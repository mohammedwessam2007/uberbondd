#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo "Run as root." >&2; exit 2; }
for cmd in wg wg-quick systemctl install; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done

ENDPOINT="${1:-${UBERBOND_COCKPIT_ENDPOINT:-}}"
[[ -n "$ENDPOINT" && "$ENDPOINT" != *[[:space:]]* && "$ENDPOINT" != */* ]] || {
  echo "REFUSED: provide the owner-controlled WireGuard endpoint as host:port (or [ipv6]:port)." >&2
  exit 2
}

CONTROL=/var/lib/uberbond-control
WGDIR=/etc/wireguard
COCKPIT_DIR="$CONTROL/cockpit"
SERVER_ADDR="10.73.0.1/24"
SERVER_IP="10.73.0.1"
CLIENT_ADDR="10.73.0.2/32"
WG_PORT="${UBERBOND_COCKPIT_PORT:-51820}"
GATEWAY_PORT="${UBERBOND_FOUNDER_GATEWAY_PORT:-8788}"
IFACE="uberbond0"

[[ "$WG_PORT" =~ ^[0-9]{1,5}$ ]] && (( WG_PORT >= 1 && WG_PORT <= 65535 )) || { echo "REFUSED: invalid WireGuard listen port." >&2; exit 2; }
[[ "$GATEWAY_PORT" =~ ^[0-9]{1,5}$ ]] && (( GATEWAY_PORT >= 1 && GATEWAY_PORT <= 65535 )) || { echo "REFUSED: invalid founder gateway port." >&2; exit 2; }
[[ ! -e /etc/uberbond/release-private.pem ]] || { echo "REFUSED: release signing private key must never live on runtime host." >&2; exit 2; }

# The founder console/gateway is an authoring/control-plane surface. The main
# application remains loopback/private under its existing sovereign runtime law.
GATEWAY_CONFIGURATOR="/opt/uberbond/control/configure-founder-private-gateway.sh"
if [[ ! -x "$GATEWAY_CONFIGURATOR" ]]; then
  GATEWAY_CONFIGURATOR="/opt/uberbond/source/ops/sovereign/configure-founder-private-gateway.sh"
fi
[[ -x "$GATEWAY_CONFIGURATOR" ]] || {
  echo "REFUSED: install the sovereign authoring/control node before the air cockpit." >&2
  exit 2
}

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
ListenPort = ${WG_PORT}
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

# Ensure reboot ordering is deterministic. The founder gateway is allowed to
# exist only after its private tunnel address has been installed.
DROPIN=/etc/systemd/system/uberbond-founder-private-gateway.service.d
install -d -m 0755 "$DROPIN"
cat > "$DROPIN/air-cockpit.conf" <<EOF
[Unit]
Requires=wg-quick@${IFACE}.service
After=wg-quick@${IFACE}.service
EOF
chmod 0644 "$DROPIN/air-cockpit.conf"

systemctl daemon-reload
systemctl enable --now "wg-quick@${IFACE}.service"
systemctl is-active --quiet "wg-quick@${IFACE}.service" || { echo "REFUSED: WireGuard interface failed to start." >&2; exit 2; }

# Reuse the already-hardened founder gateway. It exposes only the bounded
# founder-console surface on the private tunnel and keeps the main app sealed.
"$GATEWAY_CONFIGURATOR" "$SERVER_IP" "$GATEWAY_PORT"
systemctl is-active --quiet uberbond-founder-private-gateway.service || { echo "REFUSED: founder cockpit gateway failed to start." >&2; exit 2; }

cat <<EOF
UBERBOND_SOVEREIGN_AIR_COCKPIT_CONFIGURED

Heavy compute remains on the remote Linux authoring/runtime fabric.
The iPad is a thin founder cockpit only.
Founder cockpit address inside WireGuard: http://${SERVER_IP}:${GATEWAY_PORT}/
WireGuard client profile written with mode 0600: ${CLIENT_CONF}

The WireGuard client private key was NOT printed.
The founder-gateway bearer credential is managed by the existing hardened configurator.
Transfer ${CLIENT_CONF} through an owner-approved secure channel, import it into a WireGuard client,
then remove any temporary transfer copy.

NETWORK GATE: the host/router must make UDP ${WG_PORT} at ${ENDPOINT} reach this machine.
If the site is behind CGNAT, use another owner-controlled routable node as the WireGuard rendezvous.
No hosted tunnel, DNS service, deployment provider, model provider, or cloud control plane is required
for the cockpit transport itself.
EOF
