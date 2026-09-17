#!/usr/bin/env python3
"""Reconstruct canonical V9 from the hash-locked carrier, or say exactly what is missing.

The verification is unchanged and unweakened: LOSSLESS_VERIFIED is printed only
when every encoded part, binary part, compressed stream, source, byte count,
line count and SHA-256 matches. Nothing here accepts a shorter artifact.

What changed is the failure path. This exited on the first mismatched part, so a
carrier with one truncated part and fourteen parts missing a stripped trailing
newline reported `SEED_ENCODED_PART_MISMATCH:part-0001.xz.b64` -- which reads as
total corruption and cost a session's archaeology to turn into "part 16 is short
4,823 bytes". A verifier that stops at the first symptom hides the shape of the
damage, and the shape is the part a human needs to act on.

So every part is now checked before reporting, the report distinguishes a
repairable part from an unrecoverable one, and it names the bytes required.
"""
from pathlib import Path
import base64, hashlib, json, lzma, runpy, sys, tempfile

ROOT = Path.cwd()
C = ROOT / 'artifacts' / 'inevitability-v9-carrier'
M = json.loads((C / 'MANIFEST.json').read_text())
NEWLINE = b"\n"


def sha(b):
    return hashlib.sha256(b).hexdigest()


def inspect(section, subdir):
    """Check every part and return what is wrong with each, not just the first."""
    meta = M[section]
    parts, chunks = [], []
    for p in meta['parts']:
        f = C / subdir / p['file']
        row = {'file': p['file'], 'expectedBytes': p['encodedBytes']}
        if not f.exists():
            row.update(state='MISSING', actualBytes=0, shortBy=p['encodedBytes'])
            parts.append(row)
            continue
        enc = f.read_bytes()
        row['actualBytes'] = len(enc)
        if len(enc) == p['encodedBytes'] and sha(enc) == p['encodedSha256']:
            row['state'] = 'OK'
            chunks.append(base64.b64decode(enc.strip(), validate=True))
        elif sha(enc + NEWLINE) == p['encodedSha256']:
            # A stripped trailing newline is recoverable without any source: the
            # manifest hash confirms the repair rather than assuming it.
            row.update(state='REPAIRABLE_TRAILING_NEWLINE', shortBy=1)
            chunks.append(base64.b64decode(enc.strip(), validate=True))
        else:
            row.update(state='UNRECOVERABLE', shortBy=max(0, p['encodedBytes'] - len(enc)))
            chunks.append(None)
        parts.append(row)
    return meta, parts, chunks


def rebuild(section, subdir):
    """Strict reconstruction. Raises with the full picture rather than the first fault."""
    meta, parts, chunks = inspect(section, subdir)
    broken = [p for p in parts if p['state'] not in ('OK', 'REPAIRABLE_TRAILING_NEWLINE')]
    if broken:
        raise CarrierIncomplete(section, parts)
    packed = b''.join(chunks)
    if len(packed) != meta['binaryBytes'] or sha(packed) != meta['binarySha256']:
        raise SystemExit(f'{section.upper()}_STREAM_MISMATCH')
    source = lzma.decompress(packed, format=lzma.FORMAT_XZ)
    if len(source) != meta['sourceBytes'] or sha(source) != meta['sourceSha256']:
        raise SystemExit(f'{section.upper()}_SOURCE_MISMATCH')
    return source


class CarrierIncomplete(Exception):
    def __init__(self, section, parts):
        self.section = section
        self.parts = parts


def report_incomplete(err):
    """What is missing, how much, and what would close it."""
    meta = M[err.section]
    bad = [p for p in err.parts if p['state'] == 'UNRECOVERABLE']
    missing_encoded = sum(p['shortBy'] for p in bad)
    # base64 carries 3 binary bytes per 4 encoded characters.
    missing_binary = missing_encoded * 3 // 4
    recovered = [p for p in err.parts if p['state'] == 'OK']
    repairable = [p for p in err.parts if p['state'] == 'REPAIRABLE_TRAILING_NEWLINE']
    print(json.dumps({
        'status': 'CARRIER_INCOMPLETE__CANONICAL_V9_NOT_MATERIALIZED',
        'section': err.section,
        'partsTotal': len(err.parts),
        'partsVerified': len(recovered),
        'partsRepairableWithoutSource': len(repairable),
        'partsUnrecoverable': len(bad),
        'unrecoverable': bad,
        'missingEncodedBytes': missing_encoded,
        'approximateMissingBinaryBytes': missing_binary,
        'requiredToClose': {
            'artifact': f"the exact {M['v7']['bytes']}-byte V7 source" if err.section == 'seed' else 'the exact generator source',
            'sha256': meta['sourceSha256'],
            'note': 'These are compressed content bytes, not a derivable checksum. No computation in this repository can reconstruct them.'
        },
        'notWeakened': 'LOSSLESS_VERIFIED is never printed for a partial carrier, and no manifest hash may be edited to accommodate one.'
    }, indent=2))
    return 1


def main():
    try:
        seed = rebuild('seed', 'seed-v7')
        generator = rebuild('generator', 'generator')
    except CarrierIncomplete as err:
        return report_incomplete(err)

    with tempfile.NamedTemporaryFile(prefix='uberbond-v9-materializer-', suffix='.py', delete=False) as f:
        f.write(generator)
        temp = Path(f.name)
    try:
        runpy.run_path(str(temp), run_name='__main__')
    finally:
        temp.unlink(missing_ok=True)

    out = ROOT / M['materializedPath']
    raw = out.read_bytes()
    lines = raw.count(NEWLINE) + (0 if raw.endswith(NEWLINE) else (1 if raw else 0))
    if len(raw) != M['canonical']['bytes'] or lines != M['canonical']['lines'] or sha(raw) != M['canonical']['sha256']:
        raise SystemExit('CANONICAL_V9_MISMATCH')
    print(json.dumps({
        'status': 'LOSSLESS_VERIFIED', 'path': str(out), 'bytes': len(raw), 'lines': lines,
        'sha256': sha(raw), 'seedParts': len(M['seed']['parts']), 'generatorParts': len(M['generator']['parts'])
    }, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
