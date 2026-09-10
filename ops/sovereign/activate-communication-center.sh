#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 2; }
[[ $# -ge 3 && $# -le 4 ]] || {
  echo 'usage: activate-communication-center.sh /path/to/llama-server /path/to/model.gguf MODEL_ID [auto|loopback|PRIVATE_RFC1918_IPV4]' >&2
  exit 2
}
for cmd in node realpath; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
BOOTSTRAP="$ROOT/ops/sovereign/bootstrap-founder-node.sh"
[[ -d "$ROOT/.git" && ! -L "$ROOT" ]] || { echo 'REFUSED: run this from a real non-symlink UberBond Git checkout.' >&2; exit 2; }
[[ -x "$BOOTSTRAP" && -f "$BOOTSTRAP" && ! -L "$BOOTSTRAP" ]] || { echo 'REFUSED: hardened founder bootstrap must be an executable regular file.' >&2; exit 2; }

LLAMA_SERVER="$1"
MODEL_FILE="$2"
MODEL_ID="$3"
ACCESS_MODE="${4:-auto}"
PRIVATE_HOST=''

if [[ "$ACCESS_MODE" == 'auto' ]]; then
  set +e
  PRIVATE_HOST="$(node --input-type=module - <<'NODE'
import fs from 'node:fs';
import os from 'node:os';

const fail = (code, detail) => {
  process.stderr.write(`REFUSED: ${code}${detail ? `:${detail}` : ''}\n`);
  process.exit(2);
};
const isVirtual = name => /^(?:docker|br-|veth|virbr|cni|flannel|podman|tailscale|tun|tap|wg|zt)/i.test(String(name || ''));
const isPrivate = address => {
  const parts = String(address || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b,,d] = parts;
  if (d === 0 || d === 255) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};
let text;
try { text = fs.readFileSync('/proc/net/route', 'utf8'); }
catch { fail('default-route-table-unavailable'); }
const routes = text.trim().split(/\r?\n/).slice(1).map(line => line.trim().split(/\s+/)).filter(fields => {
  if (fields.length < 8 || fields[1] !== '00000000' || fields[7] !== '00000000') return false;
  const flags = Number.parseInt(fields[3], 16);
  return Number.isFinite(flags) && (flags & 0x1) === 0x1;
}).map(fields => ({ iface: fields[0], metric: Number.parseInt(fields[6], 10) })).filter(row => row.iface && Number.isFinite(row.metric));
if (!routes.length) fail('no-default-route');
const bestMetric = Math.min(...routes.map(route => route.metric));
const bestIfaces = [...new Set(routes.filter(route => route.metric === bestMetric).map(route => route.iface))];
if (bestIfaces.length !== 1) fail('ambiguous-default-route', bestIfaces.join(','));
const iface = bestIfaces[0];
if (isVirtual(iface)) fail('virtual-default-route-refused', iface);
const entries = os.networkInterfaces()[iface] || [];
const candidates = [...new Set(entries.filter(entry => entry && entry.family === 'IPv4' && entry.internal !== true && isPrivate(entry.address)).map(entry => entry.address))];
if (candidates.length !== 1) fail(candidates.length ? 'ambiguous-private-address' : 'no-private-address-on-default-route', `${iface}:${candidates.join(',')}`);
process.stdout.write(candidates[0]);
NODE
)"
  DETECT_RC=$?
  set -e
  if [[ "$DETECT_RC" -ne 0 || -z "$PRIVATE_HOST" ]]; then
    echo 'Automatic private-LAN detection refused to guess. Re-run with an explicit RFC1918 address, or pass loopback for same-machine-only access.' >&2
    exit 2
  fi
  printf 'UberBond Communication Center private host auto-detected: %s\n' "$PRIVATE_HOST"
elif [[ "$ACCESS_MODE" == 'loopback' ]]; then
  PRIVATE_HOST=''
else
  PRIVATE_HOST="$ACCESS_MODE"
fi

if [[ -n "$PRIVATE_HOST" ]]; then
  exec "$BOOTSTRAP" "$ROOT" "$LLAMA_SERVER" "$MODEL_FILE" "$MODEL_ID" "$PRIVATE_HOST"
fi
exec "$BOOTSTRAP" "$ROOT" "$LLAMA_SERVER" "$MODEL_FILE" "$MODEL_ID"
