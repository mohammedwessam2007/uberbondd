#!/usr/bin/env bash
# Invoke from the existing devcontainer postStartCommand after live configuration review.
# No installation, secret discovery, identity replacement or readiness claim.
set -euo pipefail
umask 077
state="${XDG_STATE_HOME:-$HOME/.local/state}/uberbond"
mkdir -p "$state"
if [[ "${COS_TUNNEL_AUTOSTART:-0}" != 1 || -z "${COS_TUNNEL_CMD:-}" ]]; then
  echo 'BLOCKED: existing foreground tunnel command and autostart opt-in required'
  exit 1
fi
nohup bash "$(dirname "$0")/tunnel-supervisor.sh" </dev/null >>"$state/tunnel-supervisor.out" 2>&1 &
echo 'STARTED: supervisor requested; local service, tunnel and MCP callability remain unverified'
