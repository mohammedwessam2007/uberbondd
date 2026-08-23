// Bounded MarketSignal ingestion over the existing audit log.
// This is an ingestion contract, not a scraper. Adapters must supply raw
// candidates; unconfigured adapters therefore produce zero signals.
import {
  normalizeMarketSignal,
  isStaleSignal,
  MARKET_SIGNAL_SCHEMA_VERSION
} from './market-signal.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MARKET_SIGNAL_REGISTRY_POLICY_VERSION = 'market-signal-registry-1.0.0';
const DEFAULT_MAX_BATCH = 100;
const DEFAULT_AUDIT_LIMIT = 500;
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;


function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function numericOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function sameObservation(a, b) {
  return Boolean(
    a &&
    b &&
    a.sourceKind === b.sourceKind &&
    a.entityType === b.entityType &&
    a.entityIdentity === b.entityIdentity &&
    a.signalType === b.signalType &&
    a.observedAt === b.observedAt
  );
}

function compactSignal(signal, { stale, contradictsExisting, persisted }) {
  return {
    schemaVersion: MARKET_SIGNAL_SCHEMA_VERSION,
    signalId: signal.signalId,
    dedupeKey: signal.dedupeKey,
    sourceAdapter: signal.sourceAdapter,
    sourceKind: signal.sourceKind,
    entityType: signal.entityType,
    entityIdentity: signal.entityIdentity,
    signalType: signal.signalType,
    observedAt: signal.observedAt,
    evidenceClass: signal.evidenceClass,
    provenance: signal.provenance,
    sourceUrl: signal.sourceUrl,
    verificationState: signal.verificationState,
    confidence: signal.confidence,
    freshnessMs: signal.freshnessMs,
    stale,
    contradictsExisting,
    persisted
  };
}

function baseResult({ timestamp, dryRun, inputCount, processedCount, truncated }) {
  return {
    ok: true,
    policyVersion: MARKET_SIGNAL_REGISTRY_POLICY_VERSION,
    timestamp,
    dryRun,
    inputCount,
    processedCount,
    truncated,
    accepted: [],
    duplicates: [],
    rejected: [],
    contradictionCount: 0,
    localAuditWrites: 0,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

async function priorSignalEntries(store, auditLimit) {
  if (!store || typeof store.list !== 'function') return [];
  const entries = await store.list('auditLog', {
    orderBy: 'createdAt',
    direction: 'desc',
    limit: auditLimit
  });
  return (Array.isArray(entries) ? entries : [])
    .filter(entry => entry?.type === 'market_signal_ingest' && entry.detail?.dedupeKey)
    .map(entry => entry.detail);
}

// Ingests a bounded batch supplied by an adapter or test fixture. It never
// performs network I/O and never promotes evidence classifications.
export async function ingestMarketSignals({
  store = null,
  signals = [],
  date = new Date(),
  maxBatch = DEFAULT_MAX_BATCH,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  auditLimit = DEFAULT_AUDIT_LIMIT,
  persist = false
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const rawSignals = Array.isArray(signals) ? signals : [];
  const batchSize = Math.max(1, Math.min(1000, Math.floor(numericOr(maxBatch, DEFAULT_MAX_BATCH))));
  const batch = rawSignals.slice(0, batchSize);
  const truncated = rawSignals.length > batch.length;
  const result = baseResult({
    timestamp,
    dryRun: !persist,
    inputCount: rawSignals.length,
    processedCount: batch.length,
    truncated
  });

  if (persist && (!store || typeof store.log !== 'function')) {
    return {
      ...result,
      ok: false,
      reason: 'store-log-required-for-persistence'
    };
  }

  const prior = persist ? await priorSignalEntries(store, Math.max(0, Math.floor(numericOr(auditLimit, DEFAULT_AUDIT_LIMIT)))) : [];
  const knownByDedupeKey = new Map(prior.map(entry => [entry.dedupeKey, entry]));
  const knownSignals = [...prior];
  const ageLimit = Math.max(0, numericOr(maxAgeMs, DEFAULT_MAX_AGE_MS));

  for (const raw of batch) {
    const normalized = normalizeMarketSignal(raw, { date: at });
    if (!normalized.ok) {
      result.rejected.push({
        status: 'REJECTED',
        reason: normalized.reason,
        schemaVersion: normalized.schemaVersion
      });
      continue;
    }

    if (knownByDedupeKey.has(normalized.dedupeKey)) {
      result.duplicates.push({
        status: 'DUPLICATE',
        signalId: normalized.signalId,
        dedupeKey: normalized.dedupeKey
      });
      continue;
    }

    const stale = Boolean(isStaleSignal(normalized, { maxAgeMs: ageLimit }));
    const contradictsExisting = knownSignals.some(entry =>
      sameObservation(normalized, entry) && entry.payloadDigest !== normalized.payloadDigest
    );

    const record = compactSignal(normalized, {
      stale,
      contradictsExisting,
      persisted: Boolean(persist)
    });
    record.payloadDigest = normalized.payloadDigest;
    record.registryPolicyVersion = MARKET_SIGNAL_REGISTRY_POLICY_VERSION;

    if (persist) {
      try {
        await store.log('market_signal_ingest', record);
      } catch {
        return {
          ...result,
          ok: false,
          reason: 'audit-write-failed',
          accepted: result.accepted,
          duplicates: result.duplicates,
          rejected: result.rejected
        };
      }
      result.localAuditWrites += 1;
    }

    result.accepted.push({
      ...record,
      status: stale ? 'ACCEPTED_STALE' : 'ACCEPTED'
    });
    if (contradictsExisting) result.contradictionCount += 1;
    knownByDedupeKey.set(normalized.dedupeKey, record);
    knownSignals.push(record);
  }

  return result;
}

export const MARKET_SIGNAL_REGISTRY_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
