#!/usr/bin/env bash
# Compatibility repair for the verified CoS 2.1.39 package on Debian 12.
# Rebuild only the exact vendor tree-sitter version; preserve vendor binary.
set -euo pipefail
cos_root="${COS_RUNTIME_ROOT:-/opt/cos-runtime}"
addon="$cos_root/resources/app.asar.unpacked/node_modules/tree-sitter"
version="$(node -p 'require(process.argv[1]).version' "$addon/package.json")"
if [[ "$version" != "0.25.1" ]]; then
  echo "Unvalidated tree-sitter version: $version; review before repair." >&2
  exit 1
fi
build_dir="$(mktemp -d /tmp/cos-native.XXXXXX)"
trap 'rm -rf -- "$build_dir"' EXIT
(cd "$build_dir" && npm install --build-from-source --no-audit --no-fund tree-sitter@0.25.1)
ELECTRON_RUN_AS_NODE=1 "$cos_root/chat-on-steroids" -e   'require(process.argv[1]); console.log("TREE_SITTER_ELECTRON_LOAD_OK")'   "$build_dir/node_modules/tree-sitter"
binary="$addon/prebuilds/linux-x64/tree-sitter.node"
if [[ ! -f "$binary.vendor" ]]; then sudo cp -p "$binary" "$binary.vendor"; fi
# Unlink the copy first: /opt/cos-runtime may contain hard links to vendor installation.
sudo rm -f -- "$binary"
sudo install -m 0644 "$build_dir/node_modules/tree-sitter/build/Release/tree_sitter_runtime_binding.node" "$binary"
sha256sum "$binary"
