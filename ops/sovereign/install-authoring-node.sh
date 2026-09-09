#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo "Run as root." >&2; exit 2; }
for cmd in node npm git systemctl unshare install useradd cp realpath mv rm; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done

if [[ -e /etc/uberbond/release-private.pem ]]; then
  echo "REFUSED: release signing authority must not live on the authoring/runtime control node." >&2
  exit 2
fi

SOURCE="${1:-}"
[[ -n "$SOURCE" ]] || { echo "usage: install-authoring-node.sh /path/to/clean/uberbond-checkout" >&2; exit 2; }
SOURCE="$(realpath "$SOURCE")"
[[ -d "$SOURCE/.git" && ! -L "$SOURCE" ]] || { echo "A real Git checkout is required." >&2; exit 2; }
[[ -z "$(git -C "$SOURCE" status --porcelain)" ]] || { echo "Source checkout must be clean." >&2; exit 2; }
[[ -d "$SOURCE/node_modules" && ! -L "$SOURCE/node_modules" ]] || { echo "Prepared node_modules is required; run the deliberate dependency seed first." >&2; exit 2; }
SOURCE_HEAD="$(git -C "$SOURCE" rev-parse HEAD)"
[[ "$SOURCE_HEAD" =~ ^[0-9a-f]{40}$ ]] || { echo "Exact source commit required." >&2; exit 2; }

id -u uberbond-author >/dev/null 2>&1 || useradd --system --home-dir /var/lib/uberbond-author --create-home --shell /usr/sbin/nologin uberbond-author
install -d -m 0755 /opt/uberbond /opt/uberbond/control
install -d -m 0700 -o uberbond-author -g uberbond-author /var/lib/uberbond-control /var/lib/uberbond-control/autonomy
install -d -m 0700 /etc/uberbond

STAGE="/opt/uberbond/.source-stage.$$"
PREVIOUS="/opt/uberbond/.source-previous.$$"
cleanup(){ rm -rf "$STAGE" "$PREVIOUS"; }
trap cleanup EXIT
rm -rf "$STAGE" "$PREVIOUS"
cp -a "$SOURCE" "$STAGE"
[[ -d "$STAGE/.git" && ! -L "$STAGE" ]] || { echo "Staged source lost Git identity." >&2; exit 2; }
STAGED_HEAD="$(git -C "$STAGE" rev-parse HEAD)"
[[ "$STAGED_HEAD" == "$SOURCE_HEAD" ]] || { echo "Staged source commit mismatch." >&2; exit 2; }
[[ -z "$(git -C "$STAGE" status --porcelain)" ]] || { echo "Staged source is not clean." >&2; exit 2; }
chown -R uberbond-author:uberbond-author "$STAGE" /var/lib/uberbond-author /var/lib/uberbond-control
if [[ -e /opt/uberbond/source ]]; then mv /opt/uberbond/source "$PREVIOUS"; fi
mv "$STAGE" /opt/uberbond/source
[[ "$(git -C /opt/uberbond/source rev-parse HEAD)" == "$SOURCE_HEAD" ]] || {
  rm -rf /opt/uberbond/source
  if [[ -e "$PREVIOUS" ]]; then mv "$PREVIOUS" /opt/uberbond/source; fi
  echo "Installed source identity verification failed; prior source restored." >&2
  exit 2
}
rm -rf "$PREVIOUS"
trap - EXIT

install -m 0755 /opt/uberbond/source/ops/sovereign/uberbond-authorctl /opt/uberbond/control/uberbond-authorctl
install -m 0644 /opt/uberbond/source/ops/sovereign/uberbond-authoring.service /etc/systemd/system/uberbond-authoring.service
install -m 0644 /opt/uberbond/source/ops/sovereign/uberbond-authoring.timer /etc/systemd/system/uberbond-authoring.timer

cat > /etc/uberbond/authoring.env <<EOF
UBERBOND_SOURCE_ROOT=/opt/uberbond/source
UBERBOND_CONTROL_DIR=/var/lib/uberbond-control
UBERBOND_NODE_EXECUTABLE=$(command -v node)
UBERBOND_REPOSITORY=local/uberbond
UBERBOND_LOCAL_WORKER_EXECUTABLE=
UBERBOND_LOCAL_WORKER_TIMEOUT_MS=2700000
EOF
chmod 600 /etc/uberbond/authoring.env

systemctl daemon-reload
systemctl enable --now uberbond-authoring.timer

cat <<EOF
UberBond sovereign authoring node installed.

Source commit: ${SOURCE_HEAD}
Control:       /opt/uberbond/control/uberbond-authorctl
State:         /var/lib/uberbond-control/autonomy
Config:        /etc/uberbond/authoring.env
Source:        /opt/uberbond/source

The timer can already regenerate exact truth and materialize the next bounded task.
To enable model execution, set UBERBOND_LOCAL_WORKER_EXECUTABLE to a separately
installed executable that accepts TASK_JSON_PATH RESULT_JSON_PATH and returns a
task-bound AgentCodeChangeSet. The worker receives no repository-write, merge,
signing, deployment, payment, DNS, customer-contact or business authority.

Release signing remains a separate authority by design.
EOF
