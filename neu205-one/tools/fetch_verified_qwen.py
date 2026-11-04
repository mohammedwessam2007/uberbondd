#!/usr/bin/env python3
"""Fetch baseline Qwen only through authorized HTTPS; independently pin Hub LFS metadata.
Never invokes a model or touches a phone. A blocked destination is an error, not a retry loop.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import urllib.request
from urllib.parse import urlsplit

REPO = 'unsloth/Qwen3.5-4B-GGUF'
FILENAME = 'Qwen3.5-4B-Q4_K_M.gguf'
EXPECTED = '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4'
ALLOWED = {'huggingface.co', 'cdn-lfs.huggingface.co', 'cas-bridge.xethub.hf.co'}


def checked_url(url):
    p = urlsplit(url)
    # HF's immutable LFS downloads may redirect to region-specific *.cdn.hf.co hosts.
    # Require a DNS-label boundary, not a permissive `hf.co` substring.
    host = p.hostname or ''
    if p.scheme != 'https' or not (host in ALLOWED or host.endswith('.cdn.hf.co')) or p.username or p.password or p.port not in (None, 443):
        raise ValueError('Unapproved model destination; review required domain through environment settings')
    return url


class Redirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, checked_url(newurl))


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    a.out.parent.mkdir(parents=True, exist_ok=True)
    if a.out.exists():
        if digest(a.out) != EXPECTED:
            p.error('Existing output has another digest; original preserved')
        print('Existing baseline bytes match pinned source receipt; no duplicate download')
        return
    opener = urllib.request.build_opener(Redirects())
    with opener.open(checked_url(f'https://huggingface.co/api/models/{REPO}?blobs=true'), timeout=30) as r:
        metadata = json.load(r)
    entry = next(x for x in metadata['siblings'] if x['rfilename'] == FILENAME)
    lfs = entry.get('lfs', {})
    if lfs.get('sha256') != EXPECTED or type(lfs.get('size')) is not int:
        raise ValueError('Published LFS identity does not match recovered baseline receipt')
    revision = metadata['sha']
    if not isinstance(revision, str) or len(revision) != 40 or any(x not in '0123456789abcdef' for x in revision):
        raise ValueError('Invalid immutable model revision')
    temp = a.out.with_suffix(a.out.suffix + '.partial')
    if temp.exists():
        raise ValueError('Previous partial model download preserved; inspect before retrying')
    # A denied HTTPS connection must not create an empty .partial file that blocks retries.
    with opener.open(checked_url(f'https://huggingface.co/{REPO}/resolve/{revision}/{FILENAME}'), timeout=90) as response:
        with temp.open('xb') as out:
            os.chmod(temp, 0o600)
            while block := response.read(4 * 1024 * 1024):
                out.write(block)
                if out.tell() > lfs['size']:
                    raise ValueError('Model exceeds published LFS byte count')
    if temp.stat().st_size != lfs['size'] or digest(temp) != EXPECTED:
        raise ValueError('Downloaded model failed full byte/hash verification; partial retained, not usable')
    os.replace(temp, a.out)
    receipt = {'repository': REPO, 'revision': revision, 'filename': FILENAME,
               'sha256': EXPECTED, 'bytes': lfs['size'], 'published_lfs_verified': True,
               'inference_executed': False, 'phone_touched': False}
    a.out.with_suffix('.download-receipt.json').write_text(json.dumps(receipt, indent=2))
    print('Full model and published immutable LFS metadata verified; no inference performed')


if __name__ == '__main__':
    main()
