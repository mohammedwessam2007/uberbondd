#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo "Run as root." >&2; exit 2; }
for cmd in node npm git systemctl unshare install useradd cp; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done
SOURCE="${1:-}"
[[ -n "$SOURCE" ]] || { echo "usage: install-authoring-node.sh /path/to/clean/uberbond-checkout" >&2; exit 2; }
SOURCE="$(realpath "$SOURCE")"
[[ -d "$SOURCE/.git" && ! -L "$SOURCE" ]] || { echo "A real Git checkout is required." >&2; exit 2; }
[[ -z "$(git -C "$SOURCE" status --porcelain)" ]] || { echo "Source checkout must be clean." >&2; exit 2; }
[[ -d "$SOURCE/node_modules" && ! -L "$SOURCE/node_modules" ]] || { echo "Prepared node_modules is required; run the deliberate dependency seed first." >&2; exit 2; }

id -u uberbond-author >/dev/null 2>&1 || useradd --system --home-dir /var/lib/uberbond-author --create-home --shell /usr/sbin/nologin uberbond-author
install -d -m 0750 -o uberbond-author -g uberbond-author /opt/uberbond/source
install -d -m 0755 /opt/uberbond/control
install -d -m 0700 -o uberbond-author -g uberbond-author /var/lib/uberbond-control /var/lib/uberbond-control/autonomy
install -d -m 0700 /etc/uberbond

rm -rf /opt/uberbond/source
cp -a "$SOURCE" /opt/uberbond/source
chown -R uberbond-author:uberbond-author /opt/uberbond/source /var/lib/uberbond-author /var/lib/uberbond-control
install -m 0755 "$SOURCE/ops/sovereign/uberbond-authorctl" /opt/uberbond/control/uberbond-authorctl
install -m 0644 "$SOURCE/ops/sovereign/uberbond-authoring.service" /etc/systemd/system/uberbond-authoring.service
install -m 0644 "$SOURCE/ops/sovereign/uberbond-authoring.timer" /etc/systemd/system/uberbond-authoring.timer

cat > /etc/uberbond/authoring.env <<EOF
UBERBOND_SOURCE_ROOT=/opt/uberbond/source
UBERBOND_CONTROL_DIR=/var/lib/uberbond-control
UBERBOND_NODE_EXECUTABLE=$(command -v node)
UBERBOND_REPOSITORY=local/uberbond
UBERBOND_LOCAL_WORKER_EXECUTABLE=
UBERBOND_LOCAL_WORKER_TIMEOUT_MS=2700000
EOF
chmod 600 /etc/uberbond/authoring.env

if [[ -e /etc/uberbond/release-private.pem ]]; then
  echo "REFUSED: runtime/authoring shared secret layout detected. Release signing authority must remain a separate authority." >&2
  exit 2
fi

systemctl daemon-reload
systemctl enable --now uberbond-authoring.timer

cat <<'EOF'
UberBond sovereign authoring node installed.

Control: /opt/uberbond/control/uberbond-authorctl
State:   /var/lib/uberbond-control/autonomy
Config:  /etc/uberbond/authoring.env
Source:  /opt/uberbond/source

The timer can already regenerate exact truth and materialize the next bounded task.
To enable model execution, set UBERBOND_LOCAL_WORKER_EXECUTABLE to a separately
installed executable that accepts TASK_JSON_PATH RESULT_JSON_PATH and returns a
task-bound AgentCodeChangeSet. The worker never receives repository-write,
merge, signing, deployment, payment, DNS, customer-contact or business authority.

Release signing remains a separate authority by design.
EOF
