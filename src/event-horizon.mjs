import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { getCommercialOpportunity } from './commercial-opportunity-catalog.mjs';

export const EVENT_HORIZON_POLICY_VERSION = 'event-horizon-policy-1.0.0';
export const EVENT_HORIZON_SCHEMA_VERSION = 'uberbond-event-horizon-1.0.0';

const EVIDENCE_CLASSES = new Set([
  'MODEL_HYPOTHESIS', 'CREATOR_CLAIM', 'PUBLIC_PROXY', 'BUYER_PAIN',
  'BUYER_INTEREST', 'COMMITMENT', 'PAYMENT', 'ACCEPTED_DELIVERY',
  'REPEAT_PAYMENT', 'RETENTION', 'EXPANSION'
]);

const REQUIRED_BOUNDARIES = Object.freeze([
  'No certification or legal advice.',
  'No fund custody or payment initiation.',
  'No customer data without consent.',
  'No production mutation.',
  'No model-judge-only acceptance decision.'
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function allZeroEffects(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) return false;
  const expected = Object.keys(ZERO_EXTERNAL_EFFECTS).sort();
  const actual = Object.keys(ledger).sort();
  return expected.length === actual.length
    && expected.every((key, index) => key === actual[index] && ledger[key] === 0);
}

export function scoreEventHorizonCandidate(candidate, weights) {
  if (!candidate || !weights || typeof weights !== 'object') return null;
  let raw = 0;
  let totalWeight = 0;
  for (const [dimension, weight] of Object.entries(weights)) {
    const rating = Number(candidate.ratings?.[dimension]);
    if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(rating) || rating < 0 || rating > 5) return null;
    raw += (rating / 5) * weight;
    totalWeight += weight;
  }
  if (totalWeight !== 100) return null;
  const multiplier = Number(candidate.evidenceMultiplier);
  if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 1) return null;
  return Math.round(raw * multiplier);
}

export function validateEventHorizon(record = {}) {
  const failures = [];
  if (record.schemaVersion !== EVENT_HORIZON_SCHEMA_VERSION) failures.push('invalid-schema-version');
  if (record.policyVersion !== EVENT_HORIZON_POLICY_VERSION) failures.push('invalid-policy-version');
  if (!/^[a-f0-9]{40}$/.test(String(record.sourceMainShaAtResearchStart || ''))) failures.push('invalid-source-main-sha');
  if (record.northStar !== 'risk-adjusted cleared contribution profit / founder minute') failures.push('invalid-north-star');

  const truth = record.commercialTruth || {};
  if (truth.realCustomers !== 0 || truth.clearedRevenueUsd !== 0 || truth.acceptedDeliveries !== 0 || truth.retainedCustomers !== 0) {
    failures.push('unsupported-commercial-outcome');
  }
  if (!allZeroEffects(record.externalEffectLedger)) failures.push('nonzero-external-effect');

  const sourceIds = new Set();
  for (const source of record.sourceLedger || []) {
    if (!source?.id || sourceIds.has(source.id)) failures.push('invalid-or-duplicate-source-id');
    else sourceIds.add(source.id);
    if (!/^https:\/\//.test(String(source?.url || '')) || !Array.isArray(source?.supports) || source.supports.length === 0) {
      failures.push('invalid-source-evidence');
    }
    // The host is a declared claim, checked against the URL that is supposed to
    // support it.
    //
    // Requiring only `https://` let a source keep its id, its type and its
    // supports list while its URL was repointed at an entirely different
    // domain -- the evidence ledger would still validate while citing somebody
    // else's page. Nothing in this repository can prove a page says what a
    // source claims, but a cross-domain repoint can be made a visible semantic
    // edit rather than a silent one.
    const declaredHost = String(source?.host || '').trim().toLowerCase();
    if (!declaredHost) failures.push('source-host-required');
    else {
      let actualHost = '';
      try { actualHost = new URL(String(source?.url || '')).host.toLowerCase(); } catch { actualHost = ''; }
      if (actualHost !== declaredHost) failures.push('source-url-host-mismatch');
    }
  }
  if (sourceIds.size < 5) failures.push('insufficient-source-ledger');

  const candidateIds = new Set();
  // Canonical opportunity identity is what stops one opportunity being counted
  // as two. Without this, the same canonicalOpportunityId could appear twice
  // under different candidate ids -- inflating the tournament and letting an
  // opportunity be its own strongest challenger.
  const canonicalOpportunityIds = new Set();
  let championCount = 0;
  let activeExperimentCount = 0;
  for (const candidate of record.tournament || []) {
    if (!candidate?.id || candidateIds.has(candidate.id)) failures.push('invalid-or-duplicate-candidate-id');
    else candidateIds.add(candidate.id);
    if (!candidate?.canonicalOpportunityId) failures.push('missing-canonical-opportunity-id');
    else if (!getCommercialOpportunity(candidate.canonicalOpportunityId)) failures.push('unknown-canonical-opportunity-id');
    else if (canonicalOpportunityIds.has(candidate.canonicalOpportunityId)) failures.push('duplicate-canonical-opportunity-mapping');
    else canonicalOpportunityIds.add(candidate.canonicalOpportunityId);
    if (!EVIDENCE_CLASSES.has(candidate?.evidenceClass)) failures.push('invalid-evidence-class');
    if (candidate.status === 'CURRENT_CHAMPION') championCount += 1;
    if (candidate.activeExperiment === true) activeExperimentCount += 1;
    const computed = scoreEventHorizonCandidate(candidate, record.scoring?.weights);
    if (computed == null || computed !== candidate.decisionScore) failures.push('decision-score-mismatch');
    if (!Array.isArray(candidate.killConditions) || candidate.killConditions.length < 2) failures.push('missing-kill-conditions');
  }
  if (candidateIds.size < 3) failures.push('insufficient-tournament');
  if (championCount !== 1) failures.push('exactly-one-champion-required');
  if (activeExperimentCount !== 1) failures.push('exactly-one-active-experiment-required');

  const champion = (record.tournament || []).find(candidate => candidate.status === 'CURRENT_CHAMPION');
  if (champion?.experimentState !== 'PREPARED_NOT_EXTERNALLY_ACTIVATED') failures.push('champion-state-must-preserve-external-truth');
  if (record.highestValueExperiment?.currentAuthority !== 'NONE') failures.push('experiment-authority-must-remain-none');

  const supportedIds = new Set([
    ...candidateIds,
    ...(record.economicGenes || []).map(gene => gene?.id).filter(Boolean),
    record.bestOriginalInvention?.id
  ].filter(Boolean));
  for (const source of record.sourceLedger || []) {
    if ((source.supports || []).some(id => !supportedIds.has(id))) failures.push('source-support-target-unknown');
  }

  const boundaries = new Set(record.claudeHandoff?.boundaries || []);
  for (const boundary of REQUIRED_BOUNDARIES) {
    if (!boundaries.has(boundary)) failures.push('claude-handoff-boundary-missing');
  }
  if (!Array.isArray(record.claudeHandoff?.reuse) || record.claudeHandoff.reuse.length < 3) failures.push('claude-handoff-reuse-missing');
  if (!Array.isArray(record.killedTheses) || record.killedTheses.length < 1) failures.push('killed-thesis-memory-missing');
  if (!Array.isArray(record.beliefUpdates) || record.beliefUpdates.length < 1) failures.push('belief-update-memory-missing');

  return {
    ok: failures.length === 0,
    health: failures.length === 0 ? 'EVENT_HORIZON_HEALTHY' : 'EVENT_HORIZON_INVALID',
    policyVersion: EVENT_HORIZON_POLICY_VERSION,
    schemaVersion: EVENT_HORIZON_SCHEMA_VERSION,
    candidateCount: candidateIds.size,
    sourceCount: sourceIds.size,
    championId: champion?.id || null,
    activeExperimentCount,
    failures: [...new Set(failures)],
    digest: digest(record),
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function summarizeEventHorizon(record = {}) {
  const validation = validateEventHorizon(record);
  if (!validation.ok) return validation;
  const champion = record.tournament.find(candidate => candidate.status === 'CURRENT_CHAMPION');
  const challenger = [...record.tournament]
    .filter(candidate => candidate.status !== 'CURRENT_CHAMPION')
    .sort((a, b) => b.decisionScore - a.decisionScore)[0];
  return {
    ...validation,
    version: record.schemaVersion,
    champion: { id: champion.id, canonicalOpportunityId: champion.canonicalOpportunityId, decisionScore: champion.decisionScore, state: champion.experimentState },
    strongestChallenger: { id: challenger.id, canonicalOpportunityId: challenger.canonicalOpportunityId, decisionScore: challenger.decisionScore, state: challenger.experimentState },
    bestOriginalInvention: record.bestOriginalInvention.name,
    highestValueExperiment: record.highestValueExperiment.id,
    nextCommercialMove: record.highestValueExperiment.offer,
    commercialTruth: { ...record.commercialTruth },
    businessEffectAuthority: 'NONE'
  };
}
