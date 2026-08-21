// Bounded durable reconciliation across the canonical commercial evidence
// spine: MarketSignal registry -> BusinessGenome candidate -> opportunity
// tournament. This composes existing kernels and auditLog writers only. It is
// deliberately dry-run by default and has no provider, outbound, payment,
// deployment, or promotion authority.
import crypto from 'node:crypto';
import { ingestMarketSignals } from './market-signal-registry.mjs';
import { extractGenomeCandidate, logGenomeExtraction } from './genome-extraction.mjs';
import { rankCanonicalOpportunities, logOpportunityTournament } from './opportunity-tournament.mjs';

export const COMMERCIAL_RECONCILIATION_POLICY_VERSION = 'commercial-reconciliation-1.0.0';

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

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function compactIngestion(result) {
  return {
    ok: Boolean(result?.ok),
    dryRun: Boolean(result?.dryRun),
    inputCount: result?.inputCount ?? 0,
    processedCount: result?.processedCount ?? 0,
    acceptedCount: Array.isArray(result?.accepted) ? result.accepted.length : 0,
    acceptedSignalIds: Array.isArray(result?.accepted) ? result.accepted.map(signal => signal.signalId).filter(Boolean) : [],
    duplicateCount: Array.isArray(result?.duplicates) ? result.duplicates.length : 0,
    rejectedCount: Array.isArray(result?.rejected) ? result.rejected.length : 0,
    contradictionCount: result?.contradictionCount ?? 0,
    localAuditWrites: result?.localAuditWrites ?? 0,
    reason: result?.reason || null
  };
}

function compactGenome(result) {
  return {
    ok: Boolean(result?.ok),
    candidateId: result?.candidate?.id || null,
    evidenceRefs: Array.isArray(result?.candidate?.evidenceRefs) ? [...result.candidate.evidenceRefs] : [],
    signalSourceEvidenceClass: result?.candidate?.signalSourceEvidenceClass || null,
    populatedFieldNames: result?.candidate ? Object.keys(result.candidate).sort() : [],
    reason: result?.reason || null
  };
}

function compactTournament(result) {
  return {
    ok: Boolean(result?.ok),
    tournamentId: result?.tournamentId || null,
    registryCount: result?.registryCount ?? 0,
    scoredCount: result?.scoredCount ?? 0,
    returnedCount: result?.returnedCount ?? 0,
    topOpportunityIds: Array.isArray(result?.top) ? result.top.map(row => row.opportunityId).filter(Boolean) : [],
    status: result?.status || null
  };
}

// Runs one bounded reconciliation. `persist` is explicit: when false, all
// stages remain in memory and no audit receipt is written; when true, the
// existing auditLog receives the signal, genome, tournament, and reconciliation
// receipts in that order. Raw input signals never appear in any receipt.
export async function reconcileCommercialEvidence({
  store = null,
  signals = [],
  candidate = {},
  date = new Date(),
  persist = false,
  tournamentLimit = 15,
  existingCapabilities,
  requiredCapabilities
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const candidateInput = candidate && typeof candidate === 'object' ? candidate : {};
  const ingestion = await ingestMarketSignals({
    store,
    signals,
    date: at,
    persist: Boolean(persist)
  });
  const accepted = Array.isArray(ingestion.accepted) ? ingestion.accepted : [];
  const genome = extractGenomeCandidate({
    signals: accepted,
    id: candidateInput.id,
    name: candidateInput.name,
    category: candidateInput.category,
    priceHint: candidateInput.priceHint
  });
  const tournament = rankCanonicalOpportunities({
    date: at,
    limit: tournamentLimit,
    existingCapabilities,
    requiredCapabilities
  });

  const reasonCodes = unique([
    ingestion.ok ? null : ingestion.reason,
    genome.ok ? null : genome.reason,
    tournament.ok ? null : 'opportunity-tournament-incomplete'
  ]);
  const result = {
    ok: Boolean(ingestion.ok && genome.ok && tournament.ok),
    policyVersion: COMMERCIAL_RECONCILIATION_POLICY_VERSION,
    status: ingestion.ok && genome.ok && tournament.ok ? 'RECONCILED' : 'REVIEW_REQUIRED',
    timestamp,
    persist: Boolean(persist),
    reconciliationId: digest({
      policyVersion: COMMERCIAL_RECONCILIATION_POLICY_VERSION,
      timestamp,
      acceptedSignalIds: accepted.map(signal => signal.signalId),
      candidateId: candidateInput.id || null,
      tournamentId: tournament.tournamentId || null
    }),
    reasonCodes,
    ingestion: compactIngestion(ingestion),
    genome: compactGenome(genome),
    tournament: compactTournament(tournament),
    localAuditWrites: ingestion.localAuditWrites || 0,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };

  if (persist && genome.ok) {
    await logGenomeExtraction(store, genome);
    result.localAuditWrites += 1;
  }
  if (persist && tournament.ok) {
    await logOpportunityTournament(store, tournament);
    result.localAuditWrites += 1;
  }
  if (persist && store && typeof store.log === 'function') {
    await logCommercialReconciliation(store, result);
    result.localAuditWrites += 1;
  }

  return result;
}

// Compact receipt over the same auditLog used by every upstream stage. It
// stores lineage IDs and counts, never raw signals, payloads, credentials, or
// provider responses.
export async function logCommercialReconciliation(store, result) {
  if (!store || typeof store.log !== 'function' || !result?.reconciliationId) return null;
  return store.log('commercial_evidence_reconciliation', {
    policyVersion: result.policyVersion,
    status: result.status,
    timestamp: result.timestamp,
    reconciliationId: result.reconciliationId,
    persist: result.persist,
    reasonCodes: result.reasonCodes,
    acceptedSignalIds: result.ingestion?.acceptedSignalIds || [],
    candidateId: result.genome?.candidateId || null,
    tournamentId: result.tournament?.tournamentId || null,
    registryCount: result.tournament?.registryCount ?? 0,
    scoredCount: result.tournament?.scoredCount ?? 0,
    topOpportunityIds: result.tournament?.topOpportunityIds || [],
    externalEffectLedger: result.externalEffectLedger || { ...ZERO_EXTERNAL_EFFECTS }
  });
}

export const COMMERCIAL_RECONCILIATION_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
