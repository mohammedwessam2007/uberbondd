import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pipeline } from '../src/pipeline.mjs';
import {
  assessCrawlQuality,
  classifyCrawlFailure,
  validateAuditEvidence,
  validateFindingEvidence
} from '../src/qualification.mjs';
import { Store } from '../src/store.mjs';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-qualification-'));
  const store = new Store(dir);
  await store.init();
  return { store, dir };
}

function page(url = 'https://clinic.example.com/') {
  return {
    url,
    status: 200,
    title: 'Atlas Dental Clinic in Dubai',
    description: 'Evidence-backed public clinic services and appointments.',
    h1Count: 1,
    visibleH1: ['Dental care for families in Dubai'],
    headings: [{ level: 'h1', text: 'Dental care for families in Dubai' }],
    bodyText: 'Evidence-backed public clinic services and appointments. Our dental team provides preventive and restorative care for families in Dubai.',
    lang: 'en',
    ctas: [],
    controls: [],
    images: [],
    forms: [],
    contactSignals: 0,
    brokenLinks: [],
    performance: { navigation: { domContentLoadedEventEnd: 900 } },
    renderQuality: { reliable: true, degraded: false, reasons: [], primaryActionInspection: 'complete' },
    mobile: {
      horizontalOverflow: false,
      controls: [],
      ctas: [],
      document: { width: 390 },
      viewport: { width: 390 },
      renderQuality: { reliable: true, degraded: false, reasons: [], primaryActionInspection: 'complete' }
    },
    screenshots: { desktop: '/screenshots/desktop.png', mobile: '/screenshots/mobile.png' }
  };
}

function crawlFor(url = 'https://clinic.example.com/', overrides = {}) {
  const domain = new URL(url).hostname;
  return {
    startUrl: url,
    domain,
    engine: 'fixture-browser',
    pages: [page(url)],
    errors: [],
    quality: { degraded: false, reasons: [], failureCategories: {} },
    publicAccess: { robotsChecked: true, robotsCrawlDelaySeconds: 0, ssrfGuard: 'public-network-only' },
    summary: { pagesVisited: 1, errors: 0, desktopScreenshots: 1, mobileScreenshots: 1, quality: 'complete' },
    combinedText: page(url).bodyText,
    completedAt: '2026-07-18T04:00:00.000Z',
    ...overrides
  };
}

function config(dir, overrides = {}) {
  return {
    baseUrl: 'https://operator.example.com',
    storeBackend: 'json',
    screenshotDir: dir,
    allowLocalFixtures: false,
    chromiumPath: '',
    maxBatch: 10,
    crawl: { concurrency: 1, delayMs: 0, minDomainGapMs: 0, maxPages: 5, timeoutMs: 1000, maxAttempts: 2, minimumTextLength: 80, minimumQualityScore: 60 },
    queue: { lockTimeoutMs: 60000, retryBaseMs: 1, retryMaxMs: 10 },
    ai: { provider: 'rules', anthropicModel: '', openaiModel: '' },
    hunterKey: '',
    sender: { name: 'Operator', company: 'UberBond', address: 'Business address' },
    unsubscribeSecret: 'u'.repeat(40),
    outbound: { enabled: false, dryRun: true },
    caps: { A: 0, B: 0 },
    ...overrides
  };
}

function campaign(id = 'campaign-a', overrides = {}) {
  return {
    id,
    approved: true,
    enabled: true,
    autoSend: false,
    dryRun: true,
    minimumProspectScore: 0,
    minimumEvidenceConfidence: 0.8,
    dailyAuditCap: 100,
    maximumPagesPerSite: 2,
    maximumFollowups: 0,
    ...overrides
  };
}

function prospect(id = 'prospect-a', website = 'https://clinic.example.com/', campaignId = 'campaign-a') {
  return {
    id,
    company: 'Atlas Dental',
    website,
    domain: new URL(website).hostname,
    campaignId,
    niche: 'dentist',
    country: 'AE',
    city: 'Dubai',
    status: 'queued',
    abilityToPay: 8,
    createdAt: '2026-07-18T03:00:00.000Z'
  };
}

test('crawl quality accepts credible pages and rejects parked, challenged, and empty crawls', () => {
  assert.equal(assessCrawlQuality(crawlFor()).status, 'complete');
  const partial = assessCrawlQuality(crawlFor(undefined, {
    errors: [{ category: 'http_client_error', retryable: false, status: 404, error: 'Website returned HTTP 404' }]
  }));
  assert.equal(partial.credible, true);
  assert.equal(partial.status, 'partial');

  const parkedPage = page();
  parkedPage.title = 'This domain is for sale';
  parkedPage.bodyText = 'Buy this domain through Afternic.';
  const parked = assessCrawlQuality(crawlFor(undefined, { pages: [parkedPage] }));
  assert.equal(parked.credible, false);
  assert.equal(parked.failureCategory, 'parked_domain');
  assert.equal(parked.retryable, false);

  const challengePage = page();
  challengePage.bodyText = 'Checking your browser. Verify you are human to continue.';
  const challenged = assessCrawlQuality(crawlFor(undefined, { pages: [challengePage] }));
  assert.equal(challenged.failureCategory, 'access_challenge');
  assert.equal(challenged.retryable, true);

  const empty = assessCrawlQuality({ pages: [], errors: [{ error: 'Navigation timeout exceeded' }] });
  assert.equal(empty.credible, false);
  assert.equal(empty.failureCategory, 'timeout');
});

test('finding validation binds evidence to crawled pages, screenshots, confidence, impact, and effort', () => {
  const crawl = crawlFor();
  const deterministic = validateFindingEvidence({
    code: 'no-cta', title: 'No action', severity: 5, confidence: 0.94,
    evidenceUrl: crawl.startUrl, evidenceExcerpt: 'No visible primary action was detected.',
    evidence: { type: 'page_observation', url: crawl.startUrl, excerpt: 'No visible primary action was detected.' },
    implication: 'A visitor may not know the next step.', service: 'Conversion design', safeForOutreach: true
  }, crawl);
  assert.equal(deterministic.valid, true);
  assert.equal(deterministic.finding.screenshotReference, '/screenshots/desktop.png');
  assert.equal(deterministic.finding.estimatedImpact, 'high');
  assert.equal(deterministic.finding.estimatedEffort, 'medium');
  assert.equal(deterministic.finding.evidenceValidation.valid, true);

  const exactAi = validateFindingEvidence({
    code: 'ai-1', title: 'Service evidence', severity: 3, confidence: 0.8,
    evidenceUrl: crawl.startUrl, evidenceExcerpt: 'public clinic services and appointments',
    evidence: { type: 'page_excerpt', url: crawl.startUrl, excerpt: 'public clinic services and appointments' },
    implication: 'Review the path.', service: 'Website strategy', safeForOutreach: false
  }, crawl, { requireExcerptMatch: true });
  assert.equal(exactAi.valid, true);
  assert.equal(validateFindingEvidence({ ...exactAi.finding, evidenceExcerpt: 'invented website evidence' }, crawl, { requireExcerptMatch: true }).reason, 'evidence_excerpt_not_found');
  assert.equal(validateFindingEvidence({ ...exactAi.finding, evidenceUrl: 'https://other.example.com/' }, crawl).reason, 'evidence_page_not_crawled');

  const batch = validateAuditEvidence([deterministic.finding, { ...exactAi.finding, confidence: 0.2 }], crawl, { minimumConfidence: 0.65 });
  assert.equal(batch.accepted.length, 1);
  assert.equal(batch.rejected[0].reason, 'confidence_below_threshold');
});

test('crawl failures are categorized into retryable and permanent reasons', () => {
  assert.deepEqual(classifyCrawlFailure({ status: 503 }), { category: 'http_server_error', retryable: true, message: 'Website returned HTTP 503' });
  assert.equal(classifyCrawlFailure({ status: 404 }).retryable, false);
  assert.equal(classifyCrawlFailure(new Error('Navigation timeout exceeded')).category, 'timeout');
  assert.equal(classifyCrawlFailure(new Error('Private and reserved IP addresses are blocked')).retryable, false);
  assert.equal(classifyCrawlFailure({ error: 'blocked_by_robots' }).category, 'robots_disallowed');
});

test('pipeline qualifies deterministic evidence, preserves AI only for review, and obeys campaign page limits', async () => {
  const { store, dir } = await tempStore();
  await store.add('campaigns', campaign());
  await store.add('prospects', prospect());
  let crawlOptions;
  const pipeline = new Pipeline(store, config(dir), {
    crawlSite: async (url, options) => { crawlOptions = options; return crawlFor(url); },
    enhanceAudit: async (_cfg, _prospect, crawl) => ({ issues: [{
      title: 'Exact service wording', severity: 5, confidence: 0.99,
      evidenceUrl: crawl.startUrl, evidenceExcerpt: 'public clinic services and appointments',
      implication: 'Review whether the action path supports this service.', service: 'Conversion strategy'
    }] }),
    discoverContacts: async () => ({ all: [], selected: null })
  });
  const result = await pipeline.processProspect(await store.get('prospects', 'prospect-a'));
  assert.equal(crawlOptions.maxPages, 2);
  assert.equal(result.crawlQuality.credible, true);
  assert.equal(result.status, 'research-complete');
  assert.equal(result.issue.evidenceSource, 'deterministic_rules');
  assert(result.audit.every(finding => finding.evidenceValidation.valid));
  assert(result.audit.every(finding => finding.estimatedImpact && finding.estimatedEffort));
  const aiFinding = result.audit.find(finding => finding.evidenceSource === 'ai_exact_excerpt_enhancement');
  assert.equal(aiFinding.safeForOutreach, false);
  assert.equal(aiFinding.requiresHumanReview, true);
  assert.equal(result.dossier.provenance.aiOutreachEligible, false);
  assert.equal(result.dossier.primaryOpportunity.screenshotReference, '/screenshots/desktop.png');
});

test('pipeline never promotes an unverified enrichment contact to send-ready status', async () => {
  const { store, dir } = await tempStore();
  await store.add('campaigns', campaign());
  await store.add('prospects', prospect());
  const pipeline = new Pipeline(store, config(dir), {
    crawlSite: async url => crawlFor(url),
    discoverContacts: async () => ({
      all: [{ email: 'owner@clinic.example.com', source: 'hunter', verified: 'unknown', externallyVerified: false }],
      selected: { email: 'owner@clinic.example.com', source: 'hunter', verified: 'unknown', externallyVerified: false }
    })
  });
  const result = await pipeline.processProspect(await store.get('prospects', 'prospect-a'));
  assert.equal(result.status, 'research-complete');
  assert.equal(result.contactReadiness.ok, false);
  assert.equal(result.contactReadiness.reason, 'contact-not-published-or-verified');
});

test('pipeline rejects a parked page without contact discovery', async () => {
  const { store, dir } = await tempStore();
  await store.add('campaigns', campaign());
  await store.add('prospects', prospect());
  let contactsCalled = false;
  const parkedPage = page();
  parkedPage.title = 'This domain is for sale';
  parkedPage.bodyText = 'Buy this domain through Afternic.';
  const pipeline = new Pipeline(store, config(dir), {
    crawlSite: async url => crawlFor(url, { pages: [parkedPage] }),
    discoverContacts: async () => { contactsCalled = true; return { all: [], selected: null }; }
  });
  const result = await pipeline.processProspect(await store.get('prospects', 'prospect-a'));
  assert.equal(result.status, 'rejected');
  assert.equal(result.rejectionReason, 'parked_domain');
  assert.equal(contactsCalled, false);
  assert.equal(result.dossier.qualification.qualified, false);
});

test('campaign daily audit capacity defers excess prospects without starting a browser', async () => {
  const { store, dir } = await tempStore();
  await store.add('campaigns', campaign('campaign-a', { dailyAuditCap: 0 }));
  await store.add('prospects', prospect());
  let crawlerCalled = false;
  const pipeline = new Pipeline(store, config(dir), {
    clock: () => new Date('2026-07-18T04:00:00.000Z'),
    crawlSite: async () => { crawlerCalled = true; return crawlFor(); }
  });
  const result = await pipeline.processProspect(await store.get('prospects', 'prospect-a'));
  assert.equal(crawlerCalled, false);
  assert.equal(result.status, 'queued');
  assert.equal(result.crawlQueueStatus, 'deferred');
  assert.equal(result.nextCrawlAt, '2026-07-19T00:05:00.000Z');
});

test('runBatch retries transient crawls to the attempt ceiling, then records audit-failed', async () => {
  const { store, dir } = await tempStore();
  await store.add('campaigns', campaign());
  await store.add('prospects', prospect());
  const pipeline = new Pipeline(store, config(dir), {
    crawlSite: async () => { throw new Error('Navigation timeout of 1000 ms exceeded'); }
  });
  await assert.rejects(
    pipeline.runBatch(1, { prospectIds: ['prospect-a'] }),
    error => error.category === 'batch_retryable_crawl_failure' && error.retryable === true
  );
  const afterFirst = await store.get('prospects', 'prospect-a');
  assert.equal(afterFirst.status, 'retry');
  assert.equal(afterFirst.failure.category, 'timeout');
  assert.equal(afterFirst.crawlAttempts, 1);
  await new Promise(resolve => setTimeout(resolve, 5));
  const second = await pipeline.runBatch(1, { prospectIds: ['prospect-a'] });
  assert.equal(second.status, 'completed');
  const afterSecond = await store.get('prospects', 'prospect-a');
  assert.equal(afterSecond.status, 'audit-failed');
  assert.equal(afterSecond.crawlQueueStatus, 'failed');
  assert.equal(afterSecond.crawlAttempts, 2);
});

test('pipeline browser semaphore enforces configured in-process concurrency', async () => {
  const { store, dir } = await tempStore();
  await store.add('campaigns', campaign());
  await store.add('prospects', prospect('prospect-a', 'https://a.example.com/'));
  await store.add('prospects', prospect('prospect-b', 'https://b.example.com/'));
  let active = 0;
  let maximumActive = 0;
  const pipeline = new Pipeline(store, config(dir), {
    crawlSite: async url => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active -= 1;
      return crawlFor(url);
    },
    discoverContacts: async () => ({ all: [], selected: null })
  });
  await Promise.all([
    pipeline.processProspect(await store.get('prospects', 'prospect-a')),
    pipeline.processProspect(await store.get('prospects', 'prospect-b'))
  ]);
  assert.equal(maximumActive, 1);
});

test('durable domain slots serialize starts without storing the raw domain in settings keys', async () => {
  const { store } = await tempStore();
  const first = await store.reserveCrawlSlot('clinic.example.com', 1500, '2026-07-18T04:00:00.000Z');
  const second = await store.reserveCrawlSlot('clinic.example.com', 1500, '2026-07-18T04:00:00.000Z');
  assert.equal(first.waitMs, 0);
  assert.equal(second.waitMs, 1500);
  const settings = await store.getSettings();
  assert(Object.keys(settings).some(key => key.startsWith('crawlRate:')));
  assert(Object.keys(settings).every(key => !key.includes('clinic.example.com')));
});

test('daily audit reservations are idempotent per prospect and enforce the campaign cap', async () => {
  const { store } = await tempStore();
  const first = await store.reserveAuditCapacity('campaign-a', '2026-07-18', 1, 'prospect-a');
  const duplicate = await store.reserveAuditCapacity('campaign-a', '2026-07-18', 1, 'prospect-a');
  const excess = await store.reserveAuditCapacity('campaign-a', '2026-07-18', 1, 'prospect-b');
  assert.deepEqual([first.ok, first.duplicate], [true, false]);
  assert.deepEqual([duplicate.ok, duplicate.duplicate], [true, true]);
  assert.equal(excess.ok, false);
  assert.equal(excess.reason, 'campaign-daily-audit-cap');
});
