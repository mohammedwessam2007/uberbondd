// Canon/V3 integration -- mission item 3 ("research seed rules").
//
// Adapted from V3's opportunity-factory.mjs (validateResearchPackage/importResearchSeeds).
// "Research data must never enter a send queue directly" is satisfied structurally here, not by a
// flag: this module has no store dependency and no write path at all. It only validates the static
// research-seed corpus (data/canon/research-seed/UBERBOND_IMPORT.json, loaded via
// canon-registries.mjs with hash verification) and answers "which of its opportunities currently
// have enough independent evidence + a live buyer signal to be worth someone grounding in a real
// company." A research-seed opportunity becomes a real, sendable one only by going through the
// existing commercial-intelligence-import.mjs pipeline against an ACTUAL company's ACTUAL evidence
// -- this module cannot promote anything into that pipeline itself.
import { assessActivation } from './opportunity-hunter.mjs';
import { loadResearchSeedCorpus } from './canon-registries.mjs';

/** Validates the research package's internal referential integrity: every opportunity's
 * `source_ids` must resolve to a real entry in `sources`. Mirrors V3's validateResearchPackage. */
export function validateResearchPackage(payload = {}) {
  for (const key of ['opportunities', 'buyer_signals', 'prospects', 'sources']) {
    if (!Array.isArray(payload[key])) throw new Error(`research-package-${key}-invalid`);
  }
  const sourceIds = new Set(payload.sources.map(row => String(row.source_id || '')));
  if (sourceIds.has('')) throw new Error('research-source-id-missing');
  const missing = [];
  for (const row of payload.opportunities) {
    for (const sourceId of String(row.source_ids || '').split(/[;,]/).map(x => x.trim()).filter(Boolean)) {
      if (!sourceIds.has(sourceId)) missing.push(`${row.opportunity_id}:${sourceId}`);
    }
  }
  if (missing.length) throw new Error(`research-source-reference-missing:${missing.slice(0, 10).join(',')}`);
  return { opportunities: payload.opportunities.length, buyerSignals: payload.buyer_signals.length, prospects: payload.prospects.length, sources: payload.sources.length };
}

function opportunitySourceIds(opportunity) {
  return new Set(String(opportunity.source_ids || '').split(/[;,]/).map(x => x.trim()).filter(Boolean));
}

function evidenceFamiliesFor(opportunity, sources) {
  const sourceIds = opportunitySourceIds(opportunity);
  return sources
    .filter(source => sourceIds.has(String(source.source_id || '')))
    .map(source => ({ sourceFamily: source.publisher || source.url || source.source_id, claimOrigin: source.url || source.source_id }));
}

/** The corpus links buyer_signals to sources (each signal's own `source_id`), not directly to
 * opportunities -- a signal counts as belonging to an opportunity when it shares one of that
 * opportunity's referenced sources. A signal is treated as "live validated" for
 * assessActivation's purposes when it carries a confidence rating at all and (if it declares an
 * expiry) has not yet expired; this corpus has no explicit boolean, so absence of a confidence
 * rating or a past expiry both fail closed (not live). */
function liveSignalsFor(opportunity, buyerSignals, now) {
  const sourceIds = opportunitySourceIds(opportunity);
  return buyerSignals
    .filter(signal => sourceIds.has(String(signal.source_id || '')))
    .map(signal => {
      const expiresAt = signal.expiry_date ? `${signal.expiry_date}T23:59:59.999Z` : null;
      const notExpired = !expiresAt || new Date(expiresAt) > now;
      return { ...signal, liveValidated: Boolean(signal.confidence) && notExpired, expiresAt };
    });
}

/**
 * Loads the static research-seed corpus (fails loudly if it fails validation or its hash has
 * drifted -- canon-registries.mjs) and returns every opportunity annotated with its activation
 * assessment. Nothing here is persisted; this is a read-only report for a human/owner deciding
 * what to ground in real per-company evidence next.
 */
export function listResearchSeedActivationStatus({ now = new Date(), minimumIndependentEvidence = 3 } = {}) {
  const corpus = loadResearchSeedCorpus();
  validateResearchPackage(corpus);
  return corpus.opportunities.map(opportunity => {
    const evidence = evidenceFamiliesFor(opportunity, corpus.sources);
    const buyerSignals = liveSignalsFor(opportunity, corpus.buyer_signals, now);
    const assessment = assessActivation(
      { evidence, buyerSignals, opportunityExpiresAt: opportunity.expiry_date ? `${opportunity.expiry_date}T23:59:59.999Z` : null },
      { now, minimumIndependentEvidence }
    );
    return {
      opportunityId: opportunity.opportunity_id, opportunityName: opportunity.opportunity_name,
      category: opportunity.category, totalScore: opportunity.total_score, ...assessment
    };
  });
}
