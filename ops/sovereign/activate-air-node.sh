#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 2; }
[[ $# -eq 3 ]] || {
  echo 'usage: activate-air-node.sh /path/to/llama-server /path/to/model.gguf MODEL_ID' >&2
  exit 2
}
for cmd in node tailscale realpath; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
BOOTSTRAP="$ROOT/ops/sovereign/bootstrap-founder-node.sh"
TAILNET_CONFIG="$ROOT/ops/sovereign/configure-founder-console-tailnet.sh"
[[ -d "$ROOT/.git" && ! -L "$ROOT" ]] || { echo 'REFUSED: run this from a real non-symlink UberBond Git checkout.' >&2; exit 2; }
[[ -x "$BOOTSTRAP" && -f "$BOOTSTRAP" && ! -L "$BOOTSTRAP" ]] || { echo 'REFUSED: hardened founder bootstrap must be executable.' >&2; exit 2; }
[[ -x "$TAILNET_CONFIG" && -f "$TAILNET_CONFIG" && ! -L "$TAILNET_CONFIG" ]] || { echo 'REFUSED: tailnet founder configurator must be executable.' >&2; exit 2; }

if ! tailscale status --json | node --input-type=module -e "let s='';for await(const c of process.stdin)s+=c;const j=JSON.parse(s);if(j?.BackendState!=='Running')process.exit(2)"; then
  echo 'REFUSED: authenticate this Air Node to the founder tailnet first (tailscale up).' >&2
  exit 2
fi
mapfile -t TAIL_IPS < <(tailscale ip -4 2>/dev/null | sed '/^[[:space:]]*$/d')
[[ "${#TAIL_IPS[@]}" -eq 1 ]] || { echo 'REFUSED: exactly one Tailscale IPv4 address is required.' >&2; exit 2; }
TAIL_IP="${TAIL_IPS[0]}"
if ! TAIL_IP="$TAIL_IP" node --input-type=module - <<'NODE'
const p=String(process.env.TAIL_IP||'').split('.').map(Number);
if(!(p.length===4&&p.every(Number.isInteger)&&p.every(n=>n>=0&&n<=255)&&p[0]===100&&p[1]>=64&&p[1]<=127)) process.exit(2);
NODE
then
  echo 'REFUSED: active Tailscale IPv4 is outside 100.64.0.0/10.' >&2
  exit 2
fi

# First boot stays loopback-only while source, local model, worker, verifier,
# promoter and resident continuum are admitted. Network founder access is added
# only after the canonical doctor and first wake succeed.
"$BOOTSTRAP" "$ROOT" "$1" "$2" "$3"
"$TAILNET_CONFIG" "$TAIL_IP"

cat <<EOF
UBERBOND AIR NODE READY

Communication Center: http://${TAIL_IP}:8787/
Transport:            private Tailscale tailnet only
Founder device:       iPad / iPhone / any authenticated tailnet device

The iPad is the cockpit. Compute, model inference, memory, verification and
self-completion remain on this Linux Air Node.
EOF
