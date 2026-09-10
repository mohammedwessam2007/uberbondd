#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 2; }
[[ $# -ge 1 && $# -le 2 ]] || { echo 'usage: configure-founder-console-ubermesh.sh PUBLIC_ENDPOINT_HOST [UDP_PORT]' >&2; exit 2; }
for cmd in wg wg-quick ip systemctl install mktemp chmod chown rm awk grep sed; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }
done

ENDPOINT_HOST="$1"
PORT="${2:-51820}"
[[ "$PORT" =~ ^[0-9]+$ && "$PORT" -ge 1024 && "$PORT" -le 65535 ]] || { echo 'REFUSED: UDP port must be 1024..65535.' >&2; exit 2; }
# Endpoint is data, never shell. Accept a conservative hostname/IPv4/IPv6-literal alphabet.
[[ "$ENDPOINT_HOST" =~ ^[A-Za-z0-9._:-]{1,253}$ ]] || { echo 'REFUSED: endpoint host contains unsupported characters.' >&2; exit 2; }
[[ "$ENDPOINT_HOST" != '0.0.0.0' && "$ENDPOINT_HOST" != '::' ]] || { echo 'REFUSED: wildcard endpoint is not a founder address.' >&2; exit 2; }

SOURCE=/opt/uberbond/source
PRIVATE_CONFIG="$SOURCE/ops/sovereign/configure-founder-console-private.sh"
[[ -x "$PRIVATE_CONFIG" && -f "$PRIVATE_CONFIG" && ! -L "$PRIVATE_CONFIG" ]] || { echo 'REFUSED: installed private Founder Console configurator required.' >&2; exit 2; }
[[ -f /etc/uberbond/authoring.env && ! -L /etc/uberbond/authoring.env ]] || { echo 'REFUSED: sovereign authoring node must be installed first.' >&2; exit 2; }

IFACE=uberbond-founder
SERVER_ADDR=10.77.0.1/30
SERVER_IP=10.77.0.1
CLIENT_ADDR=10.77.0.2/32
CLIENT_IP=10.77.0.2
WG_DIR=/etc/uberbond/wireguard
SERVER_KEY="$WG_DIR/server.key"
SERVER_PUB="$WG_DIR/server.pub"
CLIENT_TMP="$(mktemp /run/uberbond-founder-client.XXXXXX)"
SERVER_TMP="$(mktemp /run/uberbond-founder-server.XXXXXX)"
cleanup(){ rm -f "$CLIENT_TMP" "$SERVER_TMP"; }
trap cleanup EXIT

# Fail closed if UberMesh's fixed point-to-point address is already occupied by
# some unrelated interface. Re-running an existing UberMesh interface is allowed.
if ip -4 -o addr show | awk '{print $2" "$4}' | grep -F '10.77.0.1/30' | grep -vq "^${IFACE} "; then
  echo 'REFUSED: 10.77.0.1/30 is already owned by another interface.' >&2
  exit 2
fi

install -d -m 0700 -o root -g root "$WG_DIR" /etc/wireguard
if [[ ! -f "$SERVER_KEY" ]]; then
  wg genkey > "$SERVER_KEY"
  chmod 0600 "$SERVER_KEY"
fi
[[ -f "$SERVER_KEY" && ! -L "$SERVER_KEY" ]] || { echo 'REFUSED: server WireGuard key must be a regular file.' >&2; exit 2; }
SERVER_PRIVATE="$(cat "$SERVER_KEY")"
printf '%s' "$SERVER_PRIVATE" | wg pubkey > "$SERVER_PUB"
chmod 0644 "$SERVER_PUB"
SERVER_PUBLIC="$(cat "$SERVER_PUB")"
CLIENT_PRIVATE="$(wg genkey)"
CLIENT_PUBLIC="$(printf '%s' "$CLIENT_PRIVATE" | wg pubkey)"
PRESHARED="$(wg genpsk)"

cat > "$SERVER_TMP" <<SERVERCFG
[Interface]
Address = ${SERVER_ADDR}
ListenPort = ${PORT}
PrivateKey = ${SERVER_PRIVATE}

[Peer]
# Founder iPad. Route only the single founder client identity.
PublicKey = ${CLIENT_PUBLIC}
PresharedKey = ${PRESHARED}
AllowedIPs = ${CLIENT_ADDR}
SERVERCFG
install -m 0600 -o root -g root "$SERVER_TMP" "/etc/wireguard/${IFACE}.conf"

cat > "$CLIENT_TMP" <<CLIENTCFG
[Interface]
PrivateKey = ${CLIENT_PRIVATE}
Address = ${CLIENT_IP}/30

[Peer]
PublicKey = ${SERVER_PUBLIC}
PresharedKey = ${PRESHARED}
Endpoint = ${ENDPOINT_HOST}:${PORT}
AllowedIPs = ${SERVER_IP}/32
PersistentKeepalive = 25
CLIENTCFG
chmod 0600 "$CLIENT_TMP"

systemctl enable "wg-quick@${IFACE}.service" >/dev/null
systemctl restart "wg-quick@${IFACE}.service"
systemctl is-active --quiet "wg-quick@${IFACE}.service"
# The Founder Console binds only after the encrypted point-to-point interface is active.
"$PRIVATE_CONFIG" "$SERVER_IP"

cat <<EOF2
UBERMESH FOUNDER LINK READY

Communication Center: http://${SERVER_IP}:8787/
Transport: direct WireGuard, no central mesh provider
Server public endpoint: ${ENDPOINT_HOST}:${PORT}/UDP

IMPORT THIS WIREGUARD CONFIG ON THE FOUNDER IPAD, THEN DELETE THIS TERMINAL OUTPUT FROM ANY SHARED LOG:

$(cat "$CLIENT_TMP")

Security boundary:
- only ${CLIENT_IP} is admitted as the WireGuard peer
- only ${SERVER_IP}/32 routes through the iPad tunnel
- the Communication Center remains token-authenticated
- there is no 0.0.0.0/0 VPN route, public web bind, provider API, account token, public tunnel service, signing, deploy, spend, payment, DNS, customer or production authority

If this machine is behind NAT/CGNAT, the network owner must make UDP ${PORT} reachable or provide another owned UberMesh relay. Software cannot manufacture an inbound Internet route that the physical network does not provide.
EOF2
