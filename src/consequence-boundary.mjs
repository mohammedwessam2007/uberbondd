// Composes the Deliverability Guard (src/deliverability-guard.mjs) with the
// vendored OMNIA V9 admission kernel (src/omnia-v9/kernel.mjs) per the
// canonical architecture decision in
// docs/PROMETHEUS_CANONICAL_INTEGRATION_PLAN.md:
//
//   - Guard remains a specialized deterministic preflight/final-recheck
//     safety layer. It may DENY/BLOCK a send before V9 is ever consulted.
//   - V9 remains the authoritative policy/evidence/authority boundary for
//     consequential actions. Guard's ALLOW is necessary but not
//     sufficient -- V9's decision, when consulted, is final.
//   - Guard must never grant authority. There is no code path in this
//     module where a Guard ALLOW alone results in a final ALLOW; V9 always
//     has the last word once consulted.
//   - V9 does not duplicate deliverability logic (suppression, caps,
//     cadence, evidence freshness) -- none of that is reimplemented here.
//     It only adds the formal intent/evidence/approval admission layer on
//     top of an action Guard has already screened.
//
// The kernel's mechanism (digest-signed ActionIntent, closed schemas,
// admitAction()) is real and vendored verbatim from the unmerged V9
// branch. Its actual POLICY CONTENT (Cedar rules, a bound constitution)
// is not ported onto this branch -- that remains future work. The default
// policyAuthorizer here fails closed (DENY) accordingly: this composes the
// real mechanism without fabricating policy content that doesn't exist
// here yet.
import { createActionIntent, admitAction } from './omnia-v9/kernel.mjs';

export const CONSEQUENCE_BOUNDARY_POLICY_VERSION = 'consequence-boundary-1.0.0';

// True only when Guard has actually allowed local preparation. Any other
// Guard decision (DENY, REVIEW_REQUIRED, or anything else) means V9 must
// never be consulted for this action -- proven by evaluateConsequenceBoundary
// below never calling admitAction() unless this returns true.
export function shouldConsultV9(guardDecision) {
  return guardDecision === 'ALLOW_LOCAL_PREPARATION';
}

// Deliberately conservative: DENY with an explicit, honest reason rather
// than a permissive default. A real deployment must inject its own
// policyAuthorizer (Cedar or otherwise) via v9Context to ever reach ALLOW.
export function defaultFailClosedPolicyAuthorizer() {
  return { decision: 'DENY', reasons: ['policy:no-policy-content-ported-onto-this-branch'] };
}

// Builds a real, schema-valid ActionIntent for an outbound-send action.
// Pure given its inputs -- no randomness except an explicit nonce/
// idempotencyKey the caller must supply (matching this codebase's existing
// idempotency-key discipline elsewhere, e.g. src/send-safety.mjs).
export function buildOutboundActionIntent({
  prospect, campaign, inbox, cfg, date = new Date(), evidenceIds = [], nonce, idempotencyKey, ttlMs = 5 * 60_000
} = {}) {
  const now = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  if (!nonce || !idempotencyKey) {
    throw new TypeError('buildOutboundActionIntent requires an explicit nonce and idempotencyKey');
  }
  return createActionIntent({
    missionId: String(campaign?.id || 'unknown-campaign'),
    tenantId: String(cfg?.sender?.company || 'uberbond'),
    actorId: 'pipeline.maybeSend',
    operation: 'outbound.email.send',
    resource: `gmail-inbox:${String(inbox || 'unknown')}`,
    purpose: 'cold-outreach',
    effectClass: 'COMMUNICATE_EXTERNAL',
    arguments: { prospectId: String(prospect?.id || ''), campaignId: String(campaign?.id || ''), inbox: String(inbox || '') },
    evidenceIds,
    maxCostUsd: 0,
    blastRadius: 1,
    rollback: 'NOT_APPLICABLE_NO_SEND_OCCURRED_UNTIL_ADMITTED',
    expiresAt: new Date(now.getTime() + Math.max(1000, ttlMs)).toISOString(),
    nonce, idempotencyKey
  }, now);
}

// Thin wrapper over the vendored kernel's admitAction() -- kept separate
// from evaluateConsequenceBoundary so it can be unit-tested against the
// kernel directly without needing a Guard decision in the loop.
export function evaluateV9Admission({
  intent, approvals = [], policyAuthorizer = defaultFailClosedPolicyAuthorizer,
  evidenceResolver, evidenceRequirementResolver, usageResolver, keyResolver,
  policyVersion, policyDigest, constitutionDigest, killState, revokedIntentDigests, date = new Date()
} = {}) {
  const now = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return admitAction(intent, {
    now, approvals, policyAuthorizer, evidenceResolver, evidenceRequirementResolver, usageResolver, keyResolver,
    policyVersion, policyDigest, constitutionDigest, killState, revokedIntentDigests
  });
}

// The actual composition entry point. `guardDecision` is Guard's own
// `.decision` string (already computed by evaluateDeliverabilityGuard
// elsewhere -- this module never re-implements that). `buildIntent` is a
// zero-argument closure the caller supplies (typically
// () => buildOutboundActionIntent({...})) so an ActionIntent is only ever
// constructed -- and only ever handed to admitAction() -- when Guard has
// actually allowed the action forward.
export function evaluateConsequenceBoundary({ guardDecision, buildIntent, v9Context = {}, date = new Date() } = {}) {
  if (!shouldConsultV9(guardDecision)) {
    return {
      ok: false, finalDecision: 'DENY', reason: 'guard-did-not-allow',
      guardDecision, v9Consulted: false, v9Decision: null, intent: null,
      policyVersion: CONSEQUENCE_BOUNDARY_POLICY_VERSION
    };
  }
  const intent = buildIntent();
  const v9Decision = evaluateV9Admission({ intent, date, ...v9Context });
  const ok = v9Decision.decision === 'ALLOW';
  return {
    ok, finalDecision: v9Decision.decision, reason: ok ? 'v9-admitted' : 'v9-did-not-admit',
    guardDecision, v9Consulted: true, v9Decision, intent,
    policyVersion: CONSEQUENCE_BOUNDARY_POLICY_VERSION
  };
}
