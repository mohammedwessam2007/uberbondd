// Owner-reviewable first-payment packet. This composes the canonical
// opportunity experiment, provider-adapter access gate, payment-truth policy,
// and commercial-outcome lineage without opening checkout, contacting a
// buyer, storing legal documents, or claiming revenue.
import crypto from 'node:crypto';
import { compileCommercialOpportunity } from './commercial-opportunity-catalog.mjs';
import {
  evaluateAdapterAccess,
  ADAPTER_CONTRACT_POLICY_VERSION,
  ADAPTER_CONTRACT_EXTERNAL_EFFECTS
} from './adapter-contracts.mjs';
import { PAYMENT_TRUTH_POLICY_VERSION } from './payments.mjs';
import {
  COMMERCIAL_OUTCOME_POLICY_VERSION,
  COMMERCIAL_OUTCOME_TYPES
} from './commercial-outcome.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const COMMERCIAL_FIRST_PAYMENT_PACKET_POLICY_VERSION = 'commercial-first-payment-packet-1.0.0';


const REQUIRED_PAYMENT_PROOF_FIELDS = Object.freeze([
  'paymentDecision.policyVersion',
  'paymentDecision.classification',
  'paymentDecision.shouldRecordRevenue',
  'outcome.eventId',
  'outcome.providerEventId',
  'outcome.amountCents',
  'outcome.currency',
  'outcome.opportunityId'
]);

function referenceDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function evidenceRefs(review) {
  if (!Array.isArray(review?.evidenceRefs)) return [];
  return [...new Set(review.evidenceRefs.map(ref => String(ref || '').trim()).filter(Boolean))].slice(0, 20);
}

// Legal review is intentionally an owner-attestation boundary, not a legal
// conclusion. No document text or identity data is copied into the packet.
function compileLegalGate(review) {
  const refs = evidenceRefs(review);
  if (review?.ownerAttested === true && refs.length) {
    return {
      status: 'OWNER_ATTESTED_REVIEW_ONLY',
      truthClassification: 'OWNER_ATTESTED_NOT_VERIFIED',
      evidenceRefs: refs,
      reasonCodes: ['legal-proof-external-required']
    };
  }
  return {
    status: 'OWNER_REVIEW_REQUIRED',
    truthClassification: 'UNRESOLVED',
    evidenceRefs: [],
    reasonCodes: ['legal-review-required']
  };
}

function compileProviderGate({ manifest, authorizationReceipt, date }) {
  if (!manifest) {
    return {
      status: 'PROVIDER_CONTRACT_REQUIRED',
      truthClassification: 'EXTERNAL_PROOF_REQUIRED',
      manifestId: null,
      policyVersion: ADAPTER_CONTRACT_POLICY_VERSION,
      reasonCodes: ['provider-manifest-required', 'provider-live-proof-required'],
      externalEffectLedger: { ...ADAPTER_CONTRACT_EXTERNAL_EFFECTS }
    };
  }
  const access = evaluateAdapterAccess({ manifest, authorizationReceipt, date });
  return {
    status: access.status,
    truthClassification: access.liveAccess,
    manifestId: access.manifestId || manifest.manifestId || null,
    policyVersion: access.policyVersion,
    reasonCodes: unique([...(access.reasonCodes || []), 'provider-live-proof-required']),
    networkCalls: access.networkCalls || 0,
    providerCalls: access.providerCalls || 0,
    externalEffectLedger: access.externalEffectLedger || { ...ADAPTER_CONTRACT_EXTERNAL_EFFECTS }
  };
}

function compilePaymentGate() {
  return {
    status: 'EXTERNAL_PROOF_REQUIRED',
    truthClassification: 'EXTERNAL_PROOF_REQUIRED',
    paymentTruthPolicyVersion: PAYMENT_TRUTH_POLICY_VERSION,
    commercialOutcomePolicyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION,
    requiredOutcomeType: 'PAYMENT_CLEARED',
    acceptedOutcomeTypes: ['PAYMENT_CLEARED', 'RENEWAL_CLEARED'],
    requiredProofFields: [...REQUIRED_PAYMENT_PROOF_FIELDS],
    reasonCodes: ['first-payment-proof-required']
  };
}

// Compiles one bounded seven-day packet from the canonical catalog. The
// packet is useful even when blocked: its gates and kill conditions explain
// exactly what must be reviewed before any first-payment attempt.
export function compileCommercialFirstPaymentPacket({
  opportunityId = 'paid-media-revenue-assurance',
  legalReview = null,
  adapterManifest = null,
  adapterAuthorizationReceipt = null,
  date = new Date()
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const opportunity = compileCommercialOpportunity({ opportunityId, date: at });
  if (!opportunity.ok) {
    return {
      ok: false,
      policyVersion: COMMERCIAL_FIRST_PAYMENT_PACKET_POLICY_VERSION,
      status: 'BLOCKED',
      timestamp,
      reasonCodes: ['canonical-opportunity-required'],
      opportunityId: String(opportunityId || ''),
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }

  const legal = compileLegalGate(legalReview);
  const provider = compileProviderGate({ manifest: adapterManifest, authorizationReceipt: adapterAuthorizationReceipt, date: at });
  const payment = compilePaymentGate();
  const reasonCodes = unique([...legal.reasonCodes, ...provider.reasonCodes, ...payment.reasonCodes]);
  const packetId = `firstpay_${digest({
    policyVersion: COMMERCIAL_FIRST_PAYMENT_PACKET_POLICY_VERSION,
    opportunityId: opportunity.opportunityId,
    timestamp,
    legalEvidenceRefs: legal.evidenceRefs,
    providerManifestId: provider.manifestId
  }).slice(0, 24)}`;

  return {
    ok: true,
    policyVersion: COMMERCIAL_FIRST_PAYMENT_PACKET_POLICY_VERSION,
    status: 'OWNER_REVIEW_REQUIRED',
    mode: 'NO_CONTACT_NO_CHECKOUT_PREPARATION',
    packetId,
    timestamp,
    opportunity: {
      opportunityId: opportunity.opportunityId,
      name: opportunity.name,
      category: opportunity.category,
      verdict: opportunity.verdict,
      evidenceClassification: opportunity.evidence?.classification || 'UNRESOLVED',
      observedBuyerSignalCount: Array.isArray(opportunity.observedBuyerSignals) ? opportunity.observedBuyerSignals.length : 0
    },
    experiment: {
      durationDays: 7,
      stage: opportunity.experiment.stage,
      primaryMetric: opportunity.experiment.primaryMetric,
      secondaryMetrics: [...opportunity.experiment.secondaryMetrics],
      sevenDaySteps: [...opportunity.sevenDayExperiment],
      killConditions: [...opportunity.taskBlueprint.killConditions],
      paymentTruth: opportunity.experiment.paymentTruth,
      promotion: { ...opportunity.experiment.promotion }
    },
    gates: { legal, provider, payment },
    outcomeGraph: {
      states: ['SIGNAL_CAPTURED', 'OPPORTUNITY_SCORED', 'OFFER_PREPARED', 'CHECKOUT_STARTED', 'PAYMENT_CLEARED', 'DELIVERY_ACCEPTED', 'RENEWAL_CLEARED', 'REFUND', 'DISPUTE'],
      supportedOutcomeTypes: COMMERCIAL_OUTCOME_TYPES.filter(type => ['PAYMENT_CLEARED', 'RENEWAL_CLEARED', 'DELIVERY_ACCEPTED', 'REFUND', 'DISPUTE'].includes(type)),
      paymentClaimRule: 'Only normalizeCommercialOutcome receipts with payment-truth classification and provider event proof may enter cleared-payment learning.',
      policyVersions: {
        paymentTruth: PAYMENT_TRUTH_POLICY_VERSION,
        commercialOutcome: COMMERCIAL_OUTCOME_POLICY_VERSION
      }
    },
    blockers: reasonCodes,
    authorization: {
      externalActions: 'OWNER_REQUIRED',
      contact: 'DISABLED',
      checkout: 'DISABLED',
      providerCalls: 'DISABLED',
      spend: 'DISABLED',
      deployment: 'DISABLED',
      paymentClaim: 'EXTERNAL_PROOF_REQUIRED'
    },
    truthClassification: {
      packet: 'IMPLEMENTED_LOCAL',
      buyerEvidence: opportunity.evidence?.classification || 'UNRESOLVED',
      legal: legal.truthClassification,
      provider: provider.truthClassification,
      payment: payment.truthClassification,
      revenue: 'UNPROVEN'
    },
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export async function logCommercialFirstPaymentPacket(store, packet) {
  if (!store || typeof store.log !== 'function' || !packet?.ok) return null;
  return store.log('commercial_first_payment_packet', {
    policyVersion: packet.policyVersion,
    status: packet.status,
    mode: packet.mode,
    packetId: packet.packetId,
    timestamp: packet.timestamp,
    opportunityId: packet.opportunity?.opportunityId || null,
    durationDays: packet.experiment?.durationDays ?? null,
    primaryMetric: packet.experiment?.primaryMetric || null,
    blockers: packet.blockers || [],
    legalStatus: packet.gates?.legal?.status || null,
    providerStatus: packet.gates?.provider?.status || null,
    paymentStatus: packet.gates?.payment?.status || null,
    authorization: packet.authorization,
    truthClassification: packet.truthClassification,
    externalEffectLedger: packet.externalEffectLedger
  });
}

export const COMMERCIAL_FIRST_PAYMENT_PACKET_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
