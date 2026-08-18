// Converts ingested MarketSignals into a Business Genome candidate
// (src/opportunity-registry.mjs's compileBusinessGenome/scoreOpportunity
// input shape). Deliberately narrow: only fields a signal can actually and
// honestly speak to are populated; everything else is left absent
// (UNRESOLVED) rather than guessed. This is the real seam between the
// signal layer and the opportunity layer -- see
// docs/PROMETHEUS_ARCHITECTURE.md for why this composition wasn't wired
// until the capability/build-distance layer existed to make sense of it.
export const GENOME_EXTRACTION_POLICY_VERSION = 'genome-extraction-1.0.0';

// Accepts a signal from either surviving ingestion shape (see
// docs/PROMETHEUS_PARALLEL_SPINE_RECONCILIATION.md -- Pair 1): a raw
// normalizeMarketSignal() record (`.ok === true`, market-signal.mjs), or a
// market-signal-registry.mjs accepted-batch entry, which carries `status`
// ('ACCEPTED'/'ACCEPTED_STALE') instead of `.ok`.
function isAcceptedSignal(s) {
  return Boolean(s) && (s.ok === true || s.status === 'ACCEPTED' || s.status === 'ACCEPTED_STALE');
}

function priceFromSignals(signals) {
  const priceSignal = signals.find(s => s.signalType === 'PRICE_CHANGE' && isAcceptedSignal(s));
  if (!priceSignal) return null;
  // The raw payload isn't retained on a normalized MarketSignal (only its
  // digest is, by design -- see market-signal.mjs) so a real extractor
  // reads `payload` from the caller-supplied raw candidate, not the
  // normalized record. This function accepts the raw price value directly
  // for that reason; see extractGenomeCandidate's `priceHint` parameter.
  return priceSignal;
}

// `signals` must be already-normalized (ok:true) MarketSignal records,
// typically the `accepted` array from ingestSignals(). `priceHint`, if
// supplied, is a caller-observed numeric price tied to one of the signals
// (kept as an explicit separate argument rather than reaching back into
// raw payloads this module was never given, to avoid silently trusting
// unvalidated data).
export function extractGenomeCandidate({ signals = [], id, name, category = 'UNCATEGORIZED', priceHint } = {}) {
  if (!id) return { ok: false, reason: 'malformed-input-missing-id', policyVersion: GENOME_EXTRACTION_POLICY_VERSION };
  const okSignals = signals.filter(isAcceptedSignal);
  if (!okSignals.length) return { ok: false, reason: 'no-usable-signals', policyVersion: GENOME_EXTRACTION_POLICY_VERSION };

  const evidenceRefs = okSignals.map(s => s.signalId);
  // The candidate's own evidence tier is the WEAKEST tier among its
  // constituent signals, never the strongest -- a genome built from one
  // VERIFIED_FACT signal and one HYPOTHESIS signal is only as trustworthy
  // as its weakest link.
  const tierOrder = ['SYNTHETIC_TEST_FIXTURE', 'UNRESOLVED', 'HYPOTHESIS', 'ESTIMATE', 'INFERENCE', 'CREATOR_CLAIM', 'OPERATOR_CLAIM', 'BUYER_SIGNAL', 'COMPANY_CLAIM', 'VERIFIED_FACT'];
  const weakestClaimType = okSignals
    .map(s => s.evidenceClass)
    .reduce((weakest, current) => (tierOrder.indexOf(current) < tierOrder.indexOf(weakest) ? current : weakest), 'VERIFIED_FACT');

  const candidate = { id, name: name || id, category, evidenceRefs, signalSourceEvidenceClass: weakestClaimType };

  const priceSignal = priceFromSignals(okSignals);
  if (priceSignal && Number.isFinite(Number(priceHint))) {
    candidate.price = { value: Number(priceHint), claimType: priceSignal.evidenceClass };
  }

  return { ok: true, policyVersion: GENOME_EXTRACTION_POLICY_VERSION, candidate };
}
