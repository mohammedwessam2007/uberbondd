#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo 'Run as root on the UberLit host.' >&2; exit 2; }
[[ -r /dev/tty && -w /dev/tty ]] || { echo 'REFUSED: interactive TTY required for secret entry.' >&2; exit 2; }
SOURCE=/opt/uberlit/source
[[ -f "$SOURCE/scripts/uberlit-typesafe-secret.mjs" ]] || { echo 'REFUSED: canonical UberLit source is not installed.' >&2; exit 2; }

restore_tty() { stty echo </dev/tty 2>/dev/null || true; }
trap restore_tty EXIT INT TERM

printf 'Paste the TypeSafe API key. Input is hidden: ' >/dev/tty
stty -echo </dev/tty
IFS= read -r TYPESAFE_KEY </dev/tty
stty echo </dev/tty
printf '\n' >/dev/tty

[[ -n "$TYPESAFE_KEY" ]] || { unset TYPESAFE_KEY; echo 'REFUSED: empty TypeSafe key.' >&2; exit 2; }
RECEIPT="$(printf '%s' "$TYPESAFE_KEY" | node "$SOURCE/scripts/uberlit-typesafe-secret.mjs" store --root /var/lib/uberlit/uberbond)"
unset TYPESAFE_KEY
printf '%s\n' "$RECEIPT"

node "$SOURCE/scripts/uberlit-typesafe-secret.mjs" status --root /var/lib/uberlit/uberbond |
  node --input-type=module -e "let s='';for await(const c of process.stdin)s+=c;const j=JSON.parse(s);if(j?.ok!==true||j?.keyReturned!==false)process.exit(2)"
echo 'UBERLIT_TYPESAFE_SECRET_READY'
