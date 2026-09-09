#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

KIT="${1:-}"
TARGET="${2:-}"
PUBLIC_KEY="${3:-}"
[[ -n "$KIT" && -n "$TARGET" && -n "$PUBLIC_KEY" ]] || { echo "usage: import-sovereign-kit.sh KIT_DIR TARGET_DIR RELEASE_PUBLIC_KEY" >&2; exit 2; }
for cmd in git npm docker sha256sum openssl tar uname grep cut find; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing prerequisite: $cmd" >&2; exit 2; }; done
[[ -d "$KIT" && ! -L "$KIT" ]] || { echo "Regular kit directory required." >&2; exit 2; }
[[ ! -e "$TARGET" ]] || { echo "Target must not already exist." >&2; exit 2; }
[[ -f "$PUBLIC_KEY" && ! -L "$PUBLIC_KEY" ]] || { echo "Regular release public key required." >&2; exit 2; }
[[ -z "$(find "$KIT" -type l -print -quit)" ]] || { echo "Kit may not contain symlinks." >&2; exit 2; }
for file in kit.env SHA256SUMS kit.sig uberbond-source.bundle node_modules.tar build-images.oci.tar; do
  [[ -f "$KIT/$file" && ! -L "$KIT/$file" ]] || { echo "Kit missing regular $file" >&2; exit 2; }
done
(cd "$KIT" && sha256sum -c SHA256SUMS >/dev/null) || { echo "Kit checksum verification failed." >&2; exit 2; }
cat "$KIT/kit.env" "$KIT/SHA256SUMS" > "$KIT/.attestation.$$"
if ! openssl dgst -sha256 -verify "$PUBLIC_KEY" -signature "$KIT/kit.sig" "$KIT/.attestation.$$" >/dev/null 2>&1; then
  rm -f "$KIT/.attestation.$$"; echo "Kit signature verification failed." >&2; exit 2
fi
rm -f "$KIT/.attestation.$$"

get(){ grep -E "^$1=[A-Za-z0-9._:/@+,-]+$" "$KIT/kit.env" | cut -d= -f2-; }
SOURCE="$(get SOURCE_COMMIT)"
ARCH="$(get ARCH)"
LOCK_SHA="$(get PACKAGE_LOCK_SHA256)"
BASE_IMAGE="$(get BASE_IMAGE)"
BASE_ID="$(get BASE_IMAGE_ID)"
PG_IMAGE="$(get POSTGRES_IMAGE)"
PG_ID="$(get POSTGRES_IMAGE_ID)"
[[ "$SOURCE" =~ ^[0-9a-f]{40}$ && "$LOCK_SHA" =~ ^[0-9a-f]{64}$ ]] || { echo "Kit source/lock identity malformed." >&2; exit 2; }
[[ "$BASE_ID" =~ ^sha256:[0-9a-f]{64}$ && "$PG_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo "Kit image identity malformed." >&2; exit 2; }
[[ "$ARCH" == "$(uname -m)" ]] || { echo "Kit architecture $ARCH does not match this host $(uname -m)." >&2; exit 2; }

# Reject archive traversal before extraction. Every member must remain under node_modules/.
while IFS= read -r member; do
  [[ "$member" == node_modules || "$member" == node_modules/* ]] || { echo "Unsafe dependency archive member: $member" >&2; exit 2; }
  [[ "$member" != /* && "$member" != *"../"* && "$member" != ".." ]] || { echo "Dependency archive traversal refused." >&2; exit 2; }
done < <(tar -tf "$KIT/node_modules.tar")

docker load -i "$KIT/build-images.oci.tar" >/dev/null
[[ "$(docker image inspect -f '{{.Id}}' "$BASE_IMAGE")" == "$BASE_ID" ]] || { echo "Base image identity mismatch after load." >&2; exit 2; }
[[ "$(docker image inspect -f '{{.Id}}' "$PG_IMAGE")" == "$PG_ID" ]] || { echo "Postgres image identity mismatch after load." >&2; exit 2; }

git clone "$KIT/uberbond-source.bundle" "$TARGET"
cd "$TARGET"
git checkout --detach "$SOURCE"
[[ "$(git rev-parse HEAD)" == "$SOURCE" ]] || { echo "Restored source commit mismatch." >&2; exit 2; }
[[ "$(sha256sum package-lock.json | cut -d' ' -f1)" == "$LOCK_SHA" ]] || { echo "Restored package lock mismatch." >&2; exit 2; }
tar -xf "$KIT/node_modules.tar"
npm ls --all >/dev/null
printf 'SOVEREIGN_KIT_RESTORED source=%s arch=%s target=%s\n' "$SOURCE" "$ARCH" "$TARGET"
