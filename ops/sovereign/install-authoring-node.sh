#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo "Run as root." >&2; exit 2; }
for cmd in node npm git systemctl unshare install useradd usermod groupadd getent cp realpath mv rm chown chmod; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done
if [[ -e /etc/uberbond/release-private.pem ]]; then echo "REFUSED: release signing authority must not live on the authoring/runtime control node." >&2; exit 2; fi

SOURCE="${1:-}"
[[ -n "$SOURCE" ]] || { echo "usage: install-authoring-node.sh /path/to/clean/uberbond-checkout" >&2; exit 2; }
SOURCE="$(realpath "$SOURCE")"
[[ -d "$SOURCE/.git" && ! -L "$SOURCE" ]] || { echo "A real Git checkout is required." >&2; exit 2; }
[[ -z "$(git -C "$SOURCE" status --porcelain)" ]] || { echo "Source checkout must be clean." >&2; exit 2; }
[[ -d "$SOURCE/node_modules" && ! -L "$SOURCE/node_modules" ]] || { echo "Prepared node_modules is required; run the deliberate dependency seed first." >&2; exit 2; }
SOURCE_HEAD="$(git -C "$SOURCE" rev-parse HEAD)"; [[ "$SOURCE_HEAD" =~ ^[0-9a-f]{40}$ ]] || { echo "Exact source commit required." >&2; exit 2; }

getent group uberbond-autonomy >/dev/null || groupadd --system uberbond-autonomy
for account in uberbond-author uberbond-worker; do
  getent group "$account" >/dev/null || groupadd --system "$account"
  if ! id -u "$account" >/dev/null 2>&1; then
    useradd --system --gid "$account" --home-dir "/var/lib/$account" --create-home --shell /usr/sbin/nologin "$account"
  fi
  usermod -g "$account" -a -G uberbond-autonomy "$account"
done

install -d -m 0755 /opt/uberbond /opt/uberbond/control
install -d -m 0700 -o uberbond-author -g uberbond-author /var/lib/uberbond-control /var/lib/uberbond-control/autonomy
install -d -m 0750 -o uberbond-author -g uberbond-autonomy /var/lib/uberbond-worker/inbox
install -d -m 0750 -o uberbond-worker -g uberbond-autonomy /var/lib/uberbond-worker/outbox
install -d -m 0700 /etc/uberbond

STAGE="/opt/uberbond/.source-stage.$$"; PREVIOUS="/opt/uberbond/.source-previous.$$"
cleanup(){ rm -rf "$STAGE" "$PREVIOUS"; }; trap cleanup EXIT
rm -rf "$STAGE" "$PREVIOUS"; cp -a "$SOURCE" "$STAGE"
[[ -d "$STAGE/.git" && ! -L "$STAGE" ]] || { echo "Staged source lost Git identity." >&2; exit 2; }
[[ "$(git -C "$STAGE" rev-parse HEAD)" == "$SOURCE_HEAD" ]] || { echo "Staged source commit mismatch." >&2; exit 2; }
[[ -z "$(git -C "$STAGE" status --porcelain)" ]] || { echo "Staged source is not clean." >&2; exit 2; }
chown -R uberbond-author:uberbond-autonomy "$STAGE"
if [[ -e /opt/uberbond/source ]]; then mv /opt/uberbond/source "$PREVIOUS"; fi
mv "$STAGE" /opt/uberbond/source
if [[ "$(git -C /opt/uberbond/source rev-parse HEAD)" != "$SOURCE_HEAD" ]]; then rm -rf /opt/uberbond/source; [[ ! -e "$PREVIOUS" ]] || mv "$PREVIOUS" /opt/uberbond/source; echo "Installed source identity verification failed; prior source restored." >&2; exit 2; fi
rm -rf "$PREVIOUS"; trap - EXIT

install -m 0755 /opt/uberbond/source/ops/sovereign/uberbond-authorctl /opt/uberbond/control/uberbond-authorctl
for unit in uberbond-authoring.service uberbond-authoring.timer uberbond-local-worker.service uberbond-local-worker.path uberbond-autonomy-verify.service uberbond-autonomy-verify.path; do
  install -m 0644 "/opt/uberbond/source/ops/sovereign/$unit" "/etc/systemd/system/$unit"
done

cat > /etc/uberbond/authoring.env <<EOF
UBERBOND_SOURCE_ROOT=/opt/uberbond/source
UBERBOND_CONTROL_DIR=/var/lib/uberbond-control
UBERBOND_NODE_EXECUTABLE=$(command -v node)
UBERBOND_REPOSITORY=local/uberbond
UBERBOND_ISOLATED_WORKER_ENABLED=false
UBERBOND_WORKER_INBOX_ROOT=/var/lib/uberbond-worker/inbox
UBERBOND_WORKER_TASK_PATH=/var/lib/uberbond-worker/inbox/task.json
UBERBOND_WORKER_OUTBOX_ROOT=/var/lib/uberbond-worker/outbox
UBERBOND_WORKER_RESULT_PATH=/var/lib/uberbond-worker/outbox/result.json
EOF
chown root:uberbond-author /etc/uberbond/authoring.env; chmod 0640 /etc/uberbond/authoring.env

cat > /etc/uberbond/worker.env <<EOF
UBERBOND_SOURCE_ROOT=/opt/uberbond/source
UBERBOND_WORKER_TASK_PATH=/var/lib/uberbond-worker/inbox/task.json
UBERBOND_WORKER_OUTBOX_ROOT=/var/lib/uberbond-worker/outbox
UBERBOND_WORKER_RESULT_PATH=/var/lib/uberbond-worker/outbox/result.json
UBERBOND_LOCAL_WORKER_EXECUTABLE=
UBERBOND_LOCAL_WORKER_TIMEOUT_MS=2700000
EOF
chown root:uberbond-worker /etc/uberbond/worker.env; chmod 0640 /etc/uberbond/worker.env

systemctl daemon-reload
systemctl enable --now uberbond-authoring.timer uberbond-local-worker.path uberbond-autonomy-verify.path

cat <<EOF
UberBond sovereign authoring node installed.
Source commit: ${SOURCE_HEAD}
Founder control: /opt/uberbond/control/uberbond-authorctl
Author state:    /var/lib/uberbond-control/autonomy
Worker inbox:    /var/lib/uberbond-worker/inbox
Worker outbox:   /var/lib/uberbond-worker/outbox

Default state is truth/task generation only. To enable autonomous model proposals,
install a local worker executable outside the source tree, set it in
/etc/uberbond/worker.env, then set UBERBOND_ISOLATED_WORKER_ENABLED=true in
/etc/uberbond/authoring.env. The worker runs as a separate user with private
network, read-only source, no authoring-state write, no release key, and no
merge/deploy/business authority. Release signing remains separate.
EOF
