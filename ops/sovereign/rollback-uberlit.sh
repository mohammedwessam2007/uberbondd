#!/usr/bin/env bash
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "rollback-uberlit.sh must run as root" >&2; exit 2; }
for bin in git systemctl; do command -v "$bin" >/dev/null || { echo "missing required executable: $bin" >&2; exit 2; }; done
CURRENT=/opt/uberlit/source
OLD=/opt/uberlit/source.old
FAILED=/opt/uberlit/source.failed
[[ -d "$CURRENT/.git" ]] || { echo "current UberLit source missing" >&2; exit 2; }
[[ -d "$OLD/.git" ]] || { echo "previous UberLit source missing" >&2; exit 2; }
CURRENT_SHA="$(git -C "$CURRENT" rev-parse HEAD)"
ROLLBACK_SHA="$(git -C "$OLD" rev-parse HEAD)"
[[ -n "$ROLLBACK_SHA" ]] || { echo "rollback source commit missing" >&2; exit 2; }

systemctl stop uberlit-worker.service uberlit-tls-edge.service uberlit.service || true
rm -rf "$FAILED"
mv "$CURRENT" "$FAILED"
mv "$OLD" "$CURRENT"
install -m 0644 "$CURRENT/ops/sovereign/uberlit.service" /etc/systemd/system/uberlit.service
install -m 0644 "$CURRENT/ops/sovereign/uberlit-tls-edge.service" /etc/systemd/system/uberlit-tls-edge.service
install -m 0644 "$CURRENT/ops/sovereign/uberlit-worker.service" /etc/systemd/system/uberlit-worker.service
systemctl daemon-reload
systemctl restart uberlit.service uberlit-tls-edge.service uberlit-worker.service
systemctl is-active --quiet uberlit.service
systemctl is-active --quiet uberlit-tls-edge.service
systemctl is-active --quiet uberlit-worker.service
printf '{"ok":true,"status":"UBERLIT_ROLLBACK_COMPLETED","replacedCommit":"%s","restoredCommit":"%s","failedSourcePreserved":true,"runtimeRoot":"/var/lib/uberlit/uberbond"}\n' "$CURRENT_SHA" "$ROLLBACK_SHA"
