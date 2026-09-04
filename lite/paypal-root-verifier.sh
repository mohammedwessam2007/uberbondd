#!/usr/bin/env bash
set -euo pipefail
cd ..
echo "LITE_ROOT_VERIFIER_HEAD $(git rev-parse HEAD)"
npm ci
node .github/paypal-core-closure-foundry.mjs
