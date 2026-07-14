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
import { normalizeCountryList } from './src/send-safety.mjs';
import { verifyUnsubscribeToken } from './src/unsubscribe.mjs';

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
  dedupeKey: payload.leadId ? `research:lead:${payload.leadId}` : `research:${payload.reason || 'manual'}:${Math.floor(Date.now() / 30000)}`
});
revenue = new RevenueEngine(store, config, pipeline, { enqueueResearch });
const discoveryRunner = new DiscoveryRunner(store, config);
const handlers = createJobHandlers({ store, pipeline, revenue, discoveryRunner });
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
  try { return JSON.parse(content); }
  catch { throw new HttpError(400, 'Malformed JSON body'); }
};
// Constant-time comparison so a valid admin token cannot be recovered byte-by-byte
// through response-timing analysis. timingSafeEqual throws on length mismatch, so
// guard length first (leaking only length, which is standard and negligible here).
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
  if (safeEqual(bearer, config.adminToken)) return true;
  const queryToken = new URL(req.url, config.baseUrl).searchParams.get('token') || '';
  return safeEqual(queryToken, config.adminToken);
};
const pct = (numerator, denominator) => denominator ? Math.round(numerator / denominator * 100) : 0;
const publicApi = pathname => pathname === '/api/health' || pathname === '/api/public/unsubscribe' || pathname === '/api/public/config' || pathname === '/api/public/audit' || pathname.startsWith('/api/public/report/') || pathname.startsWith('/api/public/artifacts/') || pathname === '/api/public/checkout' || pathname === '/webhooks/lemonsqueezy';
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
      return json(res, 200, await revenue.handleLemonWebhook(raw, req.headers['x-signature']));
    }

    if (method === 'GET' && url.pathname === '/api/summary') return json(res, 200, await summary());
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
    // Always log full detail server-side; never expose raw internal messages on 5xx
    // (this handler also serves the unauthenticated public API). 4xx messages are
    // intentional, caller-facing validation text and stay as-is.
    if (status >= 500) console.error(error);
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
  if (localWorkerPromise) await queue.stopWorker().catch(error => console.error('Local worker stop failed', error));
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
