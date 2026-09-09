#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

OUT="${1:-${XDG_CONFIG_HOME:-${HOME}/.config}/uberbond-release}"
[[ "$OUT" = /* ]] || { echo "Release authority directory must be absolute." >&2; exit 2; }
command -v openssl >/dev/null 2>&1 || { echo "openssl is required." >&2; exit 2; }
mkdir -p "$OUT"
chmod 700 "$OUT"
PRIVATE="$OUT/release-private.pem"
PUBLIC="$OUT/release-public.pem"
[[ ! -e "$PRIVATE" && ! -e "$PUBLIC" ]] || { echo "Refusing to overwrite an existing release authority." >&2; exit 2; }
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$PRIVATE"
openssl pkey -in "$PRIVATE" -pubout -out "$PUBLIC"
chmod 600 "$PRIVATE"
chmod 644 "$PUBLIC"
printf '%s\n' "Release authority created." \
  "PRIVATE (keep off runtime hosts): $PRIVATE" \
  "PUBLIC  (copy to runtime host):  $PUBLIC"
