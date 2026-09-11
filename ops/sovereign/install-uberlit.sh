#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-}"
[[ -n "$SOURCE" ]] || { echo "usage: install-uberlit.sh /path/to/clean/uberbond-checkout [--start]" >&2; exit 2; }
START=false
[[ "${2:-}" == "--start" ]] && START=true
[[ $EUID -eq 0 ]] || { echo "install-uberlit.sh must run as root" >&2; exit 2; }
for bin in git node npm tar systemctl; do command -v "$bin" >/dev/null || { echo "missing required executable: $bin" >&2; exit 2; }; done
SOURCE="$(realpath "$SOURCE")"
[[ -d "$SOURCE/.git" ]] || { echo "source must be a Git checkout" >&2; exit 2; }
[[ -z "$(git -C "$SOURCE" status --porcelain --untracked-files=no)" ]] || { echo "source tracked tree must be clean" >&2; exit 2; }
SOURCE_SHA="$(git -C "$SOURCE" rev-parse HEAD)"
SOURCE_TREE="$(git -C "$SOURCE" rev-parse 'HEAD^{tree}')"

if ! id -u uberlit >/dev/null 2>&1; then
  useradd --system --home /var/lib/uberlit --create-home --shell /usr/sbin/nologin uberlit
fi
install -d -m 0755 /opt/uberlit
rm -rf /opt/uberlit/source.new
git clone --quiet --no-hardlinks --no-checkout "$SOURCE" /opt/uberlit/source.new
git -C /opt/uberlit/source.new checkout --quiet --detach "$SOURCE_SHA"
git -C /opt/uberlit/source.new remote remove origin || true
[[ "$(git -C /opt/uberlit/source.new rev-parse HEAD)" == "$SOURCE_SHA" ]] || { echo "installed source commit mismatch" >&2; exit 2; }
[[ "$(git -C /opt/uberlit/source.new rev-parse 'HEAD^{tree}')" == "$SOURCE_TREE" ]] || { echo "installed source tree mismatch" >&2; exit 2; }
[[ -z "$(git -C /opt/uberlit/source.new status --porcelain --untracked-files=no)" ]] || { echo "installed source is dirty" >&2; exit 2; }
rm -rf /opt/uberlit/source.old
[[ ! -e /opt/uberlit/source ]] || mv /opt/uberlit/source /opt/uberlit/source.old
mv /opt/uberlit/source.new /opt/uberlit/source
chown -R root:root /opt/uberlit/source
chmod -R go-w /opt/uberlit/source
install -d -o uberlit -g uberlit -m 0700 /var/lib/uberlit /var/lib/uberlit/uberbond
install -d -o root -g uberlit -m 0750 /etc/uberlit
if [[ ! -f /etc/uberlit/uberlit.env ]]; then
  cat > /etc/uberlit/uberlit.env <<'ENV'
APP_BASE_URL=https://uberlit.local
OUTBOUND_ENABLED=false
DISCOVERY_ENABLED=false
ENV
  chown root:uberlit /etc/uberlit/uberlit.env
  chmod 0640 /etc/uberlit/uberlit.env
fi
install -m 0644 /opt/uberlit/source/ops/sovereign/uberlit.service /etc/systemd/system/uberlit.service
systemctl daemon-reload
systemctl enable uberlit.service >/dev/null
if $START; then
  systemctl restart uberlit.service
  systemctl --no-pager --full status uberlit.service
fi
printf '{"ok":true,"status":"UBERLIT_NODE_INSTALLED","sourceCommit":"%s","sourceTree":"%s","serviceEnabled":true,"serviceStarted":%s,"runtimeRoot":"/var/lib/uberlit/uberbond"}\n' "$SOURCE_SHA" "$SOURCE_TREE" "$START"
