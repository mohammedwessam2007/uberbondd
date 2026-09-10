#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo "Run as root." >&2; exit 2; }
for cmd in wg wg-quick systemctl install grep sed; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done

ENDPOINT="${1:-${UBERBOND_COCKPIT_ENDPOINT:-}}"
[[ -n "$ENDPOINT" && "$ENDPOINT" != *[[:space:]]* && "$ENDPOINT" != */* ]] || {
  echo "REFUSED: provide the owner-controlled WireGuard endpoint as host:port (or [ipv6]:port)." >&2
  exit 2
}

CONTROL=/var/lib/uberbond-control
CONFIG=/etc/uberbond
WGDIR=/etc/wireguard
COCKPIT_DIR="$CONTROL/cockpit"
ENV_FILE="$CONFIG/uberbond.env"
SERVER_ADDR="${UBERBOND_COCKPIT_SERVER_ADDR:-10.73.0.1/24}"
SERVER_IP="${SERVER_ADDR%/*}"
CLIENT_ADDR="${UBERBOND_COCKPIT_CLIENT_ADDR:-10.73.0.2/32}"
PORT="${UBERBOND_COCKPIT_PORT:-51820}"
IFACE="uberbond0"

[[ "$PORT" =~ ^[0-9]{1,5}$ ]] && (( PORT >= 1 && PORT <= 65535 )) || { echo "REFUSED: invalid WireGuard listen port." >&2; exit 2; }
[[ "$SERVER_ADDR" =~ ^10\.73\.0\.1/24$ ]] || { echo "REFUSED: v1 sovereign cockpit server address is fixed to 10.73.0.1/24." >&2; exit 2; }
[[ "$CLIENT_ADDR" =~ ^10\.73\.0\.2/32$ ]] || { echo "REFUSED: v1 sovereign cockpit client address is fixed to 10.73.0.2/32." >&2; exit 2; }
[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || { echo "REFUSED: install the sovereign host first; missing regular $ENV_FILE." >&2; exit 2; }
[[ ! -e "$CONFIG/release-private.pem" ]] || { echo "REFUSED: release signing private key must never live on runtime host." >&2; exit 2; }

install -d -m 0700 "$WGDIR" "$COCKPIT_DIR"
SERVER_PRIV="$WGDIR/${IFACE}.server.key"
SERVER_PUB="$WGDIR/${IFACE}.server.pub"
CLIENT_PRIV="$COCKPIT_DIR/uberbond-ipad.key"
CLIENT_PUB="$COCKPIT_DIR/uberbond-ipad.pub"
CLIENT_CONF="$COCKPIT_DIR/uberbond-ipad.conf"
WG_CONF="$WGDIR/${IFACE}.conf"

if [[ ! -f "$SERVER_PRIV" ]]; then
  wg genkey > "$SERVER_PRIV"
  chmod 600 "$SERVER_PRIV"
fi
wg pubkey < "$SERVER_PRIV" > "$SERVER_PUB"
chmod 644 "$SERVER_PUB"

if [[ ! -f "$CLIENT_PRIV" ]]; then
  wg genkey > "$CLIENT_PRIV"
  chmod 600 "$CLIENT_PRIV"
fi
wg pubkey < "$CLIENT_PRIV" > "$CLIENT_PUB"
chmod 600 "$CLIENT_PUB"

SERVER_PRIVATE="$(cat "$SERVER_PRIV")"
SERVER_PUBLIC="$(cat "$SERVER_PUB")"
CLIENT_PRIVATE="$(cat "$CLIENT_PRIV")"
CLIENT_PUBLIC="$(cat "$CLIENT_PUB")"

cat > "$WG_CONF" <<EOF
[Interface]
Address = ${SERVER_ADDR}
ListenPort = ${PORT}
PrivateKey = ${SERVER_PRIVATE}

[Peer]
PublicKey = ${CLIENT_PUBLIC}
AllowedIPs = ${CLIENT_ADDR}
EOF
chmod 600 "$WG_CONF"

cat > "$CLIENT_CONF" <<EOF
[Interface]
PrivateKey = ${CLIENT_PRIVATE}
Address = ${CLIENT_ADDR}

[Peer]
PublicKey = ${SERVER_PUBLIC}
Endpoint = ${ENDPOINT}
AllowedIPs = ${SERVER_IP}/32
PersistentKeepalive = 25
EOF
chmod 600 "$CLIENT_CONF"

# The web process binds only to the private WireGuard address. It is not exposed
# on 0.0.0.0, the public NIC, a hosted proxy, or a cloud tunnel.
tmp="${ENV_FILE}.tmp.$$"
grep -Ev '^(HOST_BIND|APP_BASE_URL|FOUNDER_COCKPIT_TRANSPORT)=' "$ENV_FILE" > "$tmp"
{
  printf 'HOST_BIND=%s\n' "$SERVER_IP"
  printf 'APP_BASE_URL=http://%s:8080\n' "$SERVER_IP"
  printf 'FOUNDER_COCKPIT_TRANSPORT=wireguard\n'
} >> "$tmp"
chmod 600 "$tmp"
mv -f "$tmp" "$ENV_FILE"

systemctl enable --now "wg-quick@${IFACE}.service"

# If a release is already admitted, recreate only the declared exact release
# through the existing reconciler so the new private bind becomes effective.
if [[ -f "$CONTROL/state.env" && -x /opt/uberbond/control/uberbondctl ]]; then
  /opt/uberbond/control/uberbondctl reconcile
fi

cat <<EOF
UBERBOND_SOVEREIGN_AIR_COCKPIT_CONFIGURED

Remote compute remains on this Linux host.
Founder cockpit address (inside WireGuard only): http://${SERVER_IP}:8080
Client profile written with mode 0600: ${CLIENT_CONF}

The client private key was NOT printed.
Transfer ${CLIENT_CONF} to the founder device through an owner-approved secure channel,
import it into a WireGuard client, then remove any temporary transfer copy.

NETWORK GATE: the host/router must make UDP ${PORT} at ${ENDPOINT} reach this machine.
If the site is behind CGNAT, use another owner-controlled routable node as the WireGuard rendezvous.
No hosted tunnel, DNS service, deployment provider, or cloud control plane is required by this script.
EOF
