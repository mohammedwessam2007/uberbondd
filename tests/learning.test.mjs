import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { composeOutreach, stableOutreachVariantIndex } from '../src/copy.mjs';
import {
  LEARNING_DIMENSIONS,
  LearningEngine,
  buildAcquisitionLearning,
  createExperimentRecord,
  evaluateExperimentRecord,
  recordExperimentDecision
} from '../src/learning.mjs';
import { importJsonDatabase } from '../src/json-import.mjs';
import { Store } from '../src/store.mjs';

const campaign = {
  id: 'campaign-1', name: 'Healthcare evidence', niche: 'dentist',
  minimumProspectScore: 60, minimumEvidenceConfidence: 0.8,
  callToAction: 'Would a concise implementation outline be useful?',
  dailySendCap: 10, hourlySendCap: 2
};

function prospect(id, variant, extra = {}) {
  return {
    id,
    campaignId: campaign.id,
    domain: `${id}.example`,
    company: `Private ${id}`,
    website: `https://${id}.example`,
    country: 'UAE',
    niche: 'dentist',
    createdAt: '2026-07-01T00:00:00.000Z',
    score: { total: 80 },
    issue: {
      code: 'no-cta', confidence: 0.92, safeForOutreach: true,
      evidenceUrl: `https://${id}.example/`, evidenceExcerpt: 'Appointments are available by telephone.',
      evidence: { type: 'visible-page-control', url: `https://${id}.example/` }
    },
    contact: { email: `owner@${id}.example`, position: 'Practice Manager' },
    draftApproval: { status: 'approved' },
    outreach: {
      selected: { id: `draft-${variant}`, campaignSubjectVariant: variant, campaignMessageVariant: `Message ${variant}` },
      context: { callToAction: campaign.callToAction, recipientRole: 'Practice Manager' }
    },
    ...extra
  };
}

function message(prospectId, extra = {}) {
  return {
    id: `message-${prospectId}-${extra.id || 'initial'}`,
    prospectId,
    campaignId: campaign.id,
    inbox: 'A',
    provider: 'gmail',
    simulated: false,
    followup: 0,
    sentAt: '2026-07-13T09:00:00.000Z',
    ...extra
  };
}

function aggregateFixture() {
  return {
    campaigns: [campaign],
    prospects: [
      prospect('p1', 'Subject A', { proposalSentAt: '2026-07-15T00:00:00.000Z' }),
      prospect('p2', 'Subject B'),
      prospect('p3', 'Subject A', { score: { total: 10 }, draftApproval: { status: 'pending' } })
    ],
    messages: [
      message('p1', { deliveredAt: '2026-07-13T09:00:10.000Z' }),
      message('p2'),
      message('p3', { provider: 'test', simulated: true })
    ],
    replies: [
      { id: 'r1', prospectId: 'p1', classification: { label: 'interested' }, receivedAt: '2026-07-14T00:00:00.000Z' },
      { id: 'r2', prospectId: 'p2', classification: { label: 'bounce' }, receivedAt: '2026-07-14T00:00:00.000Z' },
      { id: 'r3', prospectId: 'p3', classification: { label: 'meeting-requested' }, simulated: true, provider: 'test' }
    ],
    outboundEvents: [{ id: 'oe1', prospectId: 'p2', eventType: 'hard_bounce', occurredAt: '2026-07-14T00:00:00.000Z' }],
    orders: [
      { id: 'checkout', prospectId: 'p1', offerId: 'offer-live', paymentState: 'checkout-sent', testMode: false },
      { id: 'paid', prospectId: 'p1', offerId: 'offer-live', paymentState: 'paid', verified: true, testMode: false },
      { id: 'paid-test', prospectId: 'p3', offerId: 'offer-test', paymentState: 'paid', verified: true, testMode: true, provider: 'test' }
    ],
    revenueEvents: [
      { id: 'v1', prospectId: 'p1', offerId: 'offer-live', amountCents: 10000, currency: 'USD' },
      { id: 'v2', prospectId: 'p3', offerId: 'offer-test', amountCents: 99900, currency: 'USD' }
    ],
    deliveries: [
      { id: 'd1', prospectId: 'p1', status: 'delivered', testMode: false },
      { id: 'd2', prospectId: 'p3', status: 'delivered', testMode: true }
    ],
    experiments: []
  };
}

test('learning funnel counts explicit real outcomes and separates all simulations', () => {
  const result = buildAcquisitionLearning(aggregateFixture());
  assert.deepEqual(result.counts, {
    discovered: 3, qualified: 2, draftApproved: 2, sent: 2, delivered: 1,
    bounced: 1, unsubscribed: 0, replied: 1, positivelyReplied: 1,
    meetingRequested: 0, proposalSent: 1, checkoutSent: 1, paid: 1,
    deliveryCompleted: 1
  });
  assert.deepEqual(result.revenueByCurrency, [{ currency: 'USD', amountCents: 10000 }]);
  assert.deepEqual(result.simulations, { sent: 1, replied: 1, paid: 1, deliveryCompleted: 1, excludedFromCommercialResults: true });
  assert.equal(result.trackingPolicy.openTracking, false);
  assert.equal(result.trackingPolicy.trackingPixels, false);
  assert.equal(result.trackingPolicy.automaticCapChanges, false);
  assert.deepEqual(Object.keys(result.dimensions), [...LEARNING_DIMENSIONS]);
  assert(result.dimensions.subjectVariant.some(row => row.value === 'Subject A'));
  assert(result.dimensions.sendTime.some(row => row.value === 'Mon 09:00 UTC'));
});

test('send success is never treated as delivery and learning output contains no contact PII', () => {
  const fixture = aggregateFixture();
  delete fixture.messages[0].deliveredAt;
  const result = buildAcquisitionLearning(fixture);
  assert.equal(result.counts.sent, 2);
  assert.equal(result.counts.delivered, 0);
  const serialized = JSON.stringify(result);
  assert(!serialized.includes('owner@'));
  assert(!serialized.includes('Private p1'));
  assert(!serialized.includes('gmailId'));
});

test('discovery-date cohort filters retain attributed downstream outcomes', () => {
  const fixture = aggregateFixture();
  fixture.prospects[2].createdAt = '2026-06-01T00:00:00.000Z';
  const result = buildAcquisitionLearning(fixture, { campaignId: campaign.id, country: 'UAE', niche: 'dentist', dateFrom: '2026-07-01', dateTo: '2026-07-31' });
  assert.equal(result.counts.discovered, 2);
  assert.equal(result.counts.sent, 2);
  assert.equal(result.counts.paid, 1);
});

const composerInput = {
  prospect: { company: 'Atlas Dental', website: 'https://clinic.example' },
  issue: {
    title: 'No obvious booking action was detected', evidenceUrl: 'https://clinic.example/appointments',
    evidenceExcerpt: 'Appointments are available by telephone during opening hours.',
    implication: 'A ready visitor may not know the next step.', service: 'Conversion design',
    confidence: 0.94, safeForOutreach: true
  },
  contact: { position: 'Practice Manager' },
  sender: { name: 'Mohamed', company: 'UberBond', address: 'Cairo, Egypt' },
  campaign: {
    offer: 'Evidence-backed implementation sprint',
    callToAction: 'Would a concise implementation outline be useful?',
    subjectVariants: ['Subject A for {{businessName}}', 'Subject B for {{businessName}}'],
    messageVariants: ['Message A', 'Message B'], prohibitedClaims: []
  },
  unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=test'
};

test('outreach variant assignment is stable, balanced, and does not store its prospect key', () => {
  assert.equal(stableOutreachVariantIndex('prospect-42', 2), stableOutreachVariantIndex('prospect-42', 2));
  const assignments = new Set();
  for (let index = 0; index < 100; index += 1) {
    const result = composeOutreach({ ...composerInput, selectionKey: `prospect-${index}` });
    assignments.add(result.selection.index);
    assert.equal(result.selection.strategy, 'stable-prospect-hash-v1');
    assert(!JSON.stringify(result.selection).includes(`prospect-${index}`));
  }
  assert.deepEqual(assignments, new Set([0, 1]));
});

test('experiment evaluation requires minimum samples and meaningful lift before owner review', () => {
  const record = createExperimentRecord({
    dimension: 'subjectVariant', variants: ['Subject A', 'Subject B'],
    primaryMetric: 'positiveReplyRate', minimumSampleSize: 20
  }, '2026-07-18T00:00:00.000Z');
  const fixture = aggregateFixture();
  let evaluated = evaluateExperimentRecord(record, buildAcquisitionLearning(fixture), '2026-07-18T01:00:00.000Z');
  assert.equal(evaluated.status, 'insufficient-data');
  assert.equal(evaluated.recommendation, null);

  const prospects = [];
  const messages = [];
  const replies = [];
  for (let index = 0; index < 40; index += 1) {
    const id = `sample-${index}`;
    const variant = index < 20 ? 'Subject A' : 'Subject B';
    prospects.push(prospect(id, variant));
    messages.push(message(id));
    if (index < 8 || (index >= 20 && index < 22)) replies.push({ id: `reply-${id}`, prospectId: id, classification: { label: 'interested' } });
  }
  const dashboard = buildAcquisitionLearning({ campaigns: [campaign], prospects, messages, replies });
  evaluated = evaluateExperimentRecord(record, dashboard, '2026-07-18T02:00:00.000Z');
  assert.equal(evaluated.status, 'review-ready');
  assert.equal(evaluated.recommendation.variant, 'Subject A');
  assert.equal(evaluated.recommendation.ownerDecision, 'pending');
  assert.equal(evaluated.recommendation.automaticApply, false);
  assert.equal(evaluated.recommendation.automaticCapChange, false);
  assert.equal(evaluated.history.length, 1);
});

test('experiment validation rejects unsafe fields and decisions never mutate campaign caps', async () => {
  assert.throws(() => createExperimentRecord({ dimension: 'subjectVariant', variants: ['A', 'B'], primaryMetric: 'replyRate', autoIncreaseCap: true }), /experiment-unknown-fields/);
  assert.throws(() => createExperimentRecord({ dimension: 'subjectVariant', variants: ['api token', 'B'], primaryMetric: 'replyRate' }), /experiment-variant-invalid/);
  assert.throws(() => createExperimentRecord({ dimension: 'subjectVariant', variants: ['a@example.com', 'B'], primaryMetric: 'replyRate' }), /experiment-variant-invalid/);

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-learning-'));
  const store = new Store(dir);
  await store.init();
  await store.add('campaigns', campaign);
  for (let index = 0; index < 40; index += 1) {
    const id = `engine-${index}`;
    const variant = index < 20 ? 'Subject A' : 'Subject B';
    await store.add('prospects', prospect(id, variant));
    await store.add('messages', message(id));
    if (index < 8 || (index >= 20 && index < 22)) await store.add('replies', { id: `engine-reply-${index}`, prospectId: id, classification: { label: 'interested' } });
  }
  const clock = () => new Date('2026-07-18T03:00:00.000Z');
  const engine = new LearningEngine(store, { clock });
  let experiment = await engine.create({
    campaignId: campaign.id, name: 'Subject evidence', dimension: 'subjectVariant',
    variants: ['Subject A', 'Subject B'], primaryMetric: 'positiveReplyRate', minimumSampleSize: 20
  });
  assert.equal(experiment.status, 'review-ready');
  experiment = await engine.refresh(experiment.id);
  assert.equal(experiment.history.length, 2);
  experiment = await engine.decide(experiment.id, { decision: 'approve', note: 'Owner accepts the evidence.' });
  assert.equal(experiment.status, 'approved');
  assert.equal(experiment.recommendation.automaticApply, false);
  assert.equal(experiment.recommendation.automaticCapChange, false);
  assert.deepEqual(await store.get('campaigns', campaign.id), campaign);
  await assert.rejects(engine.refresh(experiment.id), /experiment-decision-is-terminal/);
});

test('JSON recovery imports retained experiment history after its campaign', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-learning-import-'));
  const source = path.join(dir, 'source.json');
  const record = createExperimentRecord({ dimension: 'country', variants: ['UAE', 'UK'], primaryMetric: 'qualificationRate', minimumSampleSize: 20 });
  record.campaignId = campaign.id;
  record.history = [{ evaluatedAt: '2026-07-18T00:00:00.000Z', status: 'insufficient-data', results: [] }];
  await fs.writeFile(source, JSON.stringify({ version: 8, campaigns: [campaign], experiments: [record] }));
  const store = new Store(path.join(dir, 'store'));
  await store.init();
  const report = await importJsonDatabase(store, source);
  assert.equal(report.tables.experiments.written, 1);
  assert.equal((await store.get('experiments', record.id)).history.length, 1);
});

test('acquisition learning migration creates indexed historical experiment storage', async () => {
  const db = new PGlite();
  try {
    for (const name of ['001_initial.sql', '002_durable_queue.sql', '003_shared_artifacts.sql', '004_unattended_send_safety.sql', '005_offer_payment_state.sql', '006_paid_delivery_workflow.sql', '007_acquisition_learning.sql']) {
      await db.exec(await fs.readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
    }
    const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='experiments'");
    assert.equal(tables.rows.length, 1);
    const indexes = await db.query("SELECT indexname FROM pg_indexes WHERE tablename='experiments'");
    const names = new Set(indexes.rows.map(row => row.indexname));
    assert(names.has('experiments_campaign_created_idx'));
    assert(names.has('experiments_dimension_status_idx'));
    await db.query("INSERT INTO campaigns(id, data) VALUES ('campaign-1', '{}'::jsonb)");
    await db.query("INSERT INTO experiments(id,campaign_id,dimension,status,data) VALUES ('exp-1','campaign-1','country','insufficient-data','{}'::jsonb)");
  } finally {
    await db.close();
  }
});

test('owner decisions remain explicit pure records with no automatic application', () => {
  const record = createExperimentRecord({ dimension: 'inbox', variants: ['A', 'B'], primaryMetric: 'replyRate', minimumSampleSize: 20 });
  const ready = {
    ...record,
    status: 'review-ready',
    recommendation: { variant: 'A', ownerDecision: 'pending', automaticApply: false, automaticCapChange: false }
  };
  const decided = recordExperimentDecision(ready, 'reject', 'Keep collecting data.');
  assert.equal(decided.status, 'rejected');
  assert.equal(decided.recommendation.ownerDecision, 'rejected');
  assert.equal(decided.automaticApply, false);
  assert.equal(decided.automaticCapChange, false);
});

test('authenticated operator surface exposes the outcome funnel without open-tracking machinery', async () => {
  const [html, browserCode, serverCode, learningCode] = await Promise.all([
    fs.readFile(new URL('../public/admin.html', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/admin.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/learning.mjs', import.meta.url), 'utf8')
  ]);
  assert.match(html, /id="learning-funnel"/);
  assert.match(html, /id="experiment-form"/);
  assert.match(browserCode, /api\('\/api\/learning'\)/);
  assert.match(serverCode, /url\.pathname === '\/api\/learning'/);
  assert.match(serverCode, /url\.pathname === '\/api\/experiments'/);
  assert.match(learningCode, /trackingPixels: false/);
  assert.doesNotMatch(learningCode, /openedAt|openCount|trackingPixelUrl|webBeacon/);
});
