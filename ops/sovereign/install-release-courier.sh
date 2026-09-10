#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_MOUNT="${1:-/mnt/uberbond-signer-outbox}"
RUNTIME_INBOX="${2:-/var/lib/uberbond-control/inbox}"
STATE_ROOT="/var/lib/uberbond-release-courier"
INSTALL_ROOT="/opt/uberbond/release-courier"

[[ "${EUID}" -eq 0 ]] || { echo "root-required" >&2; exit 2; }
[[ "${SOURCE_MOUNT}" = /* && "${RUNTIME_INBOX}" = /* ]] || { echo "absolute-paths-required" >&2; exit 2; }
[[ -d "${SOURCE_MOUNT}" && ! -L "${SOURCE_MOUNT}" ]] || { echo "regular-source-mount-required" >&2; exit 2; }
[[ -d "${RUNTIME_INBOX}" && ! -L "${RUNTIME_INBOX}" ]] || { echo "regular-runtime-inbox-required" >&2; exit 2; }
[[ "${SOURCE_MOUNT}" != "${RUNTIME_INBOX}" ]] || { echo "source-destination-separation-required" >&2; exit 2; }

if ! id uberbond-release-courier >/dev/null 2>&1; then
  useradd --system --home /nonexistent --shell /usr/sbin/nologin uberbond-release-courier
fi
install -d -m 0755 "${INSTALL_ROOT}"
install -d -o uberbond-release-courier -g uberbond-release-courier -m 0700 "${STATE_ROOT}"
install -m 0755 "${ROOT}/ops/sovereign/sovereign-release-courier.mjs" "${INSTALL_ROOT}/sovereign-release-courier.mjs"
install -m 0644 "${ROOT}/ops/sovereign/uberbond-release-courier.service" /etc/systemd/system/uberbond-release-courier.service
install -m 0644 "${ROOT}/ops/sovereign/uberbond-release-courier.path" /etc/systemd/system/uberbond-release-courier.path

mkdir -p /etc/systemd/system/uberbond-release-courier.service.d /etc/systemd/system/uberbond-release-courier.path.d
cat >/etc/systemd/system/uberbond-release-courier.service.d/paths.conf <<EOF
[Service]
Environment=UBERBOND_RELEASE_COURIER_SOURCE=${SOURCE_MOUNT}
Environment=UBERBOND_RELEASE_COURIER_RUNTIME_INBOX=${RUNTIME_INBOX}
Environment=UBERBOND_RELEASE_COURIER_STATE=${STATE_ROOT}
ReadOnlyPaths=
ReadOnlyPaths=${SOURCE_MOUNT}
ReadWritePaths=
ReadWritePaths=${RUNTIME_INBOX} ${STATE_ROOT}
EOF
cat >/etc/systemd/system/uberbond-release-courier.path.d/paths.conf <<EOF
[Path]
PathChanged=
PathChanged=${SOURCE_MOUNT}/NEXT_RELEASE
EOF

chown root:uberbond-release-courier "${RUNTIME_INBOX}"
chmod 0770 "${RUNTIME_INBOX}"
systemctl daemon-reload
systemctl enable --now uberbond-release-courier.path

echo "release-courier-installed"
echo "source=${SOURCE_MOUNT}"
echo "runtimeInbox=${RUNTIME_INBOX}"
echo "stateRoot=${STATE_ROOT}"
echo "authority=copy-already-signed-bundle-only"
echo "signing=NONE deployment=NONE network=NONE"
