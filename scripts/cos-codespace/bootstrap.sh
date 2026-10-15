#!/usr/bin/env bash
# Ubuntu/Debian Codespaces bootstrap for a browser-accessible CoS test workstation.
set -euo pipefail
if [[ "${COS_BOOTSTRAP_SKIP_APT:-0}" == 1 ]]; then
  echo "Skipping package installation in COS_BOOTSTRAP_SKIP_APT=1 test mode"
  exit 0
fi
echo "[cos] Installing desktop-browser dependencies (no paid services)"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl git jq gnome-keyring libsecret-1-0 libnss3 libasound2 libgbm1 libgtk-3-0 xdg-utils
if ! command -v google-chrome >/dev/null 2>&1; then
  temp_deb="$(mktemp --suffix=.deb)"
  trap 'rm -f "$temp_deb"' EXIT
  curl --fail --location --silent --show-error "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb" -o "$temp_deb"
  sudo apt-get install -y -qq "$temp_deb"
fi
echo "[cos] Chrome: $(command -v google-chrome || true)"
echo "[cos] DISPLAY=${DISPLAY:-unset}; desktop feature provides noVNC on 6080"
echo "[cos] Bootstrap complete. Next: bash scripts/cos-codespace/install-cos.sh"
echo "[cos] Keep Codespaces port 6080 PRIVATE; change the initial VNC password before account login."
