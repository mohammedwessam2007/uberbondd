import { ADAPTER_OUTCOMES } from './external-effect-adapter.mjs';
import { ExternalEffectEvidenceStore } from './external-effect-evidence-store.mjs';

/**
 * Exactly the six recovery outcomes this mission's brief specifies (section
 * 12). Every call to recoverOneExecution() returns exactly one of these --
 * never a silent no-op that isn't reported as NO_ACTION, and never two
 * actions taken for one execution.
 */
export const RECOVERY_ACTIONS = Object.freeze({
  FINALIZE_CONFIRMED: 'FINALIZE_CONFIRMED',
  FINALIZE_REJECTED: 'FINALIZE_REJECTED',
  RECONCILE_PROVIDER: 'RECONCILE_PROVIDER',
  OWNER_REVIEW_REQUIRED: 'OWNER_REVIEW_REQUIRED',
  NO_ACTION: 'NO_ACTION',
  ABORTED_BEFORE_DISPATCH: 'ABORTED_BEFORE_DISPATCH'
});

async function recordReconciliationEvidence({ evidenceStore, execution, providerEvidence }) {
  return evidenceStore.append({
    executionId: execution.executionId,
    provider: execution.provider,
    businessIdentity: providerEvidence.businessIdentity ?? execution.businessKey,
    providerReferenceId: providerEvidence.providerReferenceId ?? null,
    observedAt: providerEvidence.observedAt,
    evidenceType: 'RECONCILIATION_LOOKUP',
    acquisitionMethod: providerEvidence.acquisitionMethod,
    reconciliationSource: providerEvidence.reconciliationSource || '',
    lifecycle: providerEvidence.lifecycle,
    detail: providerEvidence.detail || {}
  });
}

/**
 * Runs one reconciliation attempt for an execution already in (or entering)
 * RECONCILING, and applies the ONE safe next transition per this mission's
 * "provider reconciliation proof" cases A-E:
 *   A/B - provider evidence resolves cleanly -> FINALIZE_CONFIRMED/REJECTED.
 *   C   - provider affirmatively has no record of the request -> treated as
 *         proof of non-submission (see NOT_FOUND handling below) ->
 *         RECONCILED_NOT_SUBMITTED, reported as ABORTED_BEFORE_DISPATCH
 *         (this mission's own action vocabulary; see
 *         external-effect-state-machine.mjs's doc comment for why the
 *         underlying terminal status name differs).
 *   D   - still uncertain/not yet visible -> stays RESULT_UNCERTAIN,
 *         RECONCILE_PROVIDER (try again later; never a dispatch retry).
 *   E   - ambiguous or contradictory evidence -> OWNER_REVIEW_REQUIRED,
 *         fail closed, never auto-resolved.
 */
async function reconcileAndTransition({ store, evidenceStore, adapter, execution }) {
  const expectedTo = String(execution.resource || '').startsWith('email:')
    ? String(execution.resource).slice('email:'.length)
    : undefined;
  const providerEvidence = await adapter.reconcile({
    businessKey: execution.businessKey,
    providerEffectIdentity: execution.providerEffectIdentity,
    expectedTo
  });
  await recordReconciliationEvidence({ evidenceStore, execution, providerEvidence });
  const classification = adapter.classifyOutcome(providerEvidence);

  if (classification === ADAPTER_OUTCOMES.ACCEPTED || classification === ADAPTER_OUTCOMES.RECONCILED_ACCEPTED) {
    const result = await store.transition({ executionId: execution.executionId, toStatus: 'RECONCILED_ACCEPTED', reason: 'reconciliation:accepted', expectedFromStatus: 'RECONCILING' });
    return { action: RECOVERY_ACTIONS.FINALIZE_CONFIRMED, executionId: execution.executionId, status: result.execution.status };
  }
  if (classification === ADAPTER_OUTCOMES.REJECTED || classification === ADAPTER_OUTCOMES.RECONCILED_REJECTED) {
    const result = await store.transition({ executionId: execution.executionId, toStatus: 'RECONCILED_REJECTED', reason: 'reconciliation:rejected', expectedFromStatus: 'RECONCILING' });
    return { action: RECOVERY_ACTIONS.FINALIZE_REJECTED, executionId: execution.executionId, status: result.execution.status };
  }
  if (classification === ADAPTER_OUTCOMES.NOT_FOUND) {
    // The provider's own record affirmatively proves this request never
    // arrived -- the one case where "retry" (a brand-new execution attempt
    // under the same business key) is legal, per this mission's safe
    // retry policy. This function never performs that retry itself; it
    // only frees the business key by finalizing this row as
    // RECONCILED_NOT_SUBMITTED.
    const result = await store.transition({ executionId: execution.executionId, toStatus: 'RECONCILED_NOT_SUBMITTED', reason: 'reconciliation:provider-confirms-not-submitted', expectedFromStatus: 'RECONCILING' });
    return { action: RECOVERY_ACTIONS.ABORTED_BEFORE_DISPATCH, executionId: execution.executionId, status: result.execution.status };
  }
  if (classification === ADAPTER_OUTCOMES.AMBIGUOUS) {
    const result = await store.transition({ executionId: execution.executionId, toStatus: 'OWNER_REVIEW_REQUIRED', reason: 'reconciliation:ambiguous-or-contradictory', expectedFromStatus: 'RECONCILING' });
    return { action: RECOVERY_ACTIONS.OWNER_REVIEW_REQUIRED, executionId: execution.executionId, status: result.execution.status };
  }
  // UNCERTAIN: reconciliation itself was inconclusive (e.g. not yet visible
  // at the provider). Loop back to RESULT_UNCERTAIN -- no dispatch retry,
  // no finalization, try reconciliation again later.
  const result = await store.transition({ executionId: execution.executionId, toStatus: 'RESULT_UNCERTAIN', reason: 'reconciliation:still-uncertain', expectedFromStatus: 'RECONCILING' });
  return { action: RECOVERY_ACTIONS.RECONCILE_PROVIDER, executionId: execution.executionId, status: result.execution.status };
}

/**
 * Recovers exactly one execution, whatever state a crash left it in. Never
 * calls adapter.dispatch() -- the only network-mutating call this module
 * ever makes is adapter.reconcile(), which by contract must be read-only.
 */
export async function recoverOneExecution({ store, evidenceStore, adapter, execution }) {
  if (!execution) return { action: RECOVERY_ACTIONS.NO_ACTION, executionId: null };

  if (execution.status === 'PREPARED') {
    // Durable intent exists, but DISPATCHING was never durably reached --
    // this proves, without needing to ask the provider anything, that no
    // network call could possibly have been made yet. Safe to abort and
    // free the business key for a fresh attempt.
    const result = await store.transition({ executionId: execution.executionId, toStatus: 'ABORTED_BEFORE_DISPATCH', reason: 'recovery:never-reached-dispatching', expectedFromStatus: 'PREPARED' });
    return { action: RECOVERY_ACTIONS.ABORTED_BEFORE_DISPATCH, executionId: execution.executionId, status: result.execution.status };
  }

  if (execution.status === 'DISPATCHING') {
    // The exact checkpoint-C shape: DISPATCHING was durably committed, so a
    // provider call may have happened. Check for LOCAL evidence first (a
    // dispatch response we captured before crashing) -- if present, this
    // finalizes from what we already know, with zero network calls and,
    // critically, WITHOUT ever calling adapter.dispatch() again.
    const localEvidence = await evidenceStore.findByType(execution.executionId, 'DISPATCH_RESPONSE');
    if (localEvidence.length > 0) {
      const latest = localEvidence[localEvidence.length - 1];
      if (latest.lifecycle === 'ACCEPTED') {
        const result = await store.transition({ executionId: execution.executionId, toStatus: 'PROVIDER_ACCEPTED', reason: 'recovery:local-evidence-accepted', expectedFromStatus: 'DISPATCHING', providerReferenceId: latest.providerReferenceId });
        return { action: RECOVERY_ACTIONS.FINALIZE_CONFIRMED, executionId: execution.executionId, status: result.execution.status };
      }
      if (latest.lifecycle === 'REJECTED') {
        const result = await store.transition({ executionId: execution.executionId, toStatus: 'PROVIDER_REJECTED', reason: 'recovery:local-evidence-rejected', expectedFromStatus: 'DISPATCHING', providerReferenceId: latest.providerReferenceId });
        return { action: RECOVERY_ACTIONS.FINALIZE_REJECTED, executionId: execution.executionId, status: result.execution.status };
      }
    }
    // No local evidence at all -- we genuinely do not know whether the
    // provider ever saw this request. Never redispatch. Move to
    // RESULT_UNCERTAIN, then RECONCILING, then ask the provider.
    await store.transition({ executionId: execution.executionId, toStatus: 'RESULT_UNCERTAIN', reason: 'recovery:no-local-evidence', expectedFromStatus: 'DISPATCHING' });
    const reconciling = await store.transition({ executionId: execution.executionId, toStatus: 'RECONCILING', reason: 'recovery:begin-reconciliation', expectedFromStatus: 'RESULT_UNCERTAIN' });
    return reconcileAndTransition({ store, evidenceStore, adapter, execution: reconciling.execution });
  }

  if (execution.status === 'RESULT_UNCERTAIN') {
    const reconciling = await store.transition({ executionId: execution.executionId, toStatus: 'RECONCILING', reason: 'recovery:begin-reconciliation', expectedFromStatus: 'RESULT_UNCERTAIN' });
    return reconcileAndTransition({ store, evidenceStore, adapter, execution: reconciling.execution });
  }

  if (execution.status === 'RECONCILING') {
    return reconcileAndTransition({ store, evidenceStore, adapter, execution });
  }

  if (execution.status === 'OWNER_REVIEW_REQUIRED') {
    // Never auto-resolved. Recovery reports this and stops -- an owner
    // decision is required, not another automated attempt.
    return { action: RECOVERY_ACTIONS.OWNER_REVIEW_REQUIRED, executionId: execution.executionId, status: execution.status };
  }

  // Any terminal state: nothing to do.
  return { action: RECOVERY_ACTIONS.NO_ACTION, executionId: execution.executionId, status: execution.status };
}

/**
 * Bounded batch recovery, safe under concurrent workers: claims a batch of
 * unresolved executions with FOR UPDATE SKIP LOCKED inside one transaction
 * per worker (store.withTransaction), so two workers running this
 * concurrently partition the unresolved set rather than racing on the same
 * rows. Each claimed execution is recovered and its outcome committed
 * before the transaction ends.
 */
export async function recoverUnresolvedExecutions({ store, adapter, limit = 50 }) {
  const unresolvedStatuses = ['PREPARED', 'DISPATCHING', 'RESULT_UNCERTAIN', 'RECONCILING'];
  return store.withTransaction(async (scopedStore, client) => {
    // The evidence store MUST share the same client/transaction as scopedStore for this
    // batch: omnia_v9_external_effect_provider_evidence has a foreign key into
    // omnia_v9_external_effect_executions, and scopedStore's row-locking UPDATE (via
    // claimUnresolvedForRecovery's FOR UPDATE SKIP LOCKED, held open until COMMIT) would
    // otherwise deadlock against a same-row FK check issued from a different pool
    // connection -- this was a real bug found and fixed while building this worker,
    // not merely a theoretical concern.
    const scopedEvidenceStore = new ExternalEffectEvidenceStore({ pool: client });
    const claimed = await scopedStore.claimUnresolvedForRecovery({ statuses: unresolvedStatuses, limit });
    const results = [];
    for (const execution of claimed) {
      const outcome = await recoverOneExecution({ store: scopedStore, evidenceStore: scopedEvidenceStore, adapter, execution });
      results.push(outcome);
    }
    return results;
  });
}
