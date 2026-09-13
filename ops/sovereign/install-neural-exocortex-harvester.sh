#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "${EUID}" -eq 0 ]] || { echo "Run as root." >&2; exit 2; }
SOURCE_ROOT="${UBERBOND_SOURCE_ROOT:-/opt/uberbond/source}"
CORPUS_ROOT="${UBERBOND_CAPABILITY_GENOME_CORPUS_DIR:-/var/lib/uberbond-capability-corpus}"
SERVICE="uberbond-neural-exocortex-harvest.service"
TIMER="uberbond-neural-exocortex-harvest.timer"

for command_name in install systemctl id getent; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "Missing prerequisite: $command_name" >&2; exit 2; }
done
[[ -d "$SOURCE_ROOT" && ! -L "$SOURCE_ROOT" ]] || { echo "REFUSED: trusted source root required" >&2; exit 2; }
id -u uberbond-author >/dev/null 2>&1 || { echo "REFUSED: uberbond-author account required" >&2; exit 2; }
getent group uberbond-autonomy >/dev/null || { echo "REFUSED: uberbond-autonomy group required" >&2; exit 2; }
for file in \
  "$SOURCE_ROOT/ops/sovereign/$SERVICE" \
  "$SOURCE_ROOT/ops/sovereign/$TIMER" \
  "$SOURCE_ROOT/scripts/neural-repository-harvest.mjs" \
  "$SOURCE_ROOT/scripts/neural-exocortex-compact.mjs" \
  "$SOURCE_ROOT/scripts/neural-exocortex-brain-pulse.mjs"; do
  [[ -f "$file" && ! -L "$file" ]] || { echo "REFUSED: required Neural Exocortex source missing: $file" >&2; exit 2; }
done
[[ "$CORPUS_ROOT" = /* && "$CORPUS_ROOT" != "/" ]] || { echo "REFUSED: absolute non-root corpus directory required" >&2; exit 2; }

install -d -m 0700 -o uberbond-author -g uberbond-autonomy "$CORPUS_ROOT"
install -d -m 0700 -o uberbond-author -g uberbond-autonomy "$CORPUS_ROOT/neural-exocortex"
install -d -m 0700 /etc/uberbond
cat > /etc/uberbond/capability-genome.env <<EOF
UBERBOND_CAPABILITY_GENOME_NETWORK_READS=1
UBERBOND_CAPABILITY_GENOME_CORPUS_DIR=$CORPUS_ROOT
EOF
chown root:uberbond-author /etc/uberbond/capability-genome.env
chmod 0640 /etc/uberbond/capability-genome.env
install -m 0644 "$SOURCE_ROOT/ops/sovereign/$SERVICE" "/etc/systemd/system/$SERVICE"
install -m 0644 "$SOURCE_ROOT/ops/sovereign/$TIMER" "/etc/systemd/system/$TIMER"
systemctl daemon-reload
systemctl enable --now "$TIMER"

cat <<EOF
UberBond Neural Exocortex harvester installed.
Corpus root:       $CORPUS_ROOT/neural-exocortex
Read authority:    public GitHub metadata only
Cadence:           every six hours with bounded randomized delay
Final target:      1,000,000 deduplicated retained neural capability records
Active-cortex law: discovered/reference records never become executable without separate security, benchmark, promotion, permission and mission gates
Revenue runtime:   independent; this timer does not stop or replace the sovereign revenue continuum
EOF
