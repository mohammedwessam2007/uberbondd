import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateDeliverabilityGuard, POLICY_VERSION } from '../src/deliverability-guard.mjs';
import { Store } from '../src/store.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

function baseCampaign(overrides = {}) {
  return { id: 'camp', approved: true, autoSend: true, allowedCountries: ['GB'], minScore: 60, dailyCaps: { A: 10 }, maxFollowups: 0, ...overrides };
}

function baseCfg(overrides = {}) {
  return {
    outbound: {
      enabled: false, dryRun: true, allowedCountries: ['United Kingdom'], hourlyCaps: { A: 3 }, minGapSeconds: 0,
      businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75, maxEvidenceAgeDays: 45,
      hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3,
      ...overrides.outbound
    },
    sender: { name: 'Mohamed', company: 'UberBond', address: 'Business address' }, caps: { A: 10 }, google: {}, encryptionKey: '',
    ...overrides
  };
}

function baseProspect(overrides = {}) {
  return {
    id: 'pros', campaignId: 'camp', company: 'Clinic', website: 'https://clinic.example', domain: 'clinic.example', country: 'United Kingdom',
    inbox: 'A', draft: 'Evidence-backed message with reply no.', subject: 'Website observation',
    unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=test', oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=test',
    contact: { email: 'info@clinic.example', source: 'website', verified: 'unverified' },
    score: { total: 80 }, completedAt: monday.toISOString(),
    issue: { title: 'Booking path issue', confidence: .9, safeForOutreach: true, evidenceUrl: 'https://clinic.example/book', evidenceExcerpt: 'Book button returned an error.' },
    ...overrides
  };
}

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-guard-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function connectedStore(inbox = 'A') {
  const store = await tempStore();
  await store.add('accounts', { id: `acct-${inbox}`, slot: inbox, connected: true, email: `outreach-${inbox}@uberbond.example`, tokens: 'unused' });
  return store;
}

test('normal eligible preparation is ALLOW_LOCAL_PREPARATION with a complete receipt', async () => {
  const store = await connectedStore();
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'ALLOW_LOCAL_PREPARATION');
  assert.deepEqual(result.denyReasonCodes, []);
  assert.deepEqual(result.reviewReasonCodes, []);
  assert.equal(result.policyVersion, POLICY_VERSION);
  assert.equal(result.suppressionResult.suppressed, false);
  assert.equal(result.deduplicationResult.duplicate, false);
  assert.equal(result.idempotencyKey, 'initial:pros');
  assert.equal(result.authorityUsed.outboundStructurallyEnabled, false);
  assert.ok(result.timestamp);
  assert.ok(result.reversibleNextStep.length > 0);
  assert.equal(result.costEstimate.amountCents, 0);
});

test('missing evidence is denied', async () => {
  const store = await connectedStore();
  const prospect = baseProspect({ issue: { title: 'X', confidence: .9, safeForOutreach: true } });
  const result = await evaluateDeliverabilityGuard({ store, prospect, campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.some(r => r.startsWith('evidence:')));
});

test('expired evidence is denied', async () => {
  const store = await connectedStore();
  const stale = new Date(monday.getTime() - 90 * 86400000).toISOString();
  const prospect = baseProspect({ completedAt: stale });
  const result = await evaluateDeliverabilityGuard({ store, prospect, campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('evidence-expired'));
});

test('contradictory evidence (domain mismatch) is denied', async () => {
  const store = await connectedStore();
  const prospect = baseProspect({ issue: { title: 'X', confidence: .9, safeForOutreach: true, evidenceUrl: 'https://other.example/x', evidenceExcerpt: 'unrelated' } });
  const result = await evaluateDeliverabilityGuard({ store, prospect, campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('evidence:evidence-domain-mismatch'));
});

test('suppressed recipient is denied', async () => {
  const store = await connectedStore();
  await store.add('suppressions', { id: 'sup1', value: 'info@clinic.example', reason: 'manual', createdAt: monday.toISOString() });
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.suppressionResult.suppressed, true);
  assert.ok(result.denyReasonCodes.includes('suppressed:manual'));
});

test('opt-out is denied via the canonical suppression list', async () => {
  const store = await connectedStore();
  await store.add('suppressions', { id: 'sup1', value: 'info@clinic.example', reason: 'optout', createdAt: monday.toISOString() });
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('suppressed:optout'));
});

test('complaint is denied via the canonical suppression list', async () => {
  const store = await connectedStore();
  await store.add('suppressions', { id: 'sup1', value: 'info@clinic.example', reason: 'complaint', createdAt: monday.toISOString() });
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('suppressed:complaint'));
});

test('hard bounce is denied via the canonical suppression list', async () => {
  const store = await connectedStore();
  await store.add('suppressions', { id: 'sup1', value: 'info@clinic.example', reason: 'bounce', createdAt: monday.toISOString() });
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('suppressed:bounce'));
});

test('prior-contact duplicate (already sent) is denied as a replay', async () => {
  const store = await connectedStore();
  await store.reserveOutboundSend({ idempotencyKey: 'initial:pros', prospectId: 'pros', campaignId: 'camp', inbox: 'A', recipientEmail: 'info@clinic.example', dailyCap: 10, hourlyCap: 10, minGapSeconds: 0, now: monday.toISOString() });
  const reservation = (await store.list('outboundReservations'))[0];
  await store.markOutboundReservation(reservation.id, 'sent', { sentAt: monday.toISOString() });
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('replay-idempotency-key:sent'));
  assert.equal(result.deduplicationResult.duplicate, true);
});

test('replayed idempotency key that is merely reserved (not stale) is denied as duplicate-in-progress', async () => {
  const store = await connectedStore();
  await store.reserveOutboundSend({ idempotencyKey: 'initial:pros', prospectId: 'pros', campaignId: 'camp', inbox: 'A', recipientEmail: 'info@clinic.example', dailyCap: 10, hourlyCap: 10, minGapSeconds: 0, now: monday.toISOString() });
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('duplicate-reservation-in-progress'));
});

test('a stale reserved-but-never-completed reservation is REVIEW_REQUIRED, not a silent send', async () => {
  const store = await connectedStore();
  const reservedAt = new Date(monday.getTime() - 60 * 60000).toISOString();
  await store.reserveOutboundSend({ idempotencyKey: 'initial:pros', prospectId: 'pros', campaignId: 'camp', inbox: 'A', recipientEmail: 'info@clinic.example', dailyCap: 10, hourlyCap: 10, minGapSeconds: 0, now: reservedAt });
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'REVIEW_REQUIRED');
  assert.ok(result.reviewReasonCodes.includes('stale-reservation-detected'));
});

test('uncertain recipient identity is denied', async () => {
  const store = await connectedStore();
  const prospect = baseProspect({ contact: { email: 'owner@clinic.example', source: 'hunter', verified: 'unknown' } });
  const result = await evaluateDeliverabilityGuard({ store, prospect, campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('contact:contact-not-published-or-verified'));
});

test('inferred/unsupported contact route (free mail) is denied', async () => {
  const store = await connectedStore();
  const prospect = baseProspect({ contact: { email: 'clinic@gmail.com', source: 'website', verified: 'valid' } });
  const result = await evaluateDeliverabilityGuard({ store, prospect, campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('contact:free-mail-contact'));
});

test('missing owner authority (campaign not approved) is denied', async () => {
  const store = await connectedStore();
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign({ approved: false }), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('authority-campaign-not-approved'));
  assert.equal(result.authorityUsed.campaignApproved, false);
});

test('expired owner authority is denied', async () => {
  const store = await connectedStore();
  const campaign = baseCampaign({ expiresAt: new Date(monday.getTime() - 86400000).toISOString() });
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign, cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('authority-campaign-expired'));
});

test('campaign approved but autoSend disabled requires owner review, not a hard deny', async () => {
  const store = await connectedStore();
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign({ autoSend: false }), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'REVIEW_REQUIRED');
  assert.ok(result.reviewReasonCodes.includes('owner-review-required-autosend-disabled'));
  assert.equal(result.ownerBurden.manualStepsRequired, 1);
});

test('unsupported provider (no connected account for the inbox) is denied', async () => {
  const store = await tempStore();
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('provider-capability-absent'));
});

test('daily volume ceiling exceeded is denied', async () => {
  const store = await connectedStore();
  await store.reserveOutboundSend({ idempotencyKey: 'initial:other', prospectId: 'other', campaignId: 'camp', inbox: 'A', recipientEmail: 'other@clinic.example', dailyCap: 1, hourlyCap: 10, minGapSeconds: 0, now: monday.toISOString() });
  const campaign = baseCampaign({ dailyCaps: { A: 1 } });
  const cfg = baseCfg(); cfg.caps = { A: 1 };
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign, cfg, date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('daily-volume-ceiling-exceeded'));
});

test('cost estimate stays zero because no paid per-send provider is wired up (Gmail API)', async () => {
  const store = await connectedStore();
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.deepEqual(result.costEstimate, { amountCents: 0, currency: 'USD', basis: 'gmail-api-no-per-send-fee' });
});

test('an unsupported/unsubstantiated claim in the draft is denied', async () => {
  const store = await connectedStore();
  const prospect = baseProspect({ draft: 'We guarantee 100% results, best in the world.' });
  const result = await evaluateDeliverabilityGuard({ store, prospect, campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.some(r => r.startsWith('unsupported-claims:')));
});

test('outside the configured safety window is denied', async () => {
  const store = await connectedStore();
  const result = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: new Date('2026-07-13T02:00:00Z') });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('outside-safety-window'));
});

test('cross-campaign (cross-workspace) mismatch is denied', async () => {
  const store = await connectedStore();
  const prospect = baseProspect({ campaignId: 'a-different-campaign' });
  const result = await evaluateDeliverabilityGuard({ store, prospect, campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('cross-campaign-mismatch'));
});

test('malformed input (missing store, prospect, campaign, or config) is denied and still returns a complete receipt', async () => {
  const store = await connectedStore();
  const noStore = await evaluateDeliverabilityGuard({ prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(noStore.decision, 'DENY');
  assert.ok(noStore.denyReasonCodes.includes('malformed-input-store'));
  assert.ok(noStore.timestamp);
  assert.ok(noStore.reversibleNextStep.length > 0);

  const noProspect = await evaluateDeliverabilityGuard({ store, campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(noProspect.decision, 'DENY');
  assert.ok(noProspect.denyReasonCodes.includes('malformed-input-prospect'));

  const noCampaign = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), cfg: baseCfg(), date: monday });
  assert.equal(noCampaign.decision, 'DENY');
  assert.ok(noCampaign.denyReasonCodes.includes('malformed-input-campaign'));

  const noCfg = await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign(), date: monday });
  assert.equal(noCfg.decision, 'DENY');
  assert.ok(noCfg.denyReasonCodes.includes('malformed-input-config'));
});

test('the guard is structurally incapable of calling a provider (no send/network references)', async () => {
  const source = await fs.readFile(fileURLToPath(new URL('../src/deliverability-guard.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /sendEmail|gmail\.mjs|fetch\(|http\.request|https\.request/);
});

test('a full sweep of denied, review, duplicate, replay, and malformed cases never reserves or sends anything', async () => {
  const store = await connectedStore();
  const before = await store.list('outboundReservations');
  assert.equal(before.length, 0);

  await evaluateDeliverabilityGuard({ store, prospect: baseProspect({ contact: { email: 'clinic@gmail.com', source: 'website' } }), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  await evaluateDeliverabilityGuard({ store, prospect: baseProspect(), campaign: baseCampaign({ autoSend: false }), cfg: baseCfg(), date: monday });
  await evaluateDeliverabilityGuard({ prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });

  const after = await store.list('outboundReservations');
  assert.equal(after.length, 0);
});
