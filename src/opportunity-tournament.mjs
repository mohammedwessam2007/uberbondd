// Deterministic tournament over the one canonical opportunity registry.
//
// The registry is deliberately broad (438 records today), while the
// opportunity-registry scoring kernel is deliberately strict about missing
// evidence. This module composes those two existing pieces into one bounded
// ranking receipt. It never creates another opportunity store, calls a
// provider, sends, spends, deploys, or advances a promotion stage.
import crypto from 'node:crypto';
import {
  listCommercialOpportunityCatalog,
  listCanonicalOpportunityRegistry,
  validateOpportunityRegistry,
  buildOpportunityCandidate
} from './commercial-opportunity-catalog.mjs';
import {
  incrementalBuildDistance,
  rankOpportunities
} from './opportunity-registry.mjs';
import { existingCapabilityIds } from './capability-graph.mjs';

export const OPPORTUNITY_TOURNAMENT_POLICY_VERSION = 'opportunity-tournament-1.0.0';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// This is the minimum shared economic spine required to turn a catalog row
// into a bounded, reviewable experiment packet. These are capability ids (not
// display names) so build-distance is measured against the real graph.
export const TOURNAMENT_SHARED_CAPABILITIES = Object.freeze([
  'market-signal-registry',
  'opportunity-registry',
  'prometheus-economic-spine',
  'commercial-experiment-compiler',
  'distribution-channel-registry',
  'commercial-outcome-lineage',
  'commercial-learning-memory'
]);

const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function referenceDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function boundedLimit(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(numeric)));
}

function countsBy(rows, selector, fallback = 'UNRESOLVED') {
  return rows.reduce((counts, row) => {
    const value = selector(row) || fallback;
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function compactRecord(record, score, tournamentRank, buildDistance) {
  const truth = record.truthClassification?.value || {};
  return {
    tournamentRank,
    opportunityId: record.opportunityId,
    mechanismName: record.mechanismName?.value || record.opportunityId,
    category: record.category,
    compositeScore: score.compositeScore,
    confidence: score.confidence,
    dataSufficiency: score.dataSufficiency,
    missingCriteria: score.missingCriteria,
    evidenceTier: record.evidenceTier?.value || 'UNRESOLVED',
    evidenceClass: truth.evidence || 'UNRESOLVED',
    commercialTruth: truth.commercial || 'UNRESOLVED',
    implementationDistance: buildDistance.distance,
    reusedCapabilities: buildDistance.reused,
    missingCapabilities: buildDistance.missing,
    currentStatus: record.currentStatus?.value || 'UNRESOLVED',
    promotionStage: score.promotionStage
  };
}

// Ranks every canonical row, then returns only a bounded top slice. The
// complete scored count remains visible so a caller cannot mistake the slice
// for a partial registry.
export function rankCanonicalOpportunities({
  date = new Date(),
  limit = DEFAULT_LIMIT,
  existingCapabilities = existingCapabilityIds(),
  requiredCapabilities = TOURNAMENT_SHARED_CAPABILITIES
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const bounded = boundedLimit(limit);
  const registry = listCanonicalOpportunityRegistry();
  const validation = validateOpportunityRegistry();
  const catalog = listCommercialOpportunityCatalog();
  const recordById = new Map(registry.map(record => [record.opportunityId, record]));
  const candidates = catalog
    .map(entry => buildOpportunityCandidate(entry.id))
    .filter(Boolean);
  const scored = rankOpportunities(candidates, { date: at });
  const rows = scored.map((score, index) => {
    const record = recordById.get(score.id);
    const buildDistance = incrementalBuildDistance(requiredCapabilities, existingCapabilities);
    return compactRecord(record, score, index + 1, buildDistance);
  });
  const top = rows.slice(0, bounded);
  const tournamentId = digest({
    policyVersion: OPPORTUNITY_TOURNAMENT_POLICY_VERSION,
    timestamp,
    opportunityIds: rows.map(row => row.opportunityId),
    requiredCapabilities: [...requiredCapabilities],
    existingCapabilities: [...existingCapabilities]
  });

  return {
    ok: validation.ok && rows.length === registry.length,
    policyVersion: OPPORTUNITY_TOURNAMENT_POLICY_VERSION,
    status: validation.ok && rows.length === registry.length ? 'TOURNAMENT_COMPLETE' : 'REVIEW_REQUIRED',
    tournamentId,
    timestamp,
    registryCount: registry.length,
    validatedRegistry: validation,
    scoredCount: rows.length,
    returnedCount: top.length,
    limit: bounded,
    top,
    dataSufficiencyCounts: countsBy(rows, row => row.dataSufficiency),
    evidenceClassCounts: countsBy(rows, row => row.evidenceClass),
    categoryCounts: countsBy(rows, row => row.category),
    buildDistance: incrementalBuildDistance(requiredCapabilities, existingCapabilities),
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

// Compact append-only receipt over the existing auditLog writer. The full
// ranked list is reproducible from the tournament id and is intentionally not
// copied into the durable receipt.
export async function logOpportunityTournament(store, result) {
  if (!store || typeof store.log !== 'function' || !result?.ok) return null;
  return store.log('commercial_opportunity_tournament', {
    policyVersion: result.policyVersion,
    status: result.status,
    tournamentId: result.tournamentId,
    timestamp: result.timestamp,
    registryCount: result.registryCount,
    scoredCount: result.scoredCount,
    returnedCount: result.returnedCount,
    limit: result.limit,
    top: result.top,
    dataSufficiencyCounts: result.dataSufficiencyCounts,
    evidenceClassCounts: result.evidenceClassCounts,
    categoryCounts: result.categoryCounts,
    buildDistance: result.buildDistance,
    externalEffectLedger: result.externalEffectLedger
  });
}

export const OPPORTUNITY_TOURNAMENT_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
