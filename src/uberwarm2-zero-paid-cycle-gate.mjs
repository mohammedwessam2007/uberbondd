/**
 * UberWarm cron-to-one-shot gate. The five-minute monitor remains read-only;
 * a separately approved exact one-shot may run only with all independently
 * protected sources present. This does not create consent or send authority.
 */
export const UBERWARM2_ZERO_PAID_CYCLE_VERSION = 'uberbond.uberwarm2-zero-paid-cycle.v1';
const PROBE_ID = /^[A-Za-z0-9._:-]{1,250}$/;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const refusal = (status, reasons) => Object.freeze({
  version: UBERWARM2_ZERO_PAID_CYCLE_VERSION, status,
  reasonCodes: Object.freeze([...new Set(reasons)]),
  providerSubmissions: 0, automaticRetryAuthorized: false,
  providerWarmupAddonEnabled: false, spendCents: 0
});
export function compileUberWarm2ZeroPaidCronGate({ monitor, environment = {} } = {}) {
  const e = environment || {};
  const reasons = [];
  // An operator must set BOTH controls for a single exact seed. Neither the
  // provider token nor this script's presence enables the send path.
  if (e.UBERWARM_CADENCE_ENABLED !== 'true') reasons.push('exact-owner-seed-cadence-not-enabled');
  if (e.UBERWARM_ONE_SHOT_EXECUTION_ALLOWED !== 'true') reasons.push('protected-one-shot-not-approved');
  if (e.OUTBOUND_ENABLED === 'true' || e.UBERWARM_SEND_ENABLED === 'true') reasons.push('commercial-outbound-not-isolated');
  if (!PROBE_ID.test(e.UBERWARM_ONE_SHOT_PROBE_ID || '')) reasons.push('exact-probe-identity-required');
  if (!EMAIL.test(e.UBERWARM_ONE_SHOT_SENDER || '') || !EMAIL.test(e.UBERWARM_ONE_SHOT_RECIPIENT || '') ||
    e.UBERWARM_ONE_SHOT_SENDER === e.UBERWARM_ONE_SHOT_RECIPIENT)
    reasons.push('exact-separate-sender-recipient-required');
  if (!e.UBERWARM_ONE_SHOT_EVIDENCE_PATH?.startsWith('/') ||
    !e.UBERWARM_ONE_SHOT_EVIDENCE_PATH || !e.UBERWARM_ONE_SHOT_APPROVAL_VERIFICATION_KEY ||
    e.UBERWARM_ONE_SHOT_APPROVAL_VERIFICATION_KEY.length < 32 ||
    !e.UBERWARM_ONE_SHOT_WINNR_USER_ID || !e.WINNR_API_TOKEN || !e.DATABASE_URL)
    reasons.push('sealed-source-approval-and-ledger-config-required');
  if (monitor?.status !== 'BLOCKED_FOR_SENDING' || monitor?.database?.recovery !== false ||
      monitor?.database?.ledger_present !== true ||
      monitor?.provider?.status !== 'UBERWARM2_WINNR_LIVE_INVENTORY_OBSERVED' ||
      monitor?.provider?.accountRead !== true ||
      monitor?.provider?.providerReceiptDigestsPresent !== true ||
      monitor?.sendAuthority !== 'NONE' || monitor?.sends !== 0 ||
      (Array.isArray(monitor?.blockers) && monitor.blockers.some(x=>x === 'database-read-failed' ||
        x === 'authoritative-primary-ledger-unavailable' || x === 'authenticated-provider-read-not-ready' ||
        x === 'operational-receipt-persistence-failed')))
    reasons.push('fresh-read-monitor-primary-and-provider-evidence-required');
  return refusal(reasons.length ? 'UBERWARM2_ONE_SHOT_CADENCE_HELD' : 'UBERWARM2_ONE_SHOT_CADENCE_ELIGIBLE_FOR_PROTECTED_PREFLIGHT', reasons);
}
