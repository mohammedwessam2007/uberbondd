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
// once the cap is reached. Verifier provider scope is therefore enforced before
// backlog planning and again inside the atomic claim query.

import { claimBillingEvents, finishBillingEvent, billingBacklogSummary } from './billing-webhook-repository.mjs';
import { planPaymentReconciliation } from './payment-reconciliation-watchdog.mjs';
import { supportedPaymentProviders } from './payment-provider-verifier-dispatch.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PAYMENT_RECONCILIATION_WORKER_VERSION = 'uberbond.payment-reconciliation-worker.v1.2';

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
 * A verifier may expose `supportedProviders` as a bounded array. When it does,
 * every backlog read and durable claim is restricted to that provider set. An
 * explicitly injected legacy verifier without this property retains the prior
 * provider-agnostic contract for backwards compatibility.
 *
 * `claimEvents` and `finishEvent` are dependency-injection seams for deterministic
 * verification. Production callers should use the defaults. They do not alter
 * authority or the durable truth contract.
 */
export async function runPaymentReconciliationTick({
  pool,
  providerVerifier = null,
  workerRef = 'payment-reconciliation-worker',
  limit = 10,
  staleClaimMs = 15 * 60 * 1000,
  maxAttempts = 5,
  now = () => new Date(),
  claimEvents = claimBillingEvents,
  finishEvent = finishBillingEvent
} = {}) {
  if (!pool || typeof pool.query !== 'function') return refuse(['postgres-pool-required']);
  const worker = text(workerRef, 120);
  if (!worker) return refuse(['worker-ref-required']);
  if (typeof claimEvents !== 'function') return refuse(['billing-claim-function-required']);
  if (typeof finishEvent !== 'function') return refuse(['billing-finish-function-required']);

  if (typeof providerVerifier !== 'function') {
    let backlog = null;
    try { backlog = await billingBacklogSummary(pool); } catch { backlog = null; }
    return refuse(['payment-provider-verifier-not-configured'], {
      status: 'PAYMENT_PROVIDER_ADAPTER_NOT_CONFIGURED',
      backlog
    });
  }

  const providerScope = supportedPaymentProviders(providerVerifier);
  if (Array.isArray(providerScope) && providerScope.length === 0) {
    return refuse(['payment-provider-verifier-scope-empty'], {
      status: 'PAYMENT_PROVIDER_ADAPTER_NOT_CONFIGURED'
    });
  }

  const batch = Math.max(1, Math.min(100, Number(limit) || 10));
  let backlogRows = [];
  try {
    const scopeClause = providerScope === null ? '' : ' AND provider=ANY($2::text[])';
    const params = providerScope === null
      ? [Math.min(500, batch * 10)]
      : [Math.min(500, batch * 10), providerScope];
    const { rows } = await pool.query(
      `SELECT provider_event_key, provider, status, claim_attempts, claimed_at, updated_at
         FROM billing_webhook_inbox
        WHERE status NOT IN ('RECONCILED','IGNORED','FAILED')${scopeClause}
        ORDER BY received_at ASC
        LIMIT $1`, params);
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
        provider: row.provider || null,
        status: row.status,
        reasonCodes: plan.reasonCodes || []
      });
    }
  }

  if (!claimable) {
    return {
      ok: true,
      policyVersion: PAYMENT_RECONCILIATION_WORKER_VERSION,
      status: 'PAYMENT_RECONCILIATION_TICK_IDLE',
      claimed: 0,
      processed: [],
      escalations,
      backlogInspected: backlogRows.length,
      supportedProviders: providerScope,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
    };
  }

  let claimed;
  try {
    claimed = await claimEvents(pool, {
      workerRef: worker,
      limit: batch,
      staleClaimMs,
      maxAttempts,
      providers: providerScope
    });
  } catch (error) {
    return refuse(['billing-claim-failed'], { detail: text(error?.message, 300), supportedProviders: providerScope });
  }

  const processed = [];
  let providerCalls = 0;
  let durableFinishFailures = 0;

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
      let durableFinish = true;
      try {
        await finishEvent(pool, {
          providerEventKey: row.provider_event_key,
          status: 'UNCERTAIN',
          errorCode: 'provider-verification-threw',
          workerRef: worker
        });
      } catch {
        durableFinish = false;
        durableFinishFailures += 1;
      }
      processed.push({
        providerEventKey: row.provider_event_key,
        provider: row.provider,
        outcome: 'UNCERTAIN',
        durableFinish,
        reasonCodes: durableFinish
          ? ['provider-verification-threw']
          : ['provider-verification-threw', 'billing-finish-not-durable'],
        detail: text(error?.message, 200)
      });
      continue;
    }

    const cleared = verdict?.cleared === true;
    const receiptRef = text(verdict?.canonicalReceiptRef, 200);
    if (cleared && !receiptRef) {
      let durableFinish = true;
      try {
        await finishEvent(pool, {
          providerEventKey: row.provider_event_key,
          status: 'UNCERTAIN',
          errorCode: 'canonical-receipt-ref-missing-from-verifier',
          workerRef: worker
        });
      } catch {
        durableFinish = false;
        durableFinishFailures += 1;
      }
      processed.push({
        providerEventKey: row.provider_event_key,
        provider: row.provider,
        outcome: 'UNCERTAIN',
        durableFinish,
        reasonCodes: durableFinish
          ? ['canonical-receipt-ref-missing-from-verifier']
          : ['canonical-receipt-ref-missing-from-verifier', 'billing-finish-not-durable']
      });
      continue;
    }

    const intendedStatus = cleared ? 'RECONCILED' : verdict?.terminal === true ? 'IGNORED' : 'RETRYABLE';
    let finished;
    try {
      finished = await finishEvent(pool, {
        providerEventKey: row.provider_event_key,
        status: intendedStatus,
        ...(cleared ? { canonicalReceiptRef: receiptRef } : {}),
        ...(cleared ? {} : { errorCode: text(verdict?.errorCode || 'provider-not-cleared', 80) }),
        workerRef: worker
      });
    } catch (error) {
      durableFinishFailures += 1;
      processed.push({
        providerEventKey: row.provider_event_key,
        provider: row.provider,
        outcome: 'DURABLE_FINISH_FAILED',
        intendedOutcome: intendedStatus,
        canonicalReceiptRef: cleared ? receiptRef : null,
        finished: false,
        reasonCodes: ['billing-finish-not-durable'],
        detail: text(error?.message, 200)
      });
      continue;
    }

    processed.push({
      providerEventKey: row.provider_event_key,
      outcome: intendedStatus,
      provider: row.provider,
      canonicalReceiptRef: cleared ? receiptRef : null,
      finished: finished?.ok === true
    });
  }

  const degraded = durableFinishFailures > 0;
  return {
    ok: !degraded,
    policyVersion: PAYMENT_RECONCILIATION_WORKER_VERSION,
    status: degraded
      ? 'PAYMENT_RECONCILIATION_TICK_DEGRADED'
      : processed.length ? 'PAYMENT_RECONCILIATION_TICK_COMPLETED' : 'PAYMENT_RECONCILIATION_TICK_IDLE',
    reasonCodes: degraded ? ['billing-finish-not-durable'] : [],
    claimed: (claimed || []).length,
    processed,
    escalations,
    backlogInspected: backlogRows.length,
    supportedProviders: providerScope,
    durableFinishFailures,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...clone(ZERO_EXTERNAL_EFFECTS), providerCalls }
  };
}
