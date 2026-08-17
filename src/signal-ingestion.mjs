// Signal ingestion: normalization -> dedupe -> freshness -> audit receipt,
// over the canonical MarketSignal shape (src/market-signal.mjs). Reuses the
// existing auditLog writer (store.log) as the durable receipt/dedupe
// ledger -- no new collection, no new migration, matching the codebase's
// established "compose the existing kernel" discipline.
import { normalizeMarketSignal, isStaleSignal } from './market-signal.mjs';

export const SIGNAL_INGESTION_POLICY_VERSION = 'signal-ingestion-1.0.0';
const INGESTED_AUDIT_TYPE = 'market_signal_ingested';

// Cross-run dedupe reads recent ingestion receipts rather than requiring a
// new indexed column -- bounded by lookbackLimit so this stays cheap. A
// signal ingested outside that lookback window would be re-accepted as if
// new; callers with a high-volume signal stream should raise lookbackLimit
// accordingly. This tradeoff is explicit, not hidden.
async function knownDedupeKeys(store, lookbackLimit) {
  const recent = await store.list('auditLog', {
    filters: { type: INGESTED_AUDIT_TYPE }, orderBy: 'createdAt', direction: 'desc', limit: lookbackLimit
  });
  return new Set(recent.map(entry => entry.detail?.dedupeKey).filter(Boolean));
}

// Ingests a batch of raw signal candidates. Never throws on malformed
// input -- each item is independently normalized and malformed ones are
// collected in `rejected` rather than aborting the whole batch. Replay-safe:
// re-ingesting the exact same batch produces zero new `accepted` entries
// (everything lands in `duplicates`), proven by
// tests/signal-ingestion.test.mjs.
export async function ingestSignals({ store, signals = [], date = new Date(), lookbackLimit = 500, staleAfterMs } = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  if (!store || typeof store.log !== 'function' || typeof store.list !== 'function') {
    return { ok: false, reason: 'malformed-input-store', policyVersion: SIGNAL_INGESTION_POLICY_VERSION };
  }
  const known = await knownDedupeKeys(store, lookbackLimit);
  const seenThisBatch = new Set();
  const accepted = []; const duplicates = []; const rejected = []; const stale = [];

  for (const raw of Array.isArray(signals) ? signals : []) {
    const normalized = normalizeMarketSignal(raw, { date: referenceDate });
    if (!normalized.ok) { rejected.push(normalized); continue; }
    if (known.has(normalized.dedupeKey) || seenThisBatch.has(normalized.dedupeKey)) { duplicates.push(normalized); continue; }
    seenThisBatch.add(normalized.dedupeKey);
    await store.log(INGESTED_AUDIT_TYPE, {
      dedupeKey: normalized.dedupeKey, signalId: normalized.signalId, sourceAdapter: normalized.sourceAdapter,
      sourceKind: normalized.sourceKind, entityType: normalized.entityType, signalType: normalized.signalType,
      evidenceClass: normalized.evidenceClass, observedAt: normalized.observedAt
    });
    if (isStaleSignal(normalized, staleAfterMs != null ? { maxAgeMs: staleAfterMs } : {})) stale.push(normalized);
    accepted.push(normalized);
  }

  return {
    ok: true, policyVersion: SIGNAL_INGESTION_POLICY_VERSION, timestamp: referenceDate.toISOString(),
    accepted, duplicates, rejected, stale,
    counts: { accepted: accepted.length, duplicates: duplicates.length, rejected: rejected.length, stale: stale.length }
  };
}
