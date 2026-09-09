#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo "Run as root." >&2; exit 2; }
for cmd in docker systemctl openssl install sha256sum; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required." >&2; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTROL=/opt/uberbond/control
CONFIG=/etc/uberbond
STATE=/var/lib/uberbond-control

install -d -m 0755 /opt/uberbond "$CONTROL"
install -d -m 0700 "$CONFIG" "$STATE" "$STATE/backups"
install -m 0755 "$ROOT/ops/sovereign/uberbondctl" "$CONTROL/uberbondctl"
install -m 0644 "$ROOT/docker-compose.sovereign.yml" "$CONTROL/docker-compose.sovereign.yml"
install -m 0644 "$ROOT/ops/sovereign/uberbond-reconcile.service" /etc/systemd/system/uberbond-reconcile.service
install -m 0644 "$ROOT/ops/sovereign/uberbond-reconcile.timer" /etc/systemd/system/uberbond-reconcile.timer

if [[ ! -f "$CONFIG/uberbond.env" ]]; then
  postgres_password="$(openssl rand -hex 32)"
  admin_token="$(openssl rand -hex 32)"
  encryption_key="$(openssl rand -hex 32)"
  unsubscribe_secret="$(openssl rand -hex 32)"
  cat > "$CONFIG/uberbond.env" <<EOF
POSTGRES_PASSWORD=${postgres_password}
ADMIN_TOKEN=${admin_token}
TOKEN_ENCRYPTION_KEY=${encryption_key}
UNSUBSCRIBE_SECRET=${unsubscribe_secret}
APP_BASE_URL=http://127.0.0.1:8080
HOST_BIND=127.0.0.1
PORT=8080
AUTOPILOT_ENABLED=false
OUTBOUND_ENABLED=false
OUTBOUND_DRY_RUN=true
PROMETHEUS_SCHEDULING_ENABLED=true
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_SANDBOX_CLIENT_ID=
PAYPAL_SANDBOX_CLIENT_SECRET=
PAYPAL_SANDBOX_WEBHOOK_ID=
PAYPAL_LIVE_CLIENT_ID=
PAYPAL_LIVE_CLIENT_SECRET=
PAYPAL_LIVE_WEBHOOK_ID=
EOF
  chmod 600 "$CONFIG/uberbond.env"
fi

if [[ ! -f "$CONFIG/release-private.pem" || ! -f "$CONFIG/release-public.pem" ]]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$CONFIG/release-private.pem"
  openssl pkey -in "$CONFIG/release-private.pem" -pubout -out "$CONFIG/release-public.pem"
  chmod 600 "$CONFIG/release-private.pem"
  chmod 644 "$CONFIG/release-public.pem"
fi

systemctl daemon-reload
systemctl enable --now uberbond-reconcile.timer

cat <<EOF
UberBond sovereign host control plane installed.

Runtime control:  $CONTROL/uberbondctl
Secrets/config:   $CONFIG/uberbond.env
Release private:  $CONFIG/release-private.pem
Release public:   $CONFIG/release-public.pem
State/backups:    $STATE

No application release was downloaded or deployed.
Create a signed offline release bundle, transfer it to this host, then run:
  $CONTROL/uberbondctl deploy /path/to/release-directory

The default web bind is 127.0.0.1:8080 and outbound effects remain disabled.
EOF
