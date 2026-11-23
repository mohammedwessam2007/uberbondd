#!/bin/sh
# Fetch the pinned Maia3-5M ONNX export used by chimera/maia.py (offline afterwards).
# Source: npm package maia3-js@0.2.0 (MIT, Cem Unuvar), which bundles the same file
# as huggingface.co/cemoss17/maia3-onnx. Underlying weights: huggingface.co/UofTCSSLab/Maia3-5M.
set -eu
cd "$(dirname "$0")/.."
mkdir -p models && cd models
npm pack maia3-js@0.2.0 --silent >/dev/null
tar xzf maia3-js-0.2.0.tgz package/models/maia3_5m.onnx package/data/moves.json package/LICENSE
mv package/models/maia3_5m.onnx maia3_5m.onnx
mv package/data/moves.json maia3_moves.json
mv package/LICENSE MAIA3_JS_LICENSE
rm -rf package maia3-js-0.2.0.tgz
echo "f7bd01b3e41dceb5e93eb9f4c61e9c4db8b35411effd1d8c984b006cd74bb804  maia3_5m.onnx" | sha256sum -c -
