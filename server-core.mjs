import http from 'node:http';
import { createOwnerSessionManager, authorizeOwnerCookie, cookieHeader, clearCookieHeader, parseCookies, OWNER_SESSION_COOKIE, OWNER_SESSION_ABSOLUTE_MS } from './src/owner-session.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, validateStartupConfig } from './src/config.mjs';
import { createStore, ConflictError, StoreError } from './src/store.mjs';
import { Pipeline } from './src/pipeline.mjs';
import { RevenueEngine } from './src/revenue.mjs';
import { id, now, csvEscape, isEmail, normalizeDomain } from './src/utils.mjs';
import { parseCsv } from './src/csv.mjs';
import { googleAuthUrl, exchangeCode, sealTokens, getProfile } from './src/gmail.mjs';
import { startScheduler } from './src/scheduler.mjs';
import { DISCOVERY_CATEGORIES, parseBbox, normalizeCategories } from './src/discovery.mjs';
import { parseStrictBoolean, parseDryRunBoolean, InputError } from './src/input.mjs';
import { DurableQueue } from './src/queue.mjs';
import { DiscoveryRunner } from './src/discovery-runner.mjs';
import { importProspects } from './src/prospect-import.mjs';
import { createJobHandlers } from './src/job-handlers.mjs';
import { AGENT_RELAY_JOB_TYPE, CLOUD_AGENT_RELAY_POLICY_VERSION, claimCloudRelayTask, createCloudRelayTask, heartbeatCloudRelayTask, listCloudRelayTasks, relayHealthSummary, submitCloudRelayResult } from './src/cloud-agent-relay.mjs';
import { normalizeCountryList } from './src/send-safety.mjs';
import { inspectInfiniteOpusActivationEnvironment } from './src/infinite-opus-activation-diagnostic.mjs';
import { verifyUnsubscribeToken, preparedRecipientUnsubscribeUrls } from './src/unsubscribe.mjs';
import {
  createOutreachApproval,
  createOutreachRouteEvidence,
  evaluateOutreachGovernance,
  outreachEffectPayloadDigest,
  outreachMessageDigest
} from './src/outreach-governance.mjs';
import { resolveOmniaV9Mode } from './src/omnia-v9/integrations/config.mjs';
import { resolveOutboundFinalAdmissionHook } from './src/omnia-v9/integrations/outbound-admission.mjs';
import { createAuthoritativeOutreachConsequenceGate } from './src/omnia-v9/integrations/outreach-consequence-admission.mjs';
import { buildLiveLeadGenerationSnapshot, buildLiveLeadHandoff } from './src/leadgen-live-snapshot.mjs';
import { checkContactHistory, signContactHistoryReceipt } from './src/prospect-contact-history.mjs';
import { runProspectPreflight } from './src/prospect-preflight.mjs';
import { prepareFrozenProspectEffect, validateFrozenProspectEffect } from './src/frozen-prospect-effect.mjs';
import { buildOutreachEconomicsSnapshot } from './src/outreach-economics-snapshot.mjs';
import { buildPreflightHandoff } from './src/prospect-preflight-handoff.mjs';
import { loadPolicyEvidenceBundle, compilePolicyEvidenceStatus } from './src/global-policy-evidence.mjs';
import { createRegistryAdapterRegistry } from './src/company-registry-adapter.mjs';
import { createCompaniesHouseAdapter } from './src/companies-house-adapter.mjs';
import { compileJurisdictionMatrix } from './src/global-green-lane-router.mjs';
import { buildRouteEconomics } from './src/global-route-economics.mjs';
import { providerRoutePolicy } from './src/outreach-governance.mjs';
import { compileSenderFleetExpansionPlan } from './src/winnr-expansion-planner.mjs';
import { buildLeadAccountIntelligence } from './src/lead-generation.mjs';
import { buildRevenueOfferCatalog } from './src/revenue-offers.mjs';
import { getUberReplyOffer } from './src/uberreply-four-offer-genome.mjs';
import {
  LEAD_OPERATIONS_POLICY,
  LEAD_PROVIDER_CATALOG,
  buildBuyingGroupPlan,
  buildLeadControlTower,
  buildLeadCoverageMap,
  buildLeadFieldLedger,
  buildLookalikePlan,
  buildProviderPreflight
} from './src/lead-operations.mjs';
import { buildEncryptedSmtpAccount, selectFleetMailbox } from './src/uberfleet.mjs';
import { buildEncryptedImapAccount } from './src/uberimap.mjs';
import { createUberMaildosoAdapter } from './src/ubermaildoso.mjs';
import { createWinnrApiClient } from './src/uberwinnr-adapter.mjs';
import { compileWinnrProcurementFrontier } from './src/uberwinnr-procurement-frontier.mjs';
import { compileWinnrCredentialImport } from './src/uberwinnr-credential-import.mjs';
import { compileWinnrPostPurchaseRegistryPlan, applyWinnrPostPurchaseRegistryPlan } from './src/uberwinnr-postpurchase.mjs';
import { buildLeadIntakeRecord } from './src/lead-intelligence-v3.mjs';
import { compilePublicContactSupply } from './src/ubersupply-public-contact-capacity.mjs';
import { compileOutreachBuyList } from './src/uberbuy-outreach-bom.mjs';
import { OWNED_OUTREACH_DOMAINS } from './src/outreach-domain-fleet.mjs';
import {
  buildNativeCapacityPlan,
  buildNativeTargetProfileRecord,
  compileNativeEnrichmentPlan,
  compileNativeLeadList,
  compileNativeLocalEnrichment,
  nativeLeadListCsv
} from './src/uberbond-native-lead-ops.mjs';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

validateStartupConfig(config);
const root = path.dirname(fileURLToPath(import.meta.url));
const store = createStore(config);
await store.init();
const queue = new DurableQueue(store, config, console);
let revenue;
const omniaV9Mode = resolveOmniaV9Mode(process.env);
const pipeline = new Pipeline(store, config, {
  onProspectComplete: async prospect => revenue?.onProspectComplete(prospect),
  outboundFinalAdmissionShadow: resolveOutboundFinalAdmissionHook({ mode: omniaV9Mode, store }),
  outboundConsequenceGate: createAuthoritativeOutreachConsequenceGate({ store, cfg: config })
});
const enqueueResearch = payload => queue.enqueue('research.batch', payload, {
  maxAttempts: 3,
  dedupeKey: payload.leadId ? `research:lead:${payload.leadId}` : `research:${payload.reason || 'manual'}:${Math.floor(Date.now() / 30000)}`
});
revenue = new RevenueEngine(store, config, pipeline, { enqueueResearch });
const discoveryRunner = new DiscoveryRunner(store, config);
const handlers = createJobHandlers({ store, cfg: config, pipeline, revenue, discoveryRunner });
let stopScheduler = () => {};
let localWorkerPromise = null;
if (config.processRole === 'all') {
  stopScheduler = startScheduler(queue, config, console);
  localWorkerPromise = queue.startWorker(handlers, { concurrency: config.queue.concurrency });
}
const oauthStates = new Map();
const leadCaptureHits = new Map();
const maildoso = createUberMaildosoAdapter({
  token: config.providers?.maildoso?.apiKey || '',
  baseUrl: config.providers?.maildoso?.baseUrl || 'https://api.maildoso.com'
});
const winnr = createWinnrApiClient({
  token: config.providers?.winnr?.apiKey || '',
  authorized: config.providers?.winnr?.accountAuthorized === true,
  termsCompatible: config.providers?.winnr?.termsCompatible === true,
  evidenceRef: config.providers?.winnr?.termsEvidenceRef || ''
});

const baseHeaders = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};
const json = (res, status, data, extra = {}) => {
  res.writeHead(status, { ...baseHeaders, ...extra, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};
const text = (res, status, data, type = 'text/plain; charset=utf-8', extra = {}) => {
  res.writeHead(status, { ...baseHeaders, ...extra, 'content-type': type });
  res.end(data);
};
const bodyText = async req => {
  let content = '';
  for await (const chunk of req) {
    content += chunk;
    if (Buffer.byteLength(content) > 5e6) throw new HttpError(413, 'Request body too large');
  }
  return content;
};
const parseBody = async req => {
  const content = await bodyText(req);
  if (!content) return {};
  let parsed;
  try { parsed = JSON.parse(content); }
  catch { throw new HttpError(400, 'Malformed JSON body'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'JSON body must be an object');
  }
  return parsed;
};
const idempotencyKey = value => {
  const key = String(value ?? '').trim();
  if (!key || key.length > 200 || /[\u0000-\u001f\u007f]/.test(key)) return '';
  return key;
};
const OWNER_AUTHORIZATION_BASES = new Map([
  ['explicit_consent', 'EXPLICIT_CONSENT'],
  ['requested_information', 'REQUESTED_INFORMATION']
]);
const ownerBusinessIdentity = settings => {
  const value = settings?.businessIdentity;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const legalName = String(value.legalName || '').trim();
  const postalAddress = String(value.postalAddress || '').trim();
  if (!legalName || !postalAddress) return null;
  return {
    legalName,
    senderName: String(value.senderName || '').trim(),
    company: String(value.company || '').trim(),
    postalAddress,
    updatedAt: String(value.updatedAt || '').trim(),
    source: 'owner-protected-settings'
  };
};
const configWithOwnerIdentity = settings => {
  const identity = ownerBusinessIdentity(settings);
  if (!identity) return config;
  return {
    ...config,
    sender: {
      ...config.sender,
      name: identity.senderName || config.sender.name,
      company: identity.company || identity.legalName || config.sender.company,
      address: identity.postalAddress
    }
  };
};
const digestCampaignRequest = campaign => crypto.createHash('sha256').update(JSON.stringify({
  name: campaign.name,
  niche: campaign.niche,
  offer: campaign.offer,
  offerId: campaign.offerId || undefined,
  allowedCountries: campaign.allowedCountries,
  minScore: campaign.minScore,
  dailyCaps: campaign.dailyCaps,
  maxFollowups: campaign.maxFollowups,
  autoSend: campaign.autoSend,
  approved: campaign.approved
})).digest('hex');
const digestNativeLeadRequest = input => crypto.createHash('sha256').update(JSON.stringify({
  name: String(input?.name || '').trim(),
  profile: input?.profile && typeof input.profile === 'object' ? input.profile : {},
  campaignId: String(input?.campaignId || '').trim(),
  limit: Number(input?.limit || 0),
  idempotencyKey: String(input?.idempotencyKey || '').trim()
})).digest('hex');
const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};
const ownerSessions = createOwnerSessionManager({ adminToken: config.adminToken });
const bearerOk = req => {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  return safeEqual(bearer, config.adminToken);
};
const auth = req => {
  if (!config.adminToken) return true;
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (safeEqual(bearer, config.adminToken)) return true;
  return authorizeOwnerCookie(ownerSessions, req).ok;
};
const ownerLoginHits = new Map();
const ownerLoginLimited = req => {
  const minute = Math.floor(Date.now() / 60000);
  const key = `${clientIp(req)}:${minute}`;
  const count = (ownerLoginHits.get(key) || 0) + 1;
  ownerLoginHits.set(key, count);
  if (ownerLoginHits.size > 1000) for (const entry of ownerLoginHits.keys()) if (!entry.endsWith(`:${minute}`)) ownerLoginHits.delete(entry);
  return count > 10;
};
const cookieSecure = req => !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(String(req.headers.host || ''));
const relayConfigured = () => Boolean(config.agentRelay?.enabled && config.agentRelay?.token);
const relayAuth = req => {
  if (!relayConfigured()) return false;
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  return safeEqual(bearer, config.agentRelay.token);
};
const relayHits = new Map();
const relayRateLimited = req => {
  const minute = Math.floor(Date.now() / 60000);
  const key = `${clientIp(req)}:${minute}`;
  const count = (relayHits.get(key) || 0) + 1;
  relayHits.set(key, count);
  if (relayHits.size > 1000) {
    for (const entry of relayHits.keys()) if (!entry.endsWith(`:${minute}`)) relayHits.delete(entry);
  }
  return count > Math.max(1, Number(config.agentRelay?.rateLimitPerMinute || 120));
};
const pct = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 100) : 0;
const publicApi = pathname => pathname === '/api/health' || pathname === '/api/public/unsubscribe' || pathname === '/api/public/lead-capture' || pathname === '/api/public/config' || pathname === '/api/public/audit' || pathname.startsWith('/api/public/report/') || pathname.startsWith('/api/public/artifacts/') || pathname === '/api/public/checkout' || pathname === '/api/public/offer-interest' || pathname === '/webhooks/lemonsqueezy';
const clientIp = req => {
  const hops = Number(config.trustProxyHops) || 0;
  const socketAddress = String(req.socket?.remoteAddress || 'unknown');
  if (hops <= 0) return socketAddress;
  const raw = req.headers['x-forwarded-for'];
  const chain = String(Array.isArray(raw) ? raw.join(',') : raw || '')
    .split(',').map(entry => entry.trim()).filter(Boolean);
  if (chain.length < hops) return socketAddress;
  return chain[chain.length - hops] || socketAddress;
};

const leadCaptureRateLimited = req => {
  const hour = Math.floor(Date.now() / 3600000);
  const key = `${clientIp(req)}:${hour}`;
  const count = (leadCaptureHits.get(key) || 0) + 1;
  leadCaptureHits.set(key, count);
  if (leadCaptureHits.size > 5000) {
    for (const entry of leadCaptureHits.keys()) if (!entry.endsWith(`:${hour}`)) leadCaptureHits.delete(entry);
  }
  return count > Math.max(1, Number(config.leadCapture?.rateLimitPerHour || 30));
};


async function summary() {
  const [prospects, jobs, suppressions, accounts, discoveryRuns, revenueSummary, queueStats, pausedState, workers, settings, senderHealth, outboundReservations] = await Promise.all([
    store.list('prospects'), store.list('jobs'), store.list('suppressions'),
    store.list('accounts'), store.list('discoveryRuns'), revenue.summary(), queue.stats(), queue.pausedState(), queue.liveWorkers(),
    store.getSettings(), store.list('senderHealth'), store.list('outboundReservations')
  ]);
  const completed = prospects.filter(item => ['ready', 'research-complete', 'rejected', 'sent', 'replied'].includes(item.status));
  const qualified = prospects.filter(item => ['ready', 'research-complete', 'sent', 'replied'].includes(item.status));
  const today = new Date().toISOString().slice(0, 10);
  return {
    autopilot: config.autopilot,
    running: Number(queueStats.counts?.active || 0) > 0,
    paused: Boolean(pausedState.paused),
    workerOnline: workers.length > 0,
    workers,
    processRole: config.processRole,
    storeBackend: config.storeBackend,
    prospects: prospects.length,
    queued: prospects.filter(item => ['queued', 'new', 'retry', 'claimed'].includes(item.status)).length,
    completed: completed.length,
    qualified: qualified.length,
    ready: prospects.filter(item => item.status === 'ready').length,
    sent: prospects.filter(item => item.status === 'sent').length,
    replied: prospects.filter(item => item.status === 'replied').length,
    positive: prospects.filter(item => item.replyLabel === 'positive').length,
    suppressed: suppressions.length,
    qualificationRate: pct(qualified.length, completed.length),
    jobs: jobs.slice(0, 12),
    queue: queueStats,
    accounts: accounts.map(account => ({ slot: account.slot, email: account.email, connected: account.connected, lastReplyPoll: account.lastReplyPoll })),
    revenue: revenueSummary,
    discovery: {
      enabled: config.discovery.enabled,
      dryRun: config.discovery.dryRun,
      dailyCap: config.discovery.dailyCap,
      runs: discoveryRuns.length,
      importedToday: discoveryRuns
        .filter(run => (run.runDate || run.startedAt?.slice(0, 10)) === today && run.status !== 'error')
        .reduce((sum, run) => sum + Number(run.importedCount || 0), 0)
    },
    outbound: {
      enabled: config.outbound.enabled,
      dryRun: config.outbound.dryRun,
      globalPaused: settings.outboundPaused === true,
      pauseReason: settings.outboundPauseReason || '',
      allowedCountries: normalizeCountryList(config.outbound.allowedCountries),
      senderHealth,
      reservedToday: outboundReservations.filter(item => String(item.reservedAt || '').startsWith(today) && ['reserved','dispatching','sent','uncertain'].includes(item.status)).length,
      uncertain: outboundReservations.filter(item => item.status === 'uncertain').length
    }
  };
}

async function nativeLeadSources() {
  const [prospects, suppressions, leadLists, leadSearches, leadSignals, leadEnrichmentRuns] = await Promise.all([
    store.list('prospects'), store.list('suppressions'), store.list('leadLists'),
    store.list('leadSearches'), store.list('leadSignals'), store.list('leadEnrichmentRuns')
  ]);
  return {
    prospects: Array.isArray(prospects) ? prospects : [],
    suppressions: Array.isArray(suppressions) ? suppressions : [],
    leadLists: Array.isArray(leadLists) ? leadLists : [],
    leadSearches: Array.isArray(leadSearches) ? leadSearches : [],
    leadSignals: Array.isArray(leadSignals) ? leadSignals : [],
    leadEnrichmentRuns: Array.isArray(leadEnrichmentRuns) ? leadEnrichmentRuns : []
  };
}

function nativeLeadProfileInput(input = {}) {
  if (input?.profile && typeof input.profile === 'object' && !Array.isArray(input.profile)) return input.profile;
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

function nativeLeadArrayInput(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function publicNativeLeadList(list = {}) {
  return {
    id: list.id,
    name: list.name,
    kind: list.kind,
    status: list.status,
    campaignId: list.campaignId || null,
    profile: list.profile,
    query: list.query,
    prospectIds: list.prospectIds || [],
    rows: list.rows || [],
    stats: list.stats || {},
    exclusions: list.exclusions || {},
    sourceAuthority: list.sourceAuthority,
    handoff: list.handoff,
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    createdAt: list.createdAt,
    updatedAt: list.updatedAt
  };
}

const CANARY_PROSPECT_STATUSES = new Set(['ready', 'research-complete']);
const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});

function countReasons(rows) {
  const counts = {};
  for (const row of rows) {
    const reason = String(row?.reason || '').trim();
    if (reason) counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}

function canaryPrerequisites(runtimeConfig = config, accounts = []) {
  const outbound = runtimeConfig.outbound || {};
  const provider = String(outbound.provider || '').toLowerCase();
  const smtpFleetConfigured = accounts.some(account =>
    account?.connected === true &&
    String(account?.provider || '').toLowerCase() === 'smtp-relay' &&
    Boolean(account?.tokens) &&
    account?.smtpRoute?.authorized === true &&
    account?.smtpRoute?.termsCompatible === true &&
    Boolean(String(account?.smtpRoute?.evidenceRef || '').trim())
  );
  return {
    launchPhaseCanary: outbound.launchPhase === 'canary',
    approvedProvider: ['gmail-api', 'postal', 'smtp-relay'].includes(provider),
    approvalSecretConfigured: String(outbound.approvalSecret || '').length >= 32,
    approverConfigured: Boolean(String(outbound.approverId || '').trim()),
    senderIdentityConfigured: Boolean(String(runtimeConfig.sender?.address || '').trim()),
    allowedCountriesConfigured: normalizeCountryList(outbound.allowedCountries || []).length > 0,
    googleOAuthConfigured: Boolean(runtimeConfig.google?.clientId && runtimeConfig.google?.clientSecret),
    postalConfigured: Boolean(runtimeConfig.providers?.postal?.configured && outbound.useEffectAdapter === true),
    smtpFleetConfigured,
    providerCredentialConfigured: provider === 'postal'
      ? Boolean(runtimeConfig.providers?.postal?.configured && outbound.useEffectAdapter === true)
      : provider === 'smtp-relay'
        ? Boolean(smtpFleetConfigured && outbound.useEffectAdapter === true)
        : Boolean(runtimeConfig.google?.clientId && runtimeConfig.google?.clientSecret),
    encryptionConfigured: /^[a-f0-9]{64}$/i.test(String(runtimeConfig.encryptionKey || '')),
    unsubscribeConfigured: String(runtimeConfig.unsubscribeSecret || '').length >= 32,
    outboundEnabled: outbound.enabled === true,
    dryRun: outbound.dryRun === true
  };
}

async function outreachCanaryStatus() {
  const [prospects, campaigns, accounts, senderHealth, suppressions, reservations, settings] = await Promise.all([
    store.list('prospects'), store.list('campaigns'), store.list('accounts'), store.list('senderHealth'),
    store.list('suppressions'), store.list('outboundReservations'), store.getSettings()
  ]);
  const runtimeConfig = configWithOwnerIdentity(settings);
  const campaignsById = new Map(campaigns.map(campaign => [String(campaign.id), campaign]));
  const candidates = prospects.filter(prospect => {
    const campaign = campaignsById.get(String(prospect.campaignId || ''));
    return CANARY_PROSPECT_STATUSES.has(prospect.status)
      && Boolean(prospect.contact?.email)
      && campaign?.approved === true
      && campaign?.autoSend === true;
  });
  const evaluations = candidates.map(prospect => evaluateOutreachGovernance({
    prospect,
    campaign: campaignsById.get(String(prospect.campaignId || '')),
    cfg: runtimeConfig,
    subject: prospect.subject,
    body: prospect.draft,
    followup: 0,
    date: new Date()
  }));
  const governedReady = evaluations.filter(result => result.ok);
  const readyProspectIds = candidates
    .filter((_, index) => evaluations[index]?.ok)
    .map(prospect => prospect.id);
  const prerequisites = canaryPrerequisites(runtimeConfig, accounts);
  const connectedSlots = new Set(accounts.filter(account => account.connected === true).map(account => String(account.slot || '')));
  const pausedSlots = new Set(senderHealth.filter(row => row.paused === true).map(row => String(row.inbox || '')));
  const domainMailboxChecks = await Promise.all(governedReady.map(async prospect => {
    const account = accounts.find(row => String(row.slot || '') === String(prospect.inbox || '')) || null;
    const gate = await pipeline.evaluateDomainMailboxSendGate({ account, inbox: prospect.inbox, date: new Date() });
    return { prospectId: prospect.id, gate };
  }));
  const liveDomainMailboxBlockers = domainMailboxChecks
    .filter(item => item.gate && item.gate.decision !== 'NOT_BLOCKED_BY_DOMAIN_MAILBOX_GATE')
    .flatMap(item => (item.gate.reasonCodes || []).map(reason => `domain-mailbox:${reason}`));
  const dryRunBlockers = [];
  if (!prerequisites.launchPhaseCanary) dryRunBlockers.push('launch-phase-must-be-canary');
  if (!prerequisites.approvedProvider) dryRunBlockers.push('provider-not-approved');
  if (!prerequisites.approvalSecretConfigured) dryRunBlockers.push('approval-secret-missing');
  if (!prerequisites.approverConfigured) dryRunBlockers.push('approver-id-missing');
  if (!campaigns.some(campaign => campaign.approved === true && campaign.autoSend === true)) dryRunBlockers.push('approved-auto-send-campaign-missing');
  if (!candidates.length) dryRunBlockers.push('no-researched-canary-candidate');
  if (!governedReady.length) dryRunBlockers.push('no-approved-route-and-payload');
  if (!connectedSlots.size) dryRunBlockers.push('no-connected-sender');
  if (connectedSlots.size && [...connectedSlots].every(slot => pausedSlots.has(slot))) dryRunBlockers.push('all-senders-paused');
  if (settings?.outboundPaused === true) dryRunBlockers.push('global-outbound-paused');
  if (governedReady.length > 1) dryRunBlockers.push('canary-must-have-one-eligible-prospect');

  const liveBlockers = [...dryRunBlockers];
  if (!prerequisites.outboundEnabled) liveBlockers.push('outbound-disabled');
  if (prerequisites.dryRun) liveBlockers.push('outbound-dry-run');
  if (!prerequisites.senderIdentityConfigured) liveBlockers.push('business-address-missing');
  if (!prerequisites.allowedCountriesConfigured) liveBlockers.push('allowed-countries-missing');
  if (!prerequisites.providerCredentialConfigured) {
    const provider = String(runtimeConfig.outbound.provider || '').toLowerCase();
    liveBlockers.push(provider === 'postal'
      ? 'postal-runtime-credential-missing'
      : provider === 'smtp-relay'
        ? 'smtp-fleet-credential-or-route-missing'
        : 'google-oauth-missing');
  }
  if (!prerequisites.encryptionConfigured) liveBlockers.push('token-encryption-key-missing');
  if (!prerequisites.unsubscribeConfigured) liveBlockers.push('unsubscribe-secret-missing');
  liveBlockers.push(...liveDomainMailboxBlockers);

  const uniqueDryRunBlockers = [...new Set(dryRunBlockers)];
  const uniqueLiveBlockers = [...new Set(liveBlockers)];
  const state = uniqueDryRunBlockers.length
    ? 'CANARY_BLOCKED'
    : uniqueLiveBlockers.length
      ? 'CANARY_DRY_RUN_READY'
      : 'CANARY_READY_TO_SEND';
  return {
    ok: true,
    version: 'uberbond.outreach-canary-runtime.v1',
    state,
    provider: runtimeConfig.outbound.provider,
    launchPhase: runtimeConfig.outbound.launchPhase,
    mode: {
      outboundEnabled: runtimeConfig.outbound.enabled,
      dryRun: runtimeConfig.outbound.dryRun,
      globalPaused: settings?.outboundPaused === true
    },
    canary: {
      dailyCap: runtimeConfig.outbound.canaryDailyCap,
      hourlyCap: runtimeConfig.outbound.canaryHourlyCap,
      minGapSeconds: runtimeConfig.outbound.canaryMinGapSeconds,
      readyProspectId: readyProspectIds.length === 1 ? readyProspectIds[0] : null
    },
    domainMailbox: {
      required: runtimeConfig.outbound.domainMailboxGateRequired === true,
      checks: domainMailboxChecks.map(item => ({
        prospectId: item.prospectId,
        decision: item.gate?.decision || 'NOT_REQUIRED',
        reasonCodes: item.gate?.reasonCodes || []
      }))
    },
    counts: {
      prospects: prospects.length,
      campaigns: campaigns.length,
      approvedAutoSendCampaigns: campaigns.filter(campaign => campaign.approved === true && campaign.autoSend === true).length,
      candidates: candidates.length,
      governedReady: governedReady.length,
      connectedSenders: connectedSlots.size,
      suppressions: suppressions.length,
      activeReservations: reservations.filter(row => ['reserved', 'dispatching', 'sent', 'uncertain'].includes(row.status)).length
    },
    prerequisites,
    reasonCodes: uniqueLiveBlockers,
    dryRunReasonCodes: uniqueDryRunBlockers,
    governanceReasonCounts: countReasons(evaluations.filter(result => !result.ok)),
    readyForDryRun: uniqueDryRunBlockers.length === 0,
    readyForLiveSend: state === 'CANARY_READY_TO_SEND',
    pressable: state === 'CANARY_READY_TO_SEND',
    providerCalls: 0,
    messagesSent: 0,
    automaticRetryAuthorized: false,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    truthBoundary: 'This is a live read-only canary readiness snapshot. It proves only local configuration and durable-record state; it never proves recipient consent, inbox placement, revenue, or a provider send.'
  };
}

async function startOutreachCanary(input = {}) {
  if (input.confirmCanary !== true) throw new HttpError(400, 'confirmCanary must be true');
  const readiness = await outreachCanaryStatus();
  const canQueue = readiness.mode.dryRun === true ? readiness.readyForDryRun : readiness.readyForLiveSend;
  if (!canQueue) {
    throw new HttpError(409, `Canary is not ready: ${readiness.reasonCodes.join(', ')}`);
  }
  const prospectId = readiness.canary?.readyProspectId;
  if (!prospectId) throw new HttpError(409, 'Exactly one governed canary prospect is required');
  const job = await queue.enqueue('outbound.process', {
    limit: 1,
    prospectId,
    canary: true
  }, {
    maxAttempts: 1,
    recoveryPolicy: 'reconcile',
    dedupeKey: `outreach:canary:${prospectId}`
  });
  const dryRun = readiness.mode.dryRun === true;
  return {
    ok: true,
    state: dryRun ? 'CANARY_DRY_RUN_ENQUEUED' : 'CANARY_JOB_ENQUEUED',
    jobId: job.id,
    prospectId,
    providerCalls: 0,
    messagesSent: 0,
    automaticRetryAuthorized: false,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    truthBoundary: dryRun
      ? 'The founder press queued one exact canary prospect in dry-run mode. The worker will make zero provider calls.'
      : 'The founder press queued one exact canary prospect after a fresh governed readiness check. The worker performs its own final safety checks before any provider call.'
  };
}

function exactCanaryPayload(prospect, campaign, { subject, body, followup = 0, provider = config.outbound.provider } = {}) {
  provider = String(provider || '').toLowerCase();
  return {
    provider,
    prospectId: prospect.id,
    campaignId: campaign.id,
    recipientEmail: prospect.contact?.email,
    subject: String(subject ?? prospect.subject ?? ''),
    body: String(body ?? prospect.draft ?? ''),
    inbox: String(prospect.inbox || ''),
    followup: Number(followup || 0),
    threadId: Number(followup || 0) ? String(prospect.threadId || '') : '',
    replyToId: Number(followup || 0) ? String(prospect.rfcMessageId || '') : '',
    listUnsubscribe: String(prospect.oneClickUnsubscribeUrl || '')
  };
}

async function approveOutreachCanary(input = {}) {
  const prospectId = String(input.prospectId || '').trim();
  if (!prospectId) throw new HttpError(400, 'prospectId is required');
  const requestKey = idempotencyKey(input.idempotencyKey);
  if (!requestKey) throw new HttpError(400, 'Idempotency-Key header is required for canary approval');
  if (Number(input.followup || 0) !== 0) throw new HttpError(400, 'Only the initial canary step can be approved here');
  const runtimeConfig = configWithOwnerIdentity(await store.getSettings());
  if (runtimeConfig.outbound.launchPhase !== 'canary') throw new HttpError(409, 'Set the bounded canary launch phase before approving a canary');
  const provider = String(runtimeConfig.outbound.provider || '').toLowerCase();
  if (!['gmail-api', 'postal', 'smtp-relay'].includes(provider)) throw new HttpError(409, 'The live canary provider is not approved');
  if (String(runtimeConfig.outbound.approvalSecret || '').length < 32) throw new HttpError(503, 'The canary approval secret is not configured');
  if (!String(runtimeConfig.outbound.approverId || '').trim()) throw new HttpError(503, 'The canary approver identity is not configured');

  const prospect = await store.get('prospects', prospectId);
  if (!prospect) throw new HttpError(404, 'Prospect not found');
  const campaign = await store.get('campaigns', prospect.campaignId);
  if (!campaign) throw new HttpError(404, 'Campaign not found');
  if (campaign.approved !== true || campaign.autoSend !== true) throw new HttpError(409, 'The campaign must be approved and auto-send enabled before canary approval');
  if (!CANARY_PROSPECT_STATUSES.has(prospect.status)) throw new HttpError(409, 'The prospect must finish research before canary approval');
  if (!prospect.contact?.email) throw new HttpError(409, 'The prospect has no selected recipient email');
  if (provider === 'smtp-relay') {
    const [accounts, senderHealth] = await Promise.all([store.list('accounts'), store.list('senderHealth')]);
    const allocation = selectFleetMailbox({
      prospectId: prospect.id, currentSlot: prospect.inbox, accounts, senderHealth, provider
    });
    // Approve the sender already shown in the stored draft. Never silently
    // replace a missing/paused sender while signing an exact payload.
    if (!prospect.inbox || !allocation.ok || allocation.slot !== String(prospect.inbox)) {
      throw new HttpError(409, 'The prospect needs a healthy authorized SMTP sender in its stored draft; rerun research before approval');
    }
  } else if (!prospect.inbox || !['A', 'B'].includes(String(prospect.inbox))) {
    throw new HttpError(409, 'The prospect needs sender slot A or B');
  }

  const subject = String(input.subject ?? prospect.subject ?? '');
  const body = String(input.body ?? prospect.draft ?? '');
  if (!subject.trim() || !body.trim()) throw new HttpError(409, 'The exact subject and body must exist before approval');
  if (input.subject !== undefined && subject !== String(prospect.subject || '')) throw new HttpError(409, 'Subject must match the stored rendered draft exactly');
  if (input.body !== undefined && body !== String(prospect.draft || '')) throw new HttpError(409, 'Body must match the stored rendered draft exactly');
  if (!String(prospect.oneClickUnsubscribeUrl || '').startsWith('https://')) throw new HttpError(409, 'The prospect needs a signed HTTPS unsubscribe URL');
  const routeInput = input.routeEvidence;
  if (!routeInput || typeof routeInput !== 'object' || Array.isArray(routeInput)) throw new HttpError(400, 'routeEvidence is required');
  if (!String(routeInput.sourceObservedAt || '').trim()) throw new HttpError(400, 'routeEvidence.sourceObservedAt is required for retry-safe approval');

  const approvedAt = new Date();
  let route;
  try {
    const observedAt = new Date(String(routeInput.sourceObservedAt));
    const sourceExpiresAt = String(routeInput.sourceExpiresAt || '').trim()
      || (Number.isFinite(observedAt.getTime())
        ? new Date(observedAt.getTime() + Math.max(1, Number(runtimeConfig.outbound.routeEvidenceMaxAgeDays || 7)) * 86400000).toISOString()
        : '');
    route = createOutreachRouteEvidence({
      ...routeInput,
      recipientEmail: prospect.contact.email,
      sourceExpiresAt,
      provider: runtimeConfig.outbound.provider
    }, approvedAt);
  } catch (error) {
    throw new HttpError(400, error.message || 'Route evidence is invalid');
  }
  const payload = exactCanaryPayload(prospect, campaign, { subject, body, provider: runtimeConfig.outbound.provider });
  const messageDigest = outreachMessageDigest(payload);
  const effectPayloadDigest = outreachEffectPayloadDigest(payload);
  const requestDigest = crypto.createHash('sha256').update(JSON.stringify({
    prospectId: prospect.id,
    campaignId: campaign.id,
    routeDigest: route.routeDigest,
    messageDigest,
    effectPayloadDigest
  })).digest('hex');
  const existingApproval = prospect.outreachApproval;
  if (existingApproval && !prospect.outreachApprovalRevokedAt) {
    const existingExpiry = Date.parse(existingApproval.expiresAt || '');
    if (prospect.outreachApprovalIdempotencyKey === requestKey && prospect.outreachApprovalRequestDigest === requestDigest) {
      return {
        ok: true,
        state: 'CANARY_APPROVAL_REPLAY',
        idempotentReplay: true,
        prospectId: prospect.id,
        campaignId: campaign.id,
        approvalId: existingApproval.approvalId,
        routeDigest: existingApproval.routeDigest,
        messageDigest: existingApproval.messageDigest,
        effectPayloadDigest: existingApproval.effectPayloadDigest,
        expiresAt: existingApproval.expiresAt,
        providerCalls: 0,
        messagesSent: 0,
        automaticRetryAuthorized: false,
        businessEffectAuthority: 'NONE',
        externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
        truthBoundary: 'The exact canary approval request was replayed idempotently. It did not contact the provider or recipient.'
      };
    }
    if (Number.isFinite(existingExpiry) && existingExpiry > Date.now()) {
      throw new HttpError(409, 'An active canary approval already exists; revoke it before creating a different approval');
    }
  }
  const approval = createOutreachApproval({
    approvalId: `outreach-${crypto.randomUUID()}`,
    prospectId: prospect.id,
    campaignId: campaign.id,
    recipientEmail: prospect.contact.email,
    provider: runtimeConfig.outbound.provider,
    inbox: prospect.inbox,
    followup: 0,
    routeDigest: route.routeDigest,
    messageDigest,
    effectPayloadDigest,
    approvedBy: runtimeConfig.outbound.approverId,
    approvedAt: approvedAt.toISOString(),
    expiresAt: new Date(approvedAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
  }, runtimeConfig.outbound.approvalSecret);
  const candidate = { ...prospect, outreachRoute: route, outreachApproval: approval };
  const governance = evaluateOutreachGovernance({ prospect: candidate, campaign, cfg: runtimeConfig, subject, body, date: approvedAt });
  if (!governance.ok) throw new HttpError(409, `Canary approval refused: ${governance.reason}`);

  await store.patch('prospects', prospect.id, {
    outreachRoute: route,
    outreachApproval: approval,
    outreachApprovalIdempotencyKey: requestKey,
    outreachApprovalRequestDigest: requestDigest,
    outreachApprovalRevokedAt: null,
    externalActionAuthorized: false,
    outreachApprovalCreatedAt: approvedAt.toISOString()
  });
  await store.log('outreach_canary_approval_created', {
    prospectId: prospect.id,
    campaignId: campaign.id,
    approvalId: approval.approvalId,
    routeDigest: route.routeDigest,
    messageDigest,
    effectPayloadDigest,
    idempotencyKey: requestKey,
    provider: runtimeConfig.outbound.provider,
    inbox: prospect.inbox,
    approvedBy: runtimeConfig.outbound.approverId,
    providerCalls: 0
  });
  return {
    ok: true,
    state: 'CANARY_APPROVED_NO_PROVIDER_CALL',
    prospectId: prospect.id,
    campaignId: campaign.id,
    approvalId: approval.approvalId,
    routeDigest: route.routeDigest,
    messageDigest,
    effectPayloadDigest,
    expiresAt: approval.expiresAt,
    providerCalls: 0,
    messagesSent: 0,
    automaticRetryAuthorized: false,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    truthBoundary: 'This action stored one short-lived exact approval and route digest. It did not contact the provider or recipient.'
  };
}

async function revokeOutreachCanary(input = {}) {
  const prospectId = String(input.prospectId || '').trim();
  if (!prospectId) throw new HttpError(400, 'prospectId is required');
  if (Number(input.followup || 0) !== 0) throw new HttpError(400, 'Only the initial canary step is supported here');
  const prospect = await store.get('prospects', prospectId);
  if (!prospect) throw new HttpError(404, 'Prospect not found');
  const revokedAt = now();
  await store.patch('prospects', prospect.id, {
    outreachRoute: null,
    outreachApproval: null,
    outreachApprovalRevokedAt: revokedAt,
    externalActionAuthorized: false
  });
  await store.log('outreach_canary_approval_revoked', {
    prospectId,
    reason: String(input.reason || 'owner-revoked').slice(0, 240),
    providerCalls: 0
  });
  return {
    ok: true,
    state: 'CANARY_APPROVAL_REVOKED',
    prospectId,
    providerCalls: 0,
    messagesSent: 0,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

function validHttpsUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function suppressionMatchesEmail(row, email, domain) {
  const value = String(row?.value || '').trim().toLowerCase();
  if (!value) return false;
  return value === email || value === domain || email.endsWith(`@${value.replace(/^@/, '')}`);
}

async function outreachSaasExtinctionStatus() {
  const [prospects, suppressions, accounts, settings] = await Promise.all([
    store.list('prospects'), store.list('suppressions'), store.list('accounts'), store.getSettings()
  ]);
  const eligibilityByProspect = Object.fromEntries((prospects || [])
    .map(prospect => [
      prospect.id,
      prospect.recipientEligibility || prospect.legalEligibility || prospect.outreachEligibility || null
    ])
    .filter(([, value]) => value));
  const supply = compilePublicContactSupply({
    prospects,
    eligibilityByProspect,
    suppressions,
    targetDailyFirstTouches: 1000,
    targetBusinessDays: 20
  });
  const smtpAccounts = (accounts || []).filter(account =>
    account?.connected === true && String(account?.provider || '').toLowerCase() === 'smtp-relay'
  );
  const authorizedSmtp = smtpAccounts.filter(account =>
    account?.smtpRoute?.authorized === true &&
    account?.smtpRoute?.termsCompatible === true &&
    Boolean(String(account?.smtpRoute?.evidenceRef || '').trim())
  );
  const regulatoryStatus = String(settings?.outreachRegulatoryStatus || 'UNKNOWN').toUpperCase();
  const paymentLive = Boolean(settings?.livePaymentRailObserved === true);
  const buyList = compileOutreachBuyList({
    domainsOwned: OWNED_OUTREACH_DOMAINS.length,
    controlPlaneOwned: true,
    outboundSubstrate: {
      candidate: authorizedSmtp[0]?.provider || (config.providers?.maildoso?.configured ? 'maildoso' : ''),
      acquired: authorizedSmtp.length > 0,
      cashRequired: undefined,
      authorized: authorizedSmtp.length > 0,
      configured: authorizedSmtp.length > 0
    },
    paymentRail: { live: paymentLive },
    regulatory: {
      status: regulatoryStatus,
      detail: regulatoryStatus === 'PASSED'
        ? 'Campaign-specific regulatory evidence is recorded in protected runtime state.'
        : 'Current Egypt-based unsolicited cold-email path remains fail-closed pending applicable legal/regulatory evidence.'
    },
    publicContactSupply: supply,
    optionalModelProvider: Boolean(config.ai?.provider && config.ai.provider !== 'rules')
  });
  return {
    ok: true,
    version: 'uberbond.outreach-saas-extinction-status.v1',
    generatedAt: now(),
    supply,
    buyList,
    observed: {
      ownedOutreachDomains: OWNED_OUTREACH_DOMAINS.length,
      connectedSmtpAccounts: smtpAccounts.length,
      authorizedSmtpAccounts: authorizedSmtp.length,
      maildosoApiConfigured: Boolean(config.providers?.maildoso?.configured),
      paymentRailObserved: paymentLive,
      regulatoryStatus
    },
    providerCalls: 0,
    messagesSent: 0,
    spendCents: 0,
    truthBoundary: 'This status is read-only and evidence-derived. It never turns account presence, domain ownership, public contact discovery, or configured credentials into permission, deliverability, legal clearance, purchase proof, or revenue.'
  };
}

async function ownerSetupStatus() {
  const [settings, accounts, prospects, suppressions, campaigns] = await Promise.all([
    store.getSettings(), store.list('accounts'), store.list('prospects'), store.list('suppressions'), store.list('campaigns')
  ]);
  const runtimeConfig = configWithOwnerIdentity(settings);
  const evidenceProspects = prospects.filter(prospect => prospect.sourceMetadata?.authorization?.status === 'owner-evidence-recorded');
  return {
    ok: true,
    identity: ownerBusinessIdentity(settings),
    sender: {
      configured: Boolean(String(runtimeConfig.sender?.address || '').trim()),
      googleOAuthConfigured: Boolean(config.google?.clientId && config.google?.clientSecret),
      connectedSenders: accounts
        .filter(account => account.connected === true)
        .map(account => ({ slot: account.slot, email: account.email }))
    },
    recipientEvidence: {
      total: evidenceProspects.length,
      suppressionRecords: suppressions.length,
      byBasis: evidenceProspects.reduce((counts, prospect) => {
        const basis = String(prospect.sourceMetadata?.authorization?.basis || 'UNKNOWN');
        counts[basis] = (counts[basis] || 0) + 1;
        return counts;
      }, {})
    },
    campaigns: campaigns
      .filter(campaign => !campaign.systemKey)
      .map(campaign => ({ id: campaign.id, name: campaign.name, offerId: campaign.offerId || null, approved: campaign.approved === true, autoSend: campaign.autoSend === true }))
  };
}

async function saveOwnerBusinessIdentity(input = {}) {
  const legalName = String(input.legalName || '').trim();
  const senderName = String(input.senderName || '').trim();
  const company = String(input.company || '').trim();
  const postalAddress = String(input.postalAddress || '').trim();
  if (legalName.length < 2) throw new HttpError(400, 'A legal or business name is required');
  if (postalAddress.length < 12) throw new HttpError(400, 'A complete physical postal address is required');
  const identity = {
    legalName: legalName.slice(0, 180),
    senderName: senderName.slice(0, 120),
    company: (company || legalName).slice(0, 180),
    postalAddress: postalAddress.slice(0, 500),
    updatedAt: now(),
    source: 'owner-protected-settings'
  };
  await store.setSetting('businessIdentity', identity);
  await store.log('owner_business_identity_saved', {
    legalName: identity.legalName,
    company: identity.company,
    source: identity.source,
    providerCalls: 0,
    externalEffects: 0
  });
  return {
    ok: true,
    identity,
    providerCalls: 0,
    messagesSent: 0,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    truthBoundary: 'The protected business identity was stored locally. It did not contact a provider or recipient.'
  };
}

async function recordOwnerRecipient(input = {}) {
  const campaignId = String(input.campaignId || '').trim();
  if (!campaignId) throw new HttpError(400, 'campaignId is required');
  const campaign = await store.get('campaigns', campaignId);
  if (!campaign) throw new HttpError(404, 'Campaign not found');
  if (campaign.approved !== true || campaign.autoSend !== true) {
    throw new HttpError(409, 'The recipient must be attached to an approved auto-send campaign before canary preparation');
  }

  const company = String(input.company || '').trim();
  const website = String(input.website || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const authorizationBasis = String(input.authorizationBasis || '').trim().toLowerCase();
  const authorizationUrl = String(input.authorizationUrl || '').trim();
  const evidenceNote = String(input.evidenceNote || input.authorizationNote || '').trim();
  const jurisdiction = String(input.jurisdiction || '').trim().toUpperCase();
  const observedAt = new Date(String(input.observedAt || ''));
  const supportedCountry = normalizeCountryList([input.country])[0] || '';
  if (company.length < 2) throw new HttpError(400, 'Company name is required');
  if (!validHttpsUrl(website)) throw new HttpError(400, 'Website must be an HTTPS URL');
  if (!isEmail(email)) throw new HttpError(400, 'A valid exact business email is required');
  if (!OWNER_AUTHORIZATION_BASES.has(authorizationBasis)) {
    throw new HttpError(400, 'Authorization basis must be explicit consent or a direct information request');
  }
  if (!validHttpsUrl(authorizationUrl)) throw new HttpError(400, 'Authorization evidence URL must be HTTPS');
  if (evidenceNote.length < 8) throw new HttpError(400, 'Describe the authorization evidence in at least eight characters');
  if (!/^[A-Z]{2}$/.test(jurisdiction)) throw new HttpError(400, 'Jurisdiction must be a two-letter country code');
  if (!Number.isFinite(observedAt.getTime())) throw new HttpError(400, 'observedAt must be a valid timestamp');
  if (observedAt.getTime() > Date.now() + 5 * 60 * 1000) throw new HttpError(400, 'observedAt cannot be in the future');
  if (!supportedCountry) throw new HttpError(400, 'Country must be a supported country name or two-letter code');

  const domain = normalizeDomain(website);
  const prospects = await store.list('prospects');
  const sameEmail = prospects.find(prospect => String(prospect.contact?.email || '').toLowerCase() === email);
  if (sameEmail) {
    return {
      ok: true,
      idempotentReplay: true,
      prospect: sameEmail,
      providerCalls: 0,
      externalEffects: 0,
      truthBoundary: 'This exact recipient already exists in the durable prospect store. No provider or recipient was contacted.'
    };
  }
  const sameDomain = prospects.find(prospect => String(prospect.domain || normalizeDomain(prospect.website)) === domain);
  if (sameDomain) throw new HttpError(409, 'A prospect for this website domain already exists; reuse it instead of creating a duplicate');

  const suppressions = await store.list('suppressions');
  if (suppressions.some(row => suppressionMatchesEmail(row, email, domain))) {
    throw new HttpError(409, 'This recipient or domain is already suppressed');
  }

  const sourceRecordId = `owner-recipient-${crypto.createHash('sha256').update(`${email}|${website}|${campaignId}`).digest('hex').slice(0, 24)}`;
  const raw = {
    company: company.slice(0, 180),
    website,
    country: supportedCountry,
    city: String(input.city || '').trim().slice(0, 80),
    niche: String(input.niche || '').trim().slice(0, 120),
    campaignId,
    source: 'owner_import',
    sourceUrl: website,
    sourceRecordId,
    sourceMetadata: {
      intakeVersion: 'uberbond.owner-recipient-intake.v1',
      authorization: {
        status: 'owner-evidence-recorded',
        basis: OWNER_AUTHORIZATION_BASES.get(authorizationBasis),
        sourceUrl: authorizationUrl.slice(0, 600),
        evidenceNote: evidenceNote.slice(0, 1000),
        observedAt: observedAt.toISOString(),
        jurisdiction
      },
      suppression: { status: 'clear', checkedAt: now() }
    },
    contact: {
      email,
      name: String(input.name || '').trim().slice(0, 160),
      title: String(input.title || '').trim().slice(0, 160),
      source: 'owner_import',
      sourceUrl: authorizationUrl.slice(0, 600),
      observedAt: observedAt.toISOString(),
      verified: 'unknown'
    }
  };
  const result = await importProspects(store, config, [raw], campaignId);
  if (!result.added.length) throw new HttpError(409, result.skipped[0]?.reason || 'Recipient was not accepted');
  const prospect = result.added[0];
  await enqueueResearch({ limit: 1, reason: 'owner-recipient', leadId: prospect.id });
  return {
    ok: true,
    created: true,
    prospect,
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    truthBoundary: 'One exact owner-recorded recipient was stored and queued for local research. No scraping, provider call, or message send occurred.'
  };
}

async function applyUnsubscribe(token) {
  const verified = verifyUnsubscribeToken(token, config.unsubscribeSecret);
  if (!verified) throw new HttpError(400, 'This unsubscribe link is invalid or expired');
  if (verified.recipientEmail) {
    try {
      await store.add('suppressions', { id: id('sup'), value: verified.recipientEmail, reason: 'one-click-unsubscribe', createdAt: now() });
    } catch (error) { if (!(error instanceof ConflictError)) throw error; }
    await store.log('prepared_effect_unsubscribe', { email: verified.recipientEmail });
    return { ok: true };
  }
  const prospect = await store.get('prospects', verified.prospectId);
  if (!prospect?.contact?.email) throw new HttpError(404, 'The outreach record was not found');
  const email = String(prospect.contact.email).toLowerCase();
  try {
    await store.add('suppressions', { id: id('sup'), value: email, reason: 'one-click-unsubscribe', createdAt: now() });
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
  }
  await store.patch('prospects', prospect.id, { status: 'suppressed', nextFollowupAt: null, unsubscribedAt: now() });
  await store.log('one_click_unsubscribe', { prospectId: prospect.id, email });
  return { ok: true };
}

async function serveFile(res, file, contentType, cache = 'private, max-age=300') {
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { ...baseHeaders, 'content-type': contentType, 'cache-control': cache });
    res.end(data);
    return true;
  } catch { return false; }
}

async function staticFile(req, res) {
  let relative = decodeURIComponent(new URL(req.url, config.baseUrl).pathname);
  if (relative === '/') relative = '/index.html';
  if (relative.startsWith('/screenshots/')) {
    const file = path.resolve(config.screenshotDir, relative.slice('/screenshots/'.length));
    if (!file.startsWith(path.resolve(config.screenshotDir) + path.sep)) return false;
    return serveFile(res, file, 'image/png');
  }
  const file = path.resolve(root, 'public', relative.slice(1));
  if (!file.startsWith(path.resolve(root, 'public') + path.sep)) return false;
  const extension = path.extname(file);
  const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
  };
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, {
      ...baseHeaders,
      'content-type': types[extension] || 'application/octet-stream',
      'cache-control': extension === '.html' ? 'no-store' : 'public, max-age=3600',
      'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://*.lemonsqueezy.com https://*.paddle.com"
    });
    res.end(data);
    return true;
  } catch { return false; }
}

function errorStatus(error) {
  if (error instanceof HttpError || error instanceof InputError) return error.status;
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 600) return error.status;
  if (error instanceof ConflictError) return 409;
  if (error instanceof StoreError && error.code === 'FOREIGN_KEY') return 422;
  if (/Too many|cap reached/i.test(error.message)) return 429;
  if (/disabled|not configured|DATABASE_URL/i.test(error.message)) return 503;
  return 500;
}

// Global green-lane router context. The registry adapter set is created once so
// its digest-checked cache and request budget persist across requests. Companies
// House is a FREE public API: without COMPANIES_HOUSE_API_KEY it reports
// CREDENTIAL_MISSING and the UK route fails closed (nothing is bought or scraped).
const greenLaneRegistryAdapters = createRegistryAdapterRegistry([
  createCompaniesHouseAdapter({ apiKey: config.providers?.companiesHouse?.apiKey || '' })
]);

export const requestHandler = async (req, res) => {
  try {
    const url = new URL(req.url, config.baseUrl);
    const method = req.method;
    if (method === 'GET' && url.pathname === '/unsubscribe') {
      const token = url.searchParams.get('token') || '';
      const action = `/api/public/unsubscribe?token=${encodeURIComponent(token)}`;
      return text(res, 200, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stop UberBond messages</title><style>body{font-family:system-ui;background:#05070d;color:#eef1f8;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:520px;padding:32px;border:1px solid #293044;border-radius:16px;background:#0a0e19}button{padding:14px 20px;border:0;border-radius:10px;background:#f7a327;color:#111;font-weight:700}</style></head><body><main><h1>Stop future messages</h1><p>Confirm once and this address will be added to UberBond’s permanent suppression list.</p><form method="post" action="${action}"><button type="submit">Unsubscribe</button></form></main></body></html>`, 'text/html; charset=utf-8');
    }
    if (method === 'POST' && url.pathname === '/api/public/unsubscribe') {
      await bodyText(req);
      return json(res, 200, await applyUnsubscribe(url.searchParams.get('token') || ''));
    }
    if (url.pathname === '/api/owner-session/login' && method === 'POST') {
      if (!config.adminToken) return json(res, 503, { ok: false, state: 'OWNER_SESSION_DISABLED_NO_ADMIN_TOKEN' });
      if (ownerLoginLimited(req)) return json(res, 429, { ok: false, error: 'Too many attempts' });
      await bodyText(req);
      if (!bearerOk(req)) return json(res, 401, { ok: false, error: 'Unauthorized' });
      const issued = ownerSessions.issue();
      return json(res, 200, { ok: true, state: 'OWNER_SESSION_ACTIVE', expiresInDays: 30, authorityWidening: false },
        { 'set-cookie': cookieHeader(issued.value, { secure: cookieSecure(req) }), 'cache-control': 'no-store' });
    }
    if (url.pathname === '/api/owner-session/status' && method === 'GET') {
      if (!config.adminToken) return json(res, 200, { active: false, state: 'OWNER_SESSION_DISABLED_NO_ADMIN_TOKEN' });
      const verdict = authorizeOwnerCookie(ownerSessions, req);
      const extra = { 'cache-control': 'no-store' };
      if (verdict.ok) extra['set-cookie'] = cookieHeader(ownerSessions.refreshed(verdict.payload), { secure: cookieSecure(req), maxAgeMs: Math.max(60000, OWNER_SESSION_ABSOLUTE_MS - (Date.now() - verdict.payload.iat)) });
      return json(res, 200, { active: verdict.ok, state: verdict.ok ? 'OWNER_SESSION_ACTIVE' : 'OWNER_SESSION_ABSENT', reason: verdict.ok ? undefined : verdict.reason }, extra);
    }
    if (url.pathname === '/api/owner-session/logout' && method === 'POST') {
      await bodyText(req);
      const cookie = parseCookies(req.headers.cookie)[OWNER_SESSION_COOKIE];
      const verdict = cookie ? ownerSessions.verify(cookie) : { ok: false };
      if (verdict.ok) ownerSessions.revoke(verdict.sid);
      return json(res, 200, { ok: true, state: 'OWNER_SESSION_ENDED' }, { 'set-cookie': clearCookieHeader({ secure: cookieSecure(req) }), 'cache-control': 'no-store' });
    }
    const relayPath = url.pathname === '/api/agent-relay/health'
      || url.pathname === '/api/agent-relay/tasks'
      || url.pathname === '/api/agent-relay/tasks/claim'
      || /^\/api\/agent-relay\/tasks\/[^/]+\/heartbeat$/.test(url.pathname)
      || /^\/api\/agent-relay\/tasks\/[^/]+\/result$/.test(url.pathname);
    if (relayPath && !relayAuth(req)) {
      return json(res, relayConfigured() ? 401 : 503, { error: relayConfigured() ? 'Unauthorized' : 'Agent relay is not configured' });
    }
    if (relayPath && relayRateLimited(req)) {
      return json(res, 429, { error: 'Too many relay requests. Please slow down.' });
    }
    if ((url.pathname.startsWith('/api/') || url.pathname === '/oauth/google/start')
      && !relayPath && !publicApi(url.pathname) && !auth(req)) {
      return json(res, 401, { error: 'Unauthorized' });
    }

    if (method === 'GET' && url.pathname === '/api/health') {
      const [pausedState, workers, queueStats] = await Promise.all([queue.pausedState(), queue.liveWorkers(), queue.stats()]);
      return json(res, 200, { ok: true, time: now(), autopilot: config.autopilot, storeBackend: config.storeBackend, processRole: config.processRole, worker: { online: workers.length > 0, paused: Boolean(pausedState.paused), activeJobs: Number(queueStats.counts?.active || 0), workers }, version: `revenue-engine-${config.version}` });
    }
    if (method === 'GET' && url.pathname === '/api/public/config') {
      return json(res, 200, {
        brand: 'UberBond', publicAuditEnabled: config.revenue.publicIntake,
        prices: { full: config.revenue.fullAuditPrice, strategy: config.revenue.strategyAuditPrice, monitoring: config.revenue.monitoringPrice, implementationFrom: config.revenue.implementationFrom },
        bookingUrl: config.revenue.bookingUrl,
        offerCatalog: buildRevenueOfferCatalog(config.revenue)
      });
    }
    if (method === 'POST' && url.pathname === '/api/public/lead-capture') {
      if (config.leadCapture?.enabled !== true) return json(res, 404, { error: 'Lead capture is disabled' });
      const expectedSiteKey = String(config.leadCapture?.siteKey || '');
      if (!expectedSiteKey) return json(res, 503, { error: 'Lead capture site key is not configured' });
      if (!safeEqual(String(req.headers['x-uberbond-site-key'] || ''), expectedSiteKey)) return json(res, 401, { error: 'Invalid site key' });
      if (leadCaptureRateLimited(req)) return json(res, 429, { error: 'Lead capture rate limit exceeded' });
      const input = await parseBody(req);
      for (const forbidden of ['ip','ipAddress','cookie','cookies','sessionId','session','fingerprint']) {
        if (Object.hasOwn(input, forbidden)) throw new HttpError(400, `Privacy-sensitive field is not accepted: ${forbidden}`);
      }
      let record;
      try { record = buildLeadIntakeRecord(input, { now: new Date() }); }
      catch (error) { throw new HttpError(400, error.message); }
      const existing = await store.get('leadIntakeEvents', record.id);
      if (existing) return json(res, 200, { accepted: true, stored: true, idempotentReplay: true, eventId: existing.id, providerCalls: 0, externalEffects: 0 });
      await store.add('leadIntakeEvents', record);
      return json(res, 201, {
        accepted: true, stored: true, eventId: record.id, kind: record.kind,
        identityMode: record.privacy?.identityMode || 'account-only',
        providerCalls: 0, externalEffects: 0
      });
    }

    if (method === 'POST' && url.pathname === '/api/public/audit') {
      return json(res, 202, await revenue.createLead(await parseBody(req), clientIp(req)));
    }
    if (method === 'GET' && url.pathname.startsWith('/api/public/report/')) {
      const token = decodeURIComponent(url.pathname.slice('/api/public/report/'.length));
      const report = await revenue.publicReport(token);
      return report ? json(res, 200, report) : json(res, 404, { error: 'Report not found' });
    }
    if (method === 'GET' && url.pathname.startsWith('/api/public/artifacts/')) {
      const artifactId = decodeURIComponent(url.pathname.slice('/api/public/artifacts/'.length));
      if (!/^artifact_[a-z0-9-]+$/i.test(artifactId)) return json(res, 400, { error: 'Invalid artifact id' });
      const artifact = await store.getArtifact(artifactId);
      if (!artifact) return json(res, 404, { error: 'Artifact not found' });
      res.writeHead(200, {
        ...baseHeaders,
        'content-type': artifact.contentType || 'application/octet-stream',
        'content-length': String(artifact.byteSize || artifact.content.length),
        'cache-control': 'public, max-age=86400, immutable',
        etag: `"${artifact.sha256}"`
      });
      return res.end(artifact.content);
    }
    if (method === 'POST' && url.pathname === '/api/public/checkout') {
      const input = await parseBody(req);
      const lead = await revenue.leadByToken(input.token);
      if (!lead) return json(res, 404, { error: 'Report not found' });
      const checkout = revenue.checkoutFor(lead, String(input.product || 'full'));
      return checkout.configured ? json(res, 200, checkout) : json(res, 503, { error: 'Checkout is not configured yet', checkout });
    }
    if (method === 'POST' && url.pathname === '/api/public/offer-interest') {
      const input = await parseBody(req);
      const result = await revenue.registerOfferInterest(input.token, input.product);
      return json(res, result.status || (result.ok ? 200 : 400), result);
    }
    if (method === 'POST' && url.pathname === '/webhooks/lemonsqueezy') {
      const raw = await bodyText(req);
      const outcome = await revenue.handleLemonWebhook(raw, req.headers['x-signature']);
      return json(res, 200, {
        ok: outcome?.ok !== false,
        duplicate: outcome?.duplicate === true,
        eventName: outcome?.event?.eventName || null,
        providerObjectId: outcome?.event?.providerObjectId || null
      });
    }

    if (url.pathname.startsWith('/api/agent-relay')) {
      if (method === 'GET' && url.pathname === '/api/agent-relay/health') {
        const summary = await relayHealthSummary({ store });
        return json(res, 200, {
          ok: true,
          configured: relayConfigured(),
          jobType: AGENT_RELAY_JOB_TYPE,
          policyVersion: CLOUD_AGENT_RELAY_POLICY_VERSION,
          externalProviderCalls: 0,
          queue: { counts: summary.counts, total: summary.total, oldestQueuedAt: summary.oldestQueuedAt, staleLeases: summary.staleLeases },
          externalEffectLedger: {
            providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
            credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
          }
        });
      }
      if (method === 'POST' && url.pathname === '/api/agent-relay/tasks') {
        const result = await createCloudRelayTask({ queue, store, input: await parseBody(req) });
        return result.ok ? json(res, 201, result) : json(res, 400, result);
      }
      if (method === 'GET' && url.pathname === '/api/agent-relay/tasks') {
        const result = await listCloudRelayTasks({
          store,
          targetAgent: url.searchParams.get('targetAgent') || '',
          status: url.searchParams.get('status') || '',
          limit: Number(url.searchParams.get('limit') || 20)
        });
        return result.ok ? json(res, 200, result) : json(res, 400, result);
      }
      if (method === 'POST' && url.pathname === '/api/agent-relay/tasks/claim') {
        const input = await parseBody(req);
        const result = await claimCloudRelayTask({
          store,
          targetAgent: input.targetAgent || 'claude-code',
          workerId: input.workerId || `claude-code:${process.pid}`
        });
        if (result.ok) return json(res, 200, result);
        return json(res, result.status === 'EMPTY' ? 404 : 409, result);
      }
      const heartbeatMatch = url.pathname.match(/^\/api\/agent-relay\/tasks\/([^/]+)\/heartbeat$/);
      if (method === 'POST' && heartbeatMatch) {
        const taskId = decodeURIComponent(heartbeatMatch[1]);
        const input = await parseBody(req);
        const result = await heartbeatCloudRelayTask({ store, taskId, workerId: input.workerId });
        if (result.ok) return json(res, 200, result);
        const status = result.reasonCodes?.includes('task-not-found') ? 404
          : result.reasonCodes?.some(code => code === 'lease-owner-mismatch' || code === 'lease-lost-before-heartbeat') ? 409 : 400;
        return json(res, status, result);
      }
      const match = url.pathname.match(/^\/api\/agent-relay\/tasks\/([^/]+)\/result$/);
      if (method === 'POST' && match) {
        const taskId = decodeURIComponent(match[1]);
        const input = await parseBody(req);
        const result = await submitCloudRelayResult({
          store,
          taskId,
          workerId: input.workerId,
          status: input.status,
          result: input.result,
          receipt: input.receipt
        });
        if (result.ok) return json(res, 200, result);
        const status = result.reasonCodes?.includes('task-not-found') ? 404
          : result.reasonCodes?.includes('lease-owner-mismatch') ? 409 : 400;
        return json(res, status, result);
      }
      return json(res, 404, { error: 'Unknown agent relay route' });
    }

    if (method === 'GET' && url.pathname === '/api/summary') return json(res, 200, await summary());

    if (method === 'GET' && url.pathname === '/api/owner/setup') {
      return json(res, 200, await ownerSetupStatus());
    }
    if (method === 'POST' && url.pathname === '/api/owner/business-identity') {
      return json(res, 200, await saveOwnerBusinessIdentity(await parseBody(req)));
    }
    if (method === 'POST' && url.pathname === '/api/owner/recipient') {
      const result = await recordOwnerRecipient(await parseBody(req));
      return json(res, result.idempotentReplay ? 200 : 201, result);
    }

    if (method === 'GET' && url.pathname === '/api/leadgen/control-tower') {
      const sources = await nativeLeadSources();
      const tower = buildLeadControlTower({
        prospects: sources.prospects,
        signals: sources.leadSignals,
        suppressions: sources.suppressions,
        searches: sources.leadSearches,
        enrichmentRuns: sources.leadEnrichmentRuns,
        targetProfiles: sources.leadSearches.filter(row => row.kind === 'target-profile')
      });
      return json(res, 200, {
        ...tower,
        nativeLists: sources.leadLists.slice(0, 30).map(publicNativeLeadList),
        runtime: {
          persisted: true,
          leadLists: sources.leadLists.length,
          providerCalls: 0,
          externalEffects: 0
        }
      });
    }

    if (method === 'GET' && url.pathname === '/api/leadgen/providers') {
      return json(res, 200, {
        version: 'uberbond.native-provider-catalog.v1',
        providers: LEAD_PROVIDER_CATALOG.map(provider => ({ ...provider, fields: [...provider.fields] })),
        policy: LEAD_OPERATIONS_POLICY,
        providerCalls: 0,
        externalEffects: 0,
        businessEffectAuthority: 'NONE'
      });
    }

    if (method === 'POST' && url.pathname === '/api/leadgen/provider-preflight') {
      const input = await parseBody(req);
      const plan = buildProviderPreflight({
        fields: nativeLeadArrayInput(input.fields),
        providers: nativeLeadArrayInput(input.providers),
        configuredProviders: nativeLeadArrayInput(input.configuredProviders),
        volume: input.volume,
        maxProviderCalls: input.maxProviderCalls
      });
      return json(res, 200, plan);
    }

    if (method === 'POST' && url.pathname === '/api/leadgen/coverage') {
      const input = await parseBody(req);
      const sources = await nativeLeadSources();
      return json(res, 200, buildLeadCoverageMap({
        prospects: sources.prospects,
        signals: sources.leadSignals,
        suppressions: sources.suppressions,
        profile: nativeLeadProfileInput(input),
        now: new Date()
      }));
    }

    if (method === 'POST' && url.pathname === '/api/leadgen/buying-group') {
      const input = await parseBody(req);
      const sources = await nativeLeadSources();
      const profile = nativeLeadProfileInput(input);
      const accountIntelligence = buildLeadAccountIntelligence({
        prospects: sources.prospects,
        signals: sources.leadSignals,
        suppressions: sources.suppressions,
        query: { ...(profile.query || input.query || {}), minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false, skipOwned: false },
        limit: 100,
        now: new Date()
      });
      return json(res, 200, buildBuyingGroupPlan({
        accounts: accountIntelligence.accounts,
        requiredRoles: nativeLeadArrayInput(input.requiredRoles || profile.requiredPersonas),
        now: new Date()
      }));
    }

    if (method === 'POST' && url.pathname === '/api/leadgen/lookalike') {
      const input = await parseBody(req);
      const seedIds = nativeLeadArrayInput(input.seedIds || input.seeds);
      if (!seedIds.length) throw new HttpError(400, 'At least one seed prospect ID is required');
      const sources = await nativeLeadSources();
      const prospectsById = new Map(sources.prospects.map(prospect => [String(prospect.id), prospect]));
      const missing = seedIds.filter(seedId => !prospectsById.has(seedId));
      if (missing.length) throw new HttpError(404, `Seed prospect not found: ${missing.slice(0, 5).join(', ')}`);
      return json(res, 200, buildLookalikePlan({
        seeds: seedIds.map(seedId => prospectsById.get(seedId)),
        candidates: sources.prospects,
        signals: sources.leadSignals,
        suppressions: sources.suppressions,
        query: input.query && typeof input.query === 'object' ? input.query : {},
        limit: input.limit,
        now: new Date()
      }));
    }

    const leadLedgerMatch = url.pathname.match(/^\/api\/leadgen\/prospects\/([^/]+)\/ledger$/);
    if (method === 'GET' && leadLedgerMatch) {
      const prospect = await store.get('prospects', decodeURIComponent(leadLedgerMatch[1]));
      if (!prospect) return json(res, 404, { error: 'Prospect not found' });
      const sources = await nativeLeadSources();
      const requestedFreshness = Number(url.searchParams.get('freshWithinDays'));
      const freshWithinDays = Number.isFinite(requestedFreshness) && requestedFreshness > 0 ? Math.min(3650, Math.round(requestedFreshness)) : 180;
      return json(res, 200, buildLeadFieldLedger({ prospect, signals: sources.leadSignals, freshWithinDays, now: new Date() }));
    }

    if (method === 'GET' && url.pathname === '/api/leadgen/target-profiles') {
      const sources = await nativeLeadSources();
      return json(res, 200, sources.leadSearches.filter(row => row.kind === 'target-profile').slice(0, 100));
    }

    if (method === 'POST' && url.pathname === '/api/leadgen/target-profiles') {
      const input = await parseBody(req);
      const record = buildNativeTargetProfileRecord({
        name: input.name || input.profile?.name || '',
        profile: nativeLeadProfileInput(input),
        owner: input.owner || 'owner',
        now: new Date()
      });
      const existing = (await store.list('leadSearches')).find(row => row.kind === 'target-profile' && row.digest === record.digest);
      if (existing) return json(res, 200, { ...existing, idempotentReplay: true });
      await store.add('leadSearches', record);
      return json(res, 201, record);
    }

    if (method === 'GET' && url.pathname === '/api/leadgen/lists') {
      const sources = await nativeLeadSources();
      return json(res, 200, sources.leadLists.slice(0, 100).map(publicNativeLeadList));
    }

    if (method === 'POST' && url.pathname === '/api/leadgen/lists') {
      const input = await parseBody(req);
      const requestKey = idempotencyKey(req.headers['idempotency-key'] || input.idempotencyKey);
      if (!requestKey) throw new HttpError(400, 'Idempotency-Key header is required for lead-list compilation');
      const campaignId = String(input.campaignId || '').trim();
      if (campaignId && !(await store.get('campaigns', campaignId))) throw new HttpError(404, 'Campaign not found');
      const requestDigest = digestNativeLeadRequest({ ...input, idempotencyKey: requestKey });
      const existing = (await store.list('leadLists')).find(row => row.idempotencyKey === requestKey);
      if (existing) {
        if (existing.requestDigest !== requestDigest) throw new HttpError(409, 'Idempotency-Key was already used for a different lead-list request');
        return json(res, 200, { ...publicNativeLeadList(existing), idempotentReplay: true });
      }
      const sources = await nativeLeadSources();
      const list = compileNativeLeadList({
        name: input.name || '',
        profile: nativeLeadProfileInput(input),
        prospects: sources.prospects,
        signals: sources.leadSignals,
        suppressions: sources.suppressions,
        campaignId,
        limit: input.limit,
        idempotencyKey: requestKey,
        now: new Date()
      });
      list.requestDigest = requestDigest;
      await store.add('leadLists', list);
      await store.log('lead-list-compiled', { listId: list.id, selected: list.stats.selected, eligible: list.stats.eligible, providerCalls: 0, externalEffects: 0 });
      return json(res, 201, publicNativeLeadList(list));
    }

    const nativeListMatch = url.pathname.match(/^\/api\/leadgen\/lists\/([^/.]+)(?:\.(csv|json))?$/);
    if (method === 'GET' && nativeListMatch) {
      const list = await store.get('leadLists', decodeURIComponent(nativeListMatch[1]));
      if (!list) return json(res, 404, { error: 'Lead list not found' });
      if (nativeListMatch[2] === 'csv') {
        return text(res, 200, nativeLeadListCsv(list), 'text/csv; charset=utf-8', { 'content-disposition': `attachment; filename="${list.id}.csv"` });
      }
      return json(res, 200, publicNativeLeadList(list));
    }

    if (method === 'POST' && url.pathname === '/api/leadgen/enrichment/plan') {
      const input = await parseBody(req);
      const prospectId = String(input.prospectId || '').trim();
      if (!prospectId) throw new HttpError(400, 'prospectId is required');
      const prospect = await store.get('prospects', prospectId);
      if (!prospect) throw new HttpError(404, 'Prospect not found');
      const plan = compileNativeEnrichmentPlan({ prospect, fields: input.fields, providers: input.providers, now: new Date() });
      const existing = (await store.list('leadEnrichmentRuns')).find(row => row.prospectId === prospectId && row.planId === plan.planId);
      if (existing) return json(res, 200, { ...existing.result, idempotentReplay: true });
      const record = { id: `enrichplan_${plan.planId.slice(-24)}`, prospectId, planId: plan.planId, provider: 'plan-only', status: 'planned', result: plan, createdAt: now(), updatedAt: now(), providerCalls: 0, externalEffects: 0 };
      await store.add('leadEnrichmentRuns', record);
      return json(res, 201, plan);
    }

    if (method === 'POST' && url.pathname === '/api/leadgen/enrichment/local') {
      const input = await parseBody(req);
      const prospectId = String(input.prospectId || '').trim();
      if (!prospectId) throw new HttpError(400, 'prospectId is required');
      const prospect = await store.get('prospects', prospectId);
      if (!prospect) throw new HttpError(404, 'Prospect not found');
      const sources = await nativeLeadSources();
      const result = compileNativeLocalEnrichment({ prospect, fields: input.fields, signals: sources.leadSignals, now: new Date() });
      const existing = sources.leadEnrichmentRuns.find(row => row.id === result.id || row.planId === result.planId);
      if (existing) return json(res, 200, { ...result, idempotentReplay: true, storedRun: existing });
      await store.add('leadEnrichmentRuns', {
        id: result.id,
        prospectId: result.prospectId,
        planId: result.planId,
        provider: result.provider,
        status: result.status,
        result: result.result,
        ledger: result.ledger,
        digest: result.digest,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        providerCalls: 0,
        externalEffects: 0
      });
      for (const fieldResult of result.fieldResults) await store.upsert('leadFieldResults', fieldResult);
      return json(res, 201, result);
    }

    const capacityRoute = method === 'GET' && url.pathname === '/api/leadgen/capacity-plan'
      ? Object.fromEntries(url.searchParams.entries()) : method === 'POST' && url.pathname === '/api/leadgen/capacity-plan' ? await parseBody(req) : null;
    if (capacityRoute) {
      let senderCells = capacityRoute.senderCells || [];
      if (typeof senderCells === 'string') {
        try { senderCells = JSON.parse(senderCells); } catch { throw new HttpError(400, 'senderCells must be valid JSON'); }
      }
      const plan = buildNativeCapacityPlan({
        monthlyMessages: capacityRoute.monthlyMessages,
        activeDaysPerMonth: capacityRoute.activeDaysPerMonth,
        senderCells,
        targetReplyRate: capacityRoute.targetReplyRate,
        targetCloseRate: capacityRoute.targetCloseRate,
        averagePriceUsd: capacityRoute.averagePriceUsd,
        now: new Date()
      });
      return json(res, 200, plan);
    }

    if (method === 'GET' && url.pathname === '/api/leadgen/intelligence') {
      return json(res, 200, await buildLiveLeadGenerationSnapshot({ store }));
    }
    // Exact, read-only prospect contact-history preflight. Admin-authenticated
    // like every /api route, and additionally fail-closed when no admin token is
    // configured (the shared auth() treats "no token" as open, which is wrong
    // for a route that reveals who has been contacted). It reads the raw
    // ledgers, never aggregates, never writes, and has zero send authority.
    if (method === 'GET' && url.pathname === '/api/prospect-preflight/contact-history') {
      if (!config.adminToken) return json(res, 503, { error: 'Admin token must be configured for prospect preflight reads', status: 'CHECK_FAILED' });
      const receipt = await checkContactHistory({
        store,
        email: String(url.searchParams.get('email') || ''),
        domain: String(url.searchParams.get('domain') || ''),
        now: new Date()
      });
      return json(res, 200, config.encryptionKey && /^[a-f0-9]{64}$/i.test(String(config.encryptionKey))
        ? signContactHistoryReceipt(receipt, config.encryptionKey)
        : receipt);
    }
    // Outreach economics: cost per verified/eligible prospect, per provider-confirmed
    // send, per qualified positive reply, per opportunity, per cleared dollar,
    // cleared contribution per 1,000 sends and per founder minute. Read-only;
    // unknown costs stay UNKNOWN; revenue is provider-reconciled net cleared only.
    if (method === 'GET' && url.pathname === '/api/outreach/economics') {
      const at = new Date();
      return json(res, 200, { ...(await buildOutreachEconomicsSnapshot({ store, now: at })), routeEconomics: await buildRouteEconomics({ store, now: at }) });
    }
    // Global green-lane readiness: per-rule policy-evidence freshness (what a live
    // researcher must refresh), the jurisdiction matrix, the registry adapter state
    // (credential PRESENCE only, never its value) and the provider governance gate.
    // Read-only, admin-authenticated, fail-closed without an admin token, no authority.
    if (method === 'GET' && url.pathname === '/api/outreach/green-lane/status') {
      if (!config.adminToken) return json(res, 503, { error: 'Admin token must be configured for green-lane status', state: 'UNKNOWN_FAIL_CLOSED' });
      const at = new Date();
      const registry = loadPolicyEvidenceBundle({ now: at });
      const governance = providerRoutePolicy(config.outbound?.provider || 'smtp-relay', 'PUBLIC_BUSINESS_CONTACT');
      return json(res, 200, {
        version: 'uberbond.green-lane-status.v1',
        evaluatedAt: at.toISOString(),
        policyEvidence: compilePolicyEvidenceStatus(registry, { now: at }),
        jurisdictionMatrix: compileJurisdictionMatrix({ policyRegistry: registry, now: at }),
        registries: { adapters: greenLaneRegistryAdapters.jurisdictions(), refused: greenLaneRegistryAdapters.refused, companiesHouse: { zeroCost: true, credentialConfigured: Boolean(config.providers?.companiesHouse?.configured) } },
        governanceGate: { provider: config.outbound?.provider || 'smtp-relay', routeType: 'PUBLIC_BUSINESS_CONTACT', refused: governance.ok !== true, reason: governance.reason },
        routeEconomics: await buildRouteEconomics({ store, now: at }),
        coldDispatch: 'INTENTIONALLY_CLOSED',
        sendAuthority: false, externalEffectAuthority: 'NONE', externalEffects: 0, newRecurringCostUsd: 0
      });
    }
    // Lead generator -> preflight handoff: highest-fit uncontacted, unsuppressed
    // prospects per offer, with the exact evidence still missing. Read-only; it
    // fetches nothing, guesses no address and grants no contact authority.
    if (method === 'GET' && url.pathname === '/api/prospect-preflight/candidates') {
      const at = new Date();
      return json(res, 200, await buildPreflightHandoff({ store, perOffer: Number(url.searchParams.get('perOffer') || 3), mode: String(url.searchParams.get('mode') || 'DEFAULT'), policyRegistry: loadPolicyEvidenceBundle({ now: at }), now: at }));
    }
    // Sender-fleet expansion PLAN. OBSERVED state is read from the store
    // (connected smtp-relay accounts, sender-health pauses); the target comes
    // from the request. It is a plan only: no purchase, DNS write, mailbox
    // creation or provider call happens here, and no cap is raised.
    if (method === 'POST' && url.pathname === '/api/outbound/fleet/expansion-plan') {
      if (!config.adminToken) return json(res, 503, { error: 'Admin token must be configured for fleet planning' });
      const input = await parseBody(req) || {};
      const [accounts, senderHealth] = await Promise.all([store.list('accounts'), store.list('senderHealth')]);
      const paused = new Set(senderHealth.filter(row => row.paused === true).map(row => String(row.inbox || '')));
      const stageForCap = cap => (cap >= 10 ? 3 : cap >= 5 ? 2 : cap >= 2 ? 1 : 0);
      const mailboxes = accounts.filter(account => String(account.provider || '').toLowerCase() === 'smtp-relay').map((account, index) => ({
        ordinal: index + 1, address: account.email, smtpVerified: account.connected === true,
        imapVerified: false, quarantined: paused.has(String(account.slot || '')),
        quarantineReason: paused.has(String(account.slot || '')) ? 'SENDER_HEALTH_PAUSED' : null,
        rampStage: stageForCap(Number(account.currentDailyCap ?? account.plannedDailyCap ?? 0))
      }));
      return json(res, 200, compileSenderFleetExpansionPlan({
        observed: { entitlement: null, mailboxes, domains: [] },
        target: input.target && typeof input.target === 'object' ? input.target : {},
        demand: input.demand && typeof input.demand === 'object' ? input.demand : null,
        authorizations: Array.isArray(input.authorizations) ? input.authorizations : [],
        retirementDecisions: Array.isArray(input.retirementDecisions) ? input.retirementDecisions : [],
        now: new Date()
      }));
    }
    // PROSPECT_PREFLIGHT: the single generic, zero-authority preflight operation.
    // Same boundary as the contact-history read: admin-authenticated, fail-closed
    // when no admin token is configured, store.list only, no provider call, no
    // write, no send authority in any returned state.
    if (method === 'POST' && url.pathname === '/api/prospect-preflight') {
      if (!config.adminToken) return json(res, 503, { error: 'Admin token must be configured for prospect preflight', state: 'BLOCKED_CONTACT_HISTORY' });
      const input = await parseBody(req) || {};
      const run = (body, internal = {}) => runProspectPreflight({
        store, record: body.record && typeof body.record === 'object' && !Array.isArray(body.record) ? body.record : null,
        slots: body.slots && typeof body.slots === 'object' && !Array.isArray(body.slots) ? body.slots : {},
        artifactRef: typeof body.artifactRef === 'string' ? body.artifactRef : '',
        identity: body.identity && typeof body.identity === 'object' ? body.identity : {},
        senderSide: body.senderSide && typeof body.senderSide === 'object' ? body.senderSide : {},
        campaign: body.campaign && typeof body.campaign === 'object' ? body.campaign : {},
        prepareEffect: body.prepareEffect === true,
        unsubscribeFactory: recipientEmail => preparedRecipientUnsubscribeUrls(config.baseUrl, recipientEmail, config.unsubscribeSecret),
        policyRegistry: loadPolicyEvidenceBundle({ now: new Date() }), registryAdapters: greenLaneRegistryAdapters,
        globalRoute: body.globalRoute && typeof body.globalRoute === 'object' && !Array.isArray(body.globalRoute) ? body.globalRoute : {},
        now: new Date(), ...internal
      });
      if (input.freezeEffect === true || input.frozenEffectDigest !== undefined) {
        const settings = await store.getSettings();
        const identity = ownerBusinessIdentity(settings);
        if (!identity) return json(res, 409, { error: 'Protected owner identity is required', sendAuthority: false });
        if (input.frozenEffectDigest !== undefined) {
          if (Object.keys(input).some(k => k !== 'frozenEffectDigest')) return json(res, 400, { error: 'Frozen validation accepts only its digest; payload overrides are forbidden', sendAuthority: false });
          const snapshot = settings[`frozenProspectEffect:${input.frozenEffectDigest}`];
          const campaign = snapshot ? await store.get('campaigns', snapshot.input?.campaign?.campaignId) : null;
          return json(res, 200, await validateFrozenProspectEffect({ store, digest: input.frozenEffectDigest, secret: config.unsubscribeSecret, run, identity, campaign }));
        }
        const campaign = typeof input.campaign?.campaignId === 'string' ? await store.get('campaigns', input.campaign.campaignId) : null;
        if (!campaign || (campaign.offerId && campaign.offerId !== input.record?.corporateRoleScope?.offerId)) return json(res, 409, { error: 'An existing compatible campaign is required for effect lineage', sendAuthority: false });
        if (identity.legalName !== input.identity?.legalBusinessSenderName || identity.postalAddress !== input.identity?.authorizedPublicPostalAddress || identity.senderName !== input.identity?.displaySenderName || identity.company !== input.identity?.company) return json(res, 409, { error: 'Input identity must match protected owner identity', sendAuthority: false });
        return json(res, 200, await prepareFrozenProspectEffect({ store, input, secret: config.unsubscribeSecret, run, identity, campaign }));
      }
      const preparationCampaign = input.prepareEffect === true && typeof input.campaign?.campaignId === 'string' ? await store.get('campaigns', input.campaign.campaignId) : null;
      if (input.prepareEffect === true && (!preparationCampaign || (preparationCampaign.offerId && preparationCampaign.offerId !== input.record?.corporateRoleScope?.offerId))) return json(res, 409, { error: 'An existing compatible campaign is required for effect lineage', sendAuthority: false });
      return json(res, 200, await runProspectPreflight({
        store,
        record: input.record && typeof input.record === 'object' && !Array.isArray(input.record) ? input.record : null,
        slots: input.slots && typeof input.slots === 'object' && !Array.isArray(input.slots) ? input.slots : {},
        artifactRef: typeof input.artifactRef === 'string' ? input.artifactRef : '',
        identity: input.identity && typeof input.identity === 'object' ? input.identity : {},
        senderSide: input.senderSide && typeof input.senderSide === 'object' ? input.senderSide : {},
        campaign: input.campaign && typeof input.campaign === 'object' ? input.campaign : {},
        prepareEffect: input.prepareEffect === true,
        unsubscribeFactory: recipientEmail => preparedRecipientUnsubscribeUrls(config.baseUrl, recipientEmail, config.unsubscribeSecret),
        policyRegistry: loadPolicyEvidenceBundle({ now: new Date() }),
        registryAdapters: greenLaneRegistryAdapters,
        globalRoute: input.globalRoute && typeof input.globalRoute === 'object' && !Array.isArray(input.globalRoute) ? input.globalRoute : {},
        now: new Date()
      }));
    }
    if (method === 'POST' && url.pathname === '/api/leadgen/handoff') {
      const input = await parseBody(req) || {};
      const campaign = input.campaignId ? await store.get('campaigns', input.campaignId) : null;
      if (input.campaignId && !campaign) return json(res, 404, { error: 'Campaign not found' });
      return json(res, 200, await buildLiveLeadHandoff({
        store,
        campaign,
        query: input.query && typeof input.query === 'object' ? input.query : {},
      }));
    }
    const listRoutes = new Map([
      ['/api/prospects', 'prospects'], ['/api/leads', 'leads'], ['/api/orders', 'orders'],
      ['/api/subscriptions', 'subscriptions'], ['/api/monitoring-runs', 'monitoringRuns'],
      ['/api/notifications', 'notifications'], ['/api/replies', 'replies'], ['/api/social-tasks', 'socialTasks'],
      ['/api/campaigns', 'campaigns'], ['/api/discovery-runs', 'discoveryRuns'], ['/api/jobs', 'jobs'],
      ['/api/outbound-reservations', 'outboundReservations'], ['/api/outbound-events', 'outboundEvents'], ['/api/sender-health', 'senderHealth']
    ]);
    if (method === 'GET' && listRoutes.has(url.pathname)) {
      return json(res, 200, (await store.list(listRoutes.get(url.pathname))).reverse());
    }
    if (method === 'GET' && url.pathname.startsWith('/api/prospects/')) {
      const prospect = await store.get('prospects', url.pathname.split('/').pop());
      return prospect ? json(res, 200, prospect) : json(res, 404, { error: 'Prospect not found' });
    }
    if (method === 'GET' && url.pathname === '/api/discovery/config') {
      return json(res, 200, {
        enabled: config.discovery.enabled, dryRun: config.discovery.dryRun, dailyCap: config.discovery.dailyCap,
        bbox: config.discovery.bbox, categories: config.discovery.categories, country: config.discovery.country,
        city: config.discovery.city, supportedCategories: Object.keys(DISCOVERY_CATEGORIES)
      });
    }

    if (method === 'POST' && url.pathname === '/api/outbound/smtp-accounts/import') {
      const input = await parseBody(req);
      if (input.confirmCredentialImport !== true) throw new HttpError(400, 'confirmCredentialImport must be true');
      if (!/^[a-f0-9]{64}$/i.test(String(config.encryptionKey || ''))) throw new HttpError(409, 'TOKEN_ENCRYPTION_KEY must be configured before SMTP credential import');
      const rows = Array.isArray(input.accounts) ? input.accounts.slice(0, 500) : [];
      if (!rows.length) throw new HttpError(400, 'accounts must contain at least one SMTP mailbox');
      const prepared = rows.map(row => buildEncryptedSmtpAccount({
        ...row,
        provider: 'smtp-relay',
        routeAuthorized: row.routeAuthorized === true,
        termsCompatible: row.termsCompatible === true
      }, config.encryptionKey));
      const failed = prepared.map((row,index)=>({index,row})).filter(item=>!item.row.ok);
      if (failed.length) return json(res, 400, {
        ok: false,
        status: 'SMTP_ACCOUNT_IMPORT_REFUSED',
        failures: failed.map(item=>({index:item.index,reasonCodes:item.row.reasonCodes})),
        imported: 0
      });
      for (const item of prepared) await store.upsert('accounts', { ...item.account, createdAt: now(), updatedAt: now() });
      await store.log('smtp_account_fleet_imported', {
        count: prepared.length,
        provider: 'smtp-relay',
        slots: prepared.map(item=>item.account.slot),
        credentialStorage: 'AES_256_GCM_ENCRYPTED',
        plaintextCredentialsLogged: false
      });
      return json(res, 201, {
        ok: true,
        status: 'SMTP_ACCOUNT_FLEET_IMPORTED',
        imported: prepared.length,
        accounts: prepared.map(item=>({
          id:item.account.id,slot:item.account.slot,email:item.account.email,provider:item.account.provider,
          sendingDomainId:item.account.sendingDomainId,sendingMailboxId:item.account.sendingMailboxId
        }))
      });
    }

    const winnrUnavailable = () => ({
      ok: false,
      status: 'UBERWINNR_RUNTIME_BLOCKED',
      reasonCodes: winnr?.reasonCodes || ['configured-winnr-client-required'],
      providerCalls: 0,
      spendCents: 0
    });
    const winnrRows = value => {
      if (Array.isArray(value)) return value;
      if (!value || typeof value !== 'object') return [];
      for (const key of ['items','results','domains','email_users','users','data']) {
        if (Array.isArray(value[key])) return value[key];
      }
      return [];
    };
    const winnrDomainObserved = (value, wanted, depth = 0) => {
      if (depth > 5 || value == null) return false;
      if (typeof value === 'string') return value.trim().toLowerCase() === String(wanted || '').trim().toLowerCase();
      if (Array.isArray(value)) return value.some(item => winnrDomainObserved(item, wanted, depth + 1));
      if (typeof value !== 'object') return false;
      if (['domain','name'].some(key => typeof value[key] === 'string' && value[key].trim().toLowerCase() === String(wanted || '').trim().toLowerCase())) return true;
      return Object.values(value).some(item => item && typeof item === 'object' && winnrDomainObserved(item, wanted, depth + 1));
    };

    if (method === 'GET' && url.pathname === '/api/providers/winnr/account') {
      if (!winnr?.ok) return json(res, 503, winnrUnavailable());
      const result = await winnr.getAccount();
      return json(res, result.ok ? 200 : 502, result);
    }
    if (method === 'GET' && url.pathname === '/api/providers/winnr/usage') {
      if (!winnr?.ok) return json(res, 503, winnrUnavailable());
      const result = await winnr.getUsage();
      return json(res, result.ok ? 200 : 502, result);
    }
    if (method === 'GET' && url.pathname === '/api/providers/winnr/jobs') {
      if (!winnr?.ok) return json(res, 503, winnrUnavailable());
      const result = await winnr.listJobs({
        limit: Number(url.searchParams.get('limit') || 25),
        status: url.searchParams.get('status') || '',
        jobType: url.searchParams.get('type') || ''
      });
      return json(res, result.ok ? 200 : 502, result);
    }
    if (method === 'GET' && url.pathname === '/api/providers/winnr/prewarmed') {
      if (!winnr?.ok) return json(res, 503, winnrUnavailable());
      const result = await winnr.browsePrewarmed({
        search: url.searchParams.get('search') || '',
        sortBy: url.searchParams.get('sortBy') || 'health',
        includeAll: url.searchParams.get('includeAll') === 'true',
        page: Number(url.searchParams.get('page') || 1),
        perPage: Number(url.searchParams.get('perPage') || 50)
      });
      return json(res, result.ok ? 200 : 502, result);
    }
    if (method === 'GET' && url.pathname === '/api/providers/winnr/prewarmed/my') {
      if (!winnr?.ok) return json(res, 503, winnrUnavailable());
      const result = await winnr.listMyPrewarmed();
      return json(res, result.ok ? 200 : 502, result);
    }
    const winnrPrewarmedBlocklistMatch = url.pathname.match(/^\/api\/providers\/winnr\/prewarmed\/([^/]+)\/blocklist$/);
    if (method === 'GET' && winnrPrewarmedBlocklistMatch) {
      if (!winnr?.ok) return json(res, 503, winnrUnavailable());
      const result = await winnr.checkPrewarmedBlocklist({
        domain: decodeURIComponent(winnrPrewarmedBlocklistMatch[1]),
        blocklist: url.searchParams.get('list') || ''
      });
      return json(res, result.ok ? 200 : 502, result);
    }
    const winnrPrewarmedMatch = url.pathname.match(/^\/api\/providers\/winnr\/prewarmed\/([^/]+)$/);
    if (method === 'GET' && winnrPrewarmedMatch) {
      if (!winnr?.ok) return json(res, 503, winnrUnavailable());
      const result = await winnr.getPrewarmed({ domain: decodeURIComponent(winnrPrewarmedMatch[1]) });
      return json(res, result.ok ? 200 : 502, result);
    }
    if (method === 'GET' && url.pathname === '/api/providers/winnr/prepurchase') {
      const targetDailyCold = Math.max(1, Math.min(5000, Number(url.searchParams.get('targetDailyCold') || 45)));
      const maxPilotSpendUsd = Math.max(0, Number(url.searchParams.get('maxPilotSpendUsd') || 15));
      if (!winnr?.ok) {
        const frontier = compileWinnrProcurementFrontier({
          targetDailyCold,
          firstCashUrgent: true,
          publicTermsCurrent: config.providers?.winnr?.termsCompatible === true,
          publicTermsCompatible: config.providers?.winnr?.termsCompatible === true,
          checkoutObserved: false,
          countryPaymentAccepted: false,
          inventoryObserved: false,
          exactFirstChargeObserved: false,
          maxPilotSpendUsd
        });
        return json(res, 503, { ...winnrUnavailable(), frontier });
      }
      const account = await winnr.getAccount();
      const usage = account.ok ? await winnr.getUsage() : { ok:false, providerCalls:0, status:'SKIPPED_ACCOUNT_READ_FAILED' };
      const inventory = account.ok ? await winnr.browsePrewarmed({ sortBy:'health', page:1, perPage:50 }) : { ok:false, providerCalls:0, status:'SKIPPED_ACCOUNT_READ_FAILED' };
      const inventoryRows = inventory.ok ? winnrRows(inventory.data) : [];
      const frontier = compileWinnrProcurementFrontier({
        targetDailyCold,
        firstCashUrgent: true,
        publicTermsCurrent: config.providers?.winnr?.termsCompatible === true,
        publicTermsCompatible: config.providers?.winnr?.termsCompatible === true,
        checkoutObserved: false,
        countryPaymentAccepted: false,
        inventoryObserved: inventory.ok && inventoryRows.length > 0,
        exactFirstChargeObserved: false,
        maxPilotSpendUsd
      });
      return json(res, account.ok && usage.ok && inventory.ok ? 200 : 502, {
        ok: account.ok && usage.ok && inventory.ok,
        status: account.ok && usage.ok && inventory.ok ? 'UBERWINNR_PREPURCHASE_OBSERVED' : 'UBERWINNR_PREPURCHASE_PARTIAL',
        account, usage, inventory, frontier,
        providerCalls: Number(account.providerCalls||0)+Number(usage.providerCalls||0)+Number(inventory.providerCalls||0),
        spendCents: 0,
        purchaseAuthority: 'NONE'
      });
    }
    if (method === 'POST' && url.pathname === '/api/providers/winnr/export') {
      if (!winnr?.ok) return json(res, 503, winnrUnavailable());
      const input = await parseBody(req);
      if (input.confirmCredentialExport !== true) throw new HttpError(400, 'confirmCredentialExport must be true');
      const result = await winnr.exportMailboxes({
        format: input.format || 'default',
        domains: Array.isArray(input.domains) ? input.domains : [],
        emails: Array.isArray(input.emails) ? input.emails : [],
        allDomains: input.allDomains === true,
        writeAuthorized: true
      });
      return json(res, result.ok ? 200 : result.status === 'UBERWINNR_WRITE_OUTCOME_UNCERTAIN' ? 409 : 400, result);
    }
    if (method === 'POST' && url.pathname === '/api/providers/winnr/postpurchase/import') {
      if (!winnr?.ok) return json(res, 503, winnrUnavailable());
      const input = await parseBody(req);
      if (input.confirmCredentialImport !== true) throw new HttpError(400, 'confirmCredentialImport must be true');
      if (input.confirmRouteUse !== true) throw new HttpError(400, 'confirmRouteUse must be true');
      if (!/^[a-f0-9]{64}$/i.test(String(config.encryptionKey || ''))) throw new HttpError(409, 'TOKEN_ENCRYPTION_KEY must be configured before Winnr credential import');
      const csvText = String(input.csvText || '');
      if (!csvText.trim()) throw new HttpError(400, 'csvText is required');
      const plan = compileWinnrPostPurchaseRegistryPlan({
        csvText,
        workspaceId: input.workspaceId || 'uberbond-outreach',
        providerDomainId: input.providerDomainId || '',
        providerMailboxIdsByEmail: input.providerMailboxIdsByEmail || {},
        plannedDailyCap: Math.max(0, Math.min(2, Number(input.plannedDailyCap ?? 2)))
      });
      if (!plan.ok) return json(res, 400, plan);

      const owned = await winnr.listMyPrewarmed();
      if (!owned.ok) return json(res, 409, {
        ok:false,status:'WINNR_POSTPURCHASE_ENTITLEMENT_UNRECONCILED',
        reasonCodes:['provider-owned-prewarmed-read-required'],
        providerReceipt:owned.receipt||null,
        automaticRetryAuthorized:false
      });
      if (!winnrDomainObserved(owned.data, plan.domain.domain)) return json(res, 409, {
        ok:false,status:'WINNR_POSTPURCHASE_ENTITLEMENT_UNRECONCILED',
        reasonCodes:['credential-export-domain-not-observed-in-provider-account'],
        observedDomain:plan.domain.domain,
        providerReceipt:owned.receipt||null,
        automaticRetryAuthorized:false
      });

      const providerDigest = String(owned.receipt?.responseDigest || '').trim();
      if (!providerDigest) return json(res, 409, {
        ok:false,status:'WINNR_POSTPURCHASE_ENTITLEMENT_UNRECONCILED',
        reasonCodes:['provider-entitlement-receipt-digest-required'],
        automaticRetryAuthorized:false
      });
      const applied = await applyWinnrPostPurchaseRegistryPlan({store,plan,date:new Date()});
      if (!applied.ok) return json(res, 409, applied);
      const routeEvidenceRef = `winnr:list-my-prewarmed:${providerDigest}`;
      const prepared = compileWinnrCredentialImport({
        csvText,
        encryptionKey: config.encryptionKey,
        workspaceId: plan.workspaceId,
        linksByEmail: applied.linksByEmail,
        routeEvidenceRef,
        routeAuthorized: true,
        termsCompatible: config.providers?.winnr?.termsCompatible === true,
        plannedDailyCap: 2,
        plannedHourlyCap: 1,
        minGapSeconds: Math.max(900, Number(config.outbound?.canaryMinGapSeconds || 1800))
      });
      if (!['IMPORT_READY','PARTIAL_IMPORT_READY'].includes(prepared.status) || prepared.failureCount) {
        return json(res, 400, prepared);
      }
      for (const row of prepared.prepared) {
        await store.upsert('accounts', { ...row.smtpAccount, createdAt: now(), updatedAt: now() });
        await store.upsert('accounts', { ...row.imapAccount, createdAt: now(), updatedAt: now() });
      }
      await store.log('winnr_postpurchase_credentials_imported', {
        domainId: plan.domain.domainId,
        domain: plan.domain.domain,
        mailboxCount: prepared.preparedCount,
        accountRowsWritten: prepared.preparedCount * 2,
        providerEvidenceRef: routeEvidenceRef,
        credentialStorage: 'AES_256_GCM_ENCRYPTED',
        plaintextCredentialsLogged: false,
        plannedDailyCap: 2
      });
      return json(res, 201, {
        ok:true,
        status:'WINNR_POSTPURCHASE_IMPORTED',
        domainId:plan.domain.domainId,
        mailboxes:prepared.prepared.map(row=>({
          email:row.email,
          smtpAccountId:row.smtpAccount.id,
          imapAccountId:row.imapAccount.id,
          sendingDomainId:row.smtpAccount.sendingDomainId,
          sendingMailboxId:row.smtpAccount.sendingMailboxId
        })),
        providerEvidenceRef:routeEvidenceRef,
        plaintextCredentialsReturned:false,
        messagesSent:0,
        spendCents:0
      });
    }

    const maildosoReadMatch = url.pathname.match(/^\/api\/providers\/maildoso\/read\/([^/]+)$/);
    if (method === 'GET' && maildosoReadMatch) {
      const result = await maildoso.read(decodeURIComponent(maildosoReadMatch[1]), {
        query: Object.fromEntries(url.searchParams.entries())
      });
      return json(res, result.ok ? 200 : (result.status === 'UBERMAILDOSO_NOT_CONFIGURED' ? 503 : 400), result);
    }
    const maildosoMutationMatch = url.pathname.match(/^\/api\/providers\/maildoso\/mutate\/([^/]+)$/);
    if (method === 'POST' && maildosoMutationMatch) {
      const input = await parseBody(req);
      const result = await maildoso.mutate(decodeURIComponent(maildosoMutationMatch[1]), {
        body: input.body, params: input.params, query: input.query, approval: input.approval
      });
      return json(res, result.ok ? 200 : (result.status === 'UBERMAILDOSO_NOT_CONFIGURED' ? 503 : result.status === 'UBERMAILDOSO_MUTATION_OUTCOME_UNCERTAIN' ? 409 : 400), result);
    }

    if (method === 'POST' && url.pathname === '/api/outbound/imap-forwarding/import') {
      const input = await parseBody(req);
      if (input.confirmCredentialImport !== true) throw new HttpError(400, 'confirmCredentialImport must be true');
      if (!/^[a-f0-9]{64}$/i.test(String(config.encryptionKey || ''))) throw new HttpError(409, 'TOKEN_ENCRYPTION_KEY must be configured before IMAP credential import');
      const prepared = buildEncryptedImapAccount({
        slot: input.slot,
        email: input.email,
        host: input.host,
        port: input.port,
        secure: input.secure,
        username: input.username,
        password: input.password,
        evidenceRef: input.evidenceRef,
        authorized: input.authorized === true,
        termsCompatible: input.termsCompatible === true
      }, config.encryptionKey);
      if (!prepared.ok) return json(res, 400, prepared);
      await store.upsert('accounts', { ...prepared.account, createdAt: now(), updatedAt: now() });
      await store.log('imap_forwarding_account_imported', {
        accountId: prepared.account.id,
        slot: prepared.account.slot,
        provider: prepared.account.provider,
        credentialStorage: 'AES_256_GCM_ENCRYPTED',
        plaintextCredentialsLogged: false
      });
      return json(res, 201, {
        ok: true,
        status: 'IMAP_FORWARDING_ACCOUNT_IMPORTED',
        account: { id: prepared.account.id, slot: prepared.account.slot, email: prepared.account.email, provider: prepared.account.provider }
      });
    }

    if (method === 'GET' && url.pathname === '/api/outbound/saas-extinction') {
      return json(res, 200, await outreachSaasExtinctionStatus());
    }

    if (method === 'GET' && url.pathname === '/api/outbound/canary/status') {
      return json(res, 200, await outreachCanaryStatus());
    }
    if (method === 'POST' && url.pathname === '/api/outbound/approve-prospect') {
      const input = await parseBody(req);
      input.idempotencyKey = idempotencyKey(req.headers['idempotency-key'] || input.idempotencyKey);
      return json(res, 200, await approveOutreachCanary(input));
    }
    if (method === 'POST' && url.pathname === '/api/outbound/canary/start') {
      return json(res, 202, await startOutreachCanary(await parseBody(req)));
    }
    if (method === 'POST' && url.pathname === '/api/outbound/revoke-prospect-approval') {
      return json(res, 200, await revokeOutreachCanary(await parseBody(req)));
    }

    if (method === 'POST' && url.pathname === '/api/outbound/pause') {
      const input = await parseBody(req);
      return json(res, 200, await store.setOutboundPaused(true, input.reason || 'Paused from command center'));
    }
    if (method === 'POST' && url.pathname === '/api/outbound/resume') {
      return json(res, 200, await store.setOutboundPaused(false, ''));
    }
    const senderPauseMatch = url.pathname.match(/^\/api\/outbound\/sender\/([^/]+)\/pause$/);
    if (method === 'POST' && senderPauseMatch) {
      const slot = decodeURIComponent(senderPauseMatch[1]);
      const input = await parseBody(req);
      return json(res, 200, await store.setSenderPaused(slot, true, input.reason || 'Paused from command center'));
    }
    const senderResumeMatch = url.pathname.match(/^\/api\/outbound\/sender\/([^/]+)\/resume$/);
    if (method === 'POST' && senderResumeMatch) {
      const slot = decodeURIComponent(senderResumeMatch[1]);
      return json(res, 200, await store.setSenderPaused(slot, false, ''));
    }

    if (method === 'POST' && url.pathname === '/api/campaigns') {
      const input = await parseBody(req);
      const requestKey = idempotencyKey(req.headers['idempotency-key'] || input.idempotencyKey);
      if (!requestKey) throw new HttpError(400, 'Idempotency-Key header is required for campaign creation');
      const offerId = String(input.offerId || '').trim().toUpperCase();
      const selectedOffer = offerId ? getUberReplyOffer(offerId) : null;
      if (offerId && !selectedOffer) throw new HttpError(400, 'offerId must be one of the four final UberReply offers');
      const campaign = {
        id: id('camp'), name: input.name || 'Untitled campaign', niche: input.niche || '', offer: input.offer || selectedOffer?.publicName || '', offerId: offerId || undefined,
        allowedCountries: normalizeCountryList(Array.isArray(input.allowedCountries) ? input.allowedCountries : String(input.allowedCountries || '').split(',')),
        minScore: Math.max(50, Math.min(95, Number(input.minScore || 60))),
        dailyCaps: {
          A: Math.min(config.caps.A, Number(input.dailyCapA || config.caps.A)),
          B: Math.min(config.caps.B, Number(input.dailyCapB || config.caps.B))
        },
        maxFollowups: Math.min(1, Math.max(0, Number(input.maxFollowups ?? 0))),
        autoSend: parseStrictBoolean(input.autoSend, 'autoSend', false),
        approved: parseStrictBoolean(input.approved, 'approved', false),
        idempotencyKey: requestKey,
        createdAt: now()
      };
      campaign.idempotencyDigest = digestCampaignRequest(campaign);
      const existing = await store.findOne('campaigns', { idempotencyKey: requestKey });
      if (existing) {
        if (existing.idempotencyDigest !== campaign.idempotencyDigest) {
          throw new HttpError(409, 'Idempotency-Key was already used for a different campaign request');
        }
        return json(res, 200, { ...existing, idempotentReplay: true });
      }
      try {
        await store.add('campaigns', campaign);
      } catch (error) {
        // Two browser retries can race between the read above and the insert.
        // PostgreSQL's unique index is the final arbiter; converge the loser
        // onto the same durable campaign instead of creating or reporting a
        // duplicate.
        if (!(error instanceof ConflictError)) throw error;
        const raced = await store.findOne('campaigns', { idempotencyKey: requestKey });
        if (!raced) throw error;
        if (raced.idempotencyDigest !== campaign.idempotencyDigest) {
          throw new HttpError(409, 'Idempotency-Key was already used for a different campaign request');
        }
        return json(res, 200, { ...raced, idempotentReplay: true });
      }
      return json(res, 201, campaign);
    }
    if (method === 'POST' && url.pathname === '/api/prospects/import') {
      const input = await parseBody(req);
      if (!Array.isArray(input.prospects)) throw new HttpError(400, 'prospects array required');
      const result = await importProspects(store, config, input.prospects, input.campaignId);
      if (result.added.length) await enqueueResearch({ limit: Math.min(config.maxBatch, result.added.length), reason: 'json-import' });
      return json(res, 201, { added: result.added.length, skipped: result.skipped.length, prospects: result.added, details: result.skipped });
    }
    if (method === 'POST' && url.pathname === '/api/prospects/import-csv') {
      const rows = parseCsv(await bodyText(req));
      const result = await importProspects(store, config, rows, url.searchParams.get('campaignId') || '');
      if (result.added.length) await enqueueResearch({ limit: Math.min(config.maxBatch, result.added.length), reason: 'csv-import' });
      return json(res, 201, { rows: rows.length, added: result.added.length, skipped: result.skipped.length, details: result.skipped });
    }
    if (method === 'POST' && url.pathname === '/api/discovery/run') {
      const input = await parseBody(req);
      const campaignId = String(input.campaignId || config.discovery.campaignId || '');
      const campaign = campaignId ? await store.get('campaigns', campaignId) : null;
      if (!campaignId || !campaign) throw new HttpError(400, 'A valid discovery campaign is required');
      if (!campaign.approved) throw new HttpError(400, 'The discovery campaign must be approved');
      const bbox = String(input.bbox || config.discovery.bbox || '');
      if (!bbox) throw new HttpError(400, 'A discovery bounding box is required');
      try {
        parseBbox(bbox, config.discovery.maxBboxSpan);
        normalizeCategories(Array.isArray(input.categories) ? input.categories : (input.categories || config.discovery.categories));
      } catch (error) {
        throw new HttpError(400, error.message);
      }
      if (input.limit !== undefined && (!Number.isFinite(Number(input.limit)) || Number(input.limit) <= 0)) {
        throw new HttpError(400, 'Discovery limit must be a positive number');
      }
      const normalized = { ...input, campaignId, bbox, dryRun: parseDryRunBoolean(input.dryRun, config.discovery.dryRun) };
      const fingerprint = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
      const job = await queue.enqueue('discovery.run', normalized, {
        singletonKey: 'singleton:discovery.run',
        maxAttempts: 4,
        dedupeKey: `discovery:manual:${fingerprint}:${Math.floor(Date.now() / 60000)}`
      });
      return json(res, 202, { queued: true, jobId: job.id, status: job.status, type: job.type });
    }
    if (method === 'POST' && url.pathname === '/api/run') {
      const input = await parseBody(req);
      const job = await queue.enqueue('research.batch', {
        limit: Math.min(config.maxBatch, Math.max(1, Number(input.limit || config.maxBatch))), reason: 'manual'
      }, { maxAttempts: 3, dedupeKey: `research:manual:${Math.floor(Date.now() / 30000)}` });
      return json(res, 202, { queued: true, jobId: job.id, status: job.status });
    }
    if (method === 'POST' && url.pathname === '/api/run-monitoring') {
      const job = await queue.enqueue('monitoring.process', {}, { maxAttempts: 5, singletonKey: 'singleton:monitoring.process', dedupeKey: `monitoring:manual:${Math.floor(Date.now() / 60000)}` });
      return json(res, 202, { queued: true, jobId: job.id, status: job.status });
    }
    if (method === 'POST' && url.pathname === '/api/worker/pause') {
      const state = await queue.setPaused(true, 'admin-api');
      return json(res, 200, state);
    }
    if (method === 'POST' && url.pathname === '/api/worker/resume') {
      const state = await queue.setPaused(false, 'admin-api');
      return json(res, 200, state);
    }
    if (method === 'POST' && url.pathname.startsWith('/api/jobs/') && url.pathname.endsWith('/retry')) {
      const job = await queue.requeueDeadLetter(url.pathname.split('/')[3]);
      return job ? json(res, 200, job) : json(res, 404, { error: 'Dead-letter job not found' });
    }
    if (method === 'POST' && url.pathname.startsWith('/api/prospects/') && url.pathname.endsWith('/retry')) {
      const prospectId = url.pathname.split('/')[3];
      const prospect = await store.patch('prospects', prospectId, { status: 'retry', error: '' });
      if (!prospect) return json(res, 404, { error: 'Prospect not found' });
      const job = await queue.enqueue('research.batch', { limit: 1, reason: 'prospect-retry', prospectId }, {
        maxAttempts: 3, dedupeKey: `research:retry:${prospectId}:${Date.now()}`
      });
      return json(res, 200, { prospect, jobId: job.id });
    }
    if (method === 'POST' && url.pathname === '/api/poll-replies') {
      const job = await queue.enqueue('replies.poll', {}, { maxAttempts: 5, singletonKey: 'singleton:replies.poll', dedupeKey: `replies:manual:${Math.floor(Date.now() / 60000)}` });
      return json(res, 202, { queued: true, jobId: job.id, status: job.status });
    }
    if (method === 'POST' && url.pathname === '/api/suppress') {
      const input = await parseBody(req);
      if (!input.value) throw new HttpError(400, 'value required');
      const suppression = { id: id('sup'), value: String(input.value).toLowerCase(), reason: input.reason || 'manual', createdAt: now() };
      await store.add('suppressions', suppression);
      return json(res, 201, suppression);
    }
    if (method === 'POST' && url.pathname === '/api/notifications/read') {
      const input = await parseBody(req);
      const notification = await store.patch('notifications', input.id, { status: 'read', readAt: now() });
      return notification ? json(res, 200, notification) : json(res, 404, { error: 'Notification not found' });
    }
    if (method === 'POST' && url.pathname === '/api/test/unlock') {
      if (!config.revenue.allowTestUnlock) return json(res, 403, { error: 'Test payment unlock is disabled' });
      const input = await parseBody(req);
      return json(res, 200, await revenue.unlockLead(input.leadId, input.product || 'full', { provider: 'test', eventId: id('test'), amountCents: Number(input.amountCents || 0) }));
    }

    if (method === 'GET' && url.pathname === '/api/export.csv') {
      const columns = ['company', 'website', 'country', 'niche', 'source', 'status', 'score', 'tier', 'contact', 'issue', 'service', 'subject', 'draft'];
      const rows = (await store.list('prospects')).map(prospect => [
        prospect.company, prospect.website, prospect.country, prospect.niche, prospect.source, prospect.status,
        prospect.score?.total || '', prospect.score?.tier || '', prospect.contact?.email || '',
        prospect.issue?.title || '', prospect.issue?.service || '', prospect.subject || '', prospect.draft || ''
      ]);
      return text(res, 200, [columns, ...rows].map(row => row.map(csvEscape).join(',')).join('\n'), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="uberbond-opportunities.csv"' });
    }
    if (method === 'GET' && url.pathname === '/api/export.json') {
      const [prospects, campaigns, leads, orders, subscriptions, leadLists, leadSearches, leadSignals, leadEnrichmentRuns, leadFieldResults, leadTasks] = await Promise.all([
        store.list('prospects'), store.list('campaigns'), store.list('leads'), store.list('orders'), store.list('subscriptions'),
        store.list('leadLists'), store.list('leadSearches'), store.list('leadSignals'), store.list('leadEnrichmentRuns'), store.list('leadFieldResults'), store.list('leadTasks')
      ]);
      return text(res, 200, JSON.stringify({ exportedAt: now(), prospects, campaigns, leads, orders, subscriptions, leadLists, leadSearches, leadSignals, leadEnrichmentRuns, leadFieldResults, leadTasks }, null, 2), 'application/json; charset=utf-8', { 'content-disposition': 'attachment; filename="uberbond-revenue-engine.json"' });
    }

    if (method === 'GET' && url.pathname === '/oauth/google/start') {
      const slot = url.searchParams.get('slot') === 'B' ? 'B' : 'A';
      const state = crypto.randomBytes(20).toString('hex');
      oauthStates.set(state, { slot, created: Date.now() });
      res.writeHead(302, { location: googleAuthUrl(config.google, state) });
      return res.end();
    }
    if (method === 'GET' && url.pathname === '/oauth/google/callback') {
      const stateKey = url.searchParams.get('state');
      const state = oauthStates.get(stateKey);
      if (!state || Date.now() - state.created > 600000) throw new HttpError(400, 'Invalid OAuth state');
      oauthStates.delete(stateKey);
      const tokens = await exchangeCode(config.google, url.searchParams.get('code'));
      tokens.expires_at = Date.now() + (tokens.expires_in || 3600) * 1000;
      let account = { id: `gmail-${state.slot}`, slot: state.slot, tokens: sealTokens(tokens, config.encryptionKey), connected: true, createdAt: now() };
      const profile = await getProfile(config.google, account, config.encryptionKey);
      account.email = profile.data.emailAddress;
      account.tokens = sealTokens(profile.tokens, config.encryptionKey);
      await store.upsert('accounts', account);
      res.writeHead(302, { location: '/admin.html?gmail=connected' });
      return res.end();
    }

    if (await staticFile(req, res)) return;
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) console.error(error);
    const message = status === 503
      ? 'Service temporarily unavailable. Please try again shortly.'
      : status >= 500
        ? 'Something went wrong on our side. Please try again.'
        : error.message;
    return json(res, status, { error: message });
  }
};

export default requestHandler;

const server = http.createServer(requestHandler);
const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;
if (isEntryPoint) {
  server.listen(config.port, () => {
    console.log(`UberBond Revenue Engine running on ${config.baseUrl} using ${config.storeBackend}`);
    console.log(JSON.stringify(inspectInfiniteOpusActivationEnvironment(process.env)));
  });
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);
  stopScheduler();
  if (localWorkerPromise) await queue.stopWorker().catch(error => console.error('Local worker stop failed', error));
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
if (isEntryPoint) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
