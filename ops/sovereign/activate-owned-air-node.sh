#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 2; }
[[ $# -ge 4 && $# -le 5 ]] || {
  echo 'usage: activate-owned-air-node.sh /path/to/llama-server /path/to/model.gguf MODEL_ID PUBLIC_ENDPOINT_HOST [UDP_PORT]' >&2
  exit 2
}
for cmd in wg wg-quick realpath; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
BOOTSTRAP="$ROOT/ops/sovereign/bootstrap-founder-node.sh"
MESH_CONFIG="$ROOT/ops/sovereign/configure-founder-console-ubermesh.sh"
[[ -d "$ROOT/.git" && ! -L "$ROOT" ]] || { echo 'REFUSED: run from a real non-symlink UberBond checkout.' >&2; exit 2; }
for f in "$BOOTSTRAP" "$MESH_CONFIG"; do [[ -x "$f" && -f "$f" && ! -L "$f" ]] || { echo "REFUSED: required executable missing: $f" >&2; exit 2; }; done

# First establish the sovereign brainstem loopback-only. Only a successful canonical
# bootstrap may be followed by remote founder reachability.
"$BOOTSTRAP" "$ROOT" "$1" "$2" "$3"
"$MESH_CONFIG" "$4" "${5:-51820}"

cat <<'EOF2'
UBERBOND OWNED AIR NODE READY
The iPad is the cockpit. UberBond compute remains on this node.
Remote founder reachability is direct UberMesh/WireGuard, not a cloud mesh account.
EOF2
