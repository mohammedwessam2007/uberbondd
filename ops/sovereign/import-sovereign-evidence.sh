#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CONFIG="${UBERBOND_AUTHOR_CONFIG:-/etc/uberbond/authoring.env}"
[[ "${EUID}" -eq 0 ]] || { echo 'REFUSED: root-required' >&2; exit 2; }
[[ $# -eq 2 ]] || { echo 'usage: import-sovereign-evidence {signer|courier|runtime} /path/to/receipt.json' >&2; exit 2; }
for cmd in realpath stat install mv rm getent id runuser; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "REFUSED: missing-command:$cmd" >&2; exit 2; }
done
[[ -f "$CONFIG" && ! -L "$CONFIG" ]] || { echo "REFUSED: regular authoring config required: $CONFIG" >&2; exit 2; }
[[ "$(stat -c %u "$CONFIG")" == "0" && "$(stat -c %G "$CONFIG")" == "uberbond-author" && "$(stat -c %a "$CONFIG")" == "640" ]] || { echo 'REFUSED: authoring-config-custody-invalid' >&2; exit 2; }
id -u uberbond-author >/dev/null 2>&1 || { echo 'REFUSED: uberbond-author-identity-required' >&2; exit 2; }
id -u uberbond-promoter >/dev/null 2>&1 || { echo 'REFUSED: uberbond-promoter-identity-required' >&2; exit 2; }
getent group uberbond-autonomy >/dev/null || { echo 'REFUSED: uberbond-autonomy-group-required' >&2; exit 2; }
getent group uberbond-promotion >/dev/null || { echo 'REFUSED: uberbond-promotion-group-required' >&2; exit 2; }

config_value(){
  local key="$1" line value='' count=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "$key="* ]]; then value="${line#*=}"; count=$((count+1)); fi
  done < "$CONFIG"
  [[ "$count" -eq 1 && -n "$value" ]] || return 1
  printf '%s\n' "$value"
}
TYPE="$1"
SOURCE_RECEIPT="$2"
SOURCE_ROOT="$(config_value UBERBOND_SOURCE_ROOT)" || { echo 'REFUSED: single-source-root-config-required' >&2; exit 2; }
EVIDENCE_ROOT="$(config_value UBERBOND_SOVEREIGN_EVIDENCE_ROOT)" || { echo 'REFUSED: single-evidence-root-config-required' >&2; exit 2; }
PROMOTION_ROOT="$(config_value UBERBOND_PROMOTION_DIR)" || { echo 'REFUSED: single-promotion-root-config-required' >&2; exit 2; }
NODE_CONFIGURED="$(config_value UBERBOND_NODE_EXECUTABLE)" || { echo 'REFUSED: single-node-config-required' >&2; exit 2; }
GIT_CONFIGURED="$(config_value UBERBOND_GIT_EXECUTABLE)" || { echo 'REFUSED: single-git-config-required' >&2; exit 2; }
[[ "$SOURCE_ROOT" = /* && "$EVIDENCE_ROOT" = /* && "$PROMOTION_ROOT" = /* && "$NODE_CONFIGURED" = /* && "$GIT_CONFIGURED" = /* ]] || { echo 'REFUSED: absolute-config-paths-required' >&2; exit 2; }
[[ "$SOURCE_ROOT" != *$'\n'* && "$EVIDENCE_ROOT" != *$'\n'* && "$PROMOTION_ROOT" != *$'\n'* && "$NODE_CONFIGURED" != *$'\n'* && "$GIT_CONFIGURED" != *$'\n'* ]] || { echo 'REFUSED: single-line-config-paths-required' >&2; exit 2; }

NODE="$(realpath "$NODE_CONFIGURED" 2>/dev/null || true)"
GIT="$(realpath "$GIT_CONFIGURED" 2>/dev/null || true)"
[[ -n "$NODE" && -x "$NODE" && -f "$NODE" ]] || { echo 'REFUSED: trusted-real-node-required' >&2; exit 2; }
[[ -n "$GIT" && -x "$GIT" && -f "$GIT" ]] || { echo 'REFUSED: trusted-real-git-required' >&2; exit 2; }
[[ -d "$PROMOTION_ROOT" && ! -L "$PROMOTION_ROOT" ]] || { echo 'REFUSED: regular-promotion-root-required' >&2; exit 2; }
PROMOTION_ROOT="$(realpath "$PROMOTION_ROOT")"
[[ "$(stat -c %U "$PROMOTION_ROOT")" == "uberbond-promoter" && "$(stat -c %G "$PROMOTION_ROOT")" == "uberbond-promotion" && "$(stat -c %a "$PROMOTION_ROOT")" == "750" ]] || { echo 'REFUSED: promotion-root-custody-invalid' >&2; exit 2; }
PROMOTION_LOCK="$PROMOTION_ROOT/PROMOTION.lock"
TMP=''
PROMOTION_LOCK_CREATED=0
cleanup(){
  [[ -z "${TMP:-}" ]] || rm -f "$TMP"
  if [[ "${PROMOTION_LOCK_CREATED:-0}" == "1" ]]; then rm -f "$PROMOTION_LOCK"; fi
}
trap cleanup EXIT
set -o noclobber
if printf 'evidence-importer:%s\n' "$$" > "$PROMOTION_LOCK" 2>/dev/null; then
  PROMOTION_LOCK_CREATED=1
else
  set +o noclobber
  echo 'REFUSED: local-promotion-or-evidence-import-already-running' >&2
  exit 2
fi
set +o noclobber

[[ -d "$SOURCE_ROOT/.git" && ! -L "$SOURCE_ROOT" ]] || { echo 'REFUSED: exact-installed-git-source-required' >&2; exit 2; }
SOURCE_ROOT="$(realpath "$SOURCE_ROOT")"
[[ -d "$SOURCE_ROOT/.git" && ! -L "$SOURCE_ROOT" ]] || { echo 'REFUSED: resolved-installed-git-source-required' >&2; exit 2; }
[[ "$(stat -c %U "$SOURCE_ROOT")" == "uberbond-promoter" && "$(stat -c %G "$SOURCE_ROOT")" == "uberbond-autonomy" ]] || { echo 'REFUSED: installed-source-custody-invalid' >&2; exit 2; }
SOURCE_MODE="$(stat -c %a "$SOURCE_ROOT")"
(( (8#$SOURCE_MODE & 0022) == 0 )) || { echo 'REFUSED: installed-source-must-not-be-group-or-world-writable' >&2; exit 2; }
git_as_promoter(){ runuser -u uberbond-promoter -- "$GIT" -C "$SOURCE_ROOT" "$@"; }
[[ -z "$(git_as_promoter status --porcelain)" ]] || { echo 'REFUSED: installed-source-must-be-clean' >&2; exit 2; }
SOURCE_COMMIT="$(git_as_promoter rev-parse HEAD)"
[[ "$SOURCE_COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo 'REFUSED: exact-source-commit-required' >&2; exit 2; }

[[ -d "$EVIDENCE_ROOT" && ! -L "$EVIDENCE_ROOT" ]] || { echo 'REFUSED: protected-evidence-root-required' >&2; exit 2; }
[[ "$(stat -c %u "$EVIDENCE_ROOT")" == "0" ]] || { echo 'REFUSED: evidence-root-must-be-root-owned' >&2; exit 2; }
[[ "$(stat -c %G "$EVIDENCE_ROOT")" == "uberbond-autonomy" ]] || { echo 'REFUSED: evidence-root-group-must-be-uberbond-autonomy' >&2; exit 2; }
[[ "$(stat -c %a "$EVIDENCE_ROOT")" == "750" ]] || { echo 'REFUSED: evidence-root-mode-must-be-0750' >&2; exit 2; }

[[ -f "$SOURCE_RECEIPT" && ! -L "$SOURCE_RECEIPT" ]] || { echo 'REFUSED: regular-nonsymlink-receipt-required' >&2; exit 2; }
SOURCE_RECEIPT="$(realpath "$SOURCE_RECEIPT")"
[[ -f "$SOURCE_RECEIPT" && ! -L "$SOURCE_RECEIPT" ]] || { echo 'REFUSED: resolved-regular-receipt-required' >&2; exit 2; }
RECEIPT_BYTES="$(stat -c %s "$SOURCE_RECEIPT")"
[[ "$RECEIPT_BYTES" =~ ^[0-9]+$ && "$RECEIPT_BYTES" -gt 1 && "$RECEIPT_BYTES" -le 4000000 ]] || { echo 'REFUSED: bounded-receipt-size-required' >&2; exit 2; }

case "$TYPE" in
  signer) TARGET="$EVIDENCE_ROOT/signer-receipt.json" ;;
  courier) TARGET="$EVIDENCE_ROOT/courier-receipt.json" ;;
  runtime) TARGET="$EVIDENCE_ROOT/runtime-receipt.json" ;;
  *) echo 'REFUSED: evidence-type-must-be-signer-courier-or-runtime' >&2; exit 2 ;;
esac
[[ "$SOURCE_RECEIPT" != "$TARGET" ]] || { echo 'REFUSED: source-receipt-must-be-outside-evidence-target' >&2; exit 2; }

TMP="$EVIDENCE_ROOT/.${TYPE}-receipt.tmp.$$"
install -m 0640 -o root -g uberbond-autonomy "$SOURCE_RECEIPT" "$TMP"
[[ -f "$TMP" && ! -L "$TMP" && "$(stat -c %u "$TMP")" == "0" && "$(stat -c %G "$TMP")" == "uberbond-autonomy" && "$(stat -c %a "$TMP")" == "640" ]] || { echo 'REFUSED: staged-evidence-custody-invalid' >&2; exit 2; }

(
cd "$SOURCE_ROOT"
[[ "$(git_as_promoter rev-parse HEAD)" == "$SOURCE_COMMIT" && -z "$(git_as_promoter status --porcelain)" ]] || exit 2
runuser -u uberbond-author -- env \
  TYPE="$TYPE" RECEIPT_PATH="$TMP" EVIDENCE_ROOT="$EVIDENCE_ROOT" EXPECTED_SOURCE_COMMIT="$SOURCE_COMMIT" \
  "$NODE" --input-type=module - <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { compileSovereignBootstrapReadiness, REQUIRED_SOURCE_CONTRACTS } from './src/sovereign-bootstrap-readiness.mjs';
import { verifySovereignRuntimeRehearsalReceipt } from './ops/sovereign/sovereign-runtime-rehearsal-receipt.mjs';

function readJson(file){
  const raw=fs.readFileSync(file,'utf8');
  const value=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('receipt-object-required');
  return value;
}
const type=process.env.TYPE;
const sourceCommit=String(process.env.EXPECTED_SOURCE_COMMIT||'').toLowerCase();
const receipt=readJson(process.env.RECEIPT_PATH);
const sourceContracts=Object.fromEntries(REQUIRED_SOURCE_CONTRACTS.map(id=>[id,true]));
const base={sourceCommit,cleanSource:true,sourceContracts};
let ok=false;
if(type==='signer'){
  const out=compileSovereignBootstrapReadiness({...base,signerReceipt:receipt});
  ok=out.stages.separateReleaseSignerObserved===true;
}else if(type==='courier'){
  const signerPath=path.join(process.env.EVIDENCE_ROOT,'signer-receipt.json');
  const signer=readJson(signerPath);
  const out=compileSovereignBootstrapReadiness({...base,signerReceipt:signer,courierReceipt:receipt});
  ok=out.stages.separateReleaseSignerObserved===true&&out.stages.signedReleaseCourierObserved===true;
}else if(type==='runtime'){
  ok=verifySovereignRuntimeRehearsalReceipt(receipt)&&String(receipt.sourceCommit||'').toLowerCase()===sourceCommit;
}
if(!ok)process.exit(2);
NODE
[[ "$(git_as_promoter rev-parse HEAD)" == "$SOURCE_COMMIT" && -z "$(git_as_promoter status --porcelain)" ]] || exit 2
)

mv -f "$TMP" "$TARGET"
TMP=''
rm -f "$PROMOTION_LOCK"
PROMOTION_LOCK_CREATED=0
trap - EXIT
printf '{"ok":true,"status":"SOVEREIGN_EVIDENCE_IMPORTED","type":"%s","sourceCommit":"%s","target":"%s","signingAuthority":"NONE","deploymentAuthority":"NONE","businessEffectAuthority":"NONE","externalEffectAuthority":"NONE"}\n' "$TYPE" "$SOURCE_COMMIT" "$TARGET"
