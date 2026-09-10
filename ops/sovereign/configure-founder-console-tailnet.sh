#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 2; }
[[ $# -eq 1 ]] || { echo 'usage: configure-founder-console-tailnet.sh TAILSCALE_IPV4' >&2; exit 2; }
for cmd in node tailscale systemctl install mktemp chown chmod rm id; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }
done

HOST="$1"
CONFIG=/etc/uberbond/founder-console.env
[[ -f "$CONFIG" && ! -L "$CONFIG" ]] || { echo 'REFUSED: regular founder-console config required; install the authoring node first.' >&2; exit 2; }
id -u uberbond-author >/dev/null 2>&1 || { echo 'REFUSED: uberbond-author identity missing.' >&2; exit 2; }

# A cloud Air Node is reachable only through the machine's own active Tailscale
# address. Never accept arbitrary CGNAT, public, wildcard, Funnel or forwarded
# addresses merely because they resemble a private endpoint.
if ! tailscale status --json | node --input-type=module -e "let s='';for await(const c of process.stdin)s+=c;const j=JSON.parse(s);if(j?.BackendState!=='Running')process.exit(2)"; then
  echo 'REFUSED: Tailscale backend must be Running before founder-control exposure.' >&2
  exit 2
fi
mapfile -t TAIL_IPS < <(tailscale ip -4 2>/dev/null | sed '/^[[:space:]]*$/d')
[[ "${#TAIL_IPS[@]}" -eq 1 ]] || { echo 'REFUSED: exactly one local Tailscale IPv4 address is required.' >&2; exit 2; }
[[ "$HOST" == "${TAIL_IPS[0]}" ]] || { echo 'REFUSED: requested address is not this Air Node Tailscale address.' >&2; exit 2; }
if ! HOST="$HOST" node --input-type=module - <<'NODE'
const p=String(process.env.HOST||'').split('.').map(Number);
const ok=p.length===4&&p.every(Number.isInteger)&&p.every(n=>n>=0&&n<=255)&&p[0]===100&&p[1]>=64&&p[1]<=127;
if(!ok) process.exit(2);
NODE
then
  echo 'REFUSED: founder Air Node address must be in Tailscale IPv4 space 100.64.0.0/10.' >&2
  exit 2
fi

TOKEN="$(node --input-type=module -e "import crypto from 'node:crypto';process.stdout.write(crypto.randomBytes(32).toString('hex'))")"
[[ "$TOKEN" =~ ^[0-9a-f]{64}$ ]] || { echo 'REFUSED: secure founder token generation failed.' >&2; exit 2; }

BACKUP="$(mktemp /etc/uberbond/.founder-console-air.backup.XXXXXX)"
STAGE="$(mktemp /etc/uberbond/.founder-console-air.stage.XXXXXX)"
cleanup(){ rm -f "$BACKUP" "$STAGE"; }
trap cleanup EXIT
install -m 0640 -o root -g uberbond-author "$CONFIG" "$BACKUP"

CONFIG="$CONFIG" STAGE="$STAGE" HOST="$HOST" TOKEN="$TOKEN" node --input-type=module - <<'NODE'
import fs from 'node:fs';
const source=fs.readFileSync(process.env.CONFIG,'utf8');
const replacements=new Map([
  ['UBERBOND_FOUNDER_CONSOLE_HOST',process.env.HOST],
  ['UBERBOND_FOUNDER_CONSOLE_TOKEN',process.env.TOKEN]
]);
const seen=new Set();
const lines=source.split(/\r?\n/).filter((line,index,array)=>!(index===array.length-1&&line==='')).map(line=>{
  const match=/^([A-Z0-9_]+)=/.exec(line);
  if(!match || !replacements.has(match[1])) return line;
  if(seen.has(match[1])) throw new Error(`duplicate-config-key:${match[1]}`);
  seen.add(match[1]);
  return `${match[1]}=${replacements.get(match[1])}`;
});
for(const [key,value] of replacements){ if(!seen.has(key)) lines.push(`${key}=${value}`); }
fs.writeFileSync(process.env.STAGE,`${lines.join('\n')}\n`,{mode:0o600});
NODE
install -m 0640 -o root -g uberbond-author "$STAGE" "$CONFIG"

rollback(){
  local rc=$?
  trap - ERR EXIT
  set +e
  install -m 0640 -o root -g uberbond-author "$BACKUP" "$CONFIG"
  systemctl restart uberbond-founder-console.service >/dev/null 2>&1 || true
  cleanup
  echo 'Founder console tailnet configuration failed; prior config restored.' >&2
  exit "$rc"
}
trap rollback ERR
systemctl restart uberbond-founder-console.service
systemctl is-active --quiet uberbond-founder-console.service
trap - ERR

cat <<EOF
UberBond Air Node founder connection activated.
Private tailnet address: http://${HOST}:8787/
Founder token (shown once; store it in your password manager):
${TOKEN}

The Founder Console is bound only to this machine's active Tailscale IPv4 address.
The token is stored only in root-owned /etc/uberbond/founder-console.env and shown here once.
No Tailscale Funnel, wildcard/public bind, cloud-model fallback, signing, deployment,
customer, payment, spend, DNS or credential authority was created by this step.

On the iPad: connect the Tailscale app to the same tailnet, then open the URL above in Safari.
EOF
