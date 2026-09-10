#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 2; }
[[ $# -eq 1 ]] || { echo 'usage: configure-founder-console-private.sh PRIVATE_RFC1918_IPV4' >&2; exit 2; }
for cmd in node systemctl install mktemp chown chmod rm; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done

HOST="$1"
CONFIG=/etc/uberbond/founder-console.env
[[ -f "$CONFIG" && ! -L "$CONFIG" ]] || { echo 'REFUSED: regular founder-console config required; install the authoring node first.' >&2; exit 2; }
id -u uberbond-author >/dev/null 2>&1 || { echo 'REFUSED: uberbond-author identity missing.' >&2; exit 2; }

if ! HOST="$HOST" node --input-type=module - <<'NODE'
const host=String(process.env.HOST||'');
const parts=host.split('.');
const nums=parts.map(Number);
const valid=parts.length===4 && nums.every((n,i)=>Number.isInteger(n)&&n>=0&&n<=255&&String(n)===parts[i]);
const privateRange=valid && (nums[0]===10 || (nums[0]===172&&nums[1]>=16&&nums[1]<=31) || (nums[0]===192&&nums[1]===168));
const unusable=valid && (nums[3]===0 || nums[3]===255);
if(!privateRange || unusable) process.exit(2);
NODE
then
  echo 'REFUSED: bind address must be a specific RFC1918 IPv4 host address, never wildcard/public.' >&2
  exit 2
fi

TOKEN="$(node --input-type=module -e "import crypto from 'node:crypto';process.stdout.write(crypto.randomBytes(32).toString('hex'))")"
[[ "$TOKEN" =~ ^[0-9a-f]{64}$ ]] || { echo 'REFUSED: secure founder token generation failed.' >&2; exit 2; }

BACKUP="$(mktemp /etc/uberbond/.founder-console.backup.XXXXXX)"
STAGE="$(mktemp /etc/uberbond/.founder-console.stage.XXXXXX)"
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
  echo 'Founder console private-network configuration failed; prior config restored.' >&2
  exit "$rc"
}
trap rollback ERR
systemctl restart uberbond-founder-console.service
systemctl is-active --quiet uberbond-founder-console.service
trap - ERR

cat <<EOF
UberBond founder console private-network binding activated.
Address: http://${HOST}:8787/
Founder token (shown once; store it in your password manager):
${TOKEN}

The token was written only to root-owned /etc/uberbond/founder-console.env and this terminal output.
The browser UI keeps it in page memory only. This command refuses wildcard/public addresses.
Use only on a trusted private network. It grants founder control/dialogue access, not merge,
signing, deployment, customer, payment, spend, DNS, credential, private-life, or production authority.
EOF
