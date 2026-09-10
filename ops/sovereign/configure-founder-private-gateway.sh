#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo "Run as root." >&2; exit 2; }
HOST="${1:-}"
PORT="${2:-8788}"
[[ -n "$HOST" ]] || { echo "usage: configure-founder-private-gateway.sh PRIVATE_IP [PORT]" >&2; exit 2; }
[[ -f /etc/uberbond/authoring.env ]] || { echo "Install the sovereign authoring node first." >&2; exit 2; }
[[ -f /opt/uberbond/source/src/sovereign-founder-private-gateway.mjs ]] || { echo "Current installed UberBond source does not contain the private founder gateway." >&2; exit 2; }
source /etc/uberbond/authoring.env
NODE="${UBERBOND_NODE_EXECUTABLE:-$(command -v node)}"
[[ -x "$NODE" ]] || { echo "Node executable unavailable." >&2; exit 2; }

BINDING="$(UB_HOST="$HOST" UB_PORT="$PORT" "$NODE" --input-type=module - <<'NODE'
import { compileFounderPrivateGatewayBinding } from 'file:///opt/uberbond/source/src/sovereign-founder-private-gateway.mjs';
const out=compileFounderPrivateGatewayBinding({host:process.env.UB_HOST,port:Number(process.env.UB_PORT),token:'x'.repeat(32)});
if(!out.ok || out.hostClass==='LOOPBACK') { console.error(JSON.stringify(out)); process.exit(2); }
process.stdout.write(JSON.stringify(out));
NODE
)" || { echo "REFUSED: founder gateway must bind a specific RFC1918, CGNAT, or IPv6-ULA address; wildcard/public/loopback targets are not accepted here." >&2; exit 2; }

TOKEN="$($NODE -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
[[ ${#TOKEN} -ge 43 ]] || { echo "Strong token generation failed." >&2; exit 2; }

install -m 0755 /opt/uberbond/source/ops/sovereign/uberbond-founder-private-gateway /opt/uberbond/control/uberbond-founder-private-gateway
install -m 0644 /opt/uberbond/source/ops/sovereign/uberbond-founder-private-gateway.service /etc/systemd/system/uberbond-founder-private-gateway.service
cat > /etc/uberbond/founder-private-gateway.env <<EOF
UBERBOND_FOUNDER_GATEWAY_HOST=$HOST
UBERBOND_FOUNDER_GATEWAY_PORT=$PORT
UBERBOND_FOUNDER_GATEWAY_TOKEN=$TOKEN
EOF
chown root:uberbond-author /etc/uberbond/founder-private-gateway.env
chmod 0640 /etc/uberbond/founder-private-gateway.env

systemctl daemon-reload
systemctl enable --now uberbond-founder-console.service uberbond-founder-private-gateway.service
systemctl is-active --quiet uberbond-founder-private-gateway.service || { echo "Founder private gateway failed to start." >&2; exit 2; }

if [[ "$HOST" == *:* ]]; then URL="http://[$HOST]:$PORT/"; else URL="http://$HOST:$PORT/"; fi
cat <<EOF
UberBond founder private gateway activated.
URL:      $URL
Username: founder
Password: $TOKEN

The password above is generated locally and printed once for transfer to the founder's device.
It is never placed in a URL or repository. Store it in the device password manager.

This gateway refuses wildcard/public binds and the systemd sandbox denies all public IP traffic.
Use it only across a trusted private LAN or an encrypted private tunnel. It proxies only the
loopback founder console routes and grants no merge/sign/deploy/payment/customer/DNS/credential
or Personal Civilization vault authority. No firewall, router, DNS, or cloud-provider setting was changed.
EOF
