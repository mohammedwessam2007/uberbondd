export const PAYMENT_RECONCILIATION_WATCHDOG_VERSION = 'uberbond.payment-reconciliation-watchdog.v1';
const TERMINAL = new Set(['RECONCILED','IGNORED','FAILED']);

export function planPaymentReconciliation(event = {}, options = {}) {
  const now = new Date(options.now || Date.now());
  const staleClaimMs = Math.max(60000, Number(options.staleClaimMs || 15 * 60 * 1000));
  const uncertainEscalationMs = Math.max(60000, Number(options.uncertainEscalationMs || 30 * 60 * 1000));
  const maxAttempts = Math.max(1, Math.min(20, Number(options.maxAttempts || 5)));
  const status = String(event.status || '').toUpperCase();
  const attempts = Number(event.claimAttempts || event.claim_attempts || 0);
  const claimedAt = event.claimedAt || event.claimed_at;
  const updatedAt = event.updatedAt || event.updated_at || event.receivedAt || event.received_at;
  const age = value => value ? now.getTime() - new Date(value).getTime() : Infinity;

  if (!status) return { ok:false, status:'BLOCKED', reasonCodes:['billing-status-required'], businessEffectAuthority:'NONE', unlockAuthorized:false };
  if (TERMINAL.has(status)) return { ok:true, action:'NOOP_TERMINAL', businessEffectAuthority:'NONE', unlockAuthorized:false };
  if (attempts >= maxAttempts && !['RECONCILED','IGNORED'].includes(status)) return { ok:true, action:'ESCALATE_REVIEW', reasonCodes:['billing-reconciliation-attempt-cap-reached'], businessEffectAuthority:'NONE', unlockAuthorized:false };
  if (status === 'CLAIMED' && age(claimedAt) >= staleClaimMs) return { ok:true, action:'RECOVER_STALE_CLAIM', reasonCodes:['billing-claim-lease-stale'], businessEffectAuthority:'NONE', unlockAuthorized:false };
  if (status === 'UNCERTAIN') {
    return age(updatedAt) >= uncertainEscalationMs
      ? { ok:true, action:'ESCALATE_REVIEW', reasonCodes:['provider-state-uncertain-reconciliation-required'], businessEffectAuthority:'NONE', unlockAuthorized:false }
      : { ok:true, action:'WAIT_FOR_RECONCILIATION', reasonCodes:['provider-state-uncertain-no-blind-retry'], businessEffectAuthority:'NONE', unlockAuthorized:false };
  }
  if (['RECEIVED','RETRYABLE'].includes(status)) return { ok:true, action:'CLAIM_FOR_RECONCILIATION', businessEffectAuthority:'NONE', unlockAuthorized:false };
  return { ok:false, status:'BLOCKED', reasonCodes:[`unsupported-billing-status:${status}`], businessEffectAuthority:'NONE', unlockAuthorized:false };
}
