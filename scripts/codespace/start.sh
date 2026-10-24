#!/usr/bin/env bash
# Runs on every Codespace start (postStartCommand). Cheap, idempotent, never fails.
set -uo pipefail
log() { printf '[uberbond-start] %s\n' "$*"; }

command -v claude >/dev/null 2>&1 || bash "$(dirname "$0")/setup.sh" || true

# Reconnect hygiene: drop stale tunnel pid files left by a stopped Codespace.
state="${XDG_STATE_HOME:-$HOME/.local/state}/uberbond"
mkdir -p "$state" 2>/dev/null || true
if [ -f "$state/tunnel.pid" ] && ! kill -0 "$(cat "$state/tunnel.pid" 2>/dev/null)" 2>/dev/null; then
  rm -f "$state/tunnel.pid"
fi

# Optional: auto-start the tunnel supervisor only when explicitly configured.
if [ -n "${COS_TUNNEL_CMD:-}" ] && [ "${COS_TUNNEL_AUTOSTART:-0}" = "1" ]; then
  nohup bash "$(dirname "$0")/tunnel-supervisor.sh" >>"$state/tunnel-supervisor.out" 2>&1 &
  log "tunnel supervisor started"
fi
log "ready"
exit 0
