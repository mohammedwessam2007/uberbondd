import { importProspects } from './prospect-import.mjs';
import { ingestDemandSignal, snapshot, moneyQueueFromSnapshot } from './revenue-singularity-service.mjs';

export const REVENUE_REAL_PROSPECT_CANARY_VERSION = 'uberbond.revenue-real-prospect-canary.v1';
export const REVENUE_REAL_PROSPECT_CANARY_SOURCE = 'https://relai.ai/careers';
export const REVENUE_REAL_PROSPECT_CANARY_RECORD = 'revenue-real-canary-relai-20261004';

const ZERO_EFFECTS = Object.freeze({ messages: 0, payments: 0, deployments: 0, providerWrites: 0, spendCents: 0 });
const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const EXPECTED_ROUTE_LOCAL = 'careers';
const EXPECTED_ROUTE_DOMAIN = 'relai.ai';

function fail(status, reasonCodes = [], extra = {}) {
  return {
    ok: false,
    version: REVENUE_REAL_PROSPECT_CANARY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    outboundAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...extra
  };
}

function publishedCareersRoute(pageText) {
  const routes = String(pageText || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return routes
    .map(route => route.toLowerCase())
    .find(route => {
      const [local, domain] = route.split('@');
      return local === EXPECTED_ROUTE_LOCAL && domain === EXPECTED_ROUTE_DOMAIN;
    }) || '';
}

/**
 * Compile a prospect only when the current first-party page still contains the
 * exact public evidence we came to observe. The public careers inbox is used as
 * an identity/reachability candidate only. It is deliberately imported as
 * unverified and therefore cannot satisfy the canonical VERIFIED_ROUTE gate.
 */
export function compileRelaiCanaryProspect(pageText, { observedAt = new Date().toISOString() } = {}) {
  const body = String(pageText || '');
  const lower = body.toLowerCase();
  const publishedRoute = publishedCareersRoute(body);
  const required = [
    ['reliability in production', 'production-reliability-evidence-missing'],
    ['ai research engineer', 'ai-research-role-evidence-missing']
  ];
  const missing = required.filter(([needle]) => !lower.includes(needle)).map(([, reason]) => reason);
  if (!publishedRoute) missing.push('public-careers-route-evidence-missing');
  if (missing.length) return fail('REAL_PROSPECT_CANARY_SOURCE_REFUSED', missing, { sourceUrl: REVENUE_REAL_PROSPECT_CANARY_SOURCE });

  return {
    ok: true,
    version: REVENUE_REAL_PROSPECT_CANARY_VERSION,
    status: 'REAL_PROSPECT_CANARY_SOURCE_COMPILED',
    sourceUrl: REVENUE_REAL_PROSPECT_CANARY_SOURCE,
    prospect: {
      company: 'RELAI',
      website: 'https://relai.ai/',
      niche: 'AI agent SaaS engineering platform evaluation release workflow',
      serviceFit: 0.95,
      abilityToPay: 8,
      source: 'public_website',
      sourceUrl: REVENUE_REAL_PROSPECT_CANARY_SOURCE,
      sourceRecordId: REVENUE_REAL_PROSPECT_CANARY_RECORD,
      sourceMetadata: {
        sourceType: 'public_website',
        canary: REVENUE_REAL_PROSPECT_CANARY_RECORD,
        observedAt
      },
      contact: {
        email: publishedRoute,
        name: 'RELAI Careers',
        title: 'Careers recruiting contact',
        source: 'public_website',
        sourceUrl: REVENUE_REAL_PROSPECT_CANARY_SOURCE,
        observedAt,
        verified: 'unverified',
        exact: true,
        inferred: false
      },
      issue: {
        code: 'agent-production-reliability-hiring-signal',
        title: 'Active hiring around AI-agent reliability in production',
        evidenceUrl: REVENUE_REAL_PROSPECT_CANARY_SOURCE,
        evidenceExcerpt: 'The official careers page describes reliability in production as a core problem and lists an AI Research Engineer role focused on agent creation, simulation, evaluation, and optimization.',
        evidenceObservedAt: observedAt,
        confidence: 0.95,
        service: 'AI Agent Production Release Gate',
        safeForOutreach: false
      }
    },
    demandSignal: {
      kind: 'explicit_demand_hiring',
      observedAt,
      evidenceRef: REVENUE_REAL_PROSPECT_CANARY_SOURCE
    },
    outboundAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

async function fetchFirstPartyPage(fetchFn) {
  let response;
  try {
    response = await fetchFn(REVENUE_REAL_PROSPECT_CANARY_SOURCE, {
      method: 'GET',
      headers: { 'user-agent': 'UberBond-Evidence-Canary/1.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    return fail('REAL_PROSPECT_CANARY_SOURCE_UNREACHABLE', ['first-party-source-fetch-failed'], { errorClass: clean(error?.code || error?.name || 'network-error', 80) });
  }
  if (!response?.ok) return fail('REAL_PROSPECT_CANARY_SOURCE_UNREACHABLE', [`first-party-source-http-${Number(response?.status) || 0}`]);
  const text = await response.text();
  if (text.length > 2_000_000) return fail('REAL_PROSPECT_CANARY_SOURCE_REFUSED', ['first-party-source-too-large']);
  return { ok: true, text };
}

/**
 * One-shot production reality canary. It performs one public GET, then only
 * internal durable writes through existing UberBond prospect/signal APIs. It
 * never verifies an email, sends a message, grants authority, or spends money.
 */
export async function runRevenueRealProspectCanary({
  store,
  config,
  logger = console,
  fetchFn = globalThis.fetch,
  importFn = importProspects,
  signalFn = ingestDemandSignal,
  snapshotFn = snapshot,
  moneyQueueFn = moneyQueueFromSnapshot,
  now = () => Date.now()
} = {}) {
  if (!store || !config || typeof fetchFn !== 'function') return fail('REAL_PROSPECT_CANARY_REFUSED', ['store-config-and-fetch-required']);

  const fetched = await fetchFirstPartyPage(fetchFn);
  if (!fetched.ok) return fetched;
  const observedAt = new Date(now()).toISOString();
  const compiled = compileRelaiCanaryProspect(fetched.text, { observedAt });
  if (!compiled.ok) return compiled;

  const existingRows = await store.list('prospects');
  const rows = Array.isArray(existingRows) ? existingRows : [];
  let prospect = rows.find(row => row?.sourceRecordId === REVENUE_REAL_PROSPECT_CANARY_RECORD) || null;
  const domainCollision = rows.find(row => row?.domain === 'relai.ai' && row?.sourceRecordId !== REVENUE_REAL_PROSPECT_CANARY_RECORD);
  if (!prospect && domainCollision) {
    return fail('REAL_PROSPECT_CANARY_COLLISION', ['existing-relai-prospect-owned-by-other-lineage'], { existingProspectId: clean(domainCollision.id, 160) });
  }

  let importState = 'REUSED_EXISTING_CANARY';
  if (!prospect) {
    // The importer fourth argument is a real campaign FK. A canary lineage label
    // is not a campaign ID, so deliberately omit it and keep the prospect
    // unbound to any campaign unless a real campaign owns it later.
    const imported = await importFn(store, config, [compiled.prospect]);
    prospect = imported?.added?.[0] || null;
    if (!prospect) return fail('REAL_PROSPECT_CANARY_IMPORT_REFUSED', ['canonical-import-did-not-add-prospect'], { skipped: (imported?.skipped || []).map(item => clean(item?.reason, 120)).filter(Boolean) });
    importState = 'IMPORTED_NEW_CANARY';
  }

  const signal = await signalFn(store, { prospectId: prospect.id, ...compiled.demandSignal, now: now() });
  if (!signal?.ok) return fail('REAL_PROSPECT_CANARY_SIGNAL_REFUSED', [clean(signal?.error || 'signal-ingest-failed', 120)], { prospectId: prospect.id, importState });

  const liveSnapshot = await snapshotFn(store, now());
  const queue = moneyQueueFn(liveSnapshot, { limit: 500 });
  const ranked = (queue.items || []).find(item => item.prospectId === prospect.id) || null;
  const excluded = (queue.excluded || []).find(item => item.prospectId === prospect.id) || null;
  const queueState = ranked ? 'RANKED' : excluded ? 'EXCLUDED' : 'NOT_PRESENT';
  const receipt = {
    ok: true,
    version: REVENUE_REAL_PROSPECT_CANARY_VERSION,
    status: 'REAL_PROSPECT_MONEY_QUEUE_CANARY_OBSERVED',
    prospectId: prospect.id,
    sourceRecordId: REVENUE_REAL_PROSPECT_CANARY_RECORD,
    sourceUrl: REVENUE_REAL_PROSPECT_CANARY_SOURCE,
    importState,
    signalState: signal.duplicate ? 'SIGNAL_ALREADY_PRESENT' : 'SIGNAL_INGESTED',
    queueState,
    rank: ranked?.rank ?? null,
    offerId: ranked?.offerId ?? null,
    exclusionReasons: (excluded?.reasons || []).map(reason => clean(reason, 160)),
    expectedSafetyBoundary: 'PUBLIC_IDENTITY_AND_DEMAND_EVIDENCE_DO_NOT_CREATE_A_VERIFIED_CONTACT_ROUTE',
    publicContactValueLogged: false,
    publicPageBodyLogged: false,
    outboundAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
  if (typeof store.log === 'function') await store.log('revenue_real_prospect_canary', receipt).catch(() => {});
  logger?.log?.(`REVENUE_REAL_PROSPECT_CANARY ${JSON.stringify(receipt)}`);
  return receipt;
}
