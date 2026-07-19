import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, validateStartupConfig } from './src/config.mjs';
import { createStore, ConflictError, StoreError } from './src/store.mjs';
import { Pipeline } from './src/pipeline.mjs';
import { RevenueEngine } from './src/revenue.mjs';
import { id, now, csvEscape, normalizeDomain } from './src/utils.mjs';
import { parseCsv } from './src/csv.mjs';
import { createOAuthState, exchangeCode, getProfile, googleAuthUrl, sealTokens, verifyOAuthState } from './src/gmail.mjs';
import { startScheduler } from './src/scheduler.mjs';
import { DISCOVERY_CATEGORIES, SUPPORTED_DISCOVERY_COUNTRIES, parseBbox, normalizeCategories } from './src/discovery.mjs';
import { parseStrictBoolean, parseDryRunBoolean, InputError } from './src/input.mjs';
import { DurableQueue } from './src/queue.mjs';
import { DiscoveryRunner } from './src/discovery-runner.mjs';
import { importProspects } from './src/prospect-import.mjs';
import { createJobHandlers } from './src/job-handlers.mjs';
import { normalizeCountryList } from './src/send-safety.mjs';
import { verifyUnsubscribeToken } from './src/unsubscribe.mjs';
import { CampaignConfigError, createCampaignRecord } from './src/campaign-config.mjs';
import { validateEditedOutreach } from './src/copy.mjs';
import { validateResponseDraft } from './src/replies.mjs';
import { PaymentStateError } from './src/payments.mjs';
import { DeliveryError } from './src/delivery.mjs';
import { LearningEngine, LearningError } from './src/learning.mjs';
import { adminRequestAuthorized, PRIVATE_REFERRER_POLICY, safeErrorDetails } from './src/security.mjs';
import {
  approvedDraftPatch,
  buildCockpitSnapshot,
  cockpitExportRows,
  evaluateDraftApproval,
  rejectedDraftPatch
} from './src/cockpit.mjs';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

validateStartupConfig(config);
const root = path.dirname(fileURLToPath(import.meta.url));
const store = createStore(config);
await store.init();
const queue = new DurableQueue(store, config, console);
let revenue;
const pipeline = new Pipeline(store, config, { onProspectComplete: async prospect => revenue?.onProspectComplete(prospect) });
const enqueueResearch = payload => queue.enqueue('research.batch', payload, {
  maxAttempts: 3,
  dedupeKey: payload.dedupeKey || (payload.leadId ? `research:lead:${payload.leadId}` : `research:${payload.reason || 'manual'}:${Math.floor(Date.now() / 30000)}`)
});
revenue = new RevenueEngine(store, config, pipeline, { enqueueResearch });
const learning = new LearningEngine(store);
const discoveryRunner = new DiscoveryRunner(store, config, { enqueueResearch });
const handlers = createJobHandlers({ store, pipeline, revenue, discoveryRunner });
let stopScheduler = () => {};
let localWorkerPromise = null;
if (config.processRole === 'all') {
  stopScheduler = startScheduler(queue, config, console);
  localWorkerPromise = queue.startWorker(handlers, { concurrency: config.queue.concurrency });
}
const baseHeaders = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': PRIVATE_REFERRER_POLICY,
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
  try { return JSON.parse(content); }
  catch { throw new HttpError(400, 'Malformed JSON body'); }
};
// Privileged API credentials are accepted only in the Authorization header.
// URL tokens leak into browser history, referrers, reverse-proxy logs and screenshots.
const auth = req => adminRequestAuthorized(req, config.adminToken);
const pct = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 100) : 0;
const publicApi = pathname => pathname === '/api/health' || pathname === '/api/public/unsubscribe' || pathname === '/api/public/config' || pathname === '/api/public/audit' || pathname === '/api/public/report' || pathname.startsWith('/api/public/artifacts/') || pathname === '/api/public/checkout' || pathname === '/webhooks/lemonsqueezy';
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();

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
    positive: prospects.filter(item => ['interested', 'meeting-requested', 'asks-for-information'].includes(item.replyLabel)).length,
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

function cockpitFilters(searchParams) {
  return {
    campaignId: searchParams.get('campaignId') || '',
    country: searchParams.get('country') || '',
    niche: searchParams.get('niche') || '',
    minimumScore: searchParams.get('minimumScore') || '',
    status: searchParams.get('status') || '',
    dateFrom: searchParams.get('dateFrom') || '',
    dateTo: searchParams.get('dateTo') || ''
  };
}

function learningFilters(searchParams) {
  return {
    campaignId: searchParams.get('campaignId') || '',
    country: searchParams.get('country') || '',
    niche: searchParams.get('niche') || '',
    dateFrom: searchParams.get('dateFrom') || '',
    dateTo: searchParams.get('dateTo') || ''
  };
}

async function cockpitSnapshot(filters = {}) {
  const [prospects, campaigns, replies, orders, senderHealth, settings] = await Promise.all([
    store.list('prospects'), store.list('campaigns'), store.list('replies'), store.list('orders'),
    store.list('senderHealth'), store.getSettings()
  ]);
  return buildCockpitSnapshot({
    prospects, campaigns, replies, orders, senderHealth, settings,
    outbound: {
      provider: config.outbound.provider,
      enabled: config.outbound.enabled,
      dryRun: config.outbound.dryRun,
      liveSendApproved: config.outbound.liveSendApproved
    }
  }, filters);
}

async function approveProspectDraft(prospectId) {
  const prospect = await store.get('prospects', prospectId);
  if (!prospect) return { ok: false, reason: 'prospect-not-found', status: 404 };
  if (prospect.draftApproval?.status === 'approved') {
    return {
      ok: true,
      prospect,
      approval: {
        ok: true,
        alreadyApproved: true,
        approvalMode: prospect.draftApproval.approvalMode || 'previously-approved',
        liveSendEligible: false,
        qualityScore: Number(prospect.draftApproval.qualityScore || prospect.outreach?.selected?.quality?.score || 0)
      }
    };
  }
  const [campaign, suppressions] = await Promise.all([
    store.get('campaigns', prospect.campaignId),
    store.list('suppressions')
  ]);
  const approval = evaluateDraftApproval({ prospect, campaign: campaign || {}, cfg: config, suppressions });
  if (!approval.ok) return { ...approval, status: 409 };
  const approvedAt = now();
  const patch = approvedDraftPatch(prospect, approvedAt);
  patch.draftApproval.approvalMode = approval.approvalMode;
  const updated = await store.patch('prospects', prospect.id, patch);
  await store.log('draft_approved', { prospectId: prospect.id, approvalMode: approval.approvalMode, qualityScore: approval.qualityScore });
  return { ok: true, prospect: updated, approval };
}

function oauthStateKey(value) {
  return `oauthState:${crypto.createHash('sha256').update(String(value || '')).digest('hex')}`;
}

async function rememberOAuthState(value, state) {
  await store.setSetting(oauthStateKey(value), { slot: state.slot, expiresAt: new Date(state.issuedAt + 10 * 60 * 1000).toISOString(), used: false });
}

async function consumeOAuthState(value, verified) {
  return store.transaction(async tx => {
    const settings = await tx.getSettings();
    const key = oauthStateKey(value);
    const record = settings[key];
    if (!record || record.used === true || record.slot !== verified.slot || Date.parse(record.expiresAt || 0) < Date.now()) return false;
    await tx.setSetting(key, { ...record, used: true, usedAt: now() });
    return true;
  });
}

async function applyUnsubscribe(token) {
  const verified = verifyUnsubscribeToken(token, config.unsubscribeSecret);
  if (!verified) throw new HttpError(400, 'This unsubscribe link is invalid or expired');
  const prospect = await store.get('prospects', verified.prospectId);
  if (!prospect?.contact?.email) throw new HttpError(404, 'The outreach record was not found');
  const email = String(prospect.contact.email).toLowerCase();
  const values = [email, normalizeDomain(prospect.website)].filter(Boolean);
  await store.suppressOutbound({
    prospectId: prospect.id,
    values,
    reason: 'one-click-unsubscribe',
    status: 'unsubscribed',
    prospectPatch: { unsubscribedAt: now() }
  });
  await store.log('one_click_unsubscribe', { prospectId: prospect.id, domainSuppressed: values.length > 1 });
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
  if (error instanceof LearningError) return error.status;
  if (error instanceof PaymentStateError || error instanceof DeliveryError) {
    if (/-not-found$/.test(error.code)) return 404;
    if (/(not-configured|provider-not-configured)$/.test(error.code)) return 503;
    if (/(transition|not-issued|not-owner-approved|required|pending|incomplete|hold-active|terminal-state)$/.test(error.code)) return 409;
    return 400;
  }
  if (error instanceof ConflictError) return 409;
  if (error instanceof StoreError && error.code === 'FOREIGN_KEY') return 422;
  if (/Too many|cap reached/i.test(error.message)) return 429;
  if (/disabled|not configured|DATABASE_URL/i.test(error.message)) return 503;
  return 500;
}

const server = http.createServer(async (req, res) => {
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
    if ((url.pathname.startsWith('/api/') || url.pathname === '/oauth/google/start') && !publicApi(url.pathname) && !auth(req)) {
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
    if (method === 'POST' && url.pathname === '/api/public/report') {
      const input = await parseBody(req);
      const report = await revenue.publicReport(String(input.token || ''));
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
      return json(res, 200, await revenue.checkoutForLeadOffer(lead, String(input.offerId || '')));
    }
    if (method === 'POST' && url.pathname === '/webhooks/lemonsqueezy') {
      const raw = await bodyText(req);
      return json(res, 200, await revenue.handleLemonWebhook(raw, req.headers['x-signature']));
    }

    if (method === 'GET' && url.pathname === '/api/summary') return json(res, 200, await summary());
    if (method === 'GET' && url.pathname === '/api/cockpit') return json(res, 200, await cockpitSnapshot(cockpitFilters(url.searchParams)));
    if (method === 'GET' && url.pathname === '/api/cockpit/export.json') {
      const snapshot = await cockpitSnapshot(cockpitFilters(url.searchParams));
      return text(res, 200, JSON.stringify({ exportedAt: now(), rows: cockpitExportRows(snapshot) }, null, 2), 'application/json; charset=utf-8', { 'content-disposition': 'attachment; filename="uberbond-cockpit-safe.json"' });
    }
    if (method === 'GET' && url.pathname === '/api/cockpit/export.csv') {
      const rows = cockpitExportRows(await cockpitSnapshot(cockpitFilters(url.searchParams)));
      const columns = ['campaignId', 'company', 'website', 'country', 'city', 'niche', 'score', 'tier', 'acquisitionStatus', 'sourceStatus', 'issueTitle', 'issueService', 'hasEvidence', 'contactMode', 'draftQuality', 'draftApproval', 'replyLabel', 'paymentState', 'deliveryState', 'deliveryMode', 'updatedAt'];
      const csv = [columns, ...rows.map(row => columns.map(column => row[column] ?? ''))].map(row => row.map(csvEscape).join(',')).join('\n');
      return text(res, 200, csv, 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="uberbond-cockpit-safe.csv"' });
    }
    if (method === 'GET' && url.pathname === '/api/learning') {
      return json(res, 200, await learning.dashboard(learningFilters(url.searchParams)));
    }
    const listRoutes = new Map([
      ['/api/prospects', 'prospects'], ['/api/leads', 'leads'], ['/api/orders', 'orders'],
      ['/api/subscriptions', 'subscriptions'], ['/api/offers', 'offers'], ['/api/deliveries', 'deliveries'], ['/api/monitoring-runs', 'monitoringRuns'],
      ['/api/notifications', 'notifications'], ['/api/replies', 'replies'], ['/api/social-tasks', 'socialTasks'],
      ['/api/campaigns', 'campaigns'], ['/api/discovery-runs', 'discoveryRuns'], ['/api/jobs', 'jobs'],
      ['/api/outbound-reservations', 'outboundReservations'], ['/api/outbound-events', 'outboundEvents'], ['/api/sender-health', 'senderHealth'],
      ['/api/experiments', 'experiments']
    ]);
    if (method === 'GET' && listRoutes.has(url.pathname)) {
      return json(res, 200, (await store.list(listRoutes.get(url.pathname))).reverse());
    }
    if (method === 'GET' && /^\/api\/replies\/[^/]+$/.test(url.pathname)) {
      const reply = await store.get('replies', decodeURIComponent(url.pathname.split('/')[3]));
      return reply ? json(res, 200, reply) : json(res, 404, { error: 'Reply not found' });
    }
    if (method === 'GET' && /^\/api\/prospects\/[^/]+\/offers$/.test(url.pathname)) {
      const prospectId = decodeURIComponent(url.pathname.split('/')[3]);
      const prospect = await store.get('prospects', prospectId);
      return prospect ? json(res, 200, await revenue.offersForProspect(prospectId)) : json(res, 404, { error: 'Prospect not found' });
    }
    if (method === 'GET' && /^\/api\/prospects\/[^/]+\/deliveries$/.test(url.pathname)) {
      const prospectId = decodeURIComponent(url.pathname.split('/')[3]);
      const prospect = await store.get('prospects', prospectId);
      return prospect ? json(res, 200, await revenue.deliveriesForProspect(prospectId)) : json(res, 404, { error: 'Prospect not found' });
    }
    if (method === 'GET' && url.pathname.startsWith('/api/prospects/')) {
      const prospect = await store.get('prospects', url.pathname.split('/').pop());
      return prospect ? json(res, 200, prospect) : json(res, 404, { error: 'Prospect not found' });
    }
    if (method === 'GET' && url.pathname === '/api/discovery/config') {
      return json(res, 200, {
        enabled: config.discovery.enabled, dryRun: config.discovery.dryRun, dailyCap: config.discovery.dailyCap,
        bbox: config.discovery.bbox, categories: config.discovery.categories, country: config.discovery.country,
        city: config.discovery.city, supportedCategories: Object.keys(DISCOVERY_CATEGORIES),
        supportedCountries: SUPPORTED_DISCOVERY_COUNTRIES
      });
    }

    if (method === 'POST' && url.pathname === '/api/outbound/pause') {
      const input = await parseBody(req);
      return json(res, 200, await store.setOutboundPaused(true, input.reason || 'Paused from command center'));
    }
    if (method === 'POST' && url.pathname === '/api/experiments') {
      return json(res, 201, await learning.create(await parseBody(req)));
    }
    if (method === 'POST' && /^\/api\/experiments\/[^/]+\/refresh$/.test(url.pathname)) {
      const experimentId = decodeURIComponent(url.pathname.split('/')[3]);
      return json(res, 200, await learning.refresh(experimentId));
    }
    if (method === 'POST' && /^\/api\/experiments\/[^/]+\/decision$/.test(url.pathname)) {
      const experimentId = decodeURIComponent(url.pathname.split('/')[3]);
      return json(res, 200, await learning.decide(experimentId, await parseBody(req)));
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
    if (method === 'POST' && /^\/api\/campaigns\/[^/]+\/pause$/.test(url.pathname)) {
      const campaignId = decodeURIComponent(url.pathname.split('/')[3]);
      const campaign = await store.get('campaigns', campaignId);
      if (!campaign || campaign.systemKey) return json(res, 404, { error: 'Campaign not found' });
      if (campaign.enabled === false) return json(res, 409, { error: 'A disabled campaign cannot be paused or activated from the cockpit' });
      const input = await parseBody(req);
      const pausedAt = now();
      const updated = await store.patch('campaigns', campaignId, {
        enabled: false,
        pausedAt,
        pauseReason: String(input.reason || 'Paused from iPad cockpit').slice(0, 160),
        updatedAt: pausedAt
      });
      await store.log('campaign_paused', { campaignId });
      return json(res, 200, updated);
    }
    if (method === 'POST' && /^\/api\/campaigns\/[^/]+\/resume$/.test(url.pathname)) {
      const campaignId = decodeURIComponent(url.pathname.split('/')[3]);
      const campaign = await store.get('campaigns', campaignId);
      if (!campaign || campaign.systemKey) return json(res, 404, { error: 'Campaign not found' });
      if (!campaign.pausedAt) return json(res, 409, { error: 'Only a campaign explicitly paused from the cockpit can be resumed here' });
      if (campaign.dryRun === false || campaign.autoSend === true) {
        return json(res, 409, { error: 'Live-capable campaigns require the separate privileged activation path' });
      }
      const updatedAt = now();
      const updated = await store.patch('campaigns', campaignId, { enabled: true, pausedAt: null, pauseReason: '', updatedAt });
      await store.log('campaign_resumed_dry_run', { campaignId });
      return json(res, 200, updated);
    }

    if (method === 'POST' && url.pathname === '/api/campaigns') {
      const input = await parseBody(req);
      let campaign;
      try {
        campaign = createCampaignRecord(input, {
          systemLiveSendApproved: config.outbound.liveSendApproved === true,
          // Campaign live-send approval is a separate privileged action. A
          // campaign creation request can never approve itself.
          campaignLiveSendApproved: false,
          createdAt: now()
        });
      } catch (error) {
        if (error instanceof CampaignConfigError) throw new HttpError(400, error.message);
        throw error;
      }
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
      if (!campaign.approved || campaign.enabled === false) throw new HttpError(400, 'The discovery campaign must be enabled');
      const bbox = String(input.bbox || config.discovery.bbox || '');
      if (!bbox && !campaign.boundingBoxes?.length) throw new HttpError(400, 'A campaign or request bounding box is required');
      try {
        if (bbox) parseBbox(bbox, config.discovery.maxBboxSpan);
        normalizeCategories(Array.isArray(input.categories) && input.categories.length
          ? input.categories
          : (input.categories || campaign.discoveryCategories || config.discovery.categories));
      } catch (error) {
        throw new HttpError(400, error.message);
      }
      if (input.limit !== undefined && (!Number.isInteger(Number(input.limit)) || Number(input.limit) <= 0 || Number(input.limit) > 100)) {
        throw new HttpError(400, 'Discovery limit must be an integer from 1 to 100');
      }
      if (input.maxBatches !== undefined && (!Number.isInteger(Number(input.maxBatches)) || Number(input.maxBatches) <= 0 || Number(input.maxBatches) > 100)) {
        throw new HttpError(400, 'Discovery maxBatches must be an integer from 1 to 100');
      }
      if (input.cursor !== undefined && (!Number.isInteger(Number(input.cursor)) || Number(input.cursor) < 0)) {
        throw new HttpError(400, 'Discovery cursor must be a non-negative integer');
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
    if (method === 'POST' && /^\/api\/prospects\/[^/]+\/draft$/.test(url.pathname)) {
      const prospectId = decodeURIComponent(url.pathname.split('/')[3]);
      const prospect = await store.get('prospects', prospectId);
      if (!prospect) return json(res, 404, { error: 'Prospect not found' });
      if (['sent', 'replied', 'suppressed', 'paid'].includes(prospect.status)) {
        return json(res, 409, { error: 'This prospect is no longer editable' });
      }
      if (!prospect.outreach?.context?.bindings) return json(res, 409, { error: 'No evidence-locked draft context is available' });
      const input = await parseBody(req);
      const edited = validateEditedOutreach({ subject: input.subject, body: input.body }, prospect.outreach.context);
      if (!edited.quality?.passed) {
        return json(res, 400, {
          error: 'The edit failed the evidence and outreach safety gate',
          reasons: (edited.quality?.reasons || []).slice(0, 12)
        });
      }
      const selected = {
        ...(prospect.outreach.selected || {}),
        ...edited,
        id: `owner-edit-${Date.now()}`,
        source: 'owner-edit',
        editedAt: now()
      };
      const outreach = {
        ...prospect.outreach,
        selected,
        variants: [selected, ...(prospect.outreach.variants || []).filter(item => item.id !== selected.id)].slice(0, 10),
        ownerApproval: 'pending',
        liveSendEligible: false,
        editedAt: selected.editedAt
      };
      const updated = await store.patch('prospects', prospectId, {
        status: 'research-complete',
        subject: selected.subject,
        draft: selected.body,
        outreach,
        dossier: {
          ...(prospect.dossier || {}),
          outreach: { subject: selected.subject, draft: selected.body, quality: selected.quality, ownerApproval: 'pending' }
        },
        draftApproval: { status: 'pending', editedAt: selected.editedAt },
        updatedAt: now()
      });
      await store.log('draft_edited', { prospectId, qualityScore: selected.quality.score });
      return json(res, 200, updated);
    }
    if (method === 'POST' && /^\/api\/prospects\/[^/]+\/approve$/.test(url.pathname)) {
      const prospectId = decodeURIComponent(url.pathname.split('/')[3]);
      const result = await approveProspectDraft(prospectId);
      return result.ok ? json(res, 200, result) : json(res, result.status || 409, { error: 'Draft approval was blocked by a safety gate', reason: result.reason });
    }
    if (method === 'POST' && /^\/api\/prospects\/[^/]+\/reject$/.test(url.pathname)) {
      const prospectId = decodeURIComponent(url.pathname.split('/')[3]);
      const prospect = await store.get('prospects', prospectId);
      if (!prospect) return json(res, 404, { error: 'Prospect not found' });
      if (['sent', 'replied', 'complaint', 'bounce', 'bounced', 'suppressed', 'paid', 'delivered'].includes(String(prospect.status || '').toLowerCase())) {
        return json(res, 409, { error: 'This prospect is no longer reviewable' });
      }
      const input = await parseBody(req);
      const patch = rejectedDraftPatch(input.reason || 'owner-rejected');
      const updated = await store.patch('prospects', prospectId, {
        ...patch,
        outreach: { ...(prospect.outreach || {}), ownerApproval: 'rejected', liveSendEligible: false, rejectedAt: patch.rejectedAt }
      });
      await store.log('draft_rejected', { prospectId, reason: patch.draftApproval.reason });
      return json(res, 200, updated);
    }
    if (method === 'POST' && url.pathname === '/api/prospects/approve-batch') {
      const input = await parseBody(req);
      if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 50) {
        return json(res, 400, { error: 'ids must contain between 1 and 50 prospect IDs' });
      }
      const ids = [...new Set(input.ids.map(value => String(value || '')).filter(Boolean))].slice(0, 50);
      const results = [];
      for (const prospectId of ids) {
        const result = await approveProspectDraft(prospectId);
        results.push({ prospectId, approved: result.ok, reason: result.ok ? '' : result.reason });
      }
      return json(res, 200, {
        requested: ids.length,
        approved: results.filter(result => result.approved).length,
        skipped: results.filter(result => !result.approved).length,
        results
      });
    }
    if (method === 'POST' && /^\/api\/prospects\/[^/]+\/schedule$/.test(url.pathname)) {
      const prospectId = decodeURIComponent(url.pathname.split('/')[3]);
      const prospect = await store.get('prospects', prospectId);
      if (!prospect) return json(res, 404, { error: 'Prospect not found' });
      if (prospect.status === 'scheduled' && prospect.draftApproval?.status === 'approved') {
        return json(res, 200, { scheduled: true, duplicate: true, prospectId, mode: config.outbound.provider === 'test' ? 'test' : 'gmail' });
      }
      if (prospect.status !== 'approved' || prospect.draftApproval?.status !== 'approved') {
        return json(res, 409, { error: 'Only an owner-approved draft can be scheduled' });
      }
      const campaign = await store.get('campaigns', prospect.campaignId);
      if (!campaign?.approved || campaign.enabled === false) return json(res, 409, { error: 'Campaign is not enabled' });
      const scheduledAt = now();
      await store.patch('prospects', prospectId, {
        status: 'scheduled', acquisitionStatus: 'scheduled', scheduledAt, nextFollowupAt: null,
        sendAuthorization: { mode: 'owner-approved', approvedAt: prospect.draftApproval.approvedAt || '', scheduledAt, includesFollowup: false },
        updatedAt: scheduledAt
      });
      const job = await queue.enqueue('outbound.process', { prospectId, limit: 1, reason: 'owner-scheduled' }, {
        maxAttempts: 3,
        dedupeKey: `outbound:owner-scheduled:${prospectId}`
      });
      await store.log('outbound_scheduled', { prospectId, campaignId: campaign.id, provider: config.outbound.provider });
      return json(res, 202, {
        scheduled: true, prospectId, jobId: job.id,
        mode: config.outbound.provider === 'test' ? 'test' : 'gmail',
        liveSendingEnabled: config.outbound.enabled === true && config.outbound.dryRun === false
      });
    }
    if (method === 'POST' && /^\/api\/prospects\/[^/]+\/offers$/.test(url.pathname)) {
      const prospectId = decodeURIComponent(url.pathname.split('/')[3]);
      const offer = await revenue.createOffer(prospectId, await parseBody(req));
      return json(res, 201, offer);
    }
    if (method === 'POST' && /^\/api\/offers\/[^/]+\/approve$/.test(url.pathname)) {
      const offerId = decodeURIComponent(url.pathname.split('/')[3]);
      return json(res, 200, await revenue.approveOffer(offerId));
    }
    if (method === 'POST' && /^\/api\/offers\/[^/]+\/send-checkout$/.test(url.pathname)) {
      const offerId = decodeURIComponent(url.pathname.split('/')[3]);
      return json(res, 200, await revenue.issueCheckout(offerId));
    }
    if (method === 'POST' && /^\/api\/offers\/[^/]+\/manual-payment$/.test(url.pathname)) {
      const offerId = decodeURIComponent(url.pathname.split('/')[3]);
      return json(res, 200, await revenue.confirmManualPayment(offerId, await parseBody(req)));
    }
    if (method === 'POST' && /^\/api\/test\/offers\/[^/]+\/simulate-payment$/.test(url.pathname)) {
      if (!config.revenue.allowTestUnlock || config.nodeEnv === 'production') return json(res, 403, { error: 'Test payment simulation is disabled' });
      const offerId = decodeURIComponent(url.pathname.split('/')[4]);
      return json(res, 200, await revenue.simulateOfferPayment(offerId));
    }
    if (method === 'POST' && /^\/api\/deliveries\/[^/]+\/update$/.test(url.pathname)) {
      const deliveryId = decodeURIComponent(url.pathname.split('/')[3]);
      return json(res, 200, await revenue.updateDelivery(deliveryId, await parseBody(req)));
    }
    if (method === 'POST' && /^\/api\/replies\/[^/]+\/draft$/.test(url.pathname)) {
      const replyId = decodeURIComponent(url.pathname.split('/')[3]);
      const reply = await store.get('replies', replyId);
      if (!reply) return json(res, 404, { error: 'Reply not found' });
      if (!reply.responseDraft || !['interested', 'meeting-requested', 'asks-for-information'].includes(reply.classification?.label)) {
        return json(res, 409, { error: 'This reply has no response draft eligible for owner review' });
      }
      const prospect = reply.prospectId ? await store.get('prospects', reply.prospectId) : null;
      if (!prospect || ['suppressed', 'bounce', 'complaint', 'paid', 'delivered'].includes(String(prospect.status || '').toLowerCase())) {
        return json(res, 409, { error: 'This reply is no longer response-reviewable' });
      }
      const checked = validateResponseDraft(await parseBody(req));
      if (!checked.ok) return json(res, 400, { error: 'The response edit failed the safety gate', reasons: checked.reasons });
      const editedAt = now();
      const updated = await store.patch('replies', replyId, {
        responseDraft: {
          ...reply.responseDraft,
          subject: checked.subject,
          body: checked.body,
          status: 'needs-owner-approval',
          source: 'owner-edit',
          sendEligible: false,
          approvedAt: null,
          editedAt
        },
        updatedAt: editedAt
      });
      await store.log('reply_draft_edited', { replyId, prospectId: reply.prospectId });
      return json(res, 200, updated);
    }
    if (method === 'POST' && /^\/api\/replies\/[^/]+\/approve-response$/.test(url.pathname)) {
      const replyId = decodeURIComponent(url.pathname.split('/')[3]);
      const reply = await store.get('replies', replyId);
      if (!reply) return json(res, 404, { error: 'Reply not found' });
      if (!reply.responseDraft || !['interested', 'meeting-requested', 'asks-for-information'].includes(reply.classification?.label)) {
        return json(res, 409, { error: 'This reply has no response draft eligible for owner approval' });
      }
      if (reply.responseDraft.status === 'owner-approved') {
        return json(res, 200, { reply, alreadyApproved: true, sent: false });
      }
      const prospect = reply.prospectId ? await store.get('prospects', reply.prospectId) : null;
      if (!prospect || ['suppressed', 'bounce', 'complaint', 'paid', 'delivered'].includes(String(prospect.status || '').toLowerCase())) {
        return json(res, 409, { error: 'This reply is no longer response-reviewable' });
      }
      const checked = validateResponseDraft(reply.responseDraft);
      if (!checked.ok) return json(res, 409, { error: 'The stored response failed the safety gate', reasons: checked.reasons });
      const approvedAt = now();
      const updated = await store.patch('replies', replyId, {
        responseDraft: {
          ...reply.responseDraft,
          subject: checked.subject,
          body: checked.body,
          status: 'owner-approved',
          sendEligible: false,
          approvedAt
        },
        updatedAt: approvedAt
      });
      await store.log('reply_response_approved', { replyId, prospectId: reply.prospectId, sent: false });
      return json(res, 200, { reply: updated, alreadyApproved: false, sent: false });
    }
    if (method === 'POST' && url.pathname === '/api/poll-replies') {
      const job = await queue.enqueue('replies.poll', {}, { maxAttempts: 5, singletonKey: 'singleton:replies.poll', dedupeKey: `replies:manual:${Math.floor(Date.now() / 60000)}` });
      return json(res, 202, { queued: true, jobId: job.id, status: job.status });
    }
    if (method === 'POST' && url.pathname === '/api/suppress') {
      const input = await parseBody(req);
      if (!input.value) throw new HttpError(400, 'value required');
      const value = String(input.value).trim().toLowerCase();
      if (value.length > 320 || /[\s/?#]/.test(value)) throw new HttpError(400, 'Suppression must be one email address or domain');
      const result = await store.suppressOutbound({ values: [value], reason: String(input.reason || 'manual').slice(0, 160) });
      return json(res, 201, { value: result.values[0], suppressed: true });
    }
    if (method === 'POST' && url.pathname === '/api/notifications/read') {
      const input = await parseBody(req);
      const notification = await store.patch('notifications', input.id, { status: 'read', readAt: now() });
      return notification ? json(res, 200, notification) : json(res, 404, { error: 'Notification not found' });
    }
    if (method === 'POST' && url.pathname === '/api/test/unlock') {
      if (!config.revenue.allowTestUnlock || config.nodeEnv === 'production') return json(res, 403, { error: 'Test payment unlock is disabled' });
      const input = await parseBody(req);
      return json(res, 200, await revenue.unlockLead(input.leadId, input.product || 'full', { provider: 'test', eventId: id('test'), amountCents: Number(input.amountCents || 0) }));
    }

    if (method === 'GET' && url.pathname === '/api/export.csv') {
      const columns = ['campaign_id', 'company', 'website', 'domain', 'country', 'city', 'latitude', 'longitude', 'niche', 'source_provider', 'source_url', 'source_record_id', 'source_license', 'source_attribution', 'discovered_at', 'status', 'score', 'tier', 'contact', 'issue', 'service', 'subject', 'draft'];
      const rows = (await store.list('prospects')).map(prospect => [
        prospect.campaignId, prospect.company, prospect.website, prospect.domain, prospect.country, prospect.city,
        prospect.location?.latitude ?? '', prospect.location?.longitude ?? '', prospect.niche,
        prospect.sourceProvider || prospect.source, prospect.sourceUrl, prospect.sourceRecordId,
        prospect.sourceLicense, prospect.sourceAttribution, prospect.discoveredAt, prospect.status,
        prospect.score?.total || '', prospect.score?.tier || '', prospect.contact?.email || '',
        prospect.issue?.title || '', prospect.issue?.service || '', prospect.subject || '', prospect.draft || ''
      ]);
      return text(res, 200, [columns, ...rows].map(row => row.map(csvEscape).join(',')).join('\n'), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="uberbond-opportunities.csv"' });
    }
    if (method === 'GET' && url.pathname === '/api/export.json') {
      const [prospects, campaigns, leads, offers, orders, deliveries, subscriptions] = await Promise.all([
        store.list('prospects'), store.list('campaigns'), store.list('leads'), store.list('offers'), store.list('orders'), store.list('deliveries'), store.list('subscriptions')
      ]);
      return text(res, 200, JSON.stringify({ exportedAt: now(), prospects, campaigns, leads, offers, orders, deliveries, subscriptions }, null, 2), 'application/json; charset=utf-8', { 'content-disposition': 'attachment; filename="uberbond-revenue-engine.json"' });
    }

    if (method === 'POST' && url.pathname === '/oauth/google/start') {
      if (!config.google.clientId || !config.google.clientSecret || !/^[a-f0-9]{64}$/i.test(config.encryptionKey || '')) {
        throw new HttpError(503, 'Gmail OAuth is not configured');
      }
      const input = await parseBody(req);
      const slot = input.slot === 'B' ? 'B' : 'A';
      const state = createOAuthState(slot, config.encryptionKey);
      await rememberOAuthState(state, verifyOAuthState(state, config.encryptionKey));
      return json(res, 200, { url: googleAuthUrl(config.google, state), slot });
    }
    if (method === 'GET' && url.pathname === '/oauth/google/start') {
      return json(res, 405, { error: 'Start Gmail OAuth from the authenticated command center' });
    }
    if (method === 'GET' && url.pathname === '/oauth/google/callback') {
      if (url.searchParams.get('error')) throw new HttpError(400, 'Google authorization was not completed');
      const stateValue = url.searchParams.get('state');
      const state = verifyOAuthState(stateValue, config.encryptionKey);
      const code = url.searchParams.get('code');
      if (!state || !code || !(await consumeOAuthState(stateValue, state))) throw new HttpError(400, 'Invalid or expired OAuth state');
      const tokens = await exchangeCode(config.google, code);
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
    // Always log full detail server-side; never expose raw internal messages on 5xx
    // (this handler also serves the unauthenticated public API). 4xx messages are
    // intentional, caller-facing validation text and stay as-is.
    if (status >= 500) console.error('[server] request failed', safeErrorDetails(error));
    const message = status === 503
      ? 'Service temporarily unavailable. Please try again shortly.'
      : status >= 500
        ? 'Something went wrong on our side. Please try again.'
        : error.message;
    return json(res, status, { error: message });
  }
});

server.listen(config.port, () => console.log(`UberBond Revenue Engine running on ${config.baseUrl} using ${config.storeBackend}`));

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);
  stopScheduler();
  if (localWorkerPromise) await queue.stopWorker().catch(error => console.error('Local worker stop failed', safeErrorDetails(error)));
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
