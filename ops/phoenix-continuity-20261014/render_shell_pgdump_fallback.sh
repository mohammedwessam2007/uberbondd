#!/usr/bin/env bash
# PHOENIX fallback: run INSIDE a Render private shell/job that already has the source
# connection bound as SOURCE_DATABASE_URL (provider-native reference). Never paste URLs/keys into chat.
# Produces an encrypted, hash-receipted logical dump. Read-only on the source. Opens no firewall.
set -euo pipefail
: "${SOURCE_DATABASE_URL:?bound by provider}" "${BACKUP_PASSPHRASE:?bound by provider}"
ts=$(date -u +%Y%m%dT%H%M%SZ); out="${OUT_DIR:-/tmp}/uberbond_src_${ts}.dump.enc"
pg_dump --format=custom --no-owner --no-privileges --serializable-deferrable "$SOURCE_DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_PASSPHRASE -out "$out"
psql "$SOURCE_DATABASE_URL" -Atc "select 'tables='||count(*) from information_schema.tables where table_schema='public'"
sha256sum "$out"; wc -c "$out"
echo "receipt: ts=$ts file=$out (copy to encrypted off-Render storage BEFORE 2026-10-16T23:22:29Z; restore only into a NEW EMPTY target)"
