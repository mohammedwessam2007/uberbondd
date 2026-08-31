// The thing that drives payment reconciliation.
//
// Every piece of this existed already and none of them were connected.
// `planPaymentReconciliation` decides, per event, what should happen to it.
// `claimBillingEvents` and `finishBillingEvent` are the durable lease either
// side of the work. Nothing called any of them: a grep for claimBillingEvents
// across the tree found two comments observing that nothing calls it, and the
// health matrix reported the billing backlog as NO_WORKER for that reason.
//
// So verified webhook evidence accumulated in the inbox and was never turned
// into canonical cleared-payment truth. This is the driver, and only the driver:
// the planner still decides, the repository still owns the lease, and this walks
// between them.
//
// It cannot decide a payment cleared on its own, and that is the point. Whether
// money actually moved is the provider's answer, not ours, so the caller injects
// a `providerVerifier`. Without one this refuses.
//
// Refusing means claiming nothing at all, which is the part worth being careful
// about. A worker that claims events it cannot process still burns
// `claim_attempts` on every pass, and the repository moves an event to UNCERTAIN
// once the cap is reached -- so an unconfigured worker left running would walk
// real payment evidence into an uncertain state without ever contacting a
// provider. The configuration check therefore happens before the claim, not
// inside the loop.

import { claimBillingEvents, finishBillingEvent, billingBacklogSummary } from './billing-webhook-repository.mjs';
import { planPaymentReconciliation } from './payment-reconciliation-watchdog.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PAYMENT_RECONCILIATION_WORKER_VERSION = 'uberbond.payment-reconciliation-worker.v1';

const clone = value => structuredClone(value);
const text = (value, max = 240) => String(value ?? '').trim().slice(0, max);

function refuse(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: PAYMENT_RECONCILIATION_WORKER_VERSION,
    status: 'PAYMENT_RECONCILIATION_REFUSED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    claimed: 0,
    processed: [],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

/**
 * Reconcile one bounded batch of verified billing events.
 *
 * @param {object}   options
 * @param {object}   options.pool              a PostgreSQL pool
 * @param {Function} options.providerVerifier  async (event) => provider truth; absent means unconfigured
 * @param {string}   options.workerRef
 * @param {number}  [options.limit]
 */
export async function runPaymentReconciliationTick({
  pool,
  providerVerifier = null,
  workerRef = 'payment-reconciliation-worker',
  limit = 10,
  staleClaimMs = 15 * 60 * 1000,
  maxAttempts = 5,
  now = () => new Date()
} = {}) {
  if (!pool || typeof pool.query !== 'function') return refuse(['postgres-pool-required']);
  const worker = text(workerRef, 120);
  if (!worker) return refuse(['worker-ref-required']);

  // Before the claim, deliberately. See the note at the top of this file: an
  // unconfigured worker that claims first would push real payment evidence to
  // UNCERTAIN by exhausting its attempts, having contacted nobody.
  if (typeof providerVerifier !== 'function') {
    let backlog = null;
    try { backlog = await billingBacklogSummary(pool); } catch { backlog = null; }
    return refuse(['payment-provider-verifier-not-configured'], {
      status: 'PAYMENT_PROVIDER_ADAPTER_NOT_CONFIGURED',
      // Reported so the absence is visible as a backlog with a known cause,
      // rather than as a worker that appears to be keeping up.
      backlog
    });
  }

  const batch = Math.max(1, Math.min(100, Number(limit) || 10));

  // Plan over the backlog before claiming anything.
  //
  // Two things decide the same question here and they are not duplicates. The
  // repository's claim query selects atomically, which is the only way to be
  // safe against a second worker. `planPaymentReconciliation` decides policy
  // over the whole backlog, including the events the claim query deliberately
  // will not take -- an event stuck UNCERTAIN, or one that has exhausted its
  // attempts, needs a person rather than another pass.
  //
  // Running the planner after the claim was the first thing tried and it is
  // simply wrong: by then the row reads CLAIMED, which the planner correctly
  // refuses as a status it was never asked about. It belongs in front.
  let backlogRows = [];
  try {
    const { rows } = await pool.query(
      `SELECT provider_event_key, status, claim_attempts, claimed_at, updated_at
         FROM billing_webhook_inbox
        WHERE status NOT IN ('RECONCILED','IGNORED','FAILED')
        ORDER BY received_at ASC
        LIMIT $1`, [Math.min(500, batch * 10)]);
    backlogRows = rows || [];
  } catch (error) {
    return refuse(['billing-backlog-read-failed'], { detail: text(error?.message, 300) });
  }

  const escalations = [];
  let claimable = 0;
  for (const row of backlogRows) {
    const plan = planPaymentReconciliation({
      status: row.status,
      claimAttempts: row.claim_attempts,
      claimedAt: row.claimed_at,
      updatedAt: row.updated_at
    }, { now: now(), staleClaimMs, maxAttempts });
    if (plan.action === 'CLAIM_FOR_RECONCILIATION' || plan.action === 'RECOVER_STALE_CLAIM') claimable += 1;
    if (plan.action === 'ESCALATE_REVIEW') {
      escalations.push({
        providerEventKey: row.provider_event_key,
        status: row.status,
        reasonCodes: plan.reasonCodes || []
      });
    }
  }

  // Nothing the planner would act on means no claim at all, rather than a claim
  // that finds nothing and costs an attempt on the way.
  if (!claimable) {
    return {
      ok: true,
      policyVersion: PAYMENT_RECONCILIATION_WORKER_VERSION,
      status: 'PAYMENT_RECONCILIATION_TICK_IDLE',
      claimed: 0,
      processed: [],
      escalations,
      backlogInspected: backlogRows.length,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
    };
  }

  let claimed;
  try {
    claimed = await claimBillingEvents(pool, { workerRef: worker, limit: batch, staleClaimMs, maxAttempts });
  } catch (error) {
    return refuse(['billing-claim-failed'], { detail: text(error?.message, 300) });
  }

  const processed = [];
  let providerCalls = 0;

  for (const row of claimed || []) {
    let verdict;
    providerCalls += 1;
    try {
      verdict = await providerVerifier({
        provider: row.provider,
        eventName: row.event_name,
        objectType: row.object_type,
        objectId: row.object_id,
        providerEventKey: row.provider_event_key
      });
    } catch (error) {
      // The provider may or may not have been reached. That is exactly the
      // uncertain case, and it is finished as UNCERTAIN rather than retried,
      // because a retry against an unknown outcome is the blind retry this
      // repository refuses everywhere else.
      await finishBillingEvent(pool, {
        providerEventKey: row.provider_event_key,
        status: 'UNCERTAIN',
        errorCode: 'provider-verification-threw',
        workerRef: worker
      }).catch(() => {});
      processed.push({
        providerEventKey: row.provider_event_key,
        outcome: 'UNCERTAIN',
        reasonCodes: ['provider-verification-threw'],
        detail: text(error?.message, 200)
      });
      continue;
    }

    const cleared = verdict?.cleared === true;
    const receiptRef = text(verdict?.canonicalReceiptRef, 200);

    // A verifier saying "cleared" is not sufficient on its own. The repository
    // requires a canonical receipt reference for RECONCILED, and that rule is
    // the whole difference between provider evidence and a claim about it.
    if (cleared && !receiptRef) {
      await finishBillingEvent(pool, {
        providerEventKey: row.provider_event_key,
        status: 'UNCERTAIN',
        errorCode: 'canonical-receipt-ref-missing-from-verifier',
        workerRef: worker
      }).catch(() => {});
      processed.push({
        providerEventKey: row.provider_event_key,
        outcome: 'UNCERTAIN',
        reasonCodes: ['canonical-receipt-ref-missing-from-verifier']
      });
      continue;
    }

    const status = cleared ? 'RECONCILED' : verdict?.terminal === true ? 'IGNORED' : 'RETRYABLE';
    let finished;
    try {
      finished = await finishBillingEvent(pool, {
        providerEventKey: row.provider_event_key,
        status,
        ...(cleared ? { canonicalReceiptRef: receiptRef } : {}),
        ...(cleared ? {} : { errorCode: text(verdict?.errorCode || 'provider-not-cleared', 80) }),
        workerRef: worker
      });
    } catch (error) {
      finished = { ok: false, detail: text(error?.message, 200) };
    }

    processed.push({
      providerEventKey: row.provider_event_key,
      outcome: status,
      // The provider that actually answered, preserved rather than inferred.
      provider: row.provider,
      canonicalReceiptRef: cleared ? receiptRef : null,
      finished: finished?.ok === true
    });
  }

  return {
    ok: true,
    policyVersion: PAYMENT_RECONCILIATION_WORKER_VERSION,
    status: processed.length ? 'PAYMENT_RECONCILIATION_TICK_COMPLETED' : 'PAYMENT_RECONCILIATION_TICK_IDLE',
    claimed: (claimed || []).length,
    processed,
    escalations,
    backlogInspected: backlogRows.length,
    businessEffectAuthority: 'NONE',
    // Provider verification reads provider state. It moves no money, so the
    // money-moving counters stay zero and only the call count is real.
    externalEffectLedger: { ...clone(ZERO_EXTERNAL_EFFECTS), providerCalls }
  };
}
