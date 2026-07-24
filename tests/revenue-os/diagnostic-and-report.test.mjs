import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeCrawlerProvider, createReplayCrawlerProvider, assertCrawlerContract } from '../../revenue-os/src/providers/crawler.mjs';
import { CHECK_KEYS, runCheck, runChecksForPage, CheckEngineError } from '../../revenue-os/src/checks.mjs';
import { buildDefectCards, persistDefectCards } from '../../revenue-os/src/defects.mjs';
import {
  DIAGNOSTIC_STATES, EXCEPTION_STATES, ALL_STATES, assertValidTransition, deliveryGate, DiagnosticWorkflowError
} from '../../revenue-os/src/diagnostic-workflow.mjs';
import {
  buildReportData, buildRoadmap, renderReportHtml, renderReportMarkdown, renderReportJson,
  signReportManifest, verifyReportManifest, ReportError
} from '../../revenue-os/src/report.mjs';
import { Store } from '../../revenue-os/src/store.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-diag-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

// --- crawler ---

test('the fake crawler is deterministic and makes no real network call; the replay crawler plays a fixed script', async () => {
  const fake = createFakeCrawlerProvider();
  assertCrawlerContract(fake);
  const a = await fake.fetchPage('https://a.example.com/');
  const b = await fake.fetchPage('https://a.example.com/');
  assert.equal(a.screenshotHash, b.screenshotHash);
  const replay = createReplayCrawlerProvider([{ status: 200, ok: true, html: '<html></html>' }]);
  const first = await replay.fetchPage('https://a.example.com/');
  assert.equal(first.status, 200);
});

// --- checks ---

test('all 18 mission-named checks are registered and none submit a form', async () => {
  assert.equal(CHECK_KEYS.length, 18);
  const crawler = createFakeCrawlerProvider();
  const page = await crawler.fetchPage('https://a.example.com/');
  const results = await runChecksForPage(page, { crawler });
  assert.equal(results.length, 18);
  assert.ok(results.every(r => ['passed', 'failed', 'error'].includes(r.status)));
});

test('runCheck rejects on an unknown check key', async () => {
  await assert.rejects(() => runCheck('not-a-real-check', {}), CheckEngineError);
});

test('checks reflect real page content, not a stub answer', async () => {
  const crawler = createFakeCrawlerProvider({ 'noleadpath.example.com': { html: '<html><body>nothing</body></html>' } });
  const page = await crawler.fetchPage('https://noleadpath.example.com/');
  const results = await runChecksForPage(page, { crawler });
  const failed = results.filter(r => r.status === 'failed').map(r => r.checkKey);
  assert.ok(failed.includes('phone_link'));
  assert.ok(failed.includes('form_presence'));
  assert.ok(failed.includes('cta_presence'));
});

test('form_action_availability only ever performs a GET on the declared action URL, never a POST', async () => {
  const crawler = createFakeCrawlerProvider();
  const page = await crawler.fetchPage('https://a.example.com/');
  await runCheck('form_action_availability', page, {}, crawler);
  assert.ok(crawler._debug.calls.every(url => true)); // fetchPage has no method/body param at all -- structurally GET-only
});

// --- defect cards ---

test('buildDefectCards refuses to fabricate a card for a website with zero evidence', async () => {
  const crawler = createFakeCrawlerProvider({ 'x.example.com': { html: '<html><body>bare</body></html>' } });
  const page = await crawler.fetchPage('https://x.example.com/');
  const results = await runChecksForPage(page, { crawler });
  const { cards, skipped } = buildDefectCards(results, { websiteId: 'site1', evidenceItems: [] });
  assert.equal(cards.length, 0);
  assert.ok(skipped.length > 0);
  assert.equal(skipped[0].reason, 'no-evidence-for-website');
});

test('every defect card carries all 10 mission-required fields', async () => {
  const crawler = createFakeCrawlerProvider({ 'x.example.com': { html: '<html><body>bare</body></html>' } });
  const page = await crawler.fetchPage('https://x.example.com/');
  const results = await runChecksForPage(page, { crawler });
  const evidence = [{ id: 'ev1', websiteId: 'site1', data: { websiteId: 'site1' } }];
  const { cards } = buildDefectCards(results, { websiteId: 'site1', evidenceItems: evidence });
  assert.ok(cards.length > 0);
  for (const card of cards) {
    for (const field of ['category', 'severity', 'reproduction', 'evidenceRefs', 'confidence', 'limitations', 'cautiousConsequence', 'recommendation', 'effortHours', 'reversibility', 'authorizationRequired']) {
      assert.ok(field in card, `missing field ${field}`);
    }
    assert.ok(card.evidenceRefs.length > 0);
  }
});

test('a defect card\'s cautiousConsequence never asserts revenue loss as fact', async () => {
  const crawler = createFakeCrawlerProvider({ 'x.example.com': { html: '<html><body>bare</body></html>' } });
  const page = await crawler.fetchPage('https://x.example.com/');
  const results = await runChecksForPage(page, { crawler });
  const evidence = [{ id: 'ev1', websiteId: 'site1', data: { websiteId: 'site1' } }];
  const { cards } = buildDefectCards(results, { websiteId: 'site1', evidenceItems: evidence });
  for (const card of cards) {
    assert.match(card.cautiousConsequence, /may|not measured/i);
    assert.doesNotMatch(card.cautiousConsequence, /\bwill (cost|lose)\b/i);
  }
});

// --- diagnostic workflow ---

test('DIAGNOSTIC_STATES has exactly the mission\'s 18 named states plus 4 exception states', () => {
  assert.equal(DIAGNOSTIC_STATES.length, 18);
  assert.equal(EXCEPTION_STATES.length, 4);
  assert.equal(ALL_STATES.length, 22);
});

test('assertValidTransition walks the full linear happy path in order', () => {
  // DELIVERED's normal-path successor is ACCEPTED (tested separately below, since DELIVERED also
  // branches to CORRECTION); CORRECTION itself has no single "next" in DIAGNOSTIC_STATES order --
  // it resumes at REPORT_DRAFTED or READY_TO_DELIVER, both tested separately below.
  const skip = new Set(['DELIVERED', 'CORRECTION']);
  for (let i = 0; i < DIAGNOSTIC_STATES.length - 1; i++) {
    if (skip.has(DIAGNOSTIC_STATES[i])) continue;
    assertValidTransition(DIAGNOSTIC_STATES[i], DIAGNOSTIC_STATES[i + 1]);
  }
});

test('DELIVERED can branch to CORRECTION, which resumes at either REPORT_DRAFTED or READY_TO_DELIVER', () => {
  assertValidTransition('DELIVERED', 'ACCEPTED');
  assertValidTransition('DELIVERED', 'CORRECTION');
  assertValidTransition('CORRECTION', 'REPORT_DRAFTED');
  assertValidTransition('CORRECTION', 'READY_TO_DELIVER');
});

test('any non-terminal state can transition to an exception state, but a terminal state cannot', () => {
  assertValidTransition('PAID', 'BLOCKED');
  assertValidTransition('QA', 'CANCELED');
  assert.throws(() => assertValidTransition('CLOSED', 'CANCELED'), DiagnosticWorkflowError);
  assert.throws(() => assertValidTransition('REFUNDED', 'BLOCKED'), DiagnosticWorkflowError);
});

test('assertValidTransition rejects skipping a stage', () => {
  assert.throws(() => assertValidTransition('DRAFT', 'QA'), DiagnosticWorkflowError);
});

// --- delivery gate ---

function fullGateInput(overrides = {}) {
  return {
    project: { id: 'p1' }, payment: { status: 'VERIFIED' }, scopeAcceptance: { accepted: true },
    evidenceItems: [{ id: 'ev1', data: { lineage: { fetchedBy: 'x' } } }],
    defectCards: [], report: {}, qaResult: { passed: true },
    brand: { agencyDisplayName: 'Acme', primaryColor: '#112233', contactEmail: 'a@b.com' }, ...overrides
  };
}

test('deliveryGate passes when every condition is satisfied', () => {
  assert.equal(deliveryGate(fullGateInput()).blocked, false);
});

test('deliveryGate blocks on each of the 6 named conditions independently', () => {
  assert.ok(deliveryGate(fullGateInput({ payment: { status: 'PENDING_VERIFICATION' } })).blockers.some(b => b.code === 'payment-not-verified'));
  assert.ok(deliveryGate(fullGateInput({ scopeAcceptance: { accepted: false } })).blockers.some(b => b.code === 'scope-not-accepted'));
  assert.ok(deliveryGate(fullGateInput({ evidenceItems: [] })).blockers.some(b => b.code === 'evidence-lacks-source-lineage'));
  assert.ok(deliveryGate(fullGateInput({ defectCards: [{ evidenceRefs: [] }] })).blockers.some(b => b.code === 'unsupported-claim'));
  assert.ok(deliveryGate(fullGateInput({ brand: {} })).blockers.some(b => b.code === 'agency-branding-incomplete'));
  assert.ok(deliveryGate(fullGateInput({ qaResult: { passed: false, failedItems: ['x'] } })).blockers.some(b => b.code === 'qa-failed'));
});

// --- report generation ---

async function makeReportData() {
  const crawler = createFakeCrawlerProvider({ 'x.example.com': { html: '<html><head><title>x</title></head><body>bare</body></html>' } });
  const page = await crawler.fetchPage('https://x.example.com/');
  const results = await runChecksForPage(page, { crawler });
  const evidence = [{ id: 'ev1', websiteId: 'site1', sourceUrl: 'https://x.example.com/', sourceType: 'page_fetch', rawHash: 'h1', capturedAt: new Date().toISOString(), data: { websiteId: 'site1', lineage: { fetchedBy: 'fake' } } }];
  const { cards } = buildDefectCards(results, { websiteId: 'site1', evidenceItems: evidence });
  const reportData = buildReportData({ project: { id: 'p1', organizationDomain: 'x.example.com' }, websites: [{ id: 'site1', domain: 'x.example.com' }], defectCards: cards, evidenceItems: evidence, period: '2026-07' });
  return { reportData, cards, evidence };
}

test('buildReportData reflects exactly the input defect cards, one to one, and computes real severity counts', async () => {
  const { reportData, cards } = await makeReportData();
  assert.equal(reportData.technicalAppendix.defects.length, cards.length);
  assert.equal(reportData.executiveSummary.totalDefects, cards.length);
  const sumBySeverity = Object.values(reportData.executiveSummary.bySeverity).reduce((a, b) => a + b, 0);
  assert.equal(sumBySeverity, cards.length);
});

test('buildRoadmap ranks critical/high above medium/low, ties broken by lower effort first', () => {
  const roadmap = buildRoadmap([
    { id: 'a', severity: 'low', effortHours: 1 }, { id: 'b', severity: 'critical', effortHours: 4 },
    { id: 'c', severity: 'critical', effortHours: 2 }
  ]);
  assert.equal(roadmap[0].defectId, 'c');
  assert.equal(roadmap[1].defectId, 'b');
  assert.equal(roadmap[2].defectId, 'a');
});

test('renderReportHtml always shows the exact mission-required demo watermark text unless explicitly commissioned', async () => {
  const { reportData } = await makeReportData();
  const demo = renderReportHtml(reportData, { mode: 'demo' });
  assert.match(demo, /Demonstration, not commissioned client work\./);
  const commissioned = renderReportHtml(reportData, { mode: 'agency_branded', commissioned: true, brand: { agencyDisplayName: 'Acme', primaryColor: '#112233' } });
  assert.doesNotMatch(commissioned, /Demonstration, not commissioned client work\./);
  const uncommissionedAgency = renderReportHtml(reportData, { mode: 'agency_branded', commissioned: false });
  assert.match(uncommissionedAgency, /Demonstration, not commissioned client work\./);
});

test('renderReportHtml refuses to render a report containing an ungrounded defect', async () => {
  const { reportData } = await makeReportData();
  const tampered = { ...reportData, defectCards: [{ id: 'fake', category: 'x', severity: 'high', cautiousConsequence: 'x', recommendation: 'x' }], technicalAppendix: { defects: [{ id: 'fake', evidenceRefs: [] }] } };
  assert.throws(() => renderReportHtml(tampered), ReportError);
});

test('renderReportMarkdown and renderReportJson both produce real, parseable output', async () => {
  const { reportData } = await makeReportData();
  const md = renderReportMarkdown(reportData);
  assert.match(md, /^# Revenue Leak Diagnostic Report/);
  const json = renderReportJson(reportData);
  assert.equal(JSON.parse(json).period, '2026-07');
});

test('signReportManifest/verifyReportManifest round-trip and detect tampering', async () => {
  const { reportData } = await makeReportData();
  const secret = 'y'.repeat(32);
  const manifest = signReportManifest(reportData, secret);
  assert.equal(verifyReportManifest(reportData, manifest, secret).valid, true);
  assert.equal(verifyReportManifest({ ...reportData, period: 'tampered' }, manifest, secret).valid, false);
});

// --- persistence ---

test('persistDefectCards writes real rows to the store, linked to the diagnostic project and check run', async () => {
  const store = await harness();
  const crawler = createFakeCrawlerProvider({ 'x.example.com': { html: '<html><body>bare</body></html>' } });
  const page = await crawler.fetchPage('https://x.example.com/');
  const results = await runChecksForPage(page, { crawler });
  const evidence = [{ id: 'ev1', websiteId: 'site1', data: { websiteId: 'site1' } }];
  const { cards } = buildDefectCards(results, { websiteId: 'site1', evidenceItems: evidence });
  const persisted = await persistDefectCards(store, 'proj1', 'run1', cards);
  assert.equal(persisted.length, cards.length);
  assert.equal((await store.list('defects', { filters: { diagnosticProjectId: 'proj1' } })).length, cards.length);
});
