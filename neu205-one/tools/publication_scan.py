#!/usr/bin/env python3
"""Conservative code-publication guard; emits filenames/reasons, never secret values."""
import argparse
import json
import re
from pathlib import Path

FORBIDDEN_SUFFIXES = {'.gguf', '.onnx', '.pdf', '.apk', '.sqlite', '.db', '.wav', '.pcm',
                      '.jks', '.keystore', '.p12', '.pem', '.zip', '.bundle',
                      '.safetensors', '.npy', '.npz', '.kv', '.bin'}
SECRET = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}')


def scan(root, paths):
    findings = []
    for name in paths:
        raw = root / name
        path = raw.resolve()
        if not path.is_relative_to(root.resolve()) or raw.is_symlink():
            findings.append({'path': name, 'reason': 'path escape/symlink'})
            continue
        if not path.is_file():
            continue
        if path.suffix.lower() in FORBIDDEN_SUFFIXES or any(p in {'.private', 'private', 'signing', 'v11-evaluation'} for p in Path(name).parts):
            findings.append({'path': name, 'reason': 'private artifact/asset extension or directory'})
        data = path.read_bytes()
        if SECRET.search(data):
            findings.append({'path': name, 'reason': 'credential signature'})
        if path.stat().st_size > 2 * 1024 * 1024:
            findings.append({'path': name, 'reason': 'unexpected large code artifact'})
    return findings


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, required=True)
    p.add_argument('--files', type=Path, required=True, help='JSON array of explicitly staged paths')
    a = p.parse_args()
    findings = scan(a.root, json.loads(a.files.read_text()))
    print(json.dumps({'passed': not findings, 'findings': findings}, indent=2))
    raise SystemExit(bool(findings))
