import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, validateStartupConfig } from './src/config.mjs';
import { createStore, ConflictError, StoreError } from './src/store.mjs';
import { Pipeline } from './src/pipeline.mjs';
import { RevenueEngine } from './src/revenue.mjs';
import { id, now, csvEscape } from './src/utils.mjs';
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
import { verifyUnsubscribeToken } from './src/unsubscribe.mjs';
import {
  createOutreachApproval,
  createOutreachRouteEvidence,
  evaluateOutreachGovernance,
  outreachEffectPayloadDigest,
  outreachMessageDigest
} from './src/outreach-governance.mjs';
import { resolveOmniaV9Mode } from './src/omnia-v9/integrations/config.mjs';
import { resolveOutboundFinalAdmissionHook } from './src/omnia-v9/integrations/outbound-admission.mjs';
import { buildLiveLeadGenerationSnapshot, buildLiveLeadHandoff } from './src/leadgen-live-snapshot.mjs';

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
  outboundFinalAdmissionShadow: resolveOutboundFinalAdmissionHook({ mode: omniaV9Mode, store })
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
const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};
const auth = req => {
  if (!config.adminToken) return true;
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  return safeEqual(bearer, config.adminToken);
};
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
const publicApi = pathname => pathname === '/api/health' || pathname === '/api/public/unsubscribe' || pathname === '/api/public/config' || pathname === '/api/public/audit' || pathname.startsWith('/api/public/report/') || pathname.startsWith('/api/public/artifacts/') || pathname === '/api/public/checkout' || pathname === '/webhooks/lemonsqueezy';
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

function canaryPrerequisites() {
  const outbound = config.outbound || {};
  return {
    launchPhaseCanary: outbound.launchPhase === 'canary',
    approvedProvider: outbound.provider === 'gmail-api',
    approvalSecretConfigured: String(outbound.approvalSecret || '').length >= 32,
    approverConfigured: Boolean(String(outbound.approverId || '').trim()),
    senderIdentityConfigured: Boolean(String(config.sender?.address || '').trim()),
    allowedCountriesConfigured: normalizeCountryList(outbound.allowedCountries || []).length > 0,
    googleOAuthConfigured: Boolean(config.google?.clientId && config.google?.clientSecret),
    encryptionConfigured: /^[a-f0-9]{64}$/i.test(String(config.encryptionKey || '')),
    unsubscribeConfigured: String(config.unsubscribeSecret || '').length >= 32,
    outboundEnabled: outbound.enabled === true,
    dryRun: outbound.dryRun === true
  };
}

async function outreachCanaryStatus() {
  const [prospects, campaigns, accounts, senderHealth, suppressions, reservations, settings] = await Promise.all([
    store.list('prospects'), store.list('campaigns'), store.list('accounts'), store.list('senderHealth'),
    store.list('suppressions'), store.list('outboundReservations'), store.getSettings()
  ]);
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
    cfg: config,
    subject: prospect.subject,
    body: prospect.draft,
    followup: 0,
    date: new Date()
  }));
  const governedReady = evaluations.filter(result => result.ok);
  const readyProspectIds = candidates
    .filter((_, index) => evaluations[index]?.ok)
    .map(prospect => prospect.id);
  const prerequisites = canaryPrerequisites();
  const connectedSlots = new Set(accounts.filter(account => account.connected === true).map(account => String(account.slot || '')));
  const pausedSlots = new Set(senderHealth.filter(row => row.paused === true).map(row => String(row.inbox || '')));
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
  if (!prerequisites.googleOAuthConfigured) liveBlockers.push('google-oauth-missing');
  if (!prerequisites.encryptionConfigured) liveBlockers.push('token-encryption-key-missing');
  if (!prerequisites.unsubscribeConfigured) liveBlockers.push('unsubscribe-secret-missing');

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
    provider: config.outbound.provider,
    launchPhase: config.outbound.launchPhase,
    mode: {
      outboundEnabled: config.outbound.enabled,
      dryRun: config.outbound.dryRun,
      globalPaused: settings?.outboundPaused === true
    },
    canary: {
      dailyCap: config.outbound.canaryDailyCap,
      hourlyCap: config.outbound.canaryHourlyCap,
      minGapSeconds: config.outbound.canaryMinGapSeconds,
      readyProspectId: readyProspectIds.length === 1 ? readyProspectIds[0] : null
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
  if (!readiness.readyForDryRun && !readiness.readyForLiveSend) {
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

function exactCanaryPayload(prospect, campaign, { subject, body, followup = 0 } = {}) {
  const provider = String(config.outbound.provider || '').toLowerCase();
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
  if (Number(input.followup || 0) !== 0) throw new HttpError(400, 'Only the initial canary step can be approved here');
  if (config.outbound.launchPhase !== 'canary') throw new HttpError(409, 'Set the bounded canary launch phase before approving a canary');
  if (String(config.outbound.provider || '').toLowerCase() !== 'gmail-api') throw new HttpError(409, 'The live canary provider is not approved');
  if (String(config.outbound.approvalSecret || '').length < 32) throw new HttpError(503, 'The canary approval secret is not configured');
  if (!String(config.outbound.approverId || '').trim()) throw new HttpError(503, 'The canary approver identity is not configured');

  const prospect = await store.get('prospects', prospectId);
  if (!prospect) throw new HttpError(404, 'Prospect not found');
  const campaign = await store.get('campaigns', prospect.campaignId);
  if (!campaign) throw new HttpError(404, 'Campaign not found');
  if (campaign.approved !== true || campaign.autoSend !== true) throw new HttpError(409, 'The campaign must be approved and auto-send enabled before canary approval');
  if (!CANARY_PROSPECT_STATUSES.has(prospect.status)) throw new HttpError(409, 'The prospect must finish research before canary approval');
  if (!prospect.contact?.email) throw new HttpError(409, 'The prospect has no selected recipient email');
  if (!prospect.inbox || !['A', 'B'].includes(String(prospect.inbox))) throw new HttpError(409, 'The prospect needs sender slot A or B');

  const subject = String(input.subject ?? prospect.subject ?? '');
  const body = String(input.body ?? prospect.draft ?? '');
  if (!subject.trim() || !body.trim()) throw new HttpError(409, 'The exact subject and body must exist before approval');
  if (input.subject !== undefined && subject !== String(prospect.subject || '')) throw new HttpError(409, 'Subject must match the stored rendered draft exactly');
  if (input.body !== undefined && body !== String(prospect.draft || '')) throw new HttpError(409, 'Body must match the stored rendered draft exactly');
  if (!String(prospect.oneClickUnsubscribeUrl || '').startsWith('https://')) throw new HttpError(409, 'The prospect needs a signed HTTPS unsubscribe URL');
  const routeInput = input.routeEvidence;
  if (!routeInput || typeof routeInput !== 'object' || Array.isArray(routeInput)) throw new HttpError(400, 'routeEvidence is required');

  const approvedAt = new Date();
  let route;
  try {
    route = createOutreachRouteEvidence({
      ...routeInput,
      recipientEmail: prospect.contact.email,
      provider: config.outbound.provider
    }, approvedAt);
  } catch (error) {
    throw new HttpError(400, error.message || 'Route evidence is invalid');
  }
  const payload = exactCanaryPayload(prospect, campaign, { subject, body });
  const messageDigest = outreachMessageDigest(payload);
  const effectPayloadDigest = outreachEffectPayloadDigest(payload);
  const approval = createOutreachApproval({
    approvalId: `outreach-${crypto.randomUUID()}`,
    prospectId: prospect.id,
    campaignId: campaign.id,
    recipientEmail: prospect.contact.email,
    provider: config.outbound.provider,
    inbox: prospect.inbox,
    followup: 0,
    routeDigest: route.routeDigest,
    messageDigest,
    effectPayloadDigest,
    approvedBy: config.outbound.approverId,
    approvedAt: approvedAt.toISOString(),
    expiresAt: new Date(approvedAt.getTime() + 24 * 60 * 60 * 1000).toISOString()
  }, config.outbound.approvalSecret);
  const candidate = { ...prospect, outreachRoute: route, outreachApproval: approval };
  const governance = evaluateOutreachGovernance({ prospect: candidate, campaign, cfg: config, subject, body, date: approvedAt });
  if (!governance.ok) throw new HttpError(409, `Canary approval refused: ${governance.reason}`);

  await store.patch('prospects', prospect.id, {
    outreachRoute: route,
    outreachApproval: approval,
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
    provider: config.outbound.provider,
    inbox: prospect.inbox,
    approvedBy: config.outbound.approverId,
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

async function applyUnsubscribe(token) {
  const verified = verifyUnsubscribeToken(token, config.unsubscribeSecret);
  if (!verified) throw new HttpError(400, 'This unsubscribe link is invalid or expired');
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
        bookingUrl: config.revenue.bookingUrl
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

    if (method === 'GET' && url.pathname === '/api/leadgen/intelligence') {
      return json(res, 200, await buildLiveLeadGenerationSnapshot({ store }));
    }
    if (method === 'POST' && url.pathname === '/api/leadgen/handoff') {
      const input = await parseBody(req);
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

    if (method === 'GET' && url.pathname === '/api/outbound/canary/status') {
      return json(res, 200, await outreachCanaryStatus());
    }
    if (method === 'POST' && url.pathname === '/api/outbound/approve-prospect') {
      return json(res, 200, await approveOutreachCanary(await parseBody(req)));
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
    if (method === 'POST' && /^\/api\/outbound\/sender\/[AB]\/pause$/.test(url.pathname)) {
      const slot = url.pathname.split('/')[4];
      const input = await parseBody(req);
      return json(res, 200, await store.setSenderPaused(slot, true, input.reason || 'Paused from command center'));
    }
    if (method === 'POST' && /^\/api\/outbound\/sender\/[AB]\/resume$/.test(url.pathname)) {
      const slot = url.pathname.split('/')[4];
      return json(res, 200, await store.setSenderPaused(slot, false, ''));
    }

    if (method === 'POST' && url.pathname === '/api/campaigns') {
      const input = await parseBody(req);
      const campaign = {
        id: id('camp'), name: input.name || 'Untitled campaign', niche: input.niche || '', offer: input.offer || '',
        allowedCountries: normalizeCountryList(Array.isArray(input.allowedCountries) ? input.allowedCountries : String(input.allowedCountries || '').split(',')),
        minScore: Math.max(50, Math.min(95, Number(input.minScore || 60))),
        dailyCaps: {
          A: Math.min(config.caps.A, Number(input.dailyCapA || config.caps.A)),
          B: Math.min(config.caps.B, Number(input.dailyCapB || config.caps.B))
        },
        maxFollowups: Math.min(1, Math.max(0, Number(input.maxFollowups ?? 0))),
        autoSend: parseStrictBoolean(input.autoSend, 'autoSend', false),
        approved: parseStrictBoolean(input.approved, 'approved', false),
        createdAt: now()
      };
      await store.add('campaigns', campaign);
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
      const [prospects, campaigns, leads, orders, subscriptions] = await Promise.all([
        store.list('prospects'), store.list('campaigns'), store.list('leads'), store.list('orders'), store.list('subscriptions')
      ]);
      return text(res, 200, JSON.stringify({ exportedAt: now(), prospects, campaigns, leads, orders, subscriptions }, null, 2), 'application/json; charset=utf-8', { 'content-disposition': 'attachment; filename="uberbond-revenue-engine.json"' });
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
  server.listen(config.port, () => console.log(`UberBond Revenue Engine running on ${config.baseUrl} using ${config.storeBackend}`));
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
