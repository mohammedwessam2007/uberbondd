// Canon/V3 integration -- mission items 3 ("research seed rules") and 4 ("opportunity hunter").
//
// Adapted from V3's opportunity-factory.mjs, rejecting its in-memory/boolean-trusting parts per
// the premerge audit's merge doctrine ("map V3 concepts into existing collections... fail closed on
// missing providers or evidence"). Every signal this module produces still has to pass through
// commercial-intelligence-import.mjs's validation/scoring/policy pipeline before it becomes a real
// opportunity row -- this module's job is only to go from "an external signal" to "a candidate
// record shaped like that pipeline's schema," never to write to the store itself.
//
// KNOWN LIMITATION (disclosed, not hidden): this sandbox has no live network credentials for
// hiring boards, procurement portals, marketplaces, or partner/vendor directories. Every adapter
// below defaults to `disabledAdapter`, which returns zero signals and reports itself as
// not-configured rather than fabricating data. A real deployment supplies its own adapter
// functions (e.g. backed by the existing src/browser-crawler.mjs or a paid data API) via
// `createOpportunityAdapters({ officialReleases: async ({ now }) => [...], ... })`.
import { assessEvidenceIndependence } from './evidence-independence.mjs';

export const OPPORTUNITY_ADAPTER_KINDS = Object.freeze([
  'officialReleases', 'publicHiring', 'procurementRfp', 'marketplaces', 'partnerVendorFreelancer', 'launchesMigrations'
]);

async function disabledAdapter() { return []; }
disabledAdapter.isDisabledCanonAdapter = true;

/** Builds the full adapter map; any kind not supplied falls back to disabledAdapter (fails closed
 * -- zero signals -- rather than silently reusing another kind's logic or fabricating data). The
 * fallback is itself a real function (not undefined) so callers can always invoke `adapters[kind]`
 * safely; huntOpportunitySignals below distinguishes it from a real adapter via the marker
 * property, not via `typeof`. */
export function createOpportunityAdapters(overrides = {}) {
  return Object.fromEntries(OPPORTUNITY_ADAPTER_KINDS.map(kind => [kind, typeof overrides[kind] === 'function' ? overrides[kind] : disabledAdapter]));
}

/** Runs every configured adapter, tagging each returned signal with which adapter produced it and
 * collecting (not throwing on) adapter errors or missing configuration, so one broken/unconfigured
 * adapter never blocks the others. */
export async function huntOpportunitySignals({ adapters, now = new Date() } = {}) {
  const signals = [];
  const blocked = [];
  for (const kind of OPPORTUNITY_ADAPTER_KINDS) {
    const fn = adapters?.[kind];
    if (typeof fn !== 'function' || fn.isDisabledCanonAdapter) { blocked.push({ kind, reason: 'adapter-not-configured' }); continue; }
    try {
      const found = await fn({ now });
      for (const signal of found || []) signals.push({ ...signal, adapterKind: kind });
    } catch (error) {
      blocked.push({ kind, reason: 'adapter-error', detail: String(error?.message || error) });
    }
  }
  return { signals, blocked };
}

/**
 * Converts one already-extracted commercial-reasoning object into the exact record shape
 * commercial-intelligence-import.mjs#validateCommercialIntelligenceRecord requires. The
 * commercial-reasoning fields themselves (buyer, painful workflow, bounded pilot, price, etc.) are
 * expected to already be present on `extracted` -- an LLM may have produced them (mission item 4:
 * "Use LLM APIs only for extraction and bounded commercial reasoning"), but every field this
 * function itself sets (ids, dedupe keys, dates, currency normalization) is pure arithmetic on
 * `extracted`'s own values, never a model call.
 */
export function buildCommercialIntelligenceRecord(extracted = {}) {
  const organizationDomain = String(extracted.organizationDomain || '').trim().toLowerCase();
  const serviceLane = String(extracted.serviceLane || '').trim().toLowerCase();
  const sourceUrl = String(extracted.sourceUrl || '').trim();
  const signalKey = String(extracted.signalKey || extracted.adapterKind || '').trim();
  return {
    id: extracted.id || `signal_${organizationDomain}_${serviceLane}`,
    record_type: 'opportunity',
    organization: extracted.organization || '',
    organization_domain: organizationDomain,
    geography: extracted.geography || 'global',
    source: {
      url: sourceUrl, type: extracted.sourceType || 'official-company',
      captured_at: extracted.capturedAt || new Date().toISOString(),
      expires_at: extracted.sourceExpiresAt || null,
      official: extracted.official === true, confidence: Number(extracted.confidence ?? 0.5),
      excerpt: extracted.excerpt || ''
    },
    contact: extracted.contact || null,
    service_lane: serviceLane,
    buyer_signal: extracted.buyerSignal || '',
    expected_value_cents: Math.round(Number(extracted.expectedValueCents || 0)),
    currency: String(extracted.currency || 'USD').toUpperCase(),
    owner_minutes: Math.round(Number(extracted.ownerMinutes || 0)),
    delivery_hours: Number(extracted.deliveryHours || 0),
    expires_at: extracted.expiresAt || new Date(Date.now() + 30 * 86400000).toISOString(),
    risks: Array.isArray(extracted.risks) ? extracted.risks : [],
    kill_condition: extracted.killCondition || 'evidence expires without revalidation',
    recurring_potential: extracted.recurringPotential,
    idempotency_inputs: { organization_domain: organizationDomain, service_lane: serviceLane, source_url: sourceUrl, signal_key: signalKey }
  };
}

/** Mission item 3 (research seed rules): a research_seed opportunity may advance toward
 * experiment eligibility only once it has at least `minimumIndependentEvidence` materially
 * independent evidence identities (evidence-independence.mjs -- source-family based, not a raw
 * count) AND at least one current, unexpired, live-validated buyer signal. */
export function assessActivation({ evidence = [], buyerSignals = [], opportunityExpiresAt = null } = {}, { now = new Date(), minimumIndependentEvidence = 3 } = {}) {
  const independence = assessEvidenceIndependence(evidence, { minimumIndependentFamilies: minimumIndependentEvidence });
  const blockers = [];
  if (!independence.materiallyIndependent) blockers.push('insufficient-independent-evidence');
  const liveSignals = (buyerSignals || []).filter(row => row.liveValidated === true && (!row.expiresAt || new Date(row.expiresAt) > now));
  if (liveSignals.length < 1) blockers.push('missing-live-buyer-signal');
  if (opportunityExpiresAt && new Date(opportunityExpiresAt) <= now) blockers.push('opportunity-expired');
  return {
    eligible: blockers.length === 0, blockers,
    independentEvidenceCount: independence.independentFamilyCount, liveBuyerSignalCount: liveSignals.length
  };
}
