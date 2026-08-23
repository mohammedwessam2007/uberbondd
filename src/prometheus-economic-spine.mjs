// Canonical Prometheus economic spine composition.
// This module links existing truth-preserving kernels without creating a
// parallel opportunity, offer, payment, or authorization store.
//
// Signal -> Business Genome -> Opportunity Score -> Offer Packet ->
// dry-run experiment packet. Preparation is local-only. It never sends,
// spends, deploys, changes credentials, or records revenue.
import crypto from 'node:crypto';
import {
  EVIDENCE_CLASSES,
  normalizeMarketSignal,
  isStaleSignal
} from './market-signal.mjs';
import {
  compileBusinessGenome,
  scoreOpportunity,
  nextPromotionStage,
  PROMOTION_LADDER_STAGES
} from './opportunity-registry.mjs';
import { compileOfferPacket } from './offer-compiler.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const PROMETHEUS_ECONOMIC_SPINE_POLICY_VERSION = 'prometheus-economic-spine-1.0.0';

export const ECONOMIC_SPINE_STATUSES = Object.freeze([
  'PREPARED',
  'REVIEW_REQUIRED',
  'DENIED'
]);

const COMMERCIAL_SIGNAL_MIN_RANK = EVIDENCE_CLASSES.indexOf('BUYER_SIGNAL');
const DEFAULT_MAX_SIGNAL_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_MIN_OPPORTUNITY_CONFIDENCE = 0.3;


function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function denied(reasonCodes, timestamp, extra = {}) {
  const decisionId = digest({
    policyVersion: PROMETHEUS_ECONOMIC_SPINE_POLICY_VERSION,
    status: 'DENIED',
    reasonCodes,
    timestamp
  });
  return {
    ok: false,
    policyVersion: PROMETHEUS_ECONOMIC_SPINE_POLICY_VERSION,
    decisionId,
    status: 'DENIED',
    timestamp,
    reasonCodes: unique(reasonCodes),
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...extra
  };
}

function signalCommercialGate(signal, maxSignalAgeMs) {
  const reasonCodes = [];
  const evidenceRank = EVIDENCE_CLASSES.indexOf(signal.evidenceClass);

  if (signal.evidenceClass === 'SYNTHETIC_TEST_FIXTURE') {
    reasonCodes.push('synthetic-evidence-not-commercial');
  }
  if (evidenceRank < COMMERCIAL_SIGNAL_MIN_RANK) {
    reasonCodes.push('signal-evidence-below-commercial-threshold');
  }
  if (signal.verificationState === 'CONTRADICTED') {
    reasonCodes.push('signal-contradicted');
  }
  if (isStaleSignal(signal, { maxAgeMs: maxSignalAgeMs })) {
    reasonCodes.push('signal-stale');
  }

  return {
    allowed: reasonCodes.length === 0,
    reasonCodes,
    evidenceRank,
    minimumEvidenceClass: 'BUYER_SIGNAL'
  };
}

function offerGate({ offer, prospect, campaign }) {
  const reasonCodes = [];
  if (!prospect || !prospect.id) reasonCodes.push('canonical-prospect-required-for-offer');
  if (!offer) reasonCodes.push('offer-packet-not-compiled');
  if (offer && !offer.readyToOffer) reasonCodes.push('offer-not-ready');
  if (offer && offer.evidence?.reasonCodes?.length) reasonCodes.push(...offer.evidence.reasonCodes);
  if (campaign?.approved !== true) reasonCodes.push('campaign-approval-required');
  return unique(reasonCodes);
}

function experimentPacket({ candidate, signal, score, offer, reasonCodes, ready }) {
  const productName = offer?.productName || 'bounded offer';
  const opportunityName = candidate.name || candidate.id;
  return {
    status: ready ? 'READY_FOR_OWNER_REVIEW' : 'BLOCKED',
    mode: 'DRY_RUN_PREPARATION_ONLY',
    economicObjective: 'cleared recurring contribution profit per founder minute',
    hypothesis: 'A bounded ' + productName + ' for ' + opportunityName + ' can produce a cleared payment and accepted delivery.',
    signalId: signal.signalId,
    opportunityId: candidate.id,
    offerProduct: offer?.product || null,
    successMetrics: [
      'cleared payment linked to this opportunity',
      'accepted delivery',
      'second payment or renewal',
      'positive contribution margin with known inputs'
    ],
    killConditions: [
      'signal becomes stale or contradicted',
      'required evidence falls below policy threshold',
      'payment is not cleared',
      'delivery is not accepted',
      'contribution margin is unknown or negative after measured inputs'
    ],
    blockers: unique(reasonCodes),
    authorization: {
      externalActions: 'OWNER_REQUIRED',
      providerCalls: 'DISABLED',
      send: 'DISABLED',
      spend: 'DISABLED',
      deploy: 'DISABLED'
    },
    scoreSnapshot: score ? {
      compositeScore: score.compositeScore,
      confidence: score.confidence,
      dataSufficiency: score.dataSufficiency,
      promotionStage: score.promotionStage
    } : null
  };
}

// Composes the existing canonical kernels. This function is deterministic when
// a reference date is supplied and never mutates any input.
export function preparePrometheusEconomicSpine({
  signal,
  candidate,
  prospect = null,
  campaign = null,
  cfg = {},
  product = 'full',
  date = new Date(),
  maxSignalAgeMs = DEFAULT_MAX_SIGNAL_AGE_MS,
  minOpportunityConfidence = DEFAULT_MIN_OPPORTUNITY_CONFIDENCE,
  minEvidenceConfidence
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();

  if (!signal || typeof signal !== 'object') {
    return denied(['market-signal-required'], timestamp);
  }

  const normalizedSignal = normalizeMarketSignal(signal, { date: at });
  if (!normalizedSignal.ok) {
    return denied(['invalid-market-signal:' + normalizedSignal.reason], timestamp, {
      signal: normalizedSignal
    });
  }

  if (!candidate || typeof candidate !== 'object' || !candidate.id) {
    return denied(['opportunity-candidate-required'], timestamp, {
      signal: {
        signalId: normalizedSignal.signalId,
        evidenceClass: normalizedSignal.evidenceClass,
        sourceUrl: normalizedSignal.sourceUrl
      }
    });
  }

  if (candidate.signalId && String(candidate.signalId) !== normalizedSignal.signalId) {
    return denied(['signal-opportunity-link-mismatch'], timestamp, {
      signal: {
        signalId: normalizedSignal.signalId,
        evidenceClass: normalizedSignal.evidenceClass,
        sourceUrl: normalizedSignal.sourceUrl
      },
      opportunityId: candidate.id
    });
  }

  const genome = compileBusinessGenome(candidate);
  const score = scoreOpportunity({ candidate, date: at });
  const signalGate = signalCommercialGate(normalizedSignal, maxSignalAgeMs);

  let offer = null;
  if (prospect && prospect.id) {
    offer = compileOfferPacket({
      prospect,
      campaign,
      cfg,
      product,
      date: at,
      minEvidenceConfidence
    });
  }

  const opportunityReasons = [];
  if (!score.ok) opportunityReasons.push('opportunity-score-failed');
  if (score.ok && score.dataSufficiency === 'INSUFFICIENT') opportunityReasons.push('opportunity-data-insufficient');
  if (score.ok && score.confidence < minOpportunityConfidence) opportunityReasons.push('opportunity-confidence-below-threshold');

  const offerReasons = offerGate({ offer, prospect, campaign });
  const reasonCodes = unique([
    ...signalGate.reasonCodes,
    ...opportunityReasons,
    ...offerReasons
  ]);

  const ready = Boolean(
    genome.ok &&
    score.ok &&
    score.dataSufficiency !== 'INSUFFICIENT' &&
    score.confidence >= minOpportunityConfidence &&
    signalGate.allowed &&
    offer?.ok &&
    offer.readyToOffer &&
    campaign?.approved === true
  );

  const status = ready ? 'PREPARED' : 'REVIEW_REQUIRED';
  const decisionId = digest({
    policyVersion: PROMETHEUS_ECONOMIC_SPINE_POLICY_VERSION,
    signalId: normalizedSignal.signalId,
    opportunityId: candidate.id,
    product,
    timestamp
  });

  const promotionStage = genome.ok && PROMOTION_LADDER_STAGES.includes(genome.promotionStage)
    ? nextPromotionStage(genome.promotionStage, { gatePassed: false })
    : null;

  return {
    ok: true,
    policyVersion: PROMETHEUS_ECONOMIC_SPINE_POLICY_VERSION,
    decisionId,
    status,
    timestamp,
    reasonCodes,
    signal: {
      signalId: normalizedSignal.signalId,
      dedupeKey: normalizedSignal.dedupeKey,
      sourceAdapter: normalizedSignal.sourceAdapter,
      sourceKind: normalizedSignal.sourceKind,
      entityType: normalizedSignal.entityType,
      entityIdentity: normalizedSignal.entityIdentity,
      signalType: normalizedSignal.signalType,
      observedAt: normalizedSignal.observedAt,
      evidenceClass: normalizedSignal.evidenceClass,
      provenance: normalizedSignal.provenance,
      sourceUrl: normalizedSignal.sourceUrl,
      verificationState: normalizedSignal.verificationState,
      freshnessMs: normalizedSignal.freshnessMs,
      commercialGate: signalGate
    },
    opportunity: {
      id: candidate.id,
      name: genome.name,
      category: genome.category,
      genome,
      score,
      promotion: promotionStage
    },
    offer,
    experiment: experimentPacket({
      candidate,
      signal: normalizedSignal,
      score,
      offer,
      reasonCodes,
      ready
    }),
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

// Persists one compact receipt through the existing audit writer. It never
// creates an opportunities/experiments table and never logs raw payloads.
export async function logPrometheusEconomicSpineDecision(store, decision) {
  if (!store || typeof store.log !== 'function' || !decision?.ok) return null;
  return store.log('prometheus_economic_spine', {
    decisionId: decision.decisionId,
    status: decision.status,
    reasonCodes: decision.reasonCodes,
    signalId: decision.signal?.signalId || null,
    opportunityId: decision.opportunity?.id || null,
    product: decision.offer?.product || null,
    compositeScore: decision.opportunity?.score?.compositeScore ?? null,
    confidence: decision.opportunity?.score?.confidence ?? null,
    dataSufficiency: decision.opportunity?.score?.dataSufficiency || null,
    promotionStage: decision.opportunity?.score?.promotionStage || null,
    offerReady: Boolean(decision.offer?.readyToOffer),
    policyVersion: decision.policyVersion,
    timestamp: decision.timestamp,
    externalEffectLedger: decision.externalEffectLedger
  });
}

export const ECONOMIC_SPINE_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
