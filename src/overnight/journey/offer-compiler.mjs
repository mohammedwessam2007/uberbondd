import { sha256 } from '../../../src/omnia-v9/canonical.mjs';
import { classifyEffectLedger, EFFECT_STATES } from '../../../src/effect-ledgers.mjs';
import { isPublishableDiagnosticStatement } from './epistemic.mjs';
import { JOURNEY_DIAGNOSTIC_POLICY_VERSION } from './diagnosis.mjs';

export const JOURNEY_OFFER_COMPILER_POLICY_VERSION = 'overnight-journey-offer-compiler-1.0.0';
export const DEFAULT_JOURNEY_OFFER_NAME = 'Revenue Journey Assurance Diagnostic';

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function reject(reasonCodes) {
  return {
    ok: false,
    policyVersion: JOURNEY_OFFER_COMPILER_POLICY_VERSION,
    status: 'REJECTED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))]
  };
}

function ownerConfiguredPrice(price = {}) {
  const amountMinor = Number(price.amountMinor);
  const currency = text(price.currency, 3).toUpperCase();
  if (price.source !== 'OWNER_CONFIG') {
    return { status: 'NOT_CONFIGURED', amountMinor: null, currency: null, source: null };
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !/^[A-Z]{3}$/.test(currency)) {
    return { status: 'NOT_CONFIGURED', amountMinor: null, currency: null, source: null };
  }
  return { status: 'CONFIGURED', amountMinor, currency, source: 'OWNER_CONFIG' };
}

function channelNeutralAssets({ offerName, scope, proofPoints, diagnostic }) {
  const first = proofPoints[0];
  const stage = first?.stepType || 'journey step';
  const status = first?.observedStatus || 'incomplete';
  const evidenceLine = first
    ? `Evidence reference: ${first.evidenceRefs.join(', ')}.`
    : 'Evidence reference: see the diagnostic receipt.';

  return {
    channel: 'CHANNEL_NEUTRAL',
    subjectLine: `${offerName}: evidence-backed journey review`,
    headline: `${offerName} for a revenue-critical journey`,
    body: [
      `An authorized synthetic check recorded ${status} at the ${stage} step.`,
      evidenceLine,
      `Scope: ${scope}.`,
      'This asset reports one synthetic run only. It does not claim lost revenue, customer impact, conversion loss, or a live production defect.',
      'Next step: review the evidence and separately authorize live verification if appropriate.'
    ].join('\n\n'),
    callToAction: 'Review the evidence and authorize verification',
    disclosures: [
      'No browser, provider, customer-system, payment, mailbox, DNS, or outreach call was made by this compiler.',
      'Customer status: UNVERIFIED.',
      'Revenue outcome: NOT_MEASURED.',
      `Diagnostic reference: ${diagnostic.diagnosticId}.`
    ]
  };
}

/**
 * Compile exactly one evidence-bound, channel-neutral offer packet.
 *
 * It can describe what the synthetic run recorded, but it cannot turn that
 * record into a customer, revenue, conversion, or production claim. Price is
 * omitted unless explicitly supplied as OWNER_CONFIG; no market price is
 * invented here.
 */
export function compileJourneyOffer({
  diagnostic,
  offer = {},
  subject = {},
  date = new Date()
} = {}) {
  const timestamp = iso(date);
  if (!timestamp) return reject(['offer-time-required']);
  if (!diagnostic?.ok) return reject(['normalized-diagnostic-required']);
  if (diagnostic.policyVersion !== JOURNEY_DIAGNOSTIC_POLICY_VERSION) return reject(['diagnostic-policy-version-mismatch']);

  const effect = classifyEffectLedger('externalEffectLedger', diagnostic.externalEffectLedger);
  if (!effect.ok || effect.state !== EFFECT_STATES.ZERO_EFFECT || !effect.provenZero) {
    return reject(['offer-requires-proven-zero-effect', ...(effect.reasonCodes || [])]);
  }
  if (diagnostic.status !== 'ACTIONABLE_FINDINGS_PRESENT' || !Array.isArray(diagnostic.findings) || diagnostic.findings.length === 0) {
    return reject(['no-actionable-journey-finding']);
  }

  const proofPoints = diagnostic.findings
    .filter(finding => isPublishableDiagnosticStatement(finding.statement))
    .map(finding => ({
      findingId: finding.findingId,
      stepType: finding.stepType,
      observedStatus: finding.observedStatus,
      statement: finding.statement.statement,
      relation: finding.statement.relation,
      evidenceRefs: [...finding.statement.evidenceRefs],
      scope: finding.scope
    }));
  if (!proofPoints.length) return reject(['no-publishable-evidence-bound-finding']);

  const offerName = text(offer.name, 180) || DEFAULT_JOURNEY_OFFER_NAME;
  const scope = text(offer.scope, 400) || 'One authorized synthetic journey check and an evidence-bound diagnostic report';
  const price = ownerConfiguredPrice(offer.price);
  const subjectRef = text(subject.subjectRef || subject.organizationRef, 180);
  const recipient = {
    subjectRef: subjectRef || null,
    relationship: text(subject.relationship, 40).toUpperCase() || 'UNVERIFIED',
    displayName: text(subject.displayName, 180) || null,
    customerStatus: 'UNVERIFIED'
  };
  const assets = channelNeutralAssets({ offerName, scope, proofPoints, diagnostic });
  const packetIdentity = {
    policyVersion: JOURNEY_OFFER_COMPILER_POLICY_VERSION,
    diagnosticId: diagnostic.diagnosticId,
    offerName,
    scope,
    price,
    subjectRef,
    proofPoints
  };
  const offerId = `journey_offer_${sha256(packetIdentity).slice(0, 24)}`;
  const executionReceipt = {
    receiptId: `receipt_${sha256({ offerId, timestamp }).slice(0, 24)}`,
    operation: 'JOURNEY_OFFER_COMPILATION',
    status: 'SUCCEEDED',
    effectState: EFFECT_STATES.ZERO_EFFECT,
    externalEffectLedger: { ...effect.ledger },
    providerReferences: [],
    observedAt: timestamp
  };

  return {
    ok: true,
    policyVersion: JOURNEY_OFFER_COMPILER_POLICY_VERSION,
    offerId,
    compiledAt: timestamp,
    offer: {
      name: offerName,
      scope,
      price,
      recurring: offer.recurring === true
    },
    recipient,
    proofPoints,
    internalHypotheses: {
      inferences: diagnostic.internalInferences,
      predictions: diagnostic.internalPredictions,
      excludedFromProof: true
    },
    channelNeutralAssets: assets,
    truthBoundary: {
      claimsAreLimitedTo: ['THE_SUPPLIED_SYNTHETIC_RUN', 'THE_DERIVED_DIAGNOSTIC_FINDINGS'],
      customer: 'UNVERIFIED',
      revenue: 'NOT_MEASURED',
      conversion: 'NOT_MEASURED',
      acceptance: 'NOT_MEASURED',
      production: 'NOT_VERIFIED'
    },
    dispatch: {
      status: 'NOT_AUTHORIZED',
      channel: null,
      externalEffectAuthority: 'NONE',
      reason: 'Channel-neutral compilation does not authorize distribution.'
    },
    executionReceipt,
    externalEffectLedger: { ...effect.ledger },
    effectState: EFFECT_STATES.ZERO_EFFECT
  };
}
