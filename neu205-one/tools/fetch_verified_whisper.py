#!/usr/bin/env python3
"""Recover public Whisper assets from the custody-pinned npm archive.

Requires onnx==1.17.0. Originals and a provenance receipt remain in --recovery;
only derived runtime assets go in --output. Does not run speech inference.
"""
import argparse
import base64
import ctypes
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tempfile
import os
import tarfile
import urllib.request

VERSION = '1.0.0'
REGISTRY = 'https://registry.npmjs.org/sts-whisper-small/'
ARCHIVE = REGISTRY + '-/sts-whisper-small-1.0.0.tgz'
INTEGRITY = 'sha512-NoW0Id+PSL22BoV+34HXs0uT0et1Y63Cks/QCosYe0khaGMr6y/fBEup2k1+5fut3jxrZg1k1SrZ0gOpAU/LsQ=='

def digest(path, algorithm='sha256'):
    h = hashlib.new(algorithm)
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h

def verify_archive(path):
    actual = 'sha512-' + base64.b64encode(digest(path, 'sha512').digest()).decode()
    if actual != INTEGRITY:
        raise ValueError('Archive does not match custody-pinned npm integrity')

def extract_verified(path, output):
    verify_archive(path)
    with tarfile.open(path) as archive:
        members = archive.getmembers()
        if len(members) > 100 or sum(m.size for m in members) > 300_000_000:
            raise ValueError('Unexpected archive size')
        for member in members:
            parts = PurePosixPath(member.name)
            if parts.is_absolute() or '..' in parts.parts or parts.parts[0] != 'package' or not member.isfile():
                raise ValueError('Unsafe archive member')
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.whisper-original-', dir=output.parent) as temporary:
            staging = Path(temporary) / 'tree'
            staging.mkdir()
            archive.extractall(staging, members=members, filter='data')
            activate_verified(staging, output)

def preserve_bytes(destination, data):
    """Create a receipt once, or reuse identical bytes; never replace evidence."""
    if destination.is_symlink():
        raise ValueError('Refusing symlink destination: ' + str(destination))
    try:
        with destination.open('xb') as output:
            output.write(data)
    except FileExistsError:
        if not destination.is_file() or destination.read_bytes() != data:
            raise ValueError('Existing file differs; preserved: ' + str(destination))


def activate_verified(staging, output):
    """Activate a complete validated tree, or reuse an identical existing tree."""
    if output.is_symlink():
        raise ValueError('Refusing symlink output')
    if output.exists():
        if not output.is_dir():
            raise ValueError('Existing output is not a directory')
        expected = {p.relative_to(staging) for p in staging.rglob('*') if p.is_file()}
        actual = {p.relative_to(output) for p in output.rglob('*') if p.is_file()}
        if expected != actual or any(p.is_symlink() for p in output.rglob('*')):
            raise ValueError('Existing output differs; preserved')
        for relative in expected:
            if digest(staging / relative).digest() != digest(output / relative).digest():
                raise ValueError('Existing output differs; preserved')
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    # Stage under the same parent so publishing the whole tree is one rename.
    # Linux renameat2(RENAME_NOREPLACE) also protects against a concurrent writer.
    libc = ctypes.CDLL(None, use_errno=True)
    rename = libc.renameat2
    rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(staging), -100, os.fsencode(output), 1) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error), str(output))


def fetch(url, destination):
    partial = destination.with_suffix(destination.suffix + '.partial')
    if partial.exists() or partial.is_symlink():
        raise ValueError('Existing partial download preserved: ' + str(partial))
    if destination.is_symlink():
        raise ValueError('Refusing symlink download destination')
    if destination.exists():
        if not destination.is_file():
            raise ValueError('Existing download is not a regular file')
        return  # Callers authenticate retained metadata and archive before use.
    created = False
    try:
        with partial.open('xb') as target:
            created = True
            with urllib.request.urlopen(url, timeout=120) as source:
                shutil.copyfileobj(source, target, 1024 * 1024)
        # Hard-link publication cannot overwrite a concurrently created destination.
        os.link(partial, destination)
    finally:
        if created:
            partial.unlink(missing_ok=True)

def verify_registry_signature(metadata, recovery):
    """Verify registry ECDSA signature using npm's HTTPS-published key set.

    This authenticates npm metadata, not independent upstream model parity.
    """
    key_id = 'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U'
    fetch('https://registry.npmjs.org/-/npm/v1/keys', recovery / 'npm-signing-keys.json')
    keys = json.loads((recovery / 'npm-signing-keys.json').read_text())['keys']
    signature = next(item for item in metadata['dist']['signatures'] if item['keyid'] == key_id)
    key = next(item for item in keys if item['keyid'] == key_id)
    preserve_bytes(recovery / 'npm-key.der', base64.b64decode(key['key'], validate=True))
    preserve_bytes(recovery / 'npm-signature.der', base64.b64decode(signature['sig'], validate=True))
    preserve_bytes(recovery / 'npm-signed-message.txt', (metadata['name'] + '@' + metadata['version'] + ':' + INTEGRITY).encode('ascii'))
    pem = subprocess.run(['openssl', 'pkey', '-pubin', '-inform', 'DER', '-in', str(recovery / 'npm-key.der')], check=True, capture_output=True).stdout
    preserve_bytes(recovery / 'npm-key.pem', pem)
    subprocess.run(['openssl', 'dgst', '-sha256', '-verify', str(recovery / 'npm-key.pem'), '-signature', str(recovery / 'npm-signature.der'), str(recovery / 'npm-signed-message.txt')], check=True, capture_output=True)
    return key_id

def derive_assets(model, output):
    from patch_encoder_dynamic_ctx import patch
    patch(str(model / 'onnx/encoder_model_quantized.onnx'), str(output / 'encoder.onnx'))
    shutil.copyfile(model / 'onnx/decoder_model_merged_quantized.onnx', output / 'decoder.onnx')
    vocab = json.loads((model / 'vocab.json').read_text())
    vocab.update(json.loads((model / 'added_tokens.json').read_text()))
    tokens = [''] * (max(vocab.values()) + 1)
    for token, index in vocab.items():
        if '\n' in token or tokens[index]:
            raise ValueError('Invalid token table')
        tokens[index] = token
    (output / 'tokens.txt').write_text('\n'.join(tokens), encoding='utf-8')
    config = json.loads((model / 'config.json').read_text())
    generation = json.loads((model / 'generation_config.json').read_text())
    properties = {'layers': config['decoder_layers'], 'heads': config['decoder_attention_heads'], 'headDim': config['d_model'] // config['decoder_attention_heads'], 'suppress': ','.join(map(str, generation['suppress_tokens']))}
    receipts = {}
    for name in ['encoder', 'decoder', 'tokens']:
        file = output / (name + ('.txt' if name == 'tokens' else '.onnx'))
        properties[name + '_sha256'] = digest(file).hexdigest()
        properties[name + '_bytes'] = file.stat().st_size
        receipts[file.name] = {'sha256': digest(file).hexdigest(), 'bytes': file.stat().st_size}
    (output / 'config.properties').write_text(''.join(f'{k}={v}\n' for k, v in properties.items()), encoding='ascii')
    import onnx
    for name in ['encoder', 'decoder']:
        m = onnx.load(str(output / (name + '.onnx')))
        onnx.checker.check_model(m)
        receipts[name + '.onnx']['inputs'] = [i.name for i in m.graph.input]
        receipts[name + '.onnx']['outputs'] = [i.name for i in m.graph.output]
    return receipts, onnx.__version__

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recovery', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    args.recovery.mkdir(parents=True, exist_ok=True)
    metadata_path = args.recovery / 'npm-metadata.json'
    fetch(REGISTRY + VERSION, metadata_path)
    metadata = json.loads(metadata_path.read_text())
    if metadata['name'] != 'sts-whisper-small' or metadata['version'] != VERSION or metadata['dist']['integrity'] != INTEGRITY or metadata['dist']['tarball'] != ARCHIVE:
        raise ValueError('Publisher metadata does not match custody pin')
    signature_key = verify_registry_signature(metadata, args.recovery)
    archive = args.recovery / 'sts-whisper-small-1.0.0.tgz'
    if not archive.exists():
        fetch(ARCHIVE, archive)
    extract_verified(archive, args.recovery / 'original')
    model = args.recovery / 'original/package/models/Xenova/whisper-small'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.whisper-runtime-', dir=args.output.parent) as temporary:
        staging = Path(temporary) / 'tree'
        staging.mkdir()
        receipts, onnx_version = derive_assets(model, staging)
        activate_verified(staging, args.output)
    receipt = {'npm_signature_verified_key': signature_key, 'source': ARCHIVE, 'integrity': INTEGRITY, 'archive_sha256': digest(archive).hexdigest(), 'metadata_sha256': digest(metadata_path).hexdigest(), 'onnx_version': onnx_version, 'patch_sha256': digest(Path(__file__).with_name('patch_encoder_dynamic_ctx.py')).hexdigest(), 'originals': {str(p.relative_to(model)): {'sha256': digest(p).hexdigest(), 'bytes': p.stat().st_size} for p in sorted(model.rglob('*')) if p.is_file()}, 'assets': receipts, 'limits': ['Integrity verifies the pinned npm package; independent Hugging Face parity not established.', 'Dynamic-window accuracy requires separate measured speech validation.', 'ONNX graph validation is not Android execution or medical evaluation.']}
    receipt_bytes = (json.dumps(receipt, indent=2) + '\n').encode()
    receipt_name = 'recovery-receipt-' + hashlib.sha256(receipt_bytes).hexdigest() + '.json'
    preserve_bytes(args.recovery / receipt_name, receipt_bytes)
    print(json.dumps(receipts, indent=2))

if __name__ == '__main__':
    main()
