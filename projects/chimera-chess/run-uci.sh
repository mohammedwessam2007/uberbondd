#!/bin/sh
# CHIMERA default UCI engine (V8 native core). Builds on first use. Python V7 stays available: python -m chimera.uci
set -eu
D="$(cd "$(dirname "$0")" && pwd)"
[ -x "$D/native/chimera" ] || sh "$D/native/build.sh"
exec "$D/native/chimera" "$@"
