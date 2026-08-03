#!/usr/bin/env bash
# Runs the full stdlib-only self-test suite (mission Phase 13). No network
# access, no third-party test runner: python3 -m unittest discover only.
set -euo pipefail

PRODUCT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 -m compileall -q "$PRODUCT_ROOT/src"

cd "$PRODUCT_ROOT/tests"
python3 -m unittest discover -s . -p 'test_*.py' -v
