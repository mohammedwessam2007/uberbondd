// Durable warm-up orchestration. Warm-up is a distinct lane from cold
// outreach: nothing in this module ever authorizes a cold send, and every
// state transition here is driven by a real provider adapter response, not
// a local guess or a manufactured "warm-up conversation."
//
// Reuses the existing durable job queue (src/queue.mjs -- lease-based,
// bounded retries, stale-job recovery already implemented and tested there)
// rather than building a second job system. This module supplies the
// warm-up-specific decision logic that a queue job handler calls.
import { redactProviderReceipt } from './provider-adapter-contract.mjs';

export const WARMUP_ORCHESTRATOR_POLICY_VERSION = 'warmup-orchestrator-1.0.0';

export const WARMUP_STATES = Object.freeze([
  'WARMUP_NOT_STARTED', 'WARMUP_REQUESTED', 'WARMUP_ACTIVE', 'WARMUP_PAUSED',
  'WARMUP_COMPLETE', 'WARMUP_UNCERTAIN', 'WARMUP_BLOCKED'
]);

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

// A conservative, gradual ramp: never jumps to a large volume on day one.
// Purely a planning schedule -- the actual cap enforced at send time always
// comes from the provider's own reported cap when available, never this
// function alone, and mailbox.currentDailyCap must be provider-confirmed to
// count as real.
export function plannedWarmupCapForDay(dayIndex, { startCap = 2, dailyIncrement = 2, maxCap = 40 } = {}) {
  const day = Math.max(0, Math.floor(Number(dayIndex) || 0));
  return Math.min(maxCap, startCap + day * dailyIncrement);
}

function daysSince(startIso, at) {
  if (!startIso) return null;
  const ms = at.getTime() - Date.parse(startIso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

// Requires: a registered, DNS-verified domain (GREEN or YELLOW only -- never
// RED/BLOCKED), an authenticated mailbox linked to it, and a provider
// adapter whose warmupCapable()/startWarmup() capabilities report real
// success. Anything short of that returns WARMUP_BLOCKED with the exact
// missing requirement -- it never starts warm-up "optimistically."
export async function requestMailboxWarmupStart({
  domainState, mailboxState, providerAdapter, date = new Date()
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const reasons = [];
  if (!domainState) reasons.push('domain-not-registered');
  else if (!['GREEN', 'YELLOW'].includes(domainState.dnsState?.status)) reasons.push('domain-dns-not-verified-green-or-yellow');
  if (!mailboxState) reasons.push('mailbox-not-registered');
  else if (mailboxState.authenticationStatus !== 'AUTHENTICATED') reasons.push('mailbox-not-authenticated');
  else if (mailboxState.paused) reasons.push('mailbox-currently-paused');
  if (!providerAdapter || typeof providerAdapter.warmupCapable !== 'function' || typeof providerAdapter.startWarmup !== 'function') {
    reasons.push('provider-adapter-missing-warmup-capability');
  }
  if (reasons.length) {
    return { ok: false, policyVersion: WARMUP_ORCHESTRATOR_POLICY_VERSION, state: 'WARMUP_BLOCKED', reasonCodes: reasons, timestamp, providerReceipt: null };
  }

  const capability = await providerAdapter.warmupCapable();
  if (!capability?.ok) {
    return {
      ok: false, policyVersion: WARMUP_ORCHESTRATOR_POLICY_VERSION, state: 'WARMUP_BLOCKED',
      reasonCodes: [`provider-warmup-not-capable:${capability?.status || 'UNKNOWN'}`], timestamp,
      providerReceipt: redactProviderReceipt(capability)
    };
  }

  const started = await providerAdapter.startWarmup({ mailboxId: mailboxState.mailboxId });
  if (!started?.ok) {
    return {
      ok: false, policyVersion: WARMUP_ORCHESTRATOR_POLICY_VERSION, state: 'WARMUP_BLOCKED',
      reasonCodes: [`provider-start-warmup-failed:${started?.status || 'UNKNOWN'}`], timestamp,
      providerReceipt: redactProviderReceipt(started)
    };
  }

  return {
    ok: true, policyVersion: WARMUP_ORCHESTRATOR_POLICY_VERSION, state: 'WARMUP_ACTIVE', reasonCodes: [], timestamp,
    warmupStartTime: timestamp, providerReceipt: redactProviderReceipt(started)
  };
}

// Reconciliation job body: asks the provider for real current status and
// folds it into one of the 7 canonical warm-up states. An unreachable or
// ambiguous provider response becomes WARMUP_UNCERTAIN -- never silently
// kept at the last-known-good state, and never upgraded to WARMUP_COMPLETE
// without an explicit provider signal.
export async function reconcileMailboxWarmupStatus({
  mailboxState, providerAdapter, minWarmupDays = 14, date = new Date()
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  if (!mailboxState) {
    return { ok: false, policyVersion: WARMUP_ORCHESTRATOR_POLICY_VERSION, state: 'WARMUP_BLOCKED', reasonCodes: ['mailbox-not-registered'], timestamp, providerReceipt: null };
  }
  if (!providerAdapter || typeof providerAdapter.warmupStatus !== 'function') {
    return { ok: false, policyVersion: WARMUP_ORCHESTRATOR_POLICY_VERSION, state: 'WARMUP_UNCERTAIN', reasonCodes: ['provider-adapter-missing-warmup-status-capability'], timestamp, providerReceipt: null };
  }

  const statusResult = await providerAdapter.warmupStatus({ mailboxId: mailboxState.mailboxId });
  if (!statusResult?.ok) {
    return {
      ok: false, policyVersion: WARMUP_ORCHESTRATOR_POLICY_VERSION, state: 'WARMUP_UNCERTAIN',
      reasonCodes: [`provider-status-unavailable:${statusResult?.status || 'UNKNOWN'}`], timestamp,
      providerReceipt: redactProviderReceipt(statusResult)
    };
  }

  const providerState = String(statusResult.warmupState || '').toUpperCase();
  if (!WARMUP_STATES.includes(providerState)) {
    return { ok: false, policyVersion: WARMUP_ORCHESTRATOR_POLICY_VERSION, state: 'WARMUP_UNCERTAIN', reasonCodes: [`provider-reported-unrecognized-state:${providerState || 'EMPTY'}`], timestamp, providerReceipt: redactProviderReceipt(statusResult) };
  }

  const elapsedDays = daysSince(mailboxState.warmupStartTime, at);
  if (providerState === 'WARMUP_COMPLETE' && (elapsedDays == null || elapsedDays < minWarmupDays)) {
    // The provider says complete, but the minimum-warm-up-period policy
    // has not actually elapsed. Fail closed to WARMUP_ACTIVE rather than
    // trust an early "complete" signal a provider might report for reasons
    // unrelated to actual reputation (e.g. its own default ramp differs
    // from UberBond's configured minimum).
    return {
      ok: true, policyVersion: WARMUP_ORCHESTRATOR_POLICY_VERSION, state: 'WARMUP_ACTIVE',
      reasonCodes: [`provider-reported-complete-before-minimum-period:${elapsedDays ?? 'unknown'}/${minWarmupDays}-days`],
      timestamp, plannedDailyCap: plannedWarmupCapForDay(elapsedDays ?? 0),
      providerReceipt: redactProviderReceipt(statusResult)
    };
  }

  return {
    ok: true, policyVersion: WARMUP_ORCHESTRATOR_POLICY_VERSION, state: providerState, reasonCodes: [], timestamp,
    plannedDailyCap: elapsedDays != null ? plannedWarmupCapForDay(elapsedDays) : null,
    reportedDailyCap: Number.isFinite(Number(statusResult.currentDailyCap)) ? Number(statusResult.currentDailyCap) : null,
    providerReceipt: redactProviderReceipt(statusResult)
  };
}

// A domain/mailbox is warm-up-complete-and-eligible-for-dry-run only when
// ALL of: provider reports WARMUP_COMPLETE, the configured minimum period
// has elapsed, and no pause/uncertain state is currently active.
export function isEligibleForDryRun({ mailboxState, minWarmupDays = 14, date = new Date() } = {}) {
  if (!mailboxState || mailboxState.paused) return false;
  if (mailboxState.warmupStatus !== 'WARMUP_COMPLETE') return false;
  const at = referenceDate(date);
  const elapsed = daysSince(mailboxState.warmupStartTime, at);
  return elapsed != null && elapsed >= minWarmupDays;
}
