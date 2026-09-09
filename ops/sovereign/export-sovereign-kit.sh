#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="${1:-.}"
OUT="${2:-}"
cd "$ROOT"
for cmd in git npm docker sha256sum openssl tar awk uname date; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done
HEAD="$(git rev-parse HEAD)"
[[ "$HEAD" =~ ^[0-9a-f]{40}$ ]] || { echo "Exact source commit required." >&2; exit 2; }
[[ -z "$(git status --porcelain)" ]] || { echo "Clean source checkout required." >&2; exit 2; }
[[ -d node_modules ]] || { echo "Preseeded node_modules required." >&2; exit 2; }
npm ls --all >/dev/null

SIGNING_KEY="${UBERBOND_RELEASE_SIGNING_KEY:-${XDG_CONFIG_HOME:-${HOME}/.config}/uberbond-release/release-private.pem}"
[[ -f "$SIGNING_KEY" && ! -L "$SIGNING_KEY" ]] || { echo "Offline release signing private key required." >&2; exit 2; }
BASE_IMAGE="$(awk '/^FROM[[:space:]]+/{print $2; exit}' Dockerfile.sovereign)"
PG_IMAGE="${UBERBOND_POSTGRES_IMAGE:-postgres:16-alpine}"
[[ -n "$BASE_IMAGE" ]] || { echo "Sovereign base image not found." >&2; exit 2; }
docker image inspect "$BASE_IMAGE" >/dev/null 2>&1 || { echo "Base image is not local: $BASE_IMAGE" >&2; exit 2; }
docker image inspect "$PG_IMAGE" >/dev/null 2>&1 || { echo "Postgres image is not local: $PG_IMAGE" >&2; exit 2; }
BASE_ID="$(docker image inspect -f '{{.Id}}' "$BASE_IMAGE")"
PG_ID="$(docker image inspect -f '{{.Id}}' "$PG_IMAGE")"
[[ "$BASE_ID" =~ ^sha256:[0-9a-f]{64}$ && "$PG_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "Immutable image IDs required." >&2; exit 2; }
LOCK_SHA="$(sha256sum package-lock.json | awk '{print $1}')"
ARCH="$(uname -m)"
CREATED="$(date -u +%Y%m%d%H%M%S)"
OUT="${OUT:-dist/sovereign-kit-${HEAD}-${CREATED}}"
mkdir -p "$OUT"

# Full history and refs, not a shallow snapshot.
git bundle create "$OUT/uberbond-source.bundle" --all
git bundle verify "$OUT/uberbond-source.bundle" >/dev/null

# Dependency bytes already proven sufficient by npm ls. No registry access.
tar -cf "$OUT/node_modules.tar" node_modules

# Base/runtime DB images needed for future network-isolated release builds.
docker save -o "$OUT/build-images.oci.tar" "$BASE_IMAGE" "$PG_IMAGE"

cat > "$OUT/kit.env" <<EOF
SOURCE_COMMIT=${HEAD}
CREATED_SEQUENCE=${CREATED}
ARCH=${ARCH}
PACKAGE_LOCK_SHA256=${LOCK_SHA}
BASE_IMAGE=${BASE_IMAGE}
BASE_IMAGE_ID=${BASE_ID}
POSTGRES_IMAGE=${PG_IMAGE}
POSTGRES_IMAGE_ID=${PG_ID}
EOF
(cd "$OUT" && sha256sum uberbond-source.bundle node_modules.tar build-images.oci.tar kit.env > SHA256SUMS)
cat "$OUT/kit.env" "$OUT/SHA256SUMS" > "$OUT/.attestation"
openssl dgst -sha256 -sign "$SIGNING_KEY" -out "$OUT/kit.sig" "$OUT/.attestation"
rm -f "$OUT/.attestation"
printf 'SOVEREIGN_KIT_READY source=%s arch=%s path=%s\n' "$HEAD" "$ARCH" "$OUT"
