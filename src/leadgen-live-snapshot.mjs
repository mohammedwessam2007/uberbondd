import { buildLeadGenerationWorkspace, buildLeadHandoffPlan } from './lead-generation.mjs';

export const LIVE_LEAD_GENERATION_VERSION = 'uberbond.lead-generation-live.v1';

async function loadDurableLeadSources(store) {
  if (!store || typeof store.list !== 'function') throw new TypeError('A durable store is required');
  const [prospects, suppressions, leadLists, leadSearches, leadSignals, leadEnrichmentRuns] = await Promise.all([
    store.list('prospects'),
    store.list('suppressions'),
    store.list('leadLists'),
    store.list('leadSearches'),
    store.list('leadSignals'),
    store.list('leadEnrichmentRuns')
  ]);
  return {
    prospects: Array.isArray(prospects) ? prospects : [],
    suppressions: Array.isArray(suppressions) ? suppressions : [],
    leadLists: Array.isArray(leadLists) ? leadLists : [],
    searches: Array.isArray(leadSearches) ? leadSearches : [],
    signals: Array.isArray(leadSignals) ? leadSignals : [],
    enrichmentRuns: Array.isArray(leadEnrichmentRuns) ? leadEnrichmentRuns : []
  };
}

export async function buildLiveLeadGenerationSnapshot({ store, now = new Date() } = {}) {
  const sources = await loadDurableLeadSources(store);
  const workspace = buildLeadGenerationWorkspace({ ...sources, now });
  return {
    ...workspace,
    liveVersion: LIVE_LEAD_GENERATION_VERSION,
    liveSource: 'durable-prospects',
    sourceAuthority: 'owner-supplied, first-party, licensed, or explicitly imported records only',
    runtime: {
      persisted: true,
      prospectRecords: sources.prospects.length,
      suppressionRecords: sources.suppressions.length,
      savedSearches: sources.searches.length,
      sourceSignals: sources.signals.length,
      enrichmentRuns: sources.enrichmentRuns.length,
      providerCalls: 0,
      externalEffects: 0
    },
    handoff: {
      available: true,
      route: '/api/leadgen/handoff',
      mutatesRecords: false,
      requiresRecipientEvidence: true,
      requiresSenderEvidence: true
    }
  };
}

export async function buildLiveLeadHandoff({ store, campaign = null, query = {}, now = new Date() } = {}) {
  const sources = await loadDurableLeadSources(store);
  return {
    ...buildLeadHandoffPlan({ ...sources, campaign, query, now }),
    liveVersion: LIVE_LEAD_GENERATION_VERSION,
    liveSource: 'durable-prospects',
    mutatesRecords: false,
    requiresCertification: true
  };
}
