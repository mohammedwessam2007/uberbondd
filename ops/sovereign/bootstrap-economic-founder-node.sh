#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_ROOT="${UBERBOND_SOURCE_ROOT:-/opt/uberbond/source}"

if [[ "${EUID}" -ne 0 ]]; then
  echo 'Run as root.' >&2
  exit 2
fi

FOUNDATION="${SOURCE_ROOT}/ops/sovereign/bootstrap-founder-node.sh"
ECONOMIC="${SOURCE_ROOT}/ops/sovereign/install-founder-outcome-mission.sh"

[[ -x "$FOUNDATION" && ! -L "$FOUNDATION" ]] || { echo 'REFUSED: founder bootstrap unavailable.' >&2; exit 2; }
[[ -x "$ECONOMIC" && ! -L "$ECONOMIC" ]] || { echo 'REFUSED: economic outcome installer unavailable.' >&2; exit 2; }

"$FOUNDATION" "$@"
"$ECONOMIC"

path_state="$(systemctl is-active uberbond-founder-outcome-mission.path || true)"
timer_state="$(systemctl is-active uberbond-founder-outcome-mission.timer || true)"
service_result="$(systemctl show -p Result --value uberbond-founder-outcome-mission.service 2>/dev/null || true)"

if [[ "$path_state" != "active" || "$timer_state" != "active" || "$service_result" != "success" ]]; then
  printf '{"ok":false,"status":"ECONOMIC_FOUNDER_NODE_NOT_READY","pathState":"%s","timerState":"%s","serviceResult":"%s"}\n' "$path_state" "$timer_state" "$service_result" >&2
  exit 2
fi

printf '{"ok":true,"status":"ECONOMIC_FOUNDER_NODE_READY","pathState":"%s","timerState":"%s","serviceResult":"%s","truthBoundary":"The owned founder node and resident economic heartbeat are installed and active. This does not by itself prove provider credentials, sends, customers, cleared payments, accepted delivery, profit, or 24-hour endurance."}\n' "$path_state" "$timer_state" "$service_result"
