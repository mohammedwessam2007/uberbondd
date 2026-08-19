import { admitAction } from '../kernel.mjs';
import { resolveShadowAuthorityContext } from './shadow-approval.mjs';
import { NullConsequenceAdapter } from './null-consequence-adapter.mjs';
import { CanaryReceiptStore } from './canary-receipt-store.mjs';
import { classifyRealCedarFailure, RealCedarBindingError } from './reality-shadow-cedar.mjs';
import { CANARY_NULL_OPERATION } from './canary-approval.mjs';

/**
 * The only decision value that may ever execute the null sink. Enumerated
 * explicitly, checked by strict Set membership -- never a truthy check,
 * never an `if (decision !== 'DENY')`-shaped default-to-execute.
 */
export const CANARY_EXECUTABLE_DECISIONS = Object.freeze(new Set(['ALLOW']));

/**
 * Every decision value this gate recognizes as an explicit, understood
 * non-execution outcome. Anything NOT in this set and NOT 'ALLOW' still
 * results in no execution (see classifyCanaryGateOutcome's final branch) --
 * this set exists only to distinguish "V9 gave a real answer, and the
 * answer was no" from "V9's answer was not recognized at all", for audit
 * clarity, not to gate on.
 */
export const CANARY_KNOWN_NO_EXECUTION_DECISIONS = Object.freeze(new Set(['DENY', 'REVIEW', 'INCOMPLETE', 'ERROR']));

/**
 * CanaryReceiptStore rows come back from Postgres in snake_case; a freshly
 * executed receipt from NullConsequenceAdapter.execute() is camelCase. A
 * caller reading result.receipt.receiptDigest must get the same field
 * whether this candidate just executed the sink or converged onto a prior
 * execution's receipt via idempotent replay -- normalizing here means the
 * shape is never allowed to leak the storage layer's naming convention.
 */
function normalizeStoredReceipt(row) {
  if (!row) return null;
  return {
    schemaVersion: 'omnia.v9.null-consequence-receipt.v1',
    intentDigest: row.intent_digest,
    authorizationDigest: row.authorization_digest,
    tenantId: row.tenant_id,
    reservationId: row.reservation_id,
    actionClass: row.action_class,
    result: row.result,
    attemptedAt: row.attempted_at instanceof Date ? row.attempted_at.toISOString() : String(row.attempted_at),
    receiptDigest: row.receipt_digest
  };
}

/**
 * Pure, directly-testable gating function. Exhaustive enumeration: the ONLY
 * way to get executed:true is decision === 'ALLOW' (strict string equality
 * via Set membership). Every other value, including values this module has
 * never seen before, resolves to executed:false. There is no default-allow
 * branch anywhere in this function.
 */
export function classifyCanaryGateOutcome(decision) {
  if (CANARY_EXECUTABLE_DECISIONS.has(decision)) return { executed: true };
  if (CANARY_KNOWN_NO_EXECUTION_DECISIONS.has(decision)) return { executed: false, reason: `no-execution:${decision}` };
  return { executed: false, reason: 'no-execution:unknown-decision' };
}

/**
 * Resolves real Postgres authority + evaluates real Cedar for one canary
 * intent, gates null-sink execution on the result via
 * classifyCanaryGateOutcome(), and -- ONLY on ALLOW -- durably reserves the
 * approval's authority via the frozen, already-concurrency-tested
 * OmniaV9ProofStore.reserveAuthority() before ever calling the adapter.
 * This is the first place in this codebase where a V9 decision is
 * authoritative over whether ANY execution happens -- but the execution
 * target is always the null sink (null-consequence-adapter.mjs), never
 * Gmail, and the actual consumption of one-time authority is enforced by
 * the same atomic database transaction the frozen P1 proof store already
 * uses for every other approval in this codebase, not by a new mechanism
 * built for this mission.
 *
 * Reservation-then-execute (not execute-then-reserve) is deliberate: two
 * concurrent evaluations of the same one-use approval can both legitimately
 * see ALLOW from admitAction()'s point-in-time usage snapshot, but only one
 * can win the atomic reserveAuthority() transaction -- the loser never
 * calls the sink at all. A retry with the same idempotencyKey converges on
 * the exact same reservation and, via receiptStore, the exact same receipt
 * -- the sink is never called twice for one logical action.
 *
 * Any failure resolving authority or evaluating Cedar is caught here and
 * classified as INCOMPLETE (missing real Cedar/config) or ERROR (anything
 * else), per classifyRealCedarFailure -- never silently treated as ALLOW,
 * and never left to propagate as an uncaught exception that a caller might
 * mishandle into an accidental execution.
 */
export async function evaluateAndGateCanaryNull({
  pool, proofStore, tenantId, cedarAuthority, keyResolver, adapter, receiptStore,
  intent, evidence, now = new Date()
}) {
  if (!(adapter instanceof NullConsequenceAdapter)) throw new Error('adapter must be a NullConsequenceAdapter instance');
  if (!(receiptStore instanceof CanaryReceiptStore)) throw new Error('receiptStore must be a CanaryReceiptStore instance');

  let decision;
  let reasons = [];
  let admission = null;
  let failureDetail = null;

  try {
    if (intent.operation !== CANARY_NULL_OPERATION) {
      throw new Error(`canary intents must use operation ${CANARY_NULL_OPERATION}, got ${intent.operation}`);
    }
    const authority = await resolveShadowAuthorityContext({ pool, proofStore, tenantId, now });
    admission = admitAction(intent, {
      now,
      approvals: authority.approvals,
      keyResolver,
      usageResolver: authority.usageResolver,
      revokedApprovalIds: authority.revokedApprovalIds,
      evidenceResolver: id => (id === evidence?.evidenceId ? evidence : null),
      evidenceRequirementResolver: () => ({ minCount: 1, allowedOrigins: ['EXTERNAL_SOURCE', 'SYNTHETIC_FIXTURE'] }),
      policyAuthorizer: cedarAuthority.policyAuthorizer,
      policyVersion: 'omnia-v9-canary-null-v1',
      policyDigest: cedarAuthority.policyDigest,
      constitutionDigest: cedarAuthority.constitutionDigest
    });
    decision = admission.decision;
    reasons = admission.reasons;
  } catch (error) {
    decision = error instanceof RealCedarBindingError
      ? (classifyRealCedarFailure(error) === 'V9_INCOMPLETE' ? 'INCOMPLETE' : 'ERROR')
      : 'ERROR';
    failureDetail = String(error?.message || error);
    reasons = [failureDetail];
  }

  const gateOutcome = classifyCanaryGateOutcome(decision);
  if (!gateOutcome.executed) {
    return { decision, reasons, admission, executed: false, reason: gateOutcome.reason, receipt: null, reservation: null, failureDetail };
  }

  let reservation;
  try {
    await proofStore.putObject({ objectType: 'ACTION_INTENT', objectId: intent.intentDigest, tenantId: intent.tenantId, digest: intent.intentDigest, data: intent });
    reservation = await proofStore.reserveAuthority({
      approvalId: admission.approvalId,
      tenantId: intent.tenantId,
      intentDigest: intent.intentDigest,
      idempotencyKey: intent.idempotencyKey,
      costDeltaUsd: intent.maxCostUsd,
      blastRadius: intent.blastRadius,
      now
    });
  } catch (error) {
    return { decision, reasons, admission, executed: false, reason: `no-execution:reservation-error:${String(error?.message || error)}`, receipt: null, reservation: null, failureDetail: String(error?.message || error) };
  }

  if (!reservation.ok) {
    return { decision, reasons, admission, executed: false, reason: `no-execution:reservation-denied:${reservation.reason || 'unknown'}`, receipt: null, reservation, failureDetail: null };
  }

  const reservationId = intent.idempotencyKey;
  const authorizationDigest = admission.decisionDigest || '';

  if (reservation.duplicate) {
    // reserveAuthority()'s SELECT ... FOR UPDATE guarantees the winning
    // caller's reservation transaction has already committed by the time a
    // duplicate caller observes duplicate:true -- but receipt persistence
    // happens in a separate step after that commit, so a concurrent
    // duplicate can legitimately arrive in the brief window before the
    // winner has finished writing its receipt. Poll briefly for it rather
    // than assuming "not found yet" means "never coming" -- only after the
    // bounded wait elapses do we treat this as a genuine crash-recovery gap
    // (the winner died between reserving and persisting) and execute once
    // to close it. See V9_CANARY_CRASH_RECOVERY_REPORT.md for the exact
    // tradeoff this bound represents.
    const pollIntervalMs = 20;
    const pollBudgetMs = 500;
    let existingReceipt = await receiptStore.getByReservationId(reservationId);
    let waited = 0;
    while (!existingReceipt && waited < pollBudgetMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      waited += pollIntervalMs;
      existingReceipt = await receiptStore.getByReservationId(reservationId);
    }
    if (existingReceipt) {
      return { decision, reasons, admission, executed: true, reason: null, receipt: normalizeStoredReceipt(existingReceipt), reservation, failureDetail: null, replayed: true };
    }
    // Reservation exists but no receipt appeared within the poll budget --
    // treated as a genuine crash-recovery gap; fall through and execute
    // exactly once now, closing the gap rather than losing the consequence
    // silently.
  }

  const receipt = await adapter.execute({
    intentDigest: intent.intentDigest,
    authorizationDigest,
    tenantId: intent.tenantId,
    reservationId,
    actionClass: intent.operation,
    attemptedAt: now.toISOString()
  });

  try {
    await receiptStore.persistOnce({
      reservationId, intentDigest: intent.intentDigest, authorizationDigest,
      tenantId: intent.tenantId, actionClass: intent.operation,
      result: receipt.result, receiptDigest: receipt.receiptDigest, attemptedAt: receipt.attemptedAt
    });
  } catch (error) {
    return { decision, reasons, admission, executed: true, reason: null, receipt, reservation, failureDetail: null, receiptPersistenceError: String(error?.message || error), uncertain: true };
  }

  return { decision, reasons, admission, executed: true, reason: null, receipt, reservation, failureDetail: null };
}
