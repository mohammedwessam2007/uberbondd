#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

CTL="${UBERBOND_CTL:-/opt/uberbond/control/uberbondctl}"
STATE_FILE="${UBERBOND_STATE_FILE:-/var/lib/uberbond-control/state.env}"
RUNTIME_ENV="${UBERBOND_RUNTIME_ENV:-/etc/uberbond/uberbond.env}"
RECEIPT_PATH="${UBERBOND_RUNTIME_REHEARSAL_RECEIPT:-/var/lib/uberbond-control/runtime-rehearsal-receipt.json}"
FAILING_RELEASE="${1:-}"

die(){ printf 'SOVEREIGN_RUNTIME_REHEARSAL_REFUSED reason=%s\n' "$*" >&2; exit 2; }
need(){ command -v "$1" >/dev/null 2>&1 || die "missing-command:$1"; }
state_get(){ local key="$1" line; [[ -f "$STATE_FILE" && ! -L "$STATE_FILE" ]] || die "regular-runtime-state-required"; line="$(grep -E "^${key}=[A-Za-z0-9._:/@+,-]+$" "$STATE_FILE" | tail -n 1 || true)"; [[ -n "$line" ]] || die "runtime-state-field-required:${key}"; printf '%s\n' "${line#*=}"; }
env_exact(){ local key="$1" want="$2" line; [[ -f "$RUNTIME_ENV" && ! -L "$RUNTIME_ENV" ]] || die "regular-runtime-env-required"; line="$(grep -E "^${key}=[A-Za-z0-9._:/@+,-]+$" "$RUNTIME_ENV" | tail -n 1 || true)"; [[ "${line#*=}" == "$want" ]] || die "runtime-rehearsal-fail-closed-posture-required:${key}"; }
container_exact(){ local name="$1" image_id="$2"; [[ "$(docker inspect -f '{{.State.Running}}|{{.Image}}' "$name" 2>/dev/null || true)" == "true|${image_id}" ]]; }
write_receipt(){ local body="$1" tmp="${RECEIPT_PATH}.tmp.$$"; printf '%s\n' "$body" > "$tmp"; chmod 600 "$tmp"; mv -f "$tmp" "$RECEIPT_PATH"; }
recover_original(){
  set +e
  local now prev
  now="$(state_get CURRENT_SOURCE_COMMIT 2>/dev/null)"
  prev="$(state_get PREVIOUS_SOURCE_COMMIT 2>/dev/null)"
  if [[ -n "${ORIGINAL_SOURCE:-}" && "$now" != "$ORIGINAL_SOURCE" && "$prev" == "$ORIGINAL_SOURCE" ]]; then "$CTL" rollback >/dev/null 2>&1; fi
  "$CTL" reconcile >/dev/null 2>&1
  set -e
}
trap 'rc=$?; if [[ $rc -ne 0 ]]; then recover_original; rm -f "${RESTART_FILE:-}" "${RECEIPT_TMP:-}"; fi' EXIT

[[ "${EUID}" -eq 0 ]] || die "root-required"
[[ -n "$FAILING_RELEASE" ]] || die "usage: sovereign-runtime-rehearsal.sh /path/to/valid-signed-next-release-that-fails-after-admission"
[[ "$FAILING_RELEASE" = /* && "$FAILING_RELEASE" =~ ^[A-Za-z0-9._/+@=-]+$ ]] || die "safe-absolute-failing-release-path-required"
[[ -d "$FAILING_RELEASE" && ! -L "$FAILING_RELEASE" ]] || die "regular-failing-release-directory-required"
[[ -x "$CTL" && -f "$CTL" && ! -L "$CTL" ]] || die "installed-uberbondctl-required"
for cmd in docker systemctl grep tail chmod mv mktemp; do need "$cmd"; done
env_exact AUTOPILOT_ENABLED false
env_exact OUTBOUND_ENABLED false
env_exact OUTBOUND_DRY_RUN true

ORIGINAL_SOURCE="$(state_get CURRENT_SOURCE_COMMIT)"
ORIGINAL_ID="$(state_get CURRENT_RELEASE_ID)"
ORIGINAL_SEQUENCE="$(state_get CURRENT_RELEASE_SEQUENCE)"
ORIGINAL_PREVIOUS_SOURCE="$(state_get PREVIOUS_SOURCE_COMMIT)"
ORIGINAL_PREVIOUS_ID="$(state_get PREVIOUS_RELEASE_ID)"
ORIGINAL_PREVIOUS_SEQUENCE="$(state_get PREVIOUS_RELEASE_SEQUENCE)"
[[ "$ORIGINAL_SOURCE" =~ ^[0-9a-f]{40}$ && "$ORIGINAL_PREVIOUS_SOURCE" =~ ^[0-9a-f]{40}$ ]] || die "exact-current-and-previous-source-required"
[[ "$ORIGINAL_ID" =~ ^sha256:[0-9a-f]{64}$ && "$ORIGINAL_PREVIOUS_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || die "exact-current-and-previous-image-ids-required"
[[ "$ORIGINAL_SEQUENCE" =~ ^[0-9]{14}$ && "$ORIGINAL_PREVIOUS_SEQUENCE" =~ ^[0-9]{14}$ ]] || die "exact-current-and-previous-sequences-required"
[[ "$ORIGINAL_SOURCE" != "$ORIGINAL_PREVIOUS_SOURCE" || "$ORIGINAL_ID" != "$ORIGINAL_PREVIOUS_ID" ]] || die "two-distinct-good-release-history-required-for-reversible-rollback"
systemctl is-active --quiet uberbond-reconcile.timer || die "independent-reconcile-timer-must-be-active"

"$CTL" status >/dev/null
"$CTL" backup >/dev/null
RESTORE_OUT="$("$CTL" restore-drill 2>&1)"
grep -Fq 'RESTORE_DRILL_PASSED' <<<"$RESTORE_OUT" || die "restore-drill-pass-marker-required"

RESTART_FILE="$(mktemp)"
docker exec -e "SOURCE_COMMIT=${ORIGINAL_SOURCE}" uberbond-web node scripts/deploy-restart-recovery-drill.mjs >"$RESTART_FILE"
RESTART_DIGEST="$(docker exec -i -e "EXPECTED_SOURCE_COMMIT=${ORIGINAL_SOURCE}" uberbond-web node --input-type=module -e '
import fs from "node:fs";
import {verifyRestartRecoveryReceiptIntegrity} from "./src/deploy-restart-recovery-receipt.mjs";
const r=JSON.parse(fs.readFileSync(0,"utf8"));
if(!verifyRestartRecoveryReceiptIntegrity(r)||r.sourceCommit!==process.env.EXPECTED_SOURCE_COMMIT)process.exit(2);
process.stdout.write(r.receiptDigest);
' <"$RESTART_FILE")"
[[ "$RESTART_DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || die "durable-restart-recovery-receipt-invalid"
rm -f "$RESTART_FILE"; unset RESTART_FILE

docker kill uberbond-web >/dev/null
"$CTL" reconcile >/dev/null
container_exact uberbond-web "$ORIGINAL_ID" || die "web-not-reconciled-to-exact-admitted-image"

docker kill uberbond-worker >/dev/null
"$CTL" reconcile >/dev/null
container_exact uberbond-worker "$ORIGINAL_ID" || die "worker-not-reconciled-to-exact-admitted-image"

set +e
FAILED_OUT="$("$CTL" deploy "$FAILING_RELEASE" 2>&1)"
FAILED_RC=$?
set -e
if [[ "$FAILED_RC" -eq 0 ]]; then die "rehearsal-candidate-unexpectedly-promoted"; fi
grep -Fq 'promotion refused and rollback attempted' <<<"$FAILED_OUT" || die "post-admission-failed-promotion-rollback-marker-required"
[[ "$(state_get CURRENT_SOURCE_COMMIT)" == "$ORIGINAL_SOURCE" && "$(state_get CURRENT_RELEASE_ID)" == "$ORIGINAL_ID" && "$(state_get CURRENT_RELEASE_SEQUENCE)" == "$ORIGINAL_SEQUENCE" ]] || die "failed-promotion-did-not-restore-original-admitted-state"

"$CTL" rollback >/dev/null
[[ "$(state_get CURRENT_SOURCE_COMMIT)" == "$ORIGINAL_PREVIOUS_SOURCE" && "$(state_get CURRENT_RELEASE_ID)" == "$ORIGINAL_PREVIOUS_ID" ]] || die "explicit-rollback-did-not-reach-previous-exact-state"
"$CTL" rollback >/dev/null
FINAL_SOURCE="$(state_get CURRENT_SOURCE_COMMIT)"
FINAL_ID="$(state_get CURRENT_RELEASE_ID)"
FINAL_PREVIOUS_SOURCE="$(state_get PREVIOUS_SOURCE_COMMIT)"
FINAL_PREVIOUS_ID="$(state_get PREVIOUS_RELEASE_ID)"
[[ "$FINAL_SOURCE" == "$ORIGINAL_SOURCE" && "$FINAL_ID" == "$ORIGINAL_ID" && "$FINAL_PREVIOUS_SOURCE" == "$ORIGINAL_PREVIOUS_SOURCE" && "$FINAL_PREVIOUS_ID" == "$ORIGINAL_PREVIOUS_ID" ]] || die "explicit-rollback-roundtrip-did-not-restore-starting-state"
container_exact uberbond-web "$FINAL_ID" || die "final-web-not-on-restored-current-image"
container_exact uberbond-worker "$FINAL_ID" || die "final-worker-not-on-restored-current-image"

RECEIPT_TMP="$(mktemp)"
docker exec \
  -e "REHEARSAL_SOURCE=${FINAL_SOURCE}" \
  -e "REHEARSAL_PREVIOUS_SOURCE=${FINAL_PREVIOUS_SOURCE}" \
  -e "REHEARSAL_CURRENT_ID=${FINAL_ID}" \
  -e "REHEARSAL_PREVIOUS_ID=${FINAL_PREVIOUS_ID}" \
  -e "REHEARSAL_RESTART_DIGEST=${RESTART_DIGEST}" \
  uberbond-web node --input-type=module -e '
import {compileSovereignRuntimeRehearsalReceipt,verifySovereignRuntimeRehearsalReceipt} from "./ops/sovereign/sovereign-runtime-rehearsal-receipt.mjs";
const commands=["status","backup","restore-drill","durable-postgres-crash-recovery","kill-web+reconcile","kill-worker+reconcile","deploy-valid-signed-failing-candidate","failed-promotion-rollback","explicit-rollback-out","explicit-rollback-return"];
const r=compileSovereignRuntimeRehearsalReceipt({
  sourceCommit:process.env.REHEARSAL_SOURCE,previousSourceCommit:process.env.REHEARSAL_PREVIOUS_SOURCE,
  finalCurrentReleaseId:process.env.REHEARSAL_CURRENT_ID,finalPreviousReleaseId:process.env.REHEARSAL_PREVIOUS_ID,
  durableRestartRecoveryReceiptDigest:process.env.REHEARSAL_RESTART_DIGEST,
  backupObserved:true,restoreDrillObserved:true,webReconciledToExactImage:true,workerReconciledToExactImage:true,
  failedPromotionRollbackObserved:true,explicitRollbackRoundTripObserved:true,commands
});
if(!verifySovereignRuntimeRehearsalReceipt(r))process.exit(2);
process.stdout.write(JSON.stringify(r,null,2));
' >"$RECEIPT_TMP"
RECEIPT_BODY="$(cat "$RECEIPT_TMP")"
write_receipt "$RECEIPT_BODY"
rm -f "$RECEIPT_TMP"; unset RECEIPT_TMP
trap - EXIT
printf '%s\n' "$RECEIPT_BODY"
