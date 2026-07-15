import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { SCHEMA_SQL } from '../lite/lib/schema.mjs';
import { createReportToken, hashToken, isTokenShape } from '../lite/lib/tokens.mjs';
import { parseEmail, parseWebsite, parseLeadInput, LiteInputError } from '../lite/lib/validate.mjs';
import { isPrivateIp } from '../lite/lib/security.mjs';
import { getLimits, decideAuditRateLimit, decideLeadRateLimit } from '../lite/lib/rate-limit.mjs';
import { buildReport } from '../lite/lib/report.mjs';
import { sendOwnerEmail, formatPendingLeadLog } from '../lite/lib/email.mjs';
import { clientAddress, requesterHash, readJson } from '../lite/lib/http.mjs';
import { createHandler as createHealthHandler } from '../lite/api/health.mjs';
import { createHandler as createRequestHandler } from '../lite/api/request-audit.mjs';
import { createHandler as createReportHandler } from '../lite/api/report.mjs';
import { createHandler as createInterestHandler } from '../lite/api/interest.mjs';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const privateLookup = async () => [{ address: '10.0.0.5', family: 4 }];

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (data) => { res.body = JSON.parse(data); };
  return res;
}
const fakeReq = (over = {}) => ({
  method: 'POST',
  headers: { 'x-forwarded-for': '203.0.113.9' },
  socket: { remoteAddress: '203.0.113.9' },
  ...over
});

test('lite migration file stays byte-identical to embedded schema', async () => {
  const file = await fs.readFile(new URL('../lite/migrations/lite_001.sql', import.meta.url), 'utf8');
  assert.equal(file, SCHEMA_SQL);
});

test('report tokens are high-entropy, URL-safe, and hash deterministically', () => {
  const token = createReportToken();
  assert(isTokenShape(token));
  assert(token.length >= 40);
  assert.match(hashToken(token), /^[a-f0-9]{64}$/);
  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), hashToken(createReportToken()));
  for (const bad of ['', 'short', 'has space '.repeat(5), 'x'.repeat(101), 'inject/../etc', null, 42]) {
    assert.equal(isTokenShape(bad), false, `should reject ${String(bad)}`);
  }
});

test('email validation accepts real addresses and rejects junk', () => {
  assert.equal(parseEmail('  Dr.Founder@Clinic.COM '), 'dr.founder@clinic.com');
  for (const bad of ['', 'nope', 'a@b', 'a b@c.com', '@x.com', 'a@.com', 'x'.repeat(250) + '@a.com']) {
    assert.throws(() => parseEmail(bad), LiteInputError);
  }
});

test('website validation blocks SSRF vectors and normalizes public sites', async () => {
  assert.equal(isPrivateIp('0.1.2.3'), true);
  assert.equal(isPrivateIp('::ffff:127.0.0.1'), true);
  const good = await parseWebsite('www.Example.com/path?a=1#frag', { lookup: publicLookup });
  assert.equal(good.domain, 'example.com');
  assert.equal(good.href, 'https://www.example.com/path?a=1');
  await assert.rejects(parseWebsite('ftp://example.com', { lookup: publicLookup }), /HTTP and HTTPS/);
  await assert.rejects(parseWebsite('https://user:pass@example.com', { lookup: publicLookup }), /credentials/);
  await assert.rejects(parseWebsite('http://localhost:8080', { lookup: publicLookup }), /Local addresses/);
  await assert.rejects(parseWebsite('http://internal.local', { lookup: publicLookup }), /Local addresses/);
  await assert.rejects(parseWebsite('http://192.168.1.1', { lookup: publicLookup }), /Private and reserved/);
  await assert.rejects(parseWebsite('http://169.254.169.254/latest/meta-data', { lookup: publicLookup }), /Private and reserved/);
  await assert.rejects(parseWebsite('http://rebind.attacker.example', { lookup: privateLookup }), /resolves to a private/);
  await assert.rejects(parseWebsite('', { lookup: publicLookup }), /enter your website/);
  await assert.rejects(parseWebsite('x'.repeat(301), { lookup: publicLookup }), /too long/);
});

test('pre-parsed serverless request bodies still enforce the byte limit', async () => {
  await assert.rejects(
    readJson({ body: { message: 'x'.repeat(9 * 1024) } }),
    error => error instanceof LiteInputError && error.status === 413
  );
  assert.deepEqual(await readJson({ body: { ok: true } }), { ok: true });
});

test('rate-limit decisions cover every gate with friendly messages', () => {
  const limits = getLimits({ LITE_MAX_PER_IP_HOUR: '3', LITE_MAX_PER_EMAIL_DAY: '3', LITE_MAX_ACTIVE_QUEUE: '25', LITE_MAX_LEADS_PER_IP_HOUR: '5' });
  assert.deepEqual(decideAuditRateLimit({ perIpCount: 0, perEmailCount: 0, activeCount: 0 }, limits), { allowed: true });
  assert.equal(decideAuditRateLimit({ perIpCount: 3, perEmailCount: 0, activeCount: 0 }, limits).reason, 'ip_limit');
  assert.equal(decideAuditRateLimit({ perIpCount: 0, perEmailCount: 3, activeCount: 0 }, limits).reason, 'email_limit');
  assert.equal(decideAuditRateLimit({ perIpCount: 0, perEmailCount: 0, activeCount: 25 }, limits).reason, 'queue_full');
  assert.equal(decideLeadRateLimit({ perIpCount: 5 }, limits).reason, 'ip_limit');
  assert.equal(decideLeadRateLimit({ perIpCount: 4 }, limits).allowed, true);
  const defaults = getLimits({});
  assert.equal(defaults.perIpPerHour, 3);
  assert.equal(getLimits({ LITE_MAX_PER_IP_HOUR: '-2' }).perIpPerHour, 3);
});

test('buildReport strips screenshots, bounds the score, and grades correctly', () => {
  const crawl = { pages: [{}, {}], errors: [], summary: { pagesVisited: 2 }, engine: 'playwright' };
  const findings = [
    { code: 'no-cta', title: 'No CTA', severity: 5, confidence: 0.94, category: 'Conversion', implication: 'x', service: 'y', evidenceUrl: 'https://a', evidenceExcerpt: 'e', screenshots: { desktop: '/x.png' }, safeForOutreach: true },
    { code: 'mobile-overflow', title: 'Overflow', severity: 5, confidence: 0.99, category: 'Mobile', implication: 'x', service: 'y', evidenceUrl: 'https://a', evidenceExcerpt: 'e', screenshots: {} }
  ];
  const report = buildReport(crawl, findings);
  assert.equal(report.findings.length, 2);
  assert(!('screenshots' in report.findings[0]));
  assert(!('safeForOutreach' in report.findings[0]));
  assert.equal(report.summary.pagesVisited, 2);
  assert.equal(report.summary.pageErrors, 0);
  assert.deepEqual(report.summary.topFixes, ['No CTA', 'Overflow']);
  assert(report.score >= 15 && report.score <= 94);
  const clean = buildReport({ pages: [{}] }, []);
  assert.equal(clean.score, 96);
  assert.equal(clean.grade, 'Excellent');
  const wrecked = buildReport(crawl, Array.from({ length: 12 }, (_, i) => ({
    code: `f-${i}`, title: `F${i}`, severity: 5, confidence: 0.99,
    category: 'Technical', implication: 'A supported high-impact issue.', service: 'Website repair',
    evidenceUrl: `https://example.com/page-${i}`, evidenceExcerpt: `Measured issue ${i}.`
  })));
  assert.equal(wrecked.score, 15);
  assert.equal(wrecked.grade, 'Critical gaps');
});

test('owner email is a graceful no-op without secrets and posts correctly with them', async () => {
  const neverCalled = async () => { throw new Error('fetch must not be called'); };
  const skipped = await sendOwnerEmail({ subject: 's', text: 't' }, { fetchImpl: neverCalled, env: {} });
  assert.equal(skipped.skipped, true);
  let captured = null;
  const okFetch = async (url, options) => { captured = { url, options }; return { ok: true }; };
  const sent = await sendOwnerEmail({ subject: 'Lead', text: 'Body' }, {
    fetchImpl: okFetch, env: { RESEND_API_KEY: 'k', OWNER_EMAIL: 'owner@x.com' }
  });
  assert.equal(sent.ok, true);
  assert.equal(captured.url, 'https://api.resend.com/emails');
  assert.equal(captured.options.headers.authorization, 'Bearer k');
  const payload = JSON.parse(captured.options.body);
  assert.deepEqual(payload.to, ['owner@x.com']);
  const failed = await sendOwnerEmail({ subject: 's', text: 't' }, {
    fetchImpl: async () => ({ ok: false, status: 422, text: async () => 'bad from' }),
    env: { RESEND_API_KEY: 'k', OWNER_EMAIL: 'o@x.com' }
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 422);
});

test('fallback lead log preserves the database pointer without exposing PII', () => {
  const line = formatPendingLeadLog({
    id: 'lead-123', domain: 'clinic.example', created_at: '2026-07-15T10:00:00.000Z',
    email: 'private@example.com', name: 'Private Person', message: 'Sensitive request'
  });
  assert.match(line, /lead-123/);
  assert.match(line, /clinic\.example/);
  assert.doesNotMatch(line, /private@example\.com|Private Person|Sensitive request/);
});

test('health endpoint fails closed until the database is configured and reachable', async () => {
  const missing = fakeRes();
  await createHealthHandler({ env: {}, ensure: async () => {}, query: async () => ({ rows: [] }) })(
    fakeReq({ method: 'GET' }), missing
  );
  assert.equal(missing.statusCode, 503);
  assert.equal(missing.body.ok, false);

  let checked = false;
  const healthy = fakeRes();
  await createHealthHandler({
    env: { DATABASE_URL: 'postgres://configured' },
    ensure: async () => {},
    query: async text => { checked = text === 'SELECT 1 AS ok'; return { rows: [{ ok: 1 }] }; }
  })(fakeReq({ method: 'GET' }), healthy);
  assert.equal(healthy.statusCode, 200);
  assert.equal(healthy.body.databaseReachable, true);
  assert.equal(checked, true);

  const unreachable = fakeRes();
  await createHealthHandler({
    env: { DATABASE_URL: 'postgres://configured' },
    ensure: async () => { throw new Error('connection refused'); },
    query: async () => ({ rows: [] })
  })(fakeReq({ method: 'GET' }), unreachable);
  assert.equal(unreachable.statusCode, 503);
});

test('Vercel config protects capability-token report routes', async () => {
  const config = JSON.parse(await fs.readFile(new URL('../lite/vercel.json', import.meta.url), 'utf8'));
  assert(config.rewrites.some(rule => rule.source === '/r/:token' && rule.destination === '/report.html'));
  const global = config.headers.find(rule => rule.source === '/(.*)');
  assert(global.headers.some(header => header.key === 'Referrer-Policy' && header.value === 'no-referrer'));
  assert(global.headers.some(header => header.key === 'Content-Security-Policy'));
  const report = config.headers.find(rule => rule.source === '/r/:token');
  assert(report.headers.some(header => header.key === 'Cache-Control' && /no-store/.test(header.value)));
  assert(report.headers.some(header => header.key === 'X-Robots-Tag' && /noindex/.test(header.value)));
});

test('client address and requester hash are stable and salted', () => {
  const req = fakeReq({ headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' } });
  assert.equal(clientAddress(req), '198.51.100.7');
  const h1 = requesterHash(req);
  assert.match(h1, /^[a-f0-9]{64}$/);
  assert.equal(h1, requesterHash(req));
  assert.notEqual(h1, requesterHash(fakeReq({ headers: { 'x-forwarded-for': '198.51.100.8' } })));
});

function stubQuery(state) {
  return async (text, params = []) => {
    if (text.includes('COUNT(*)') && text.includes('requester_hash') && text.includes('lite_audit_requests')) return { rows: [{ n: state.perIp }] };
    if (text.includes('COUNT(*)') && text.includes('email')) return { rows: [{ n: state.perEmail }] };
    if (text.includes("status IN ('queued','running')")) return { rows: [{ n: state.active }] };
    if (text.startsWith('INSERT INTO lite_audit_requests')) { state.inserted = params; return { rows: [{ id: params[0] }] }; }
    if (text.includes('COUNT(*)') && text.includes('lite_leads')) return { rows: [{ n: state.leadCount || 0 }] };
    if (text.includes('FROM lite_audit_requests r')) return { rows: state.reportRows || [] };
    if (text.startsWith('INSERT INTO lite_leads')) { state.leadInserted = params; return { rows: [{ id: params[0] }] }; }
    if (text.startsWith('UPDATE lite_leads')) { state.leadNotified = params[0]; return { rows: [] }; }
    throw new Error(`unexpected query in stub: ${text.slice(0, 60)}`);
  };
}

test('request-audit handler queues valid submissions and enforces limits', async () => {
  const state = { perIp: 0, perEmail: 0, active: 0 };
  const handler = createRequestHandler({ query: stubQuery(state), ensure: async () => {}, lookup: publicLookup });
  const res = fakeRes();
  await handler(fakeReq({ body: { website: 'clinic-example.com', email: 'Founder@Clinic.com' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.match(res.body.reportPath, /^\/r\/[A-Za-z0-9_-]{40,}$/);
  assert.equal(res.body.domain, 'clinic-example.com');
  assert.equal(state.inserted[3], 'founder@clinic.com');
  assert.match(state.inserted[4], /^[a-f0-9]{64}$/); // token hash, never the raw token

  const limited = fakeRes();
  await createRequestHandler({ query: stubQuery({ perIp: 3, perEmail: 0, active: 0 }), ensure: async () => {}, lookup: publicLookup })(
    fakeReq({ body: { website: 'clinic-example.com', email: 'f@c.com' } }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.reason, 'ip_limit');

  const badSite = fakeRes();
  await handler(fakeReq({ body: { website: 'http://192.168.0.1', email: 'f@c.com' } }), badSite);
  assert.equal(badSite.statusCode, 400);

  const wrongMethod = fakeRes();
  await handler(fakeReq({ method: 'GET' }), wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
});

test('report handler validates token shape and hides unknown reports', async () => {
  const handler = createReportHandler({ query: stubQuery({ reportRows: [] }), ensure: async () => {} });
  const bad = fakeRes();
  await handler(fakeReq({ method: 'GET', url: '/api/report?token=short' }), bad);
  assert.equal(bad.statusCode, 400);
  const missing = fakeRes();
  await handler(fakeReq({ method: 'GET', url: `/api/report?token=${createReportToken()}` }), missing);
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.headers['x-robots-tag'], 'noindex');
});

test('interest handler stores leads, requires an email, and notifies the owner', async () => {
  const state = { reportRows: [{ id: 'req1', domain: 'clinic-example.com', status: 'done', score: 82, findings: [] }], leadCount: 0 };
  let notified = null;
  const handler = createInterestHandler({
    query: stubQuery(state),
    ensure: async () => {},
    notify: async (payload) => { notified = payload; return { ok: true }; }
  });
  const res = fakeRes();
  const token = createReportToken();
  await handler(fakeReq({ body: { token, email: 'lead@clinic.com', name: 'Dr. A', message: 'Fix it all' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.leadInserted[2], 'lead@clinic.com');
  assert.match(notified.subject, /clinic-example\.com/);
  assert.equal(state.leadNotified, state.leadInserted[0]); // marked notified after email success

  const noEmail = fakeRes();
  await handler(fakeReq({ body: { token } }), noEmail);
  assert.equal(noEmail.statusCode, 400);

  const badToken = fakeRes();
  await handler(fakeReq({ body: { token: 'nope', email: 'a@b.com' } }), badToken);
  assert.equal(badToken.statusCode, 400);
});

test('lead input is length-capped and optional fields normalize to null', () => {
  const lead = parseLeadInput({ name: ' N '.padEnd(200, 'x'), message: 'm'.repeat(3000), email: ' A@B.co ' });
  assert.equal(lead.name.length, 120);
  assert.equal(lead.message.length, 2000);
  assert.equal(lead.email, 'a@b.co');
  assert.deepEqual(parseLeadInput({}), { name: null, message: null, email: null });
});
