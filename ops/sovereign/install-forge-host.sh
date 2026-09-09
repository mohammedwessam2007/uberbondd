#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root.' >&2; exit 2; }
for cmd in systemctl install runuser git node npm docker; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done
docker compose version >/dev/null 2>&1 || { echo 'Docker Compose v2 is required.' >&2; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO="${1:-}"
[[ -n "$REPO" ]] || { echo 'Usage: install-forge-host.sh /absolute/path/to/dedicated/uberbondd/repo' >&2; exit 2; }
REPO="$(realpath "$REPO")"
[[ -d "$REPO/.git" && ! -L "$REPO" ]] || { echo 'Dedicated Git repository required.' >&2; exit 2; }
[[ "$(git -C "$REPO" branch --show-current)" == main ]] || { echo 'Forge repository must be on main.' >&2; exit 2; }
[[ -z "$(git -C "$REPO" status --porcelain)" ]] || { echo 'Forge repository must be clean before installation.' >&2; exit 2; }
[[ -d "$REPO/node_modules" && ! -L "$REPO/node_modules" ]] || { echo 'Prepared node_modules required; install exact locked dependencies before enabling Forge.' >&2; exit 2; }

FORGE_USER=uberbond-forge
FORGE_GROUP=uberbond-forge
BIN_DIR=/opt/uberbond-forge
CONFIG_DIR=/etc/uberbond-forge
STATE_DIR=/var/lib/uberbond-forge
CONFIG="$CONFIG_DIR/forge.env"
SIGNING_KEY="$CONFIG_DIR/release-private.pem"

getent group "$FORGE_GROUP" >/dev/null 2>&1 || groupadd --system "$FORGE_GROUP"
id "$FORGE_USER" >/dev/null 2>&1 || useradd --system --gid "$FORGE_GROUP" --home-dir "$STATE_DIR" --shell /usr/sbin/nologin "$FORGE_USER"
if getent group docker >/dev/null 2>&1; then usermod -aG docker "$FORGE_USER"; else echo 'Docker group required for the dedicated Forge account.' >&2; exit 2; fi

install -d -m 0755 "$BIN_DIR"
install -d -o "$FORGE_USER" -g "$FORGE_GROUP" -m 0700 "$STATE_DIR"
install -d -o root -g "$FORGE_GROUP" -m 0750 "$CONFIG_DIR"
install -m 0755 "$ROOT/ops/sovereign/uberbond-forge-runner" "$BIN_DIR/uberbond-forge-runner"
install -m 0644 "$ROOT/ops/sovereign/uberbond-forge.service" /etc/systemd/system/uberbond-forge.service
install -m 0644 "$ROOT/ops/sovereign/uberbond-forge.timer" /etc/systemd/system/uberbond-forge.timer

if [[ ! -f "$REPO/.uberbond-sovereign-forge" ]]; then
  install -o "$FORGE_USER" -g "$FORGE_GROUP" -m 0600 /dev/null "$REPO/.uberbond-sovereign-forge"
fi
chown -R "$FORGE_USER:$FORGE_GROUP" "$REPO"

if [[ ! -f "$CONFIG" ]]; then
  cat > "$CONFIG" <<EOF
UBERBOND_FORGE_REPO=$REPO
UBERBOND_FORGE_STATE_DIR=$STATE_DIR
# These two paths must expose the independently controlled runtime host's admission inbox/state,
# for example through an authenticated, restricted transport or mounted control channel.
UBERBOND_RUNTIME_INBOX=/mnt/uberbond-runtime/inbox
UBERBOND_RUNTIME_STATE_FILE=/mnt/uberbond-runtime/state.env
UBERBOND_RELEASE_SIGNING_KEY=$SIGNING_KEY
UBERBOND_FORGE_MODEL_PROVIDER=open-model
UBERBOND_FORGE_ALLOW_EXTERNAL_MODEL_FALLBACK=false
EOF
  chown root:"$FORGE_GROUP" "$CONFIG"
  chmod 0640 "$CONFIG"
fi

if [[ -e /etc/uberbond/release-private.pem ]]; then
  echo 'REFUSED: the Forge signing key must not be installed in the runtime-host control directory.' >&2
  exit 2
fi
if [[ ! -f "$SIGNING_KEY" || -L "$SIGNING_KEY" ]]; then
  echo "BLOCKER: install the Forge-only release signing key as a regular file at $SIGNING_KEY (0600, owned by $FORGE_USER) before autonomy can start." >&2
  systemctl daemon-reload
  systemctl disable --now uberbond-forge.timer >/dev/null 2>&1 || true
  exit 3
fi
chown "$FORGE_USER:$FORGE_GROUP" "$SIGNING_KEY"
chmod 0600 "$SIGNING_KEY"

systemctl daemon-reload
if runuser -u "$FORGE_USER" -- "$BIN_DIR/uberbond-forge-runner" doctor >/tmp/uberbond-forge-doctor.json 2>/tmp/uberbond-forge-doctor.err; then
  systemctl enable --now uberbond-forge.timer
  echo 'UberBond Sovereign Forge doctor passed; bounded 15-minute heartbeat enabled.'
else
  systemctl disable --now uberbond-forge.timer >/dev/null 2>&1 || true
  echo 'Forge installed but NOT enabled because the doctor refused. Resolve the reported model/runtime/repository prerequisite and rerun this installer.' >&2
  cat /tmp/uberbond-forge-doctor.json >&2 || true
  cat /tmp/uberbond-forge-doctor.err >&2 || true
  exit 4
fi
