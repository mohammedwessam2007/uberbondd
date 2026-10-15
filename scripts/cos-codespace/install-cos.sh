#!/usr/bin/env bash
# Download an official upstream CoS Linux release and require SHA-256 verification.
set -euo pipefail
repo="totec448-spec/chat-on-steroids"
if ! command -v gh >/dev/null || ! command -v jq >/dev/null; then
  echo "Install gh and jq before using this installer." >&2
  exit 1
fi
tempdir="$(mktemp -d)"
trap 'rm -rf "$tempdir"' EXIT
assets_json="$(gh release view --repo "$repo" --json assets,tagName)"
tag="$(jq -r '.tagName' <<<"$assets_json")"
asset="$(jq -r '.assets[].name | select(test("Linux-x64[.]deb$"))' <<<"$assets_json" | head -n1)"
if [[ -z "$asset" ]]; then
  echo "No Linux x64 DEB found in upstream release $tag; see upstream releases." >&2
  exit 1
fi
echo "[cos] Downloading upstream release $tag: $asset"
gh release download --repo "$repo" --pattern "$asset" --dir "$tempdir" --clobber
expected="${COS_EXPECTED_SHA256:-}"
if [[ -z "$expected" ]]; then
  mapfile -t checksum_assets < <(jq -r '.assets[].name | select(test("(?i)(sha256|checksum|shasum)"))' <<<"$assets_json")
  for checksum_asset in "${checksum_assets[@]}"; do
    gh release download --repo "$repo" --pattern "$checksum_asset" --dir "$tempdir" --clobber || continue
    line="$(grep -F " $asset" "$tempdir/$checksum_asset" 2>/dev/null | head -n1 || true)"
    if [[ "$line" =~ ^[0-9a-fA-F]{64}[[:space:]] ]]; then
      expected="${line:0:64}"
      break
    fi
    if [[ "$checksum_asset" == "$asset.sha256" ]] || [[ "$checksum_asset" == "$asset.sha256sum" ]]; then
      expected="$(grep -Eo '^[0-9a-fA-F]{64}' "$tempdir/$checksum_asset" | head -n1 || true)"
      [[ -z "$expected" ]] || break
    fi
  done
fi
if [[ ! "$expected" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "STOP: No matching published SHA-256 checksum located for $asset." >&2
  echo "Review $repo release $tag and rerun with COS_EXPECTED_SHA256=<verified-release-sha>." >&2
  exit 2
fi
actual="$(sha256sum "$tempdir/$asset" | awk '{print $1}')"
if [[ "${actual,,}" != "${expected,,}" ]]; then
  echo "STOP: checksum mismatch; refusing to install." >&2
  exit 3
fi
echo "[cos] SHA-256 MATCH: $actual"
sudo apt-get install -y "$tempdir/$asset"
echo "[cos] CoS installed from $tag. Open from the desktop application menu."
echo "[cos] Do not paste tunnel API keys into the GitHub repository or chat."
