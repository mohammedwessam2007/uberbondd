import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  composeOutreach,
  createOutreachContext,
  outreachContextForAi,
  validateEditedOutreach,
  validateOutreachCandidate
} from '../src/copy.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { Store } from '../src/store.mjs';

const input = {
  prospect: { company: 'Atlas Dental', website: 'https://clinic.example', niche: 'dentist' },
  issue: {
    code: 'no-cta',
    title: 'No obvious booking action was detected',
    evidenceUrl: 'https://clinic.example/appointments',
    evidenceExcerpt: 'Appointments are available by telephone during opening hours.',
    implication: 'A ready visitor may not know the next step.',
    service: 'Conversion design',
    confidence: 0.94,
    safeForOutreach: true
  },
  contact: { firstName: 'Sara', position: 'Practice Manager', published: true },
  sender: { name: 'Mohamed', company: 'UberBond', address: 'Cairo, Egypt' },
  campaign: {
    offer: 'Evidence-backed implementation sprint',
    callToAction: 'Would a concise implementation outline be useful?',
    subjectVariants: ['{{businessName}} booking path', '{{businessName}}: {{service}} evidence'],
    messageVariants: ['evidence-first', 'implication-first'],
    prohibitedClaims: ['guaranteed revenue', 'guaranteed patient growth']
  },
  unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=test-token'
};

test('deterministic composer creates multiple concise variants with sentence-level evidence bindings', () => {
  const result = composeOutreach(input);
  assert.equal(result.status, 'needs-review');
  assert.equal(result.variants.length, 2);
  assert.equal(result.selected.quality.passed, true);
  assert(result.variants.every(variant => variant.quality.score >= variant.quality.threshold));
  assert(result.variants.every(variant => Object.values(variant.quality.dimensions).every(score => score >= 75)));
  assert(result.variants.every(variant => /software-assisted review/i.test(variant.body)));
  assert(result.variants.every(variant => variant.body.includes(input.issue.evidenceExcerpt)));
  assert(result.variants.every(variant => variant.body.includes(input.issue.implication)));
  assert(result.variants.every(variant => variant.body.includes(input.campaign.offer)));
  assert(result.variants.every(variant => variant.body.includes(input.campaign.callToAction)));
  assert(result.variants.every(variant => /reply “no”/i.test(variant.body)));
  assert(result.variants.every(variant => !/personally reviewed|guaranteed|limited time|am impressed/i.test(variant.body)));
  assert(result.variants.every(variant => (variant.sentences.find(sentence => sentence.type === 'cta').text.match(/\?/g) || []).length === 1));

  const knownBindings = new Set(result.context.bindings.map(binding => binding.id));
  for (const variant of result.variants) {
    assert(variant.sentences.every(sentence => sentence.bindingIds.every(id => knownBindings.has(id))));
    assert(variant.sentences.some(sentence => sentence.bindingIds.includes('recipient_role')));
    assert.equal(variant.sentences.filter(sentence => sentence.type === 'implication').length, 1);
    assert.equal(variant.sentences.filter(sentence => sentence.type === 'cta').length, 1);
  }
  const evidenceBinding = result.context.bindings.find(binding => binding.id === 'evidence_excerpt');
  assert.equal(evidenceBinding.sourceUrl, input.issue.evidenceUrl);
  assert.equal(evidenceBinding.evidenceExcerpt, input.issue.evidenceExcerpt);
  assert.notEqual(result.variants[0].body, result.variants[1].body);
});

test('composer rejects missing, cross-domain, or unsafe evidence instead of producing weak copy', () => {
  for (const issue of [
    { ...input.issue, evidenceExcerpt: '' },
    { ...input.issue, evidenceUrl: 'https://unrelated.example/appointments' },
    { ...input.issue, safeForOutreach: false }
  ]) {
    const result = composeOutreach({ ...input, issue });
    assert.equal(result.status, 'rejected');
    assert.equal(result.selected, null);
    assert.equal(result.variants.length, 0);
    assert(result.rejectedVariants.length >= 2);
  }
});

test('unsafe AI output is rejected while deterministic fallback remains available', () => {
  const baseline = composeOutreach(input);
  const core = baseline.selected.sentences
    .filter(sentence => !['greeting', 'optout', 'signature'].includes(sentence.type))
    .map(sentence => ({ ...sentence }));
  const implication = core.find(sentence => sentence.type === 'implication');
  implication.text = 'This will boost patient revenue by 50% in one week.';
  const result = composeOutreach({
    ...input,
    context: baseline.context,
    aiCandidates: [{
      id: 'unsafe-ai',
      subject: 'Atlas Dental: Conversion design evidence',
      sentences: core
    }]
  });
  assert.equal(result.status, 'needs-review');
  assert.equal(result.variants.filter(variant => variant.source === 'deterministic').length, 2);
  assert.equal(result.variants.some(variant => variant.source === 'ai'), false);
  const rejected = result.rejectedVariants.find(variant => variant.id === 'unsafe-ai');
  assert(rejected);
  assert(rejected.reasons.includes('implication-not-exact'));
  assert(rejected.reasons.some(reason => reason.startsWith('unsupported-number:')));

  const invented = baseline.selected.sentences.map(sentence => ({ ...sentence }));
  invented.find(sentence => sentence.type === 'disclosure').text += ' Its CEO approved this assessment.';
  invented.push({ type: 'extra_claim', text: 'A fabricated extra fact.', bindingIds: [] });
  const inventedResult = validateOutreachCandidate({
    id: 'invented-ai', source: 'ai', subject: baseline.selected.subject, sentences: invented
  }, baseline.context);
  assert.equal(inventedResult.quality.passed, false);
  assert(inventedResult.quality.reasons.includes('unsupported-sentence-text:disclosure'));
  assert(inventedResult.quality.reasons.includes('unknown-sentence-type:extra_claim'));
});

test('a fully evidence-bound AI structure can pass the same gate without overriding facts', () => {
  const baseline = composeOutreach(input);
  const candidate = {
    id: 'bounded-ai',
    source: 'ai',
    subject: `Atlas Dental: ${input.issue.title}`,
    sentences: baseline.selected.sentences.map(sentence => ({ ...sentence }))
  };
  const validated = validateOutreachCandidate(candidate, baseline.context);
  assert.equal(validated.quality.passed, true);
  assert.equal(validated.source, 'ai');
  assert.equal(validated.quality.dimensions.evidenceFidelity, 100);
  assert.equal(validated.quality.dimensions.hallucinationRisk, 100);
});

test('AI context contains public evidence but omits recipient email, sender address, and unsubscribe token', () => {
  const context = createOutreachContext({
    ...input,
    contact: { ...input.contact, email: 'sara@clinic.example' }
  });
  const safe = outreachContextForAi(context);
  const serialized = JSON.stringify(safe);
  assert.match(serialized, /Atlas Dental/);
  assert.match(serialized, /Appointments are available/);
  assert.doesNotMatch(serialized, /sara@clinic\.example/);
  assert.doesNotMatch(serialized, /Cairo, Egypt/);
  assert.doesNotMatch(serialized, /test-token/);
});

test('safe owner edits are rescored and unsupported additions are rejected', () => {
  const generated = composeOutreach(input);
  const selected = generated.selected;
  const safeBody = selected.body.replace('The stored page evidence reads:', 'Exact website evidence:');
  const safe = validateEditedOutreach({ subject: selected.subject, body: safeBody }, generated.context);
  assert.equal(safe.quality.passed, true);
  assert.equal(safe.source, 'owner_edit');

  const unsafe = validateEditedOutreach({
    subject: selected.subject,
    body: `${safeBody}\n\nI can guarantee 50% more patients next week.`
  }, generated.context);
  assert.equal(unsafe.quality.passed, false);
  assert(unsafe.quality.reasons.includes('unsupported-edited-sentence'));
});

test('daily draft capacity is atomic, campaign-scoped, capped, and idempotent', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-draft-capacity-'));
  const store = new Store(dir);
  await store.init();
  const date = '2026-07-18';
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) =>
    store.reserveDraftCapacity('campaign-a', date, 2, `prospect-${index}`)
  ));
  assert.equal(attempts.filter(result => result.ok).length, 2);
  assert(attempts.filter(result => !result.ok).every(result => result.reason === 'campaign-daily-draft-cap'));
  const duplicate = await store.reserveDraftCapacity('campaign-a', date, 2, 'prospect-0');
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  const otherCampaign = await store.reserveDraftCapacity('campaign-b', date, 1, 'prospect-0');
  assert.equal(otherCampaign.ok, true);
  const settings = await store.getSettings();
  assert.equal(Object.keys(settings).some(key => key.includes('campaign-a')), false);
});

test('qualification pipeline persists only quality-approved drafts without sending', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-outreach-pipeline-'));
  const store = new Store(dir);
  await store.init();
  await store.add('campaigns', {
    id: 'campaign-a', approved: true, enabled: true, autoSend: false, dryRun: true,
    minimumProspectScore: 0, minimumEvidenceConfidence: 0.8, dailyAuditCap: 10, dailyDraftCap: 10,
    maximumPagesPerSite: 1, offer: input.campaign.offer, callToAction: input.campaign.callToAction,
    subjectVariants: input.campaign.subjectVariants, messageVariants: input.campaign.messageVariants,
    prohibitedClaims: input.campaign.prohibitedClaims
  });
  await store.add('prospects', {
    id: 'prospect-a', company: 'Atlas Dental', website: 'https://clinic.example', domain: 'clinic.example',
    campaignId: 'campaign-a', niche: 'dentist', country: 'AE', status: 'queued', abilityToPay: 8,
    createdAt: '2026-07-18T01:00:00.000Z'
  });
  const page = {
    url: 'https://clinic.example/', status: 200, title: 'Atlas Dental', description: 'Dental care and appointments.',
    h1Count: 1, visibleH1: ['Dental care'], headings: [{ level: 'h1', text: 'Dental care' }],
    bodyText: 'Atlas Dental provides preventive and restorative dental care for families. Appointments are available by telephone during opening hours.',
    lang: 'en', ctas: [], controls: [], images: [], forms: [], contactSignals: 1, brokenLinks: [],
    performance: { navigation: { domContentLoadedEventEnd: 900 } },
    renderQuality: { reliable: true, degraded: false, reasons: [], primaryActionInspection: 'complete' },
    mobile: { horizontalOverflow: false, controls: [], ctas: [], document: { width: 390 }, viewport: { width: 390 }, renderQuality: { reliable: true, degraded: false, reasons: [], primaryActionInspection: 'complete' } },
    screenshots: { desktop: '/screenshots/desktop.png', mobile: '/screenshots/mobile.png' }
  };
  const crawl = {
    startUrl: page.url, domain: 'clinic.example', engine: 'fixture-browser', pages: [page], errors: [],
    quality: { degraded: false, reasons: [], failureCategories: {} },
    publicAccess: { robotsChecked: true, robotsCrawlDelaySeconds: 0, ssrfGuard: 'public-network-only' },
    summary: { pagesVisited: 1, errors: 0, desktopScreenshots: 1, mobileScreenshots: 1, quality: 'complete' },
    combinedText: page.bodyText, completedAt: '2026-07-18T02:00:00.000Z'
  };
  const contact = {
    email: 'office@clinic.example', source: 'website', published: true, verified: 'unverified',
    evidence: [{
      email: 'office@clinic.example', sourceUrl: 'https://clinic.example/contact', sourceType: 'visible_text',
      evidenceExcerpt: 'Contact office@clinic.example', published: true
    }]
  };
  let sends = 0;
  const pipeline = new Pipeline(store, {
    baseUrl: 'https://operator.example', screenshotDir: dir, allowLocalFixtures: false, chromiumPath: '', maxBatch: 10,
    crawl: { concurrency: 1, delayMs: 0, minDomainGapMs: 0, maxPages: 1, timeoutMs: 1000, maxAttempts: 2, minimumTextLength: 80, minimumQualityScore: 60 },
    queue: { lockTimeoutMs: 60000, retryBaseMs: 1, retryMaxMs: 10 },
    ai: { provider: 'rules' }, hunterKey: '', sender: input.sender, unsubscribeSecret: 'u'.repeat(40),
    outbound: { enabled: false, dryRun: true }, caps: { A: 0, B: 0 }
  }, {
    clock: () => new Date('2026-07-18T03:00:00.000Z'),
    crawlSite: async () => crawl,
    discoverContacts: async () => ({ all: [contact], selected: contact }),
    sendEmail: async () => { sends += 1; throw new Error('must not send'); }
  });
  const result = await pipeline.processProspect(await store.get('prospects', 'prospect-a'));
  assert.equal(result.status, 'ready');
  assert.equal(result.draftCapacity.ok, true);
  assert.equal(result.outreach.status, 'needs-review');
  assert(result.outreach.variants.length >= 2);
  assert.equal(result.outreach.selected.quality.passed, true);
  assert.equal(result.draft, result.outreach.selected.body);
  assert.equal(result.subject, result.outreach.selected.subject);
  assert.equal(result.draftApproval.status, 'pending');
  assert.equal(sends, 0);
});
