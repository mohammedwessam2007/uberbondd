import { admitAction } from '../kernel.mjs';
import { resolveShadowAuthorityContext } from './shadow-approval.mjs';
import { NullConsequenceAdapter } from './null-consequence-adapter.mjs';
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
 * intent, then gates null-sink execution on the result via
 * classifyCanaryGateOutcome(). This is the first place in this codebase
 * where a V9 decision is authoritative over whether ANY execution happens
 * -- but the execution target is always the null sink
 * (null-consequence-adapter.mjs), never Gmail.
 *
 * Any failure resolving authority or evaluating Cedar is caught here and
 * classified as INCOMPLETE (missing real Cedar/config) or ERROR (anything
 * else), per classifyRealCedarFailure -- never silently treated as ALLOW,
 * and never left to propagate as an uncaught exception that a caller might
 * mishandle into an accidental execution.
 */
export async function evaluateAndGateCanaryNull({
  pool, proofStore, tenantId, cedarAuthority, keyResolver, adapter,
  intent, evidence, now = new Date()
}) {
  if (!(adapter instanceof NullConsequenceAdapter)) throw new Error('adapter must be a NullConsequenceAdapter instance');

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
    return { decision, reasons, admission, executed: false, reason: gateOutcome.reason, receipt: null, failureDetail };
  }

  const receipt = await adapter.execute({
    intentDigest: intent.intentDigest,
    authorizationDigest: admission?.decisionDigest || '',
    tenantId: intent.tenantId,
    reservationId: intent.idempotencyKey,
    actionClass: intent.operation,
    attemptedAt: now.toISOString()
  });

  return { decision, reasons, admission, executed: true, reason: null, receipt, failureDetail: null };
}
