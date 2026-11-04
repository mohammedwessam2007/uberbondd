#!/usr/bin/env python3
"""Run llama-bench locally against an explicit checksum-pinned Qwen asset. No ADB or installs."""
import argparse
import hashlib
import json
import os
import platform
import subprocess
import time
from pathlib import Path


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--binary', type=Path, required=True)
    p.add_argument('--model', type=Path, required=True)
    p.add_argument('--expected-sha256', required=True)
    p.add_argument('--backend', choices=['CPU', 'GPUOpenCL', 'Hexagon'], required=True)
    p.add_argument('--device', help='Exact backend identifier from the installed binary --list-devices')
    p.add_argument('--identity', type=Path, required=True, help='Private verified GGUF identity JSON')
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    identity = json.loads(a.identity.read_text())
    model_sha = sha256(a.model)
    if model_sha != a.expected_sha256 or identity.get('sha256') != model_sha:
        p.error('Model identity / checksum mismatch; refusing benchmark')
    if 'qwen' not in str(identity.get('architecture', '')).lower():
        p.error('Only a verified Qwen architecture is permitted')
    if a.backend != 'CPU' and not a.device:
        p.error('GPU/NPU requires an exact verified device identifier; no guessed compatibility')
    command = [str(a.binary.resolve()), '-m', str(a.model.resolve()), '-p', '128', '-n', '64',
               '-r', '5', '-t', '4', '-ngl', '0' if a.backend == 'CPU' else '99', '-o', 'json']
    if a.device:
        command += ['--device', a.device]
    started = time.time()
    run = subprocess.run(command, capture_output=True, text=True, timeout=1800)
    # Benchmark logs may contain private paths. Keep raw logs next to the private receipt only.
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.with_suffix('.stdout').write_text(run.stdout)
    a.out.with_suffix('.stderr').write_text(run.stderr)
    receipt = {'scope': 'local-compute-only', 'hardware': platform.machine(), 'host': platform.system(),
               'model_sha256': model_sha, 'binary_sha256': sha256(a.binary), 'backend': a.backend,
               'device': a.device, 'identity': identity, 'exit_code': run.returncode,
               'elapsed_s': time.time() - started, 'phone_acoustic_test': False,
               'phone_thermal_battery_test': False, 'release_qualified': False,
               'compatibility': 'PASSED_EXECUTION' if run.returncode == 0 else 'REJECTED_ROLLBACK_TO_CPU'}
    a.out.write_text(json.dumps(receipt, indent=2))
    os.chmod(a.out, 0o600)
    raise SystemExit(run.returncode)


if __name__ == '__main__':
    main()
