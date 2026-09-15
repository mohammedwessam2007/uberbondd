import crypto from 'node:crypto';
import {
  searchLocalLeadCorpus,
  buildLeadAccountIntelligence,
  buildEnrichmentPlan
} from './lead-generation.mjs';
import {
  prepareUberLaunchDiscovery,
  compileUberLaunchManifest
} from './uberlaunch-one-button.mjs';

export const UBERLEAD_LAUNCH_FUSION_VERSION = 'uberbond.uberlead-launch-fusion.v1';

const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function prospectId(prospect = {}) {
  return `ublead_${sha256(JSON.stringify({
    company: clean(prospect.company, 180).toLowerCase(),
    website: clean(prospect.website, 1000).toLowerCase(),
    sourceUrl: clean(prospect.sourceUrl, 1000),
    sourceRecordId: clean(prospect.sourceRecordId, 240)
  })).slice(0, 24)}`;
}

export function compilePublicDiscoveryLeadCorpus({ discovery = {}, now = new Date() } = {}) {
  const observedAt = new Date(now).toISOString();
  const prospects = (Array.isArray(discovery?.prospects) ? discovery.prospects : []).map(prospect => ({
    id: prospectId(prospect),
    company: clean(prospect.company, 180),
    website: clean(prospect.website, 1000),
    domain: clean(prospect.domain, 320),
    niche: clean(prospect.niche, 160),
    country: clean(prospect.country, 80),
    city: clean(prospect.city, 80),
    source: 'public_website',
    sourceType: 'public_website',
    sourceUrl: clean(prospect.sourceUrl, 1000),
    sourceLicense: clean(prospect.sourceLicense, 240),
    notes: clean(prospect.notes || 'Exact public business record with a public website.', 1000),
    issue: {
      title: 'Public business evidence',
      evidenceUrl: clean(prospect.sourceUrl || prospect.website, 1000),
      evidenceExcerpt: clean(prospect.notes || `${prospect.company || 'Business'} has a public website in the discovery source.`, 1000),
      observedAt
    },
    contact: null,
    tags: ['public-business-discovery'],
    status: 'discovered'
  }));

  return {
    version: UBERLEAD_LAUNCH_FUSION_VERSION,
    prospects,
    sourceClass: discovery?.sourceClass || 'PUBLIC_BUSINESS_DATA',
    provider: discovery?.provider || null,
    evidenceRef: discovery?.evidenceRef || null,
    privateDataInference: false,
    protectedSource: Boolean(discovery?.protectedSource),
    captchaBypass: Boolean(discovery?.captchaBypass),
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'This corpus contains only public business/account evidence already returned by the allowed discovery adapter. It deliberately creates no private contact route and grants no outreach authority.'
  };
}

export function compileApolloStyleLeadLayer({
  corpus,
  leadQuery = {},
  suppressions = [],
  signals = [],
  limit = 100,
  now = new Date()
} = {}) {
  const prospects = Array.isArray(corpus?.prospects) ? corpus.prospects : [];
  const discoveryQuery = {
    ...leadQuery,
    requireContact: false,
    requireEvidence: leadQuery.requireEvidence !== false,
    minEvidenceScore: leadQuery.minEvidenceScore ?? 1,
    minScore: leadQuery.minScore ?? 0,
    skipOwned: leadQuery.skipOwned !== false,
    limit: Math.max(1, Math.min(250, Number(limit) || 100))
  };
  const search = searchLocalLeadCorpus({ prospects, signals, suppressions, query: discoveryQuery, now });
  const accounts = buildLeadAccountIntelligence({
    prospects,
    signals,
    suppressions,
    query: { ...discoveryQuery, requireContact: false },
    limit: Math.min(100, discoveryQuery.limit),
    now
  });
  const enrichmentPlans = search.results.slice(0, 25).map(row => buildEnrichmentPlan({
    prospect: prospects.find(prospect => prospect.id === row.id) || row,
    fields: ['company_profile', 'website_evidence', 'work_email', 'email_verification'],
    providers: [],
    now
  }));

  return {
    version: UBERLEAD_LAUNCH_FUSION_VERSION,
    query: search.query,
    rankedLeads: search.results,
    rankedAccounts: accounts.accounts,
    enrichmentPlans,
    counts: {
      discovered: prospects.length,
      rankedLeads: search.results.length,
      rankedAccounts: accounts.accounts.length,
      enrichmentPlans: enrichmentPlans.length
    },
    providerCalls: 0,
    externalEffects: 0,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Apollo-style here means UberBond-owned target construction, ranking, dedupe, evidence, account intelligence and enrichment planning over its own corpus. It does not copy Apollo data, call Apollo, infer private email addresses, or authorize outreach.'
  };
}

export async function prepareUberLeadLaunchFusion({
  sourceReadiness,
  discoveryConfig,
  discoveryOptions,
  leadQuery,
  suppressions = [],
  signals = [],
  substrate,
  launchInputs,
  ownerAuthorization,
  fetcher = fetch,
  now = new Date()
} = {}) {
  const discovery = await prepareUberLaunchDiscovery({ discoveryConfig, discoveryOptions, fetcher });
  const corpus = compilePublicDiscoveryLeadCorpus({ discovery, now });
  const leadLayer = compileApolloStyleLeadLayer({
    corpus,
    leadQuery,
    suppressions,
    signals,
    limit: discoveryOptions?.limit || discoveryConfig?.dailyCap || 100,
    now
  });

  const rankedDiscovery = {
    ...discovery,
    state: leadLayer.rankedAccounts.length ? 'READY' : 'WAIT',
    qualifiedProspectCount: leadLayer.rankedAccounts.length,
    prospects: leadLayer.rankedLeads,
    evidenceRef: leadLayer.rankedAccounts.length
      ? `ubleadfusion_${sha256(JSON.stringify({
        discoveryRef: discovery.evidenceRef,
        query: leadLayer.query,
        accounts: leadLayer.rankedAccounts.map(account => ({ accountKey: account.accountKey, score: account.accountScore }))
      }))}`
      : null,
    privateDataInference: false,
    protectedSource: Boolean(discovery.protectedSource),
    captchaBypass: Boolean(discovery.captchaBypass)
  };

  const manifest = compileUberLaunchManifest({
    sourceReadiness,
    discovery: rankedDiscovery,
    substrate,
    launchInputs,
    ownerAuthorization,
    now
  });

  return {
    version: UBERLEAD_LAUNCH_FUSION_VERSION,
    discovery,
    corpus,
    leadLayer,
    rankedDiscovery,
    manifest,
    oneButtonPressAvailable: manifest.oneButtonPressAvailable,
    selfHostRequired: true,
    preferredSubstrates: ['UBERCLOUD', 'UBERLIT', 'UBERCEL'],
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'This closes the source seam from public business discovery into UberBond\'s Apollo-style lead OS and then into the existing one-button launch gate. Real contact routes, legal eligibility, sender health, egress, recipient-provider budgets and founder authorization must still be observed before the button becomes pressable.'
  };
}
