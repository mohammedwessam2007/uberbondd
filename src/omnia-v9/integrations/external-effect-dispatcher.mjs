import { ADAPTER_OUTCOMES } from './external-effect-adapter.mjs';

/**
 * The safe dispatch sequence this mission exists to build:
 *
 *   1. authority already reserved by the caller (V9's existing frozen
 *      reserveAuthority() machinery -- this module does not re-implement
 *      authority reservation, it only ever runs AFTER an ALLOW + successful
 *      reservation, exactly like canary-null-authority.mjs's existing
 *      execution gate).
 *   2. durable execution-intent object persisted, status PREPARED -- must
 *      exist before any provider call is even possible.
 *   3. durable transition to DISPATCHING, committed BEFORE any network I/O.
 *      After this point a crash must never reset the action to freely
 *      retryable (the business-key partial-unique-index in migration 011
 *      enforces this at the database level).
 *   4. adapter.prepare() -> adapter.dispatch() (the only network I/O).
 *   5. classify the outcome and durably transition to a next state --
 *      NEVER back to PREPARED or DISPATCHING, and an UNCERTAIN outcome
 *      NEVER triggers an automatic second dispatch() call in this
 *      function. "Uncertainty must never become retry permission" is
 *      enforced structurally: this function has no retry loop at all.
 *
 * `crashAt` is the deterministic crash-injection hook
 * (tests/omnia-v9-external-effect-crash-injection.test.mjs): when set to
 * one of CRASH_POINTS, this function throws CrashInjected at that exact
 * point instead of continuing, standing in for a process crash at that
 * instruction boundary. No timing hacks, no real process kill -- an
 * explicit, reproducible fault point.
 */
export const CRASH_POINTS = Object.freeze({
  AFTER_AUTHORITY_RESERVATION: 'AFTER_AUTHORITY_RESERVATION',
  AFTER_EXECUTION_OBJECT_CREATED: 'AFTER_EXECUTION_OBJECT_CREATED',
  AFTER_DISPATCHING_DURABLE: 'AFTER_DISPATCHING_DURABLE',
  IMMEDIATELY_BEFORE_PROVIDER_CALL: 'IMMEDIATELY_BEFORE_PROVIDER_CALL',
  IMMEDIATELY_AFTER_PROVIDER_ACCEPTS: 'IMMEDIATELY_AFTER_PROVIDER_ACCEPTS',
  AFTER_RECEIPT_BEFORE_AUTHORIZATION_BINDING: 'AFTER_RECEIPT_BEFORE_AUTHORIZATION_BINDING'
});

export class CrashInjected extends Error {
  constructor(point) {
    super(`crash-injected:${point}`);
    this.name = 'CrashInjected';
    this.code = 'CRASH_INJECTED';
    this.point = point;
  }
}

/**
 * A dedicated kill switch for this execution layer specifically, separate
 * from the general OMNIA_V9_MODE switch (config.mjs) -- a production
 * emergency stop for external effects should be flippable on its own,
 * without touching the broader shadow/compare/canary mode. Engaging it
 * prevents any NEW dispatch (this function throws before store.prepare()
 * ever runs, so no new durable object is even created) but deliberately
 * does NOT gate external-effect-recovery.mjs -- read-only reconciliation
 * and finalization of already-attempted effects must keep working, per
 * this mission's kill-switch-during-dispatch requirement (section 22):
 * evidence about what already happened must remain resolvable even while
 * new effects are blocked.
 */
export function isExternalEffectKillSwitchEngaged(env = process.env) {
  return String(env?.OMNIA_V9_EXTERNAL_EFFECT_KILL_SWITCH || '').trim().toLowerCase() === 'engaged';
}

export class ExternalEffectKillSwitchEngagedError extends Error {
  constructor() {
    super('external-effect dispatch is blocked: OMNIA_V9_EXTERNAL_EFFECT_KILL_SWITCH is engaged');
    this.name = 'ExternalEffectKillSwitchEngagedError';
    this.code = 'EXTERNAL_EFFECT_KILL_SWITCH_ENGAGED';
  }
}

export class ExternalEffectFinalAdmissionError extends Error {
  constructor(message, code = 'EXTERNAL_EFFECT_FINAL_ADMISSION_BLOCKED', detail = {}) {
    super(message);
    this.name = 'ExternalEffectFinalAdmissionError';
    this.code = code;
    this.detail = detail;
  }
}

function maybeCrash(crashAt, point) {
  if (crashAt === point) throw new CrashInjected(point);
}

function classificationToStatus(classification) {
  if (classification === ADAPTER_OUTCOMES.ACCEPTED) return 'PROVIDER_ACCEPTED';
  if (classification === ADAPTER_OUTCOMES.REJECTED) return 'PROVIDER_REJECTED';
  return 'RESULT_UNCERTAIN';
}

/**
 * Dispatches one prepared external effect. `effectIntent` must already
 * carry a caller-generated executionId, businessKey and
 * providerEffectIdentity -- generating those is the caller's
 * responsibility (see V9_EXTERNAL_EFFECT_PROTOCOL.md, "provider business
 * identity"), not this function's, so this function has no hidden
 * randomness that would make crash-injection scenarios non-deterministic.
 */
function requireMatchingIdentity(prepared, expected, field) {
  if (String(prepared?.[field] || '') !== String(expected || '')) {
    throw new ExternalEffectFinalAdmissionError(`adapter.prepare() changed ${field}`, 'PREPARED_EFFECT_IDENTITY_MISMATCH', { field });
  }
}

function validateFinalAdmission(admission, prepared, effectIntent) {
  if (!admission || admission.decision !== 'ALLOW') {
    return { ok: false, reason: admission?.reason || `final-admission:${String(admission?.decision || 'missing').toLowerCase()}` };
  }
  if (admission.authoritative !== true || admission.enforced !== true) {
    return { ok: false, reason: 'final-admission:not-authoritative-and-enforced' };
  }
  const bindings = [
    ['executionId', effectIntent.executionId],
    ['businessKey', effectIntent.businessKey],
    ['actionIntentDigest', effectIntent.actionIntentDigest],
    ['authorizationDigest', effectIntent.authorizationDigest],
    ['providerEffectIdentity', effectIntent.providerEffectIdentity],
    ['approvalId', effectIntent.approvalId],
    ['policyDigest', effectIntent.policyDigest],
    ['constitutionDigest', effectIntent.constitutionDigest]
  ];
  for (const [field, expected] of bindings) {
    if (String(admission[field] || '') !== String(expected || '')) return { ok: false, reason: `final-admission:${field}-mismatch` };
  }
  if (prepared?.argumentsDigest && String(admission.argumentsDigest || '') !== String(prepared.argumentsDigest)) {
    return { ok: false, reason: 'final-admission:arguments-digest-mismatch' };
  }
  return { ok: true };
}

export async function dispatchExternalEffect({
  store, evidenceStore, adapter, effectIntent, finalAdmissionCheck = null,
  crashAt = null, now = () => new Date(), env = process.env
}) {
  if (isExternalEffectKillSwitchEngaged(env)) throw new ExternalEffectKillSwitchEngagedError();
  maybeCrash(crashAt, CRASH_POINTS.AFTER_AUTHORITY_RESERVATION);

  if (String(adapter?.providerName || '') !== String(effectIntent?.provider || '')) {
    throw new ExternalEffectFinalAdmissionError('adapter provider does not match the durable effect intent', 'PROVIDER_SUBSTITUTION');
  }

  const prepared = await store.prepare(effectIntent);
  maybeCrash(crashAt, CRASH_POINTS.AFTER_EXECUTION_OBJECT_CREATED);

  let preparedEffect;
  try {
    preparedEffect = await adapter.prepare({
      businessKey: prepared.businessKey,
      providerEffectIdentity: prepared.providerEffectIdentity,
      executionId: prepared.executionId,
      effectPayload: effectIntent.effectPayload,
      simulation: effectIntent.simulation
    });
    requireMatchingIdentity(preparedEffect, prepared.businessKey, 'businessKey');
    requireMatchingIdentity(preparedEffect, prepared.providerEffectIdentity, 'providerEffectIdentity');
  } catch (error) {
    await store.transition({
      executionId: prepared.executionId, toStatus: 'ABORTED_BEFORE_DISPATCH',
      reason: `prepare-error:${String(error?.code || error?.message || error)}`,
      expectedFromStatus: 'PREPARED'
    });
    throw error;
  }

  // A real provider may never be reached without a fresh, authoritative
  // admission check over the exact prepared effect. The null sink remains
  // exempt because it has no external consequence and is the deterministic
  // uncertainty simulator used by the crash/property suite.
  if (adapter.providerName !== 'null-sink-v2') {
    let admission;
    try {
      if (typeof finalAdmissionCheck !== 'function') {
        throw new ExternalEffectFinalAdmissionError('a real provider requires finalAdmissionCheck', 'FINAL_ADMISSION_REQUIRED');
      }
      admission = await finalAdmissionCheck({ execution: prepared, preparedEffect, effectIntent, now: now() });
    } catch (error) {
      await store.transition({
        executionId: prepared.executionId, toStatus: 'ABORTED_BEFORE_DISPATCH',
        reason: `final-admission-error:${String(error?.code || error?.message || error)}`,
        expectedFromStatus: 'PREPARED'
      });
      throw error;
    }
    const verified = validateFinalAdmission(admission, preparedEffect, effectIntent);
    if (!verified.ok) {
      const blocked = await store.transition({
        executionId: prepared.executionId, toStatus: 'ABORTED_BEFORE_DISPATCH',
        reason: verified.reason, expectedFromStatus: 'PREPARED'
      });
      return { executionId: prepared.executionId, status: blocked.execution.status, blocked: true, decision: admission?.decision || 'DENY', reason: verified.reason };
    }
  }

  // Re-read the independently controlled kill switch after all preparation
  // and admission work but before the durable dispatch boundary. Once
  // DISPATCHING commits, execution has begun and recovery must reconcile it.
  if (isExternalEffectKillSwitchEngaged(env)) {
    await store.transition({
      executionId: prepared.executionId, toStatus: 'ABORTED_BEFORE_DISPATCH',
      reason: 'external-effect-kill-switch-engaged-before-dispatch', expectedFromStatus: 'PREPARED'
    });
    throw new ExternalEffectKillSwitchEngagedError();
  }

  const dispatching = await store.transition({
    executionId: prepared.executionId, toStatus: 'DISPATCHING', reason: 'dispatch-begin', expectedFromStatus: 'PREPARED'
  });
  if (!dispatching.applied) {
    throw new Error(`could not durably enter DISPATCHING for ${prepared.executionId}: current status ${dispatching.execution?.status}`);
  }
  maybeCrash(crashAt, CRASH_POINTS.AFTER_DISPATCHING_DURABLE);
  maybeCrash(crashAt, CRASH_POINTS.IMMEDIATELY_BEFORE_PROVIDER_CALL);

  let dispatchResult;
  let thrown = null;
  try {
    dispatchResult = await adapter.dispatch(preparedEffect);
  } catch (error) {
    thrown = error;
  }

  if (thrown) {
    // A thrown dispatch() proves NOTHING about what the provider did -- it
    // is never treated as REJECTED, only as UNCERTAIN. No evidence exists
    // to record here; recovery must reconcile with the provider.
    const uncertain = await store.transition({
      executionId: prepared.executionId, toStatus: 'RESULT_UNCERTAIN',
      reason: `dispatch-exception:${String(thrown.message || thrown)}`, expectedFromStatus: 'DISPATCHING'
    });
    return { executionId: prepared.executionId, status: uncertain.execution.status, classification: ADAPTER_OUTCOMES.UNCERTAIN, dispatchError: String(thrown.message || thrown) };
  }

  if (dispatchResult.classification === ADAPTER_OUTCOMES.ACCEPTED) {
    maybeCrash(crashAt, CRASH_POINTS.IMMEDIATELY_AFTER_PROVIDER_ACCEPTS);
  }

  if (dispatchResult.evidence) {
    await evidenceStore.append({ executionId: prepared.executionId, provider: prepared.provider, ...dispatchResult.evidence });
  }
  maybeCrash(crashAt, CRASH_POINTS.AFTER_RECEIPT_BEFORE_AUTHORIZATION_BINDING);

  const nextStatus = classificationToStatus(dispatchResult.classification);
  const bound = await store.transition({
    executionId: prepared.executionId, toStatus: nextStatus, reason: dispatchResult.classification,
    expectedFromStatus: 'DISPATCHING', providerReferenceId: dispatchResult.providerReferenceId || null
  });
  if (!bound.applied) {
    throw new Error(`could not durably bind outcome for ${prepared.executionId}: current status ${bound.execution?.status}`);
  }

  return { executionId: prepared.executionId, status: bound.execution.status, classification: dispatchResult.classification };
}
