#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ "${EUID}" -eq 0 ]] || { echo "Run as root." >&2; exit 2; }
SOURCE_ROOT="${1:-/opt/uberbond/offline-source}"
KEY_SOURCE="${2:-}"
[[ -d "$SOURCE_ROOT/.git" ]] || { echo "usage: install-offline-signer-node.sh /exact/uberbond/source /path/to/release-private.pem" >&2; exit 2; }
[[ -n "$KEY_SOURCE" && -f "$KEY_SOURCE" && ! -L "$KEY_SOURCE" ]] || { echo "A real non-symlink release private key is required." >&2; exit 2; }
for cmd in node git systemctl install useradd id getent docker; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done
getent group docker >/dev/null || { echo "Local Docker group required; seed Docker deliberately before installing the signer." >&2; exit 2; }
systemctl is-active --quiet docker.service || { echo "Local Docker daemon must already be active; this installer does not install or download it." >&2; exit 2; }
if ! id -u uberbond-offline-signer >/dev/null 2>&1; then useradd --system --home-dir /var/lib/uberbond-offline-signer --no-create-home --shell /usr/sbin/nologin uberbond-offline-signer; fi
install -d -m 0750 -o uberbond-offline-signer -g uberbond-offline-signer /var/lib/uberbond-offline-signer /var/lib/uberbond-offline-signer/inbox /var/lib/uberbond-offline-signer/outbox
install -d -m 0700 -o uberbond-offline-signer -g uberbond-offline-signer /var/lib/uberbond-offline-signer/keys
install -m 0400 -o uberbond-offline-signer -g uberbond-offline-signer "$KEY_SOURCE" /var/lib/uberbond-offline-signer/keys/release-private.pem
install -m 0644 "$SOURCE_ROOT/ops/sovereign/uberbond-offline-signer.service" /etc/systemd/system/uberbond-offline-signer.service
install -m 0644 "$SOURCE_ROOT/ops/sovereign/uberbond-offline-signer.path" /etc/systemd/system/uberbond-offline-signer.path
systemctl daemon-reload
systemctl enable --now uberbond-offline-signer.path
cat <<'EOF'
OFFLINE_SIGNER_READY
The signer performs no package install, model/provider call, GitHub call, or network fetch.
Drop only a verified sovereign-release-request.json into:
  /var/lib/uberbond-offline-signer/inbox/
The signer emits a signed release under:
  /var/lib/uberbond-offline-signer/outbox/
and atomically updates outbox/NEXT_RELEASE.
No runtime deployment authority is installed on this node.
EOF
