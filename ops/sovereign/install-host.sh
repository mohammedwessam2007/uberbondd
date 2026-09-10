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
PUBLIC_SOURCE="${1:-}"

install -d -m 0755 /opt/uberbond "$CONTROL"
install -d -m 0700 "$CONFIG" "$STATE" "$STATE/backups" "$STATE/inbox"
install -m 0755 "$ROOT/ops/sovereign/uberbondctl" "$CONTROL/uberbondctl"
install -m 0755 "$ROOT/ops/sovereign/sovereign-runtime-rehearsal.sh" "$CONTROL/sovereign-runtime-rehearsal"
install -m 0644 "$ROOT/docker-compose.sovereign.yml" "$CONTROL/docker-compose.sovereign.yml"
for unit in uberbond-reconcile.service uberbond-reconcile.timer uberbond-release-apply.service uberbond-release-apply.path; do
  install -m 0644 "$ROOT/ops/sovereign/$unit" "/etc/systemd/system/$unit"
done

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

if [[ -n "$PUBLIC_SOURCE" ]]; then
  [[ -f "$PUBLIC_SOURCE" && ! -L "$PUBLIC_SOURCE" ]] || { echo "Release public key source must be a regular file." >&2; exit 2; }
  openssl pkey -pubin -in "$PUBLIC_SOURCE" -noout >/dev/null 2>&1 || { echo "Release public key is invalid." >&2; exit 2; }
  install -m 0644 "$PUBLIC_SOURCE" "$CONFIG/release-public.pem"
fi

if [[ -e "$CONFIG/release-private.pem" ]]; then
  echo "REFUSED: release signing private key must never live on the runtime host: $CONFIG/release-private.pem" >&2
  exit 2
fi

systemctl daemon-reload
systemctl enable --now uberbond-reconcile.timer uberbond-release-apply.path

cat <<EOF
UberBond sovereign host control plane installed.

Runtime control:  $CONTROL/uberbondctl
Rehearsal witness: $CONTROL/sovereign-runtime-rehearsal
Secrets/config:   $CONFIG/uberbond.env
Release verifier: $CONFIG/release-public.pem
State/backups:    $STATE
Release inbox:    $STATE/inbox

No application release was downloaded or deployed.
The release-signing PRIVATE key must remain on a separate authoring/offline machine.
EOF

if [[ ! -f "$CONFIG/release-public.pem" ]]; then
  cat <<EOF

BLOCKER: no release public key is installed yet.
Create release authority on a separate machine with:
  ops/sovereign/init-release-authority.sh
Then copy ONLY release-public.pem here and re-run:
  sudo $ROOT/ops/sovereign/install-host.sh /path/to/release-public.pem
EOF
else
  cat <<EOF

To deploy manually:
  $CONTROL/uberbondctl deploy /path/to/signed-release-directory

To deploy automatically after an offline/local transfer:
  1. place the signed release directory under $STATE/inbox/<safe-name>
  2. atomically write that directory name to $STATE/inbox/NEXT_RELEASE
The systemd path unit will verify signature, anti-replay sequence, image IDs,
backup the database, migrate, health-check, and roll back on failure.

After two distinct known-good releases exist, the bounded runtime rehearsal can
exercise backup/restore, durable Postgres restart recovery, killed-container
reconciliation, failed-promotion rollback, and an explicit rollback round trip:
  sudo $CONTROL/sovereign-runtime-rehearsal /path/to/valid-signed-failing-release
Its JSON output is evidence only for the exact source commit it reports. Copying
that receipt into another host's protected evidence ingress is a separate
owner/root custody operation; the runtime witness grants itself no such authority.
EOF
fi

cat <<EOF

The default web bind is 127.0.0.1:8080 and external effects remain disabled.
EOF
