#!/usr/bin/env python3
"""Register owner-approved visual source custody; never invent diagram interpretation.
This does not make a text-only Qwen candidate vision-capable or answer figure-only questions.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--file', type=Path, required=True)
    p.add_argument('--expected-sha256', required=True)
    p.add_argument('--source-reference', required=True)
    p.add_argument('--rights', choices=['owner-private', 'explicit-open-license'], required=True)
    p.add_argument('--digital-page', type=int, required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    if not 1 <= a.digital_page <= 299 or not a.source_reference.strip():
        p.error('Original source/page provenance required')
    if a.file.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.pdf'}:
        p.error('Only an explicitly approved source image/PDF can be registered')
    raw = a.file.read_bytes()
    if len(raw) > 64 * 1024 * 1024:
        p.error('Visual source exceeds bounded intake size')
    digest = hashlib.sha256(raw).hexdigest()
    if digest != a.expected_sha256:
        p.error('Source digest mismatch; original unchanged')
    if a.out.exists():
        p.error('Preserve prior visual source version; choose a new output directory')
    a.out.mkdir(parents=True, mode=0o700)
    target = a.out / ('original' + a.file.suffix.lower())
    with target.open('xb') as f:
        os.chmod(target, 0o600); f.write(raw)
    receipt = {'schema': 'neu205.visual-custody.v1', 'sha256': digest, 'bytes': len(raw),
               'rights_declared': a.rights, 'source_reference': a.source_reference,
               'digital_pdf_page': a.digital_page, 'visual_interpretation_verified': False,
               'answer_generation_enabled': False, 'figure_only_coverage': 'UNSUPPORTED_PENDING_VERIFIED_VISUAL_PIPELINE'}
    (a.out / 'manifest.json').write_text(json.dumps(receipt, indent=2))
    print('Private visual source registered; no interpretation or figure-answering claim')


if __name__ == '__main__':
    main()
