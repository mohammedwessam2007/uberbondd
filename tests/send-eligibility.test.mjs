import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCanonSendEligibility, resolveCanonSendCandidate } from '../src/send-eligibility.mjs';
import { persistCampaignActivationApproval } from '../src/campaign-activation.mjs';
import { JsonStore } from '../src/store.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canon-send-eligibility-'));
  const store = new JsonStore(dir);
  await store.init();
  return store;
}

const at = new Date('2026-08-01T12:00:00.000Z');

async function seedReadyCandidate(store, overrides = {}) {
  const evidence = await store.add('sourceEvidence', {
    id: 'ev_1', organizationDomain: 'acme.com', sourceUrl: 'https://acme.com/careers', sourceType: 'official-company',
    status: 'active', contentHash: 'hash1', capturedAt: '2026-07-30T00:00:00.000Z', expiresAt: null, data: {}
  });
  const opportunity = await store.add('opportunities', {
    id: 'opp_1', idempotencyKey: 'idem_opp_1', sourceEvidenceId: evidence.id, stage: 'ready_for_message',
    serviceLane: 'ai-workflow', expectedValueCents: 50000, currency: 'USD', ownerMinutes: 10, deliveryHours: 4,
    scoreTotal: 80, scoreVersion: 'v1', expiresAt: null, data: { organizationDomain: 'acme.com' }, ...overrides.opportunity
  });
  await store.add('policyDecisions', { id: 'pd_1', opportunityId: opportunity.id, policyVersion: 'v1', decision: 'pass', reasonCodes: [], evaluatedAt: '2026-07-31T00:00:00.000Z', data: {}, ...overrides.policyDecision });
  const messageVariant = await store.add('messageVariants', { id: 'mv_1', opportunityId: opportunity.id, lane: 'ai-workflow', subject: 's', body: 'b', bodyHash: 'h', status: 'approved', data: {}, ...overrides.messageVariant });
  const experiment = await store.add('experiments', { id: 'exp_1', status: 'active', hypothesis: 'h', lane: 'ai-workflow', variant: 'a', successMetric: 'replies', data: {}, ...overrides.experiment });
  const recipients = ['buyer@acme.com'];
  await persistCampaignActivationApproval(store, {
    experimentId: experiment.id, members: [{ organizationDomain: 'acme.com', recipientEmail: 'buyer@acme.com' }],
    senderSet: ['inbox-a'], policyVersion: 'v1', approvedBy: 'owner', expiresAt: '2026-08-10T00:00:00.000Z', now: at
  });
  return { evidence, opportunity, messageVariant, experiment, recipients };
}

test('a fully ready candidate passes', async () => {
  const store = await makeStore();
  const { opportunity, messageVariant, experiment, recipients } = await seedReadyCandidate(store);
  const result = await resolveCanonSendCandidate(store, {
    opportunityId: opportunity.id, messageVariantId: messageVariant.id, experimentId: experiment.id,
    contactRoute: { type: 'email', email: 'buyer@acme.com', publishedOfficially: true },
    prospect: { status: 'new' }, senderInbox: 'inbox-a', organizationDomain: 'acme.com', senderSet: ['inbox-a'],
    policyVersion: 'v1', cfg: { acquisition: { workersActive: true } }, at
  });
  assert.equal(result.ok, true, JSON.stringify(result.reasons));
});

test('P0-003 acceptance: a policy-rejected opportunity cannot reserve even with prospect.sendEligible=true / status=ready_for_message', async () => {
  const store = await makeStore();
  const { opportunity, messageVariant, experiment, recipients } = await seedReadyCandidate(store, {
    opportunity: { stage: 'policy_rejected' }
  });
  const result = await resolveCanonSendCandidate(store, {
    opportunityId: opportunity.id, messageVariantId: messageVariant.id, experimentId: experiment.id,
    contactRoute: { type: 'email', email: 'buyer@acme.com', publishedOfficially: true },
    // A stale/tampered record claiming eligibility -- these fields are never read by the
    // eligibility function at all, so flipping them cannot change the outcome.
    prospect: { status: 'ready_for_message', sendEligible: true },
    senderInbox: 'inbox-a', organizationDomain: 'acme.com', senderSet: ['inbox-a'], policyVersion: 'v1',
    cfg: { acquisition: { workersActive: true } }, at
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('opportunity-not-ready-for-message'));
});

test('P0-005 acceptance: a suppressed recipient blocks reservation', async () => {
  const store = await makeStore();
  const { opportunity, messageVariant, experiment, recipients } = await seedReadyCandidate(store);
  await store.add('suppressions', { id: 'sup_1', value: 'buyer@acme.com', data: {} });
  const result = await resolveCanonSendCandidate(store, {
    opportunityId: opportunity.id, messageVariantId: messageVariant.id, experimentId: experiment.id,
    contactRoute: { type: 'email', email: 'buyer@acme.com', publishedOfficially: true },
    prospect: { status: 'new' }, senderInbox: 'inbox-a', organizationDomain: 'acme.com', senderSet: ['inbox-a'],
    policyVersion: 'v1', cfg: { acquisition: { workersActive: true } }, at
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('recipient-suppressed'));
});

test('a terminal prospect status blocks reservation', () => {
  const result = evaluateCanonSendEligibility({
    opportunity: { id: 'o', stage: 'ready_for_message' },
    policyDecision: { decision: 'pass' },
    sourceEvidence: { status: 'active', capturedAt: '2026-07-30T00:00:00.000Z' },
    contactRoute: { type: 'email', email: 'buyer@acme.com', publishedOfficially: true },
    prospect: { status: 'hard-bounce' },
    messageVariant: { status: 'approved', opportunityId: 'o' },
    experiment: { status: 'active' },
    campaignActivation: { ok: true },
    at
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('prospect-terminal-status'));
});

test('a non-email contact route (e.g. a partner application form) can never be email-sendable', () => {
  const result = evaluateCanonSendEligibility({
    opportunity: { id: 'o', stage: 'ready_for_message' },
    policyDecision: { decision: 'pass' },
    sourceEvidence: { status: 'active', capturedAt: '2026-07-30T00:00:00.000Z' },
    contactRoute: { type: 'partner_application', sourceUrl: 'https://acme.com/partners', publishedOfficially: true },
    prospect: { status: 'new' },
    messageVariant: { status: 'approved', opportunityId: 'o' },
    experiment: { status: 'active' },
    campaignActivation: { ok: true },
    at
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('contact-route-not-email-sendable'));
});

test('a reserved (.example) domain fails closed outside simulation', () => {
  const result = evaluateCanonSendEligibility({
    opportunity: { id: 'o', stage: 'ready_for_message', data: { organizationDomain: 'company-01.example' } },
    policyDecision: { decision: 'pass' },
    sourceEvidence: { status: 'active', capturedAt: '2026-07-30T00:00:00.000Z', organizationDomain: 'company-01.example' },
    contactRoute: { type: 'email', email: 'partnerships@company-01.example', publishedOfficially: true },
    prospect: { status: 'new' },
    messageVariant: { status: 'approved', opportunityId: 'o' },
    experiment: { status: 'active' },
    campaignActivation: { ok: true },
    at, simulation: false
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('reserved-domain-outside-simulation'));
});
