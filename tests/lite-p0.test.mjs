import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { deterministicAudit } from '../src/audit-rules.mjs';
import { buildReport } from '../lite/lib/report.mjs';
import { SCHEMA_SQL } from '../lite/lib/schema.mjs';
import {
  createAuditRequest, claimNextAudit, completeAudit, failAudit,
  updateAuditStage, getReportByTokenHash
} from '../lite/lib/db.mjs';
import { createReportToken, hashToken } from '../lite/lib/tokens.mjs';
import { createHandler as createRequestHandler } from '../lite/api/request-audit.mjs';
import { createHandler as createReportHandler } from '../lite/api/report.mjs';
import { createHandler as createInterestHandler } from '../lite/api/interest.mjs';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const staleBefore = new Date(Date.now() - 60_000);

function page(overrides = {}) {
  return {
    url: 'https://example.com/', requestedUrl: 'https://example.com/', status: 200,
    title: 'Example Business Services', description: 'Clear description for customers.',
    h1Count: 1, visibleH1: ['A clear customer promise'],
    headings: [{ level: 'h1', text: 'A clear customer promise' }],
    robotsMeta: [], responseHeaders: {}, ctas: [{ text: 'Contact us', aboveFold: true }],
    controls: [], images: [], forms: [], bodyText: 'A legitimate online business serving customers.',
    lang: 'en', contactSignals: 1, brokenLinks: [],
    performance: { navigation: { domContentLoadedEventEnd: 900 } },
    mobile: {
      horizontalOverflow: false, controls: [{ text: 'Contact us', width: 120, height: 28 }],
      ctas: [{ text: 'Contact us', aboveFold: true }], document: { width: 390 }, viewport: { width: 390 }
    },
    screenshots: { desktop: '/tmp/private-desktop.png', mobile: '/tmp/private-mobile.png' },
    ...overrides
  };
}

function rawFinding(overrides = {}) {
  return {
    code: 'missing-title', title: 'Homepage has no document title', severity: 4, confidence: 0.99,
    category: 'SEO', implication: 'Customers and search engines receive less context.',
    service: 'Website foundation', evidenceUrl: 'https://example.com/',
    evidenceExcerpt: 'The document title is empty or absent.',
    evidence: { type: 'page_metadata', url: 'https://example.com/', field: 'document_title', observedValue: 'absent' },
    screenshots: { desktop: '/workspace/secret.png' },
    ...overrides
  };
}

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: null };
  res.setHeader = (key, value) => { res.headers[key.toLowerCase()] = value; };
  res.end = data => { res.body = JSON.parse(data); };
  return res;
}

const fakeReq = (overrides = {}) => ({
  method: 'POST',
  headers: { 'x-forwarded-for': overrides.ip || '203.0.113.9' },
  socket: { remoteAddress: '203.0.113.9' },
  ...overrides
});

test('P0 SEO, performance, HTTPS, contact, and mobile findings use explicit evidence', () => {
  const audit = deterministicAudit({
    pages: [page({
      url: 'http://example.com/', requestedUrl: 'http://example.com/',
      title: '', description: '', h1Count: 3,
      robotsMeta: [{ name: 'robots', content: 'noindex, nofollow' }],
      ctas: [{ text: 'Contact us', aboveFold: true }], contactSignals: 0,
      performance: { navigation: { domContentLoadedEventEnd: 3456.78 } },
      mobile: {
        horizontalOverflow: false,
        controls: [
          { text: 'A', width: 20, height: 20 },
          { text: 'B', width: 24, height: 22 },
          { text: 'C', width: 18, height: 18 }
        ],
        ctas: [], document: { width: 390 }, viewport: { width: 390 }
      }
    })], errors: []
  });
  const codes = new Set(audit.map(finding => finding.code));
  for (const expected of ['missing-title', 'missing-description', 'excessive-h1', 'noindex', 'slow-dom-content-loaded', 'https-not-enforced', 'weak-contact-path', 'small-touch-targets', 'mobile-primary-action-hidden']) {
    assert(codes.has(expected), `missing ${expected}`);
  }
  const performance = audit.find(finding => finding.code === 'slow-dom-content-loaded');
  assert.deepEqual(performance.evidence, {
    type: 'measurement', url: 'http://example.com/',
    metric: 'PerformanceNavigationTiming.domContentLoadedEventEnd',
    value: 3500, unit: 'ms', context: 'laboratory'
  });
  assert.doesNotMatch(performance.title + performance.implication, /field core web vitals|ranking promise/i);
});

test('online-only businesses and ordinary text links suppress mobile and contact false positives', () => {
  const audit = deterministicAudit({
    pages: [page({
      bodyText: 'Online-only software business. Contact support through our help center.',
      contactSignals: 1,
      mobile: {
        horizontalOverflow: false,
        controls: [
          { text: 'Docs', width: 80, height: 20 },
          { text: 'Support', width: 90, height: 20 },
          { text: 'Contact us', width: 110, height: 20 }
        ],
        ctas: [{ text: 'Contact us', aboveFold: true }],
        document: { width: 390 }, viewport: { width: 390 }
      }
    })], errors: []
  });
  const codes = new Set(audit.map(finding => finding.code));
  assert.equal(codes.has('weak-contact-path'), false);
  assert.equal(codes.has('small-touch-targets'), false);
  assert.equal(codes.has('mobile-primary-action-hidden'), false);
});

test('report keeps fewer than three distinct priorities and consolidates overlapping findings', () => {
  const report = buildReport({ pages: [{}], errors: [], summary: { pagesVisited: 1 } }, [
    rawFinding({ code: 'no-cta', title: 'No obvious primary action', severity: 5, category: 'Conversion', service: 'Conversion design' }),
    rawFinding({ code: 'cta-below-fold', title: 'Primary action is below the fold', severity: 4, category: 'Conversion', service: 'Conversion design' })
  ]);
  assert.equal(report.priorities.length, 1);
  assert.equal(report.priorities[0].code, 'no-cta');
  assert.equal(report.summary.priorityCount, 1);
  assert.deepEqual(report.summary.topFixes, ['No obvious primary action']);
});

test('Quick Wins come only from high-confidence, lower-effort existing findings', () => {
  const report = buildReport({ pages: [{}] }, [
    rawFinding(),
    rawFinding({
      code: 'slow-dom-content-loaded', title: 'Laboratory page readiness was slow', severity: 4, confidence: 0.95,
      category: 'Performance', service: 'Performance optimization',
      evidenceExcerpt: 'PerformanceNavigationTiming.domContentLoadedEventEnd: 4200 ms.',
      evidence: { type: 'measurement', url: 'https://example.com/', metric: 'PerformanceNavigationTiming.domContentLoadedEventEnd', value: 4200, unit: 'ms', context: 'laboratory' }
    })
  ]);
  assert(report.quickWins.some(finding => finding.code === 'missing-title'));
  assert.equal(report.quickWins.some(finding => finding.code === 'slow-dom-content-loaded'), false);
  assert(report.quickWins.every(finding => finding.evidence && finding.quickWinReason));
});

test('report evidence invariant drops unsupported, private, internal, and evidence-free findings', () => {
  const report = buildReport({ pages: [{}] }, [
    rawFinding(),
    rawFinding({ code: 'bad-scheme', evidenceUrl: 'file:///workspace/report.html', evidence: { type: 'page_observation', url: 'file:///workspace/report.html', excerpt: 'x' } }),
    rawFinding({ code: 'private-url', evidenceUrl: 'http://127.0.0.1/admin', evidence: { type: 'page_observation', url: 'http://127.0.0.1/admin', excerpt: 'x' } }),
    rawFinding({ code: 'private-ipv6', evidenceExcerpt: 'Internal endpoint ::1', evidence: { type: 'page_observation', url: 'https://example.com/', excerpt: 'Internal endpoint ::1' } }),
    rawFinding({ code: 'internal-detail', evidenceExcerpt: 'Stack at /workspace/private/source.mjs', evidence: { type: 'page_observation', url: 'https://example.com/', excerpt: 'Stack at /workspace/private/source.mjs' } }),
    { code: 'unsupported', title: 'No evidence', severity: 5, confidence: 1, implication: 'Unknown', service: 'Unknown' }
  ]);
  assert.deepEqual(report.findings.map(finding => finding.code), ['missing-title']);
  assert(!('screenshots' in report.findings[0]));
  assert.equal(report.summary.evidencePolicy, 'validated_typed_evidence_only');
  assert.equal(report.summary.screenshotPolicy, 'ephemeral_not_retained');
});

test('Lite customer eligibility excludes unsafe and low-confidence findings from every output surface', () => {
  const thinDiscovery = rawFinding({
    code: 'thin-discovery', title: 'Only one usable public page was discovered', severity: 2,
    confidence: 0.60, category: 'Technical', safeForOutreach: false,
    implication: 'The crawl may have observed limited coverage.', service: 'Information architecture review',
    evidenceExcerpt: 'Crawler completed with 0 recorded errors.',
    evidence: { type: 'page_observation', url: 'https://example.com/', excerpt: 'Crawler completed with 0 recorded errors.' }
  });
  const unsafeHighConfidence = rawFinding({ code: 'unsafe-high', confidence: 0.99, safeForOutreach: false });
  const safeLowConfidence = rawFinding({ code: 'safe-low', confidence: 0.71, safeForOutreach: true });
  const report = buildReport({ pages: [{}], errors: [], summary: { pagesVisited: 1 } }, [
    thinDiscovery, unsafeHighConfidence, safeLowConfidence
  ]);

  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.priorities, []);
  assert.deepEqual(report.quickWins, []);
  assert.deepEqual(report.summary.implementationOptions, []);
  assert.equal(report.score, 96);
  assert.doesNotMatch(JSON.stringify(report), /safeForOutreach|thin-discovery|unsafe-high|safe-low/);
});

test('Lite suppresses medical and Gulf localization rules without verified structured metadata', () => {
  const gymCrawl = {
    pages: [page({
      bodyText: 'Independent city gym selling healthy products and strength training memberships.',
      visibleH1: ['Train stronger every week'],
      headings: [{ level: 'h1', text: 'Train stronger every week' }]
    })],
    errors: []
  };
  const gymAudit = deterministicAudit(gymCrawl, {});
  assert(gymAudit.some(finding => finding.code === 'medical-trust'), 'fixture must exercise the broad medical keyword rule');
  const gymReport = buildReport(gymCrawl, gymAudit);
  assert.equal(gymReport.findings.some(finding => finding.code === 'medical-trust'), false);

  const multilingualCrawl = {
    pages: [
      page({
        bodyText: 'A French multilingual software business supporting international customers, including a Dubai client.',
        lang: 'fr'
      }),
      page({ url: 'https://example.com/fr/', requestedUrl: 'https://example.com/fr/', lang: 'fr' })
    ],
    errors: []
  };
  const multilingualAudit = deterministicAudit(multilingualCrawl, { country: 'FR' });
  assert(multilingualAudit.some(finding => finding.code === 'arabic-opportunity'), 'fixture must exercise the broad Gulf keyword rule');
  const multilingualReport = buildReport(multilingualCrawl, multilingualAudit);
  assert.equal(multilingualReport.findings.some(finding => finding.code === 'arabic-opportunity'), false);

  const verticalOnly = buildReport({ pages: [{}], errors: [] }, [
    rawFinding({ code: 'medical-trust', title: 'Medical-only recommendation', confidence: 0.99, service: 'Medical trust communication' }),
    rawFinding({ code: 'arabic-opportunity', title: 'Gulf-only recommendation', confidence: 0.99, service: 'Arabic localization' })
  ]);
  assert.deepEqual(verticalOnly.findings, []);
  assert.deepEqual(verticalOnly.summary.implementationOptions, []);
  assert.doesNotMatch(JSON.stringify(verticalOnly), /clinic|medical|gulf|arabic/i);
});

for (const [failureName, crawlError] of [
  ['timeout', { url: 'https://example.com/about', error: 'navigation timeout after 25000ms' }],
  ['page error', { url: 'https://example.com/contact', status: 503 }],
  ['incomplete crawl', { url: 'https://example.com/services', error: 'blocked_by_robots' }]
]) {
  test(`degraded ${failureName} suppresses absence claims while retaining valid measured evidence`, () => {
    const absenceCodes = [
      'no-cta', 'weak-contact-path', 'missing-h1', 'missing-title',
      'missing-description', 'thin-discovery', 'mobile-primary-action-hidden'
    ];
    const absenceFindings = absenceCodes.map((code, index) => rawFinding({
      code,
      title: `Absence claim ${index}`,
      confidence: 0.99,
      safeForOutreach: true,
      evidence: { type: 'page_observation', url: 'https://example.com/', excerpt: `Absence observation ${index}` }
    }));
    const measured = rawFinding({
      code: 'slow-dom-content-loaded', title: 'Laboratory page readiness was slow', severity: 3,
      confidence: 0.94, category: 'Performance', service: 'Performance optimization',
      implication: 'The measured laboratory readiness observation was slow.',
      evidenceExcerpt: 'PerformanceNavigationTiming.domContentLoadedEventEnd was 4200 ms.',
      evidence: {
        type: 'measurement', url: 'https://example.com/',
        metric: 'PerformanceNavigationTiming.domContentLoadedEventEnd', value: 4200, unit: 'ms', context: 'laboratory'
      }
    });
    const report = buildReport({
      pages: [page()], errors: [crawlError], summary: { pagesVisited: 1 }
    }, [...absenceFindings, measured]);

    assert.deepEqual(report.findings.map(finding => finding.code), ['slow-dom-content-loaded']);
    assert.equal(report.summary.pageErrors, 1);
    assert.equal(report.summary.degradedCrawlPolicy, 'absence_findings_suppressed');
    assert.doesNotMatch(JSON.stringify(report), /navigation timeout|blocked_by_robots|503/);
  });
}

function seriousFinding(code, confidence = 0.94) {
  return rawFinding({
    code, title: `Supported issue ${code}`, severity: 5, confidence, safeForOutreach: true,
    implication: 'This is a distinct, supported high-impact issue.', service: 'Website repair',
    evidenceExcerpt: `Measured evidence for ${code}.`,
    evidence: { type: 'page_observation', url: `https://example.com/${code}`, excerpt: `Measured evidence for ${code}.` }
  });
}

test('score calibration is conservative, deterministic, and based on eligible distinct problem families', () => {
  const crawl = { pages: [page()], errors: [] };
  const empty = buildReport(crawl, []);
  assert.equal(empty.score, 96);

  const one = buildReport(crawl, [seriousFinding('one-serious', 0.99)]);
  assert.equal(one.score, 84);
  assert.equal(one.grade, 'Good');

  const three = buildReport(crawl, [
    seriousFinding('serious-a'), seriousFinding('serious-b'), seriousFinding('serious-c')
  ]);
  assert.equal(three.score, 61);
  assert.equal(three.grade, 'Needs work');

  const many = buildReport(crawl, Array.from({ length: 7 }, (_, index) => seriousFinding(`serious-${index}`)));
  assert.equal(many.score, 15);
  assert.equal(many.grade, 'Critical gaps');

  const strongestOverlap = seriousFinding('no-cta', 0.99);
  const oneConversionFamily = buildReport(crawl, [strongestOverlap]);
  const overlappingConversionFamily = buildReport(crawl, [
    strongestOverlap,
    seriousFinding('cta-below-fold', 0.94)
  ]);
  assert.equal(overlappingConversionFamily.score, oneConversionFamily.score);
  assert.equal(overlappingConversionFamily.summary.scoredProblemFamilies, 1);

  const rejectedOnly = buildReport(crawl, [
    seriousFinding('unsafe-score', 0.99),
    seriousFinding('low-confidence-score', 0.71),
    { ...seriousFinding('invalid-evidence-score', 0.99), evidenceUrl: 'file:///workspace/private', evidence: null }
  ].map((finding, index) => index === 0 ? { ...finding, safeForOutreach: false } : finding));
  assert.equal(rejectedOnly.score, 96);
});

test('implementation options and CTA continuity use only eligible report data and textContent', async () => {
  const report = buildReport({ pages: [page()], errors: [] }, [
    rawFinding({ code: 'no-cta', title: 'Add a clear inquiry action', service: 'Conversion design' }),
    rawFinding({ code: 'thin-discovery', title: 'Thin discovery', confidence: 0.60, safeForOutreach: false })
  ]);
  assert.deepEqual(report.summary.implementationOptions, [{
    code: 'no-cta', title: 'Add a clear inquiry action', service: 'Conversion design'
  }]);
  assert.deepEqual(report.summary.topFixes, ['Add a clear inquiry action']);

  const [html, script] = await Promise.all([
    fs.readFile(new URL('../lite/public/report.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../lite/public/report.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /id="cta-context"/);
  assert.match(script, /summary\.topFixes/);
  assert.match(script, /summary\.implementationOptions/);
  assert.match(script, /getElementById\('cta-context'\)\.textContent/);
  assert.doesNotMatch(script, /cta-context[^\n]*(?:innerHTML|insertAdjacentHTML)/);
});

let db;
let query;
test.before(async () => {
  db = new PGlite();
  await db.exec(SCHEMA_SQL);
  query = (text, params = []) => db.query(text, params);
});
test.after(async () => { await db.close(); });

test('audit submission is idempotent and queued/running/completed stages are durable', async () => {
  const token = createReportToken();
  const handler = createRequestHandler({ query, ensure: async () => {}, lookup: publicLookup });
  const body = { website: 'https://p0-submission.example', email: 'owner@p0-submission.example', reportToken: token };
  const first = fakeRes();
  await handler(fakeReq({ ip: '198.51.100.11', body }), first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.duplicate, false);
  assert.equal(first.body.processingStage, 'request_accepted');
  const duplicate = fakeRes();
  await handler(fakeReq({ ip: '198.51.100.11', body }), duplicate);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.reportPath, first.body.reportPath);

  const count = await query("SELECT COUNT(*)::int AS n FROM lite_audit_requests WHERE domain='p0-submission.example'");
  assert.equal(count.rows[0].n, 1);
  const reportHandler = createReportHandler({ query, ensure: async () => {} });
  const queued = fakeRes();
  await reportHandler(fakeReq({ method: 'GET', url: `/api/report?token=${token}` }), queued);
  assert.equal(queued.body.processingStage, 'waiting_for_audit_worker');

  const claimed = await claimNextAudit(query, { staleBefore, maxAttempts: 2 });
  assert.equal(claimed.domain, 'p0-submission.example');
  await updateAuditStage(query, claimed.id, 'testing_mobile_experience');
  const running = fakeRes();
  await reportHandler(fakeReq({ method: 'GET', url: `/api/report?token=${token}` }), running);
  assert.equal(running.body.status, 'running');
  assert.equal(running.body.processingStage, 'testing_mobile_experience');

  const report = buildReport({ pages: [{}], summary: { pagesVisited: 1 } }, [rawFinding()]);
  await completeAudit(query, { requestId: claimed.id, domain: claimed.domain, score: report.score, summary: report.summary, findings: report.findings });
  const completed = fakeRes();
  await reportHandler(fakeReq({ method: 'GET', url: `/api/report?token=${token}` }), completed);
  assert.equal(completed.body.processingStage, 'completed');
  assert.equal(completed.body.report.summary.priorities.length, 1);
});

test('invalid and SSRF website submissions fail without creating queue rows', async () => {
  const handler = createRequestHandler({ query, ensure: async () => {}, lookup: publicLookup });
  for (const website of ['not a valid website', 'http://127.0.0.1/private']) {
    const response = fakeRes();
    await handler(fakeReq({ ip: '198.51.100.12', body: { website, email: 'owner@invalid.example' } }), response);
    assert.equal(response.statusCode, 400);
  }
});

test('failed processing exposes a calm retry-exhausted state without internal error details', async () => {
  const token = createReportToken();
  await createAuditRequest(query, {
    websiteUrl: 'https://p0-failure.example/', domain: 'p0-failure.example', email: 'owner@p0-failure.example',
    tokenHash: hashToken(token), requesterHash: 'f'.repeat(64)
  });
  const first = await claimNextAudit(query, { staleBefore, maxAttempts: 2 });
  await failAudit(query, { requestId: first.id, error: 'Stack at /workspace/private/worker.mjs SECRET_TOKEN=abc', maxAttempts: 2 });
  const second = await claimNextAudit(query, { staleBefore, maxAttempts: 2 });
  await failAudit(query, { requestId: second.id, error: 'Stack at /workspace/private/worker.mjs SECRET_TOKEN=abc', maxAttempts: 2 });
  const response = fakeRes();
  await createReportHandler({ query, ensure: async () => {} })(fakeReq({ method: 'GET', url: `/api/report?token=${token}` }), response);
  assert.equal(response.body.processingStage, 'failed_after_retries');
  assert.match(response.body.message, /available retries/i);
  assert.doesNotMatch(JSON.stringify(response.body), /workspace|SECRET_TOKEN|worker\.mjs/);
});

async function completedRequest(label, findings = [rawFinding({ code: 'no-cta', title: 'No obvious primary action', service: 'Conversion design' })]) {
  const token = createReportToken();
  const requestId = await createAuditRequest(query, {
    websiteUrl: `https://${label}.example/`, domain: `${label}.example`, email: `owner@${label}.example`,
    tokenHash: hashToken(token), requesterHash: label.padEnd(64, 'x').slice(0, 64)
  });
  const report = buildReport({ pages: [{}], summary: { pagesVisited: 1 } }, findings);
  await completeAudit(query, { requestId, domain: `${label}.example`, score: report.score, summary: report.summary, findings: report.findings });
  return { token, requestId };
}

test('implementation requests are structured, idempotent, and survive notification failure', async () => {
  const completed = await completedRequest('p0-interest');
  let notifications = 0;
  const handler = createInterestHandler({
    query, ensure: async () => {},
    notify: async () => { notifications++; throw new Error('provider secret detail'); }
  });
  const body = {
    token: completed.token, selectedIssueCode: 'no-cta', email: 'customer@p0-interest.example',
    name: 'Customer', message: 'Please improve the inquiry path.'
  };
  const first = fakeRes();
  await handler(fakeReq({ ip: '198.51.100.21', body }), first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.duplicate, false);
  assert.match(first.body.message, /stored/i);

  const stored = await query(
    'SELECT selected_issue_code, service_interest, status, source_page, owner_notified, message FROM lite_leads WHERE request_id = $1',
    [completed.requestId]
  );
  assert.equal(stored.rows.length, 1);
  assert.deepEqual(stored.rows[0], {
    selected_issue_code: 'no-cta', service_interest: 'Conversion design', status: 'new',
    source_page: 'private_report', owner_notified: false, message: 'Please improve the inquiry path.'
  });

  const duplicate = fakeRes();
  await handler(fakeReq({ ip: '198.51.100.21', body }), duplicate);
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(notifications, 1);
  const count = await query('SELECT COUNT(*)::int AS n FROM lite_leads WHERE request_id = $1', [completed.requestId]);
  assert.equal(count.rows[0].n, 1);
});

test('unconfigured owner notification is a safe stored-request fallback', async () => {
  const completed = await completedRequest('p0-unconfigured');
  const handler = createInterestHandler({
    query, ensure: async () => {}, notify: async () => ({ skipped: true, reason: 'not configured' })
  });
  const response = fakeRes();
  await handler(fakeReq({ ip: '198.51.100.22', body: { token: completed.token, email: 'customer@p0-unconfigured.example' } }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  const stored = await query('SELECT owner_notified, service_interest FROM lite_leads WHERE request_id = $1', [completed.requestId]);
  assert.deepEqual(stored.rows[0], { owner_notified: false, service_interest: 'General implementation review' });
});

test('invalid report tokens and unfinished reports cannot create implementation requests', async () => {
  const handler = createInterestHandler({ query, ensure: async () => {}, notify: async () => ({ ok: true }) });
  const invalid = fakeRes();
  await handler(fakeReq({ ip: '198.51.100.23', body: { token: 'invalid', email: 'customer@example.com' } }), invalid);
  assert.equal(invalid.statusCode, 400);

  const token = createReportToken();
  await createAuditRequest(query, {
    websiteUrl: 'https://p0-queued.example/', domain: 'p0-queued.example', email: 'owner@p0-queued.example',
    tokenHash: hashToken(token), requesterHash: 'q'.repeat(64)
  });
  const queued = fakeRes();
  await handler(fakeReq({ ip: '198.51.100.24', body: { token, email: 'customer@example.com' } }), queued);
  assert.equal(queued.statusCode, 409);
});

test('Cash Engine Lite customer copy is broad-SMB and processing narration is real-state based', async () => {
  const files = await Promise.all([
    fs.readFile(new URL('../lite/public/index.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../lite/public/report.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../lite/public/report.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(files.join('\n'), /\b(?:clinic|patient)s?\b/i);
  assert.match(files[2], /waiting_for_audit_worker/);
  assert.match(files[2], /testing_mobile_experience/);
  assert.doesNotMatch(files[2], /fake|simulat|percent|% complete/i);
});

test('worker logs retain pointers without exposing provider or crawl error details', async () => {
  const worker = await fs.readFile(new URL('../lite/worker/run-audits.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(worker, /console\.(?:warn|error)\([^\n]*(?:result\.error|error\.message)/);
  assert.match(worker, /internal detail retained in PostgreSQL/);
  assert.match(worker, /request remains stored and will retry/);
});
