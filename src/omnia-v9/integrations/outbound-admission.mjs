import { createActionIntent, createEvidenceRecord, admitAction } from '../kernel.mjs';
import { sha256 } from '../canonical.mjs';

const OUTBOUND_EXTERNAL_ORIGINS = ['EXTERNAL_SOURCE', 'PROVIDER_CALLBACK', 'CUSTOMER_ATTESTATION', 'PROFESSIONAL_ATTESTATION', 'PRODUCTION_TELEMETRY'];
const INTENT_WINDOW_MS = 15 * 60_000;

/**
 * Derives a P0 ActionIntent + Evidence record from the P4 shadow context that
 * pipeline.mjs already builds at the "after durable reservation, before Gmail"
 * boundary (see src/omnia-v9/final-admission-shadow.mjs). This is a pure
 * function: it reads only the summarized context object, never the raw
 * prospect/campaign entities, and never anything Gmail-related.
 */
export function deriveOutboundActionIntent(context, now = new Date()) {
  const action = context?.action || {};
  const reservation = context?.reservation || {};
  const tenantId = `campaign:${action.campaignId || 'unknown'}`;
  const hasExternalUrl = typeof action.evidenceUrl === 'string' && /^https?:\/\//i.test(action.evidenceUrl);

  const evidence = createEvidenceRecord({
    evidenceId: `outreach:${action.prospectId || 'unknown'}:issue`,
    tenantId,
    subject: action.recipientEmail || 'unknown-recipient',
    origin: hasExternalUrl ? 'EXTERNAL_SOURCE' : 'INTERNAL_OBSERVATION',
    relation: 'DIRECT',
    verificationClaims: [],
    lifecycleFlags: ['ACTIVE'],
    sourceRef: hasExternalUrl ? action.evidenceUrl : 'internal:missing-external-evidence-url',
    payloadDigest: action.evidenceExcerptSha256 || sha256(''),
    observedAt: context?.observedAt || now.toISOString()
  });

  const intent = createActionIntent({
    missionId: tenantId,
    tenantId,
    actorId: 'uberbond-outbound-worker',
    operation: 'email.send',
    resource: `email:${String(action.recipientEmail || '').toLowerCase()}`,
    purpose: 'qualified-b2b-outreach',
    effectClass: 'COMMUNICATE_EXTERNAL',
    argumentsDigest: sha256({ subjectSha256: action.subjectSha256 || '', bodySha256: action.bodySha256 || '' }),
    evidenceIds: [evidence.evidenceId],
    maxCostUsd: 0.25,
    blastRadius: 1,
    rollback: 'SUPPRESS_FUTURE_CONTACT',
    createdAt: context?.observedAt || now.toISOString(),
    expiresAt: new Date((Date.parse(context?.observedAt) || now.getTime()) + INTENT_WINDOW_MS).toISOString(),
    nonce: `${reservation.id || 'no-reservation'}:${context?.observedAt || now.toISOString()}`,
    idempotencyKey: reservation.idempotencyKey || `unknown:${reservation.id || ''}`
  }, now);

  return { intent, evidence };
}

/**
 * Evaluates V9 admission for one outbound candidate. Never sends email,
 * never touches Gmail, never mutates reservation/send state — it only
 * returns a structured decision for the caller (final-admission-shadow.mjs)
 * to log. Defaults reflect the honest current state of production: no
 * owner-issued approvals exist yet, so real production calls will resolve
 * to REVIEW or DENY, never a fabricated ALLOW. Callers (tests, replay) may
 * inject approvals/policyAuthorizer to exercise the full decision range.
 */
export function evaluateOutboundAdmission({
  context,
  now = new Date(),
  approvals = [],
  keyResolver = () => null,
  usageResolver = () => ({ uses: 0, costUsd: 0 }),
  policyAuthorizer = () => ({ decision: 'REVIEW', reasons: ['no-live-policy-authorizer-configured'] }),
  policyVersion = 'omnia-v9-outbound-integration-v1',
  policyDigest,
  constitutionDigest,
  killState = { active: false },
  revokedApprovalIds = new Set()
} = {}) {
  const { intent, evidence } = deriveOutboundActionIntent(context, now);
  const authorization = admitAction(intent, {
    now,
    approvals,
    keyResolver,
    usageResolver,
    evidenceResolver: id => (id === evidence.evidenceId ? evidence : null),
    evidenceRequirementResolver: () => ({ minCount: 1, allowedOrigins: OUTBOUND_EXTERNAL_ORIGINS }),
    policyAuthorizer,
    policyVersion,
    policyDigest,
    constitutionDigest,
    killState,
    revokedApprovalIds
  });

  return {
    decision: authorization.decision,
    reasons: authorization.reasons,
    policyDigest: authorization.policyDigest,
    constitutionDigest: authorization.constitutionDigest,
    intentDigest: intent.intentDigest,
    evidenceId: evidence.evidenceId
  };
}

/**
 * Builds the hook function passed to Pipeline({ outboundFinalAdmissionShadow }).
 * The returned function matches the contract in observeOutboundFinalAdmission:
 * (context) => { decision, reasons, policyDigest, constitutionDigest }.
 *
 * When mode is 'compare', also persists a structured comparison record via
 * store.log(). This never affects the returned decision or throws: a
 * comparison-logging failure is recorded but does not change V9's answer,
 * matching shadow mode's "V9 crash never blocks legacy" contract.
 */
export function createOutboundAdmissionHook({ store, mode = 'shadow', ...admissionOptions } = {}) {
  return async function outboundAdmissionHook(context) {
    const result = await evaluateOutboundAdmission({ ...admissionOptions, context });
    if (mode === 'compare') {
      try {
        const { classifyComparison } = await import('./compare.mjs');
        const category = classifyComparison({
          legacyEligible: context?.legacySignals?.legacyEligible === true,
          v9Status: 'OBSERVED',
          v9Decision: result.decision
        });
        await store?.log?.('omnia_v9_outbound_compare', {
          schemaVersion: 'omnia.v9.outbound-compare.v1',
          reservationId: context?.reservation?.id || '',
          category,
          legacyEligible: context?.legacySignals?.legacyEligible === true,
          legacyReason: context?.legacySignals?.legacyReason || '',
          v9Decision: result.decision,
          v9Reasons: result.reasons,
          policyDigest: result.policyDigest,
          constitutionDigest: result.constitutionDigest,
          intentDigest: result.intentDigest,
          observedAt: context?.observedAt || new Date().toISOString()
        });
      } catch (error) {
        console.warn('[omnia-v9] compare-mode logging failed (decision unaffected):', error?.message || error);
      }
    }
    return result;
  };
}

/**
 * Single wiring point for process entrypoints (server.mjs, worker.mjs):
 * returns the hook to pass as Pipeline's `outboundFinalAdmissionShadow`
 * option, or null. Returning null for 'off' (and any mode this integration
 * doesn't recognize) preserves the exact pre-integration behavior — the
 * NO_HOOK observation that final-admission-shadow.mjs already logs
 * unconditionally, with zero consequence authority either way.
 */
export function resolveOutboundFinalAdmissionHook({ mode, store }) {
  if (mode !== 'shadow' && mode !== 'compare') return null;
  return createOutboundAdmissionHook({ store, mode });
}
