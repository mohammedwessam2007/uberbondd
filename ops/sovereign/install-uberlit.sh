#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-}"
[[ -n "$SOURCE" ]] || { echo "usage: install-uberlit.sh /path/to/clean/uberbond-checkout [--start]" >&2; exit 2; }
START=false
[[ "${2:-}" == "--start" ]] && START=true
[[ $EUID -eq 0 ]] || { echo "install-uberlit.sh must run as root" >&2; exit 2; }
for bin in git node npm tar openssl systemctl systemd-notify; do command -v "$bin" >/dev/null || { echo "missing required executable: $bin" >&2; exit 2; }; done
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
if [[ ! -f /etc/uberlit/uberlit.env ]]; then\n  cat > /etc/uberlit/uberlit.env <<'ENV'\nAPP_BASE_URL=https://127.0.0.1:32443\nTRUST_PROXY_HOPS=1\nUBERLIT_TLS_BIND=127.0.0.1\nUBERLIT_TLS_PORT=32443\nUBERLIT_WEB_PORT=32123\nUBERLIT_DB_PORT=35432\nAUTOPILOT_ENABLED=true\nOUTBOUND_ENABLED=false\nDISCOVERY_ENABLED=false\nENV\nfi\nensure_env() {\n  local key="$1" value="$2"\n  if grep -q "^${key}=" /etc/uberlit/uberlit.env; then\n    sed -i "s|^${key}=.*|${key}=${value}|" /etc/uberlit/uberlit.env\n  else\n    printf '%s=%s\n' "$key" "$value" >> /etc/uberlit/uberlit.env\n  fi\n}\nensure_env TYPESAFE_BASE_URL https://api.typesafe.ai\nensure_env TYPESAFE_DEFAULT_MODEL jev-latest\nensure_env TYPESAFE_JEV_ENABLED false\nensure_env TYPESAFE_INPUT_USD_PER_MILLION 0.042\nensure_env TYPESAFE_OUTPUT_USD_PER_MILLION 0\nensure_env TYPESAFE_PRICING_SOURCE https://typesafe.ai/\nensure_env TYPESAFE_PRICING_VERIFIED_AT 2026-09-19T00:00:00.000Z\nensure_env TYPESAFE_MAX_COST_USD_PER_CALL 0.001\nchown root:uberlit /etc/uberlit/uberlit.env\nchmod 0640 /etc/uberlit/uberlit.env
install -m 0644 /opt/uberlit/source/ops/sovereign/uberlit.service /etc/systemd/system/uberlit.service
install -m 0644 /opt/uberlit/source/ops/sovereign/uberlit-tls-edge.service /etc/systemd/system/uberlit-tls-edge.service
install -m 0644 /opt/uberlit/source/ops/sovereign/uberlit-worker.service /etc/systemd/system/uberlit-worker.service
systemctl daemon-reload
systemctl enable uberlit.service uberlit-tls-edge.service uberlit-worker.service >/dev/null
if $START; then
  systemctl restart uberlit.service
  systemctl restart uberlit-tls-edge.service
  systemctl restart uberlit-worker.service
  systemctl --no-pager --full status uberlit.service
  systemctl --no-pager --full status uberlit-tls-edge.service
  systemctl --no-pager --full status uberlit-worker.service
fi
printf '{"ok":true,"status":"UBERLIT_NODE_INSTALLED","sourceCommit":"%s","sourceTree":"%s","serviceEnabled":true,"tlsEdgeEnabled":true,"workerEnabled":true,"autopilotEnabled":true,"serviceStarted":%s,"runtimeRoot":"/var/lib/uberlit/uberbond","localHttpsUrl":"https://127.0.0.1:32443"}\n' "$SOURCE_SHA" "$SOURCE_TREE" "$START"
