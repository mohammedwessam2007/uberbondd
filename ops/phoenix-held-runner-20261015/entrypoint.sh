#!/bin/sh
# Root sets container-namespace egress firewall, then drops to the node user.
# REQUIRES container CAP_NET_ADMIN (never --privileged, --network host or -p).
# If iptables cannot be enforced, EXIT BEFORE starting the application.
set -eu
umask 077
HOST='ep-soft-cake-baiahh8q.c-8.eu-central-1.aws.neon.tech'
SHA='c1f9b4aac2278617cb0c9e04d14e29f0544dd701'
die() { printf '%s\n' 'PHOENIX_RUNNER_REFUSED' >&2; exit 70; }
[ "$(id -u)" = '0' ] || die
[ "$(git -C /srv/uberbond rev-parse HEAD 2>/dev/null)" = "$SHA" ] || die
[ -z "$(git -C /srv/uberbond status --porcelain --untracked-files=no 2>/dev/null)" ] || die
[ -n "$DATABASE_URL" ] && [ -n "$TOKEN_ENCRYPTION_KEY" ] && [ -n "$ADMIN_TOKEN" ] || die
# Resolve once before lockdown. Pin the exact trusted DB hostname locally;
# no outbound DNS is needed after the network firewall is installed.
DB_IP="$(getent ahostsv4 "$HOST" | awk 'NR==1 {print $1}')"
case "$DB_IP" in
  ''|*[!0-9.]* ) die ;;
esac
printf '%s %s\n' "$DB_IP" "$HOST" >> /etc/hosts || die
[ "$(getent ahostsv4 "$HOST" | awk 'NR==1 {print $1}')" = "$DB_IP" ] || die
# Disable IPv6 outbound before IPv4. No default egress ever permitted.
ip6tables -w -P OUTPUT DROP || die
ip6tables -w -F OUTPUT || die
ip6tables -w -A OUTPUT -o lo -j ACCEPT || die
iptables -w -P OUTPUT DROP || die
iptables -w -F OUTPUT || die
iptables -w -A OUTPUT -o lo -j ACCEPT || die
iptables -w -A OUTPUT -p tcp -d "$DB_IP/32" --dport 5432 -j ACCEPT || die
[ "$(iptables -w -S OUTPUT | grep -c -- '-P OUTPUT DROP')" = '1' ] || die
[ "$(ip6tables -w -S OUTPUT | grep -c -- '-P OUTPUT DROP')" = '1' ] || die
# No inherited credentials/provider SDK flags or production environment group.
set +e
timeout -s TERM -k 8s 170s runuser -u node -- env -i \
  PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp \
  PHOENIX_HELD_RESTORE_PROBE=1 NODE_ENV=production PROCESS_ROLE=web STORE_BACKEND=postgres \
  DATABASE_SSL=true DATABASE_URL="$DATABASE_URL" TOKEN_ENCRYPTION_KEY="$TOKEN_ENCRYPTION_KEY" \
  ADMIN_TOKEN="$ADMIN_TOKEN" APP_BASE_URL=https://held-restore.invalid PORT=28994 \
  AUTOPILOT_ENABLED=false OUTBOUND_ENABLED=false OUTBOUND_DRY_RUN=true \
  OUTBOUND_EMERGENCY_STOP=true PUBLIC_AUDIT_ENABLED=false AGENT_RELAY_ENABLED=false \
  ALLOW_TEST_PAYMENT_UNLOCK=false NODE_TLS_REJECT_UNAUTHORIZED=1 \
  node /opt/phoenix/supervise.mjs
RC=$?
set -e
# Policy DROP counters are observable proof of attempted prohibited connections;
# never print private addresses, credentials or subprocess raw logs.
V4="$(iptables -w -nvxL OUTPUT | sed -n '1s/.*policy DROP \([0-9][0-9]*\) packets.*/\1/p')"
V6="$(ip6tables -w -nvxL OUTPUT | sed -n '1s/.*policy DROP \([0-9][0-9]*\) packets.*/\1/p')"
[ -n "$V4" ] && [ -n "$V6" ] || die
printf 'PHOENIX_EGRESS_POLICY {"ipv4DefaultDrop":true,"ipv6DefaultDrop":true,"blockedV4Packets":%s,"blockedV6Packets":%s}\n' "$V4" "$V6"
if [ "$RC" -ne 0 ] || [ "$V4" -ne 0 ] || [ "$V6" -ne 0 ]; then
  printf '%s\n' 'PHOENIX_RUNNER_FAILED'
  exit 71
fi
printf '%s\n' 'PHOENIX_RUNNER_SUCCESS'
