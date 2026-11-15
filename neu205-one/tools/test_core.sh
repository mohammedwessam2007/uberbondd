#!/usr/bin/env bash
# Host tests for the pure-Java core. Usage: tools/test_core.sh [private/kb.json private/kb_expectations.tsv]
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf build/core build/test && mkdir -p build/core build/test
javac --release 11 -d build/core $(find core/src/main -name '*.java')
javac --release 11 -cp build/core -d build/test $(find core/src/test -name '*.java')
java -cp build/core:build/test ai.neu205.one.core.CoreTests "${1:-}" "${2:-}"
