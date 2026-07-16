import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA_SQL } from '../lite/lib/schema.mjs';
import {
  createAuditRequest, claimNextAudit, completeAudit, failAudit, sweepStaleRequests,
  getReportByTokenHash, createLead, pendingLeads, markLeadNotified, countActiveRequests
} from '../lite/lib/db.mjs';
import { buildReport } from '../lite/lib/report.mjs';
import { createReportToken, hashToken } from '../lite/lib/tokens.mjs';
import { createHandler as createRequestHandler } from '../lite/api/request-audit.mjs';
import { createHandler as createReportHandler } from '../lite/api/report.mjs';
import { createHandler as createInterestHandler } from '../lite/api/interest.mjs';
import { databaseFingerprint, emitQueueDiagnostic } from '../lite/lib/queue-diagnostics.mjs';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const FUTURE = new Date(Date.now() - 60_000); // "stale before" cutoff in the recent past
const MAX_ATTEMPTS = 2;

let db, qx;
test.before(async () => {
  db = new PGlite();
  await db.exec(SCHEMA_SQL);
  qx = (text, params = []) => db.query(text, params);
});
test.after(async () => { await db.close(); });

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (data) => { res.body = JSON.parse(data); };
  return res;
}
const fakeReq = (over = {}) => ({
  method: 'POST',
  headers: { 'x-forwarded-for': over.ip || '203.0.113.9' },
  socket: { remoteAddress: '203.0.113.9' },
  ...over
});

const fakeCrawl = {
  engine: 'playwright',
  pages: [{ url: 'https://clinic-example.com/' }],
  errors: [],
  summary: { pagesVisited: 1 }
};
const fakeFindings = [
  { code: 'no-cta', title: 'No obvious primary action was detected', severity: 5, confidence: 0.94, category: 'Conversion', implication: 'A ready visitor may not know what to do next.', service: 'Conversion design', evidenceUrl: 'https://clinic-example.com/', evidenceExcerpt: 'No visible booking action.', screenshots: { desktop: '/x.png' } }
];

test('submission and worker diagnostics prove one shared queue without leaking secrets', async () => {
  const isolatedDb = new PGlite();
  await isolatedDb.exec(SCHEMA_SQL);
  const query = (text, params = []) => isolatedDb.query(text, params);
  const databaseUrl = 'postgresql://diagnostic_role:never-log-this-password@ep-shared-pooler.example.net/lite_db?sslmode=require';
  const lines = [];
  const logger = {
    info: line => lines.push(line),
    warn: line => lines.push(line)
  };

  try {
    const requestHandler = createRequestHandler({
      query,
      ensure: async () => {},
      lookup: publicLookup,
      env: { DATABASE_URL: databaseUrl },
      logger
    });
    const submitted = fakeRes();
    await requestHandler(fakeReq({
      ip: '198.51.100.201',
      body: { website: 'https://diagnostic-example.com', email: 'private@diagnostic-example.com' }
    }), submitted);
    assert.equal(submitted.statusCode, 200);
    assert.match(lines[0], /source=vercel-submit/);
    assert.match(lines[0], /inserted=true queued=1 running=0 done=0/);

    const workerStart = await emitQueueDiagnostic({
      query,
      databaseUrl,
      source: 'github-worker-start',
      logger
    });
    assert.equal(workerStart.ok, true);
    assert.deepEqual(workerStart.counts, { queued: 1, running: 0, done: 0 });

    const claimed = await claimNextAudit(query, { staleBefore: FUTURE, maxAttempts: MAX_ATTEMPTS });
    assert.equal(claimed.domain, 'diagnostic-example.com');
    await completeAudit(query, {
      requestId: claimed.id,
      domain: claimed.domain,
      score: 88,
      summary: { grade: 'Strong', pagesVisited: 1, pageErrors: 0, topFixes: [] },
      findings: []
    });
    const workerEnd = await emitQueueDiagnostic({
      query,
      databaseUrl,
      source: 'github-worker-end',
      logger
    });
    assert.deepEqual(workerEnd.counts, { queued: 0, running: 0, done: 1 });

    const fingerprint = databaseFingerprint(databaseUrl);
    assert.match(fingerprint, /^[a-f0-9]{16}$/);
    assert.equal(
      fingerprint,
      databaseFingerprint('postgres://diagnostic_role:rotated-password@ep-shared-pooler.example.net:5432/lite_db?channel_binding=require')
    );
    assert.notEqual(
      fingerprint,
      databaseFingerprint('postgresql://diagnostic_role:anything@ep-other-pooler.example.net/lite_db')
    );
    assert(lines.every(line => line.includes(`db=${fingerprint}`)));
    assert.doesNotMatch(
      lines.join('\n'),
      /never-log-this-password|rotated-password|private@|diagnostic_role|ep-shared-pooler|postgres(?:ql)?:\/\//
    );
  } finally {
    await isolatedDb.close();
  }
});

test('full lite flow: request → claim → report → secure link → lead', async () => {
  // 1. Visitor submits through the real API handler
  const requestHandler = createRequestHandler({ query: qx, ensure: async () => {}, lookup: publicLookup });
  const submitRes = fakeRes();
  await requestHandler(fakeReq({ body: { website: 'https://clinic-example.com', email: 'founder@clinic-example.com' } }), submitRes);
  assert.equal(submitRes.statusCode, 200);
  const token = submitRes.body.reportPath.replace('/r/', '');

  // 2. Report shows queued while waiting for the scheduled worker
  const reportHandler = createReportHandler({ query: qx, ensure: async () => {} });
  const queuedRes = fakeRes();
  await reportHandler(fakeReq({ method: 'GET', url: `/api/report?token=${token}` }), queuedRes);
  assert.equal(queuedRes.body.status, 'queued');
  assert.equal(await countActiveRequests(qx), 1);

  // 3. Worker claims exactly this item (attempt counter increments)
  const claimed = await claimNextAudit(qx, { staleBefore: FUTURE, maxAttempts: MAX_ATTEMPTS });
  assert.equal(claimed.domain, 'clinic-example.com');
  assert.equal(claimed.attempts, 1);
  assert.equal(await claimNextAudit(qx, { staleBefore: FUTURE, maxAttempts: MAX_ATTEMPTS }), null, 'no double-claim');

  // 4. Worker stores the report
  const report = buildReport(fakeCrawl, fakeFindings);
  await completeAudit(qx, { requestId: claimed.id, domain: claimed.domain, score: report.score, summary: report.summary, findings: report.findings });

  // 5. Secure link now serves the full report; wrong tokens stay blind
  const doneRes = fakeRes();
  await reportHandler(fakeReq({ method: 'GET', url: `/api/report?token=${token}` }), doneRes);
  assert.equal(doneRes.body.status, 'done');
  assert.equal(doneRes.body.report.score, report.score);
  assert.equal(doneRes.body.report.findings.length, 1);
  assert(!('screenshots' in doneRes.body.report.findings[0]));
  assert.equal(doneRes.body.report.summary.grade, report.grade);
  const wrongRes = fakeRes();
  await reportHandler(fakeReq({ method: 'GET', url: `/api/report?token=${createReportToken()}` }), wrongRes);
  assert.equal(wrongRes.statusCode, 404);

  // 6. "Request implementation" stores a lead; without email config it stays pending for the worker
  const interestHandler = createInterestHandler({ query: qx, ensure: async () => {}, notify: async () => ({ skipped: true, reason: 'missing RESEND_API_KEY' }) });
  const leadRes = fakeRes();
  await interestHandler(fakeReq({ body: { token, email: 'founder@clinic-example.com', message: 'Implement the CTA fix.' } }), leadRes);
  assert.equal(leadRes.statusCode, 200);
  let pending = await pendingLeads(qx);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].domain, 'clinic-example.com');
  await markLeadNotified(qx, pending[0].id);
  pending = await pendingLeads(qx);
  assert.equal(pending.length, 0);
});

test('retry then permanent failure path is visible through the secure link', async () => {
  const token = createReportToken();
  await createAuditRequest(qx, {
    websiteUrl: 'https://blocked-example.com/', domain: 'blocked-example.com',
    email: 'x@blocked-example.com', tokenHash: hashToken(token), requesterHash: 'r2'.padEnd(64, '0')
  });
  const first = await claimNextAudit(qx, { staleBefore: FUTURE, maxAttempts: MAX_ATTEMPTS });
  assert.equal(first.domain, 'blocked-example.com');
  assert.equal(await failAudit(qx, { requestId: first.id, error: 'blocked_by_robots', maxAttempts: MAX_ATTEMPTS }), 'queued');
  const second = await claimNextAudit(qx, { staleBefore: FUTURE, maxAttempts: MAX_ATTEMPTS });
  assert.equal(second.attempts, 2);
  assert.equal(await failAudit(qx, { requestId: second.id, error: 'blocked_by_robots', maxAttempts: MAX_ATTEMPTS }), 'failed');
  assert.equal(await claimNextAudit(qx, { staleBefore: FUTURE, maxAttempts: MAX_ATTEMPTS }), null);

  const reportHandler = createReportHandler({ query: qx, ensure: async () => {} });
  const res = fakeRes();
  await reportHandler(fakeReq({ method: 'GET', url: `/api/report?token=${token}` }), res);
  assert.equal(res.body.status, 'failed');
  assert.match(res.body.message, /could not complete/i);
});

test('stale exhausted runs are swept to failed; duplicate token hashes are rejected', async () => {
  const token = createReportToken();
  await createAuditRequest(qx, {
    websiteUrl: 'https://stale-example.com/', domain: 'stale-example.com',
    email: 'x@stale-example.com', tokenHash: hashToken(token), requesterHash: 'r3'.padEnd(64, '0')
  });
  await qx(
    "UPDATE lite_audit_requests SET status='running', attempts=$2, locked_at=now() - interval '2 hours' WHERE domain=$1",
    ['stale-example.com', MAX_ATTEMPTS]
  );
  const swept = await sweepStaleRequests(qx, { staleBefore: new Date(Date.now() - 20 * 60_000), maxAttempts: MAX_ATTEMPTS });
  assert.equal(swept, 1);
  const row = await getReportByTokenHash(qx, hashToken(token));
  assert.equal(row.status, 'failed');

  await assert.rejects(createAuditRequest(qx, {
    websiteUrl: 'https://dupe.com/', domain: 'dupe.com', email: 'd@dupe.com',
    tokenHash: hashToken(token), requesterHash: 'r4'.padEnd(64, '0')
  }), /unique|duplicate/i);
});

test('per-email daily limit is enforced end-to-end against real SQL counts', async () => {
  const handler = createRequestHandler({ query: qx, ensure: async () => {}, lookup: publicLookup });
  for (let i = 0; i < 3; i++) {
    const res = fakeRes();
    await handler(fakeReq({ ip: `198.51.100.${20 + i}`, body: { website: 'https://limit-example.com', email: 'same@limit.com' } }), res);
    assert.equal(res.statusCode, 200, `submission ${i + 1} should pass`);
  }
  const blocked = fakeRes();
  await handler(fakeReq({ ip: '198.51.100.99', body: { website: 'https://limit-example.com', email: 'same@limit.com' } }), blocked);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.reason, 'email_limit');
});
