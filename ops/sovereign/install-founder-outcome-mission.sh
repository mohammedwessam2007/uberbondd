#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="${UBERBOND_SOURCE_ROOT:-/opt/uberbond/source}"
CONTROL_DIR="${UBERBOND_CONTROL_DIR:-/var/lib/uberbond-control}"
UNIT_DIR="/etc/systemd/system"

if [[ "${EUID}" -ne 0 ]]; then
  echo '{"ok":false,"status":"FOUNDER_OUTCOME_MISSION_INSTALL_REFUSED","reasonCodes":["root-required"]}' >&2
  exit 2
fi
if ! id -u uberbond-author >/dev/null 2>&1; then
  echo '{"ok":false,"status":"FOUNDER_OUTCOME_MISSION_INSTALL_REFUSED","reasonCodes":["uberbond-author-identity-required","install-sovereign-authoring-node-first"]}' >&2
  exit 2
fi

for file in \
  "src/founder-outcome-mission.mjs" \
  "scripts/compile-founder-outcome-mission.mjs" \
  "scripts/founder-economic-mission-pulse.mjs" \
  "ops/sovereign/uberbond-founder-outcome-mission.service" \
  "ops/sovereign/uberbond-founder-outcome-mission.path" \
  "ops/sovereign/uberbond-founder-outcome-mission.timer"; do
  if [[ ! -f "${SOURCE_ROOT}/${file}" ]]; then
    printf '{"ok":false,"status":"FOUNDER_OUTCOME_MISSION_INSTALL_REFUSED","reasonCodes":["missing-source:%s"]}\n' "$file" >&2
    exit 2
  fi
done

install -d -m 0700 -o uberbond-author -g uberbond-author "${CONTROL_DIR}/founder-missions"
install -m 0644 "${SOURCE_ROOT}/ops/sovereign/uberbond-founder-outcome-mission.service" "${UNIT_DIR}/uberbond-founder-outcome-mission.service"
install -m 0644 "${SOURCE_ROOT}/ops/sovereign/uberbond-founder-outcome-mission.path" "${UNIT_DIR}/uberbond-founder-outcome-mission.path"
install -m 0644 "${SOURCE_ROOT}/ops/sovereign/uberbond-founder-outcome-mission.timer" "${UNIT_DIR}/uberbond-founder-outcome-mission.timer"

systemctl daemon-reload
systemctl enable --now uberbond-founder-outcome-mission.path uberbond-founder-outcome-mission.timer
systemctl start uberbond-founder-outcome-mission.service

path_state="$(systemctl is-active uberbond-founder-outcome-mission.path || true)"
timer_state="$(systemctl is-active uberbond-founder-outcome-mission.timer || true)"
service_state="$(systemctl show -p Result --value uberbond-founder-outcome-mission.service 2>/dev/null || true)"

if [[ "$path_state" != "active" || "$timer_state" != "active" || "$service_state" != "success" ]]; then
  printf '{"ok":false,"status":"FOUNDER_OUTCOME_MISSION_INSTALL_INCOMPLETE","pathState":"%s","timerState":"%s","serviceResult":"%s"}\n' "$path_state" "$timer_state" "$service_state" >&2
  exit 2
fi

economic_env=false
[[ -f /etc/uberbond/economic.env ]] && economic_env=true
printf '{"ok":true,"status":"FOUNDER_OUTCOME_MISSION_CONTINUUM_ACTIVE","pathState":"%s","timerState":"%s","serviceResult":"%s","economicRuntimeEnvPresent":%s,"controlDir":"%s","truthBoundary":"Active systemd units prove the outcome-mission heartbeat is installed. The optional protected /etc/uberbond/economic.env supplies the real commercial worker database/provider environment when available. Missing economic runtime configuration remains an execution blocker, not a terminal revenue result. Active units do not by themselves prove sends, payments, customers, or cleared revenue."}\n' "$path_state" "$timer_state" "$service_state" "$economic_env" "$CONTROL_DIR"
