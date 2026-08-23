import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pipeline } from '../src/pipeline.mjs';
import { Store } from '../src/store.mjs';
import { evaluateDeliverabilityGuard } from '../src/deliverability-guard.mjs';

// The guard reads authority from durable storage, exactly as production does:
// the pipeline loads the campaign with store.get before it ever gets here. A
// fixture that hands over a campaign existing only in memory is modelling a
// state the system cannot be in, and it is what let a revoked approval pass the
// final recheck unnoticed.
async function guardWith(store, args = {}) {
  if (args.campaign) await store.upsert('campaigns', args.campaign);
  return evaluateDeliverabilityGuard({ store, ...args });
}


// These tests prove the wiring between Pipeline.maybeSend and
// evaluateDeliverabilityGuard(). The guard's own hostile scenarios (expired
// evidence, cost/volume ceilings, sender-health pause, malformed input,
// cross-campaign mismatch, unknown provider, etc.) are already covered
// standalone in tests/deliverability-guard.test.mjs; this file only tests
// that the pipeline actually calls the guard at the right points, persists
// its receipt, and never reaches sendEmailFn (the only provider boundary)
// when the guard says no. sendEmailFn is always a local stub here — no test
// in this file makes a real network call.

const monday = new Date('2026-07-13T10:00:00.000Z');

function baseCampaign(overrides = {}) {
  return { id: 'camp', approved: true, autoSend: true, allowedCountries: ['GB'], minScore: 60, dailyCaps: { A: 10 }, maxFollowups: 0, ...overrides };
}

function baseCfg(overrides = {}) {
  return {
    outbound: {
      enabled: true, dryRun: false, allowedCountries: ['United Kingdom'], hourlyCaps: { A: 3 }, minGapSeconds: 0,
      businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75, maxEvidenceAgeDays: 45,
      hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3,
      ...overrides.outbound
    },
    sender: { name: 'Mohamed', company: 'UberBond', address: 'Business address' }, caps: { A: 10 }, google: {}, encryptionKey: ''
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-pipeline-guard-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function connectedStore(inbox = 'A') {
  const store = await tempStore();
  await store.add('accounts', { id: `acct-${inbox}`, slot: inbox, connected: true, email: `outreach-${inbox}@uberbond.example`, tokens: 'unused' });
  // The pipeline loads the campaign from the store before it reaches
  // maybeSend, and the guard now reads authority back from there. Seeding it
  // is what makes the fixture match production.
  await store.upsert('campaigns', baseCampaign());
  return store;
}

function spyPipeline(store, cfg, extraHooks = {}) {
  let sends = 0;
  const pipeline = new Pipeline(store, cfg, {
    clock: () => monday,
    sendEmail: async () => { sends += 1; return { data: { id: 'gmail-1', threadId: 'thread-1' } }; },
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<message-1@example>' }] } } }),
    ...extraHooks
  });
  return { pipeline, sends: () => sends };
}

async function guardDecisions(store) {
  return (await store.list('auditLog')).filter(entry => entry.type === 'deliverability_guard_decision');
}

test('admission DENY stops before any reservation and persists a receipt', async () => {
  const store = await connectedStore();
  await store.add('suppressions', { id: 'sup1', value: 'info@clinic.example', reason: 'manual', createdAt: monday.toISOString() });
  const { pipeline, sends } = spyPipeline(store, baseCfg());
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  assert.equal(result.sent, false);
  assert.equal(result.decision, 'DENY');
  assert.equal(sends(), 0);
  assert.equal((await store.list('outboundReservations')).length, 0);
  const decisions = await guardDecisions(store);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].detail.phase, 'admission');
  assert.equal(decisions[0].detail.decision, 'DENY');
});

test('REVIEW_REQUIRED stops before any reservation and persists a receipt', async () => {
  const store = await connectedStore();
  const { pipeline, sends } = spyPipeline(store, baseCfg());
  const campaign = baseCampaign({ autoSend: false });
  await store.upsert('campaigns', campaign);
  const result = await pipeline.maybeSend(baseProspect(), campaign);
  assert.equal(result.sent, false);
  assert.equal(result.decision, 'REVIEW_REQUIRED');
  assert.equal(sends(), 0);
  assert.equal((await store.list('outboundReservations')).length, 0);
  const decisions = await guardDecisions(store);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].detail.decision, 'REVIEW_REQUIRED');
});

test('ALLOW_LOCAL_PREPARATION alone cannot cause a send while the structural kill switch is disabled', async () => {
  const store = await connectedStore();
  const cfg = baseCfg({ outbound: { enabled: false, dryRun: true } });
  const { pipeline, sends } = spyPipeline(store, cfg);
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  assert.equal(result.sent, false);
  assert.equal(sends(), 0);
  assert.equal((await store.list('outboundReservations')).length, 0);
  const decisions = await guardDecisions(store);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].detail.decision, 'ALLOW_LOCAL_PREPARATION', 'the guard itself must admit local preparation even though the separate structural kill switch still blocks the actual send');
});

test('a fully eligible action reaches the provider exactly once, with both an admission and a final-recheck receipt', async () => {
  const store = await connectedStore();
  await store.upsert('campaigns', baseCampaign());
  await store.add('prospects', { ...baseProspect(), status: 'ready', createdAt: monday.toISOString() });
  const { pipeline, sends } = spyPipeline(store, baseCfg());
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  assert.equal(result.sent, true);
  assert.equal(sends(), 1);
  const decisions = await guardDecisions(store);
  assert.equal(decisions.length, 2);
  assert.deepEqual(decisions.map(d => d.detail.phase).sort(), ['admission', 'final-recheck']);
  assert.ok(decisions.every(d => d.detail.decision === 'ALLOW_LOCAL_PREPARATION'));
  assert.equal(decisions[0].detail.actionIdentity, decisions[1].detail.actionIdentity, 'the same unchanged action must hash to the same action identity across both checkpoints');

  const expected = await guardWith(store, {
    prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday, followup: 0,
    body: baseProspect().draft, subject: baseProspect().subject
  });
  assert.equal(decisions[0].detail.actionIdentity, expected.actionIdentity);
});

test('a changed message produces a different action identity than the original preparation', async () => {
  const store = await connectedStore();
  const { pipeline } = spyPipeline(store, baseCfg());
  const first = await pipeline.maybeSend(baseProspect(), baseCampaign());
  const second = await pipeline.maybeSend(baseProspect(), baseCampaign({ maxFollowups: 2 }), { followup: 1, body: 'A completely different follow-up message.' });
  const decisions = await guardDecisions(store);
  const firstAdmission = decisions.find(d => d.detail.phase === 'admission' && d.detail.followup === 0);
  const secondAdmission = decisions.find(d => d.detail.phase === 'admission' && d.detail.followup === 1);
  assert.ok(firstAdmission && secondAdmission);
  assert.notEqual(firstAdmission.detail.actionIdentity, secondAdmission.detail.actionIdentity);
  void first; void second;
});

test('final recheck blocks a recipient suppressed after admission but before the provider call, and cancels the reservation', async () => {
  const store = await connectedStore();
  const realMark = store.markOutboundReservation.bind(store);
  let injected = false;
  store.markOutboundReservation = async (id, status, patch) => {
    const result = await realMark(id, status, patch);
    if (status === 'dispatching' && !injected) {
      injected = true;
      await store.add('suppressions', { id: 'sup-race', value: 'info@clinic.example', reason: 'optout', createdAt: monday.toISOString() });
    }
    return result;
  };
  const { pipeline, sends } = spyPipeline(store, baseCfg());
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  assert.equal(result.sent, false);
  assert.equal(result.decision, 'DENY');
  assert.equal(sends(), 0, 'the provider must never be called once the final recheck denies');
  const reservations = await store.list('outboundReservations');
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].status, 'cancelled');
  const decisions = await guardDecisions(store);
  assert.equal(decisions.length, 2);
  const final = decisions.find(d => d.detail.phase === 'final-recheck');
  assert.ok(final.detail.receipt.denyReasonCodes.some(r => r.startsWith('suppressed:')));
});

test('final recheck blocks evidence that expires between admission and the provider call', async () => {
  const store = await connectedStore();
  let calls = 0;
  const farFuture = new Date(monday.getTime() + 400 * 86400000);
  const clock = () => { calls += 1; return calls >= 4 ? farFuture : monday; };
  const pipeline = new Pipeline(store, baseCfg(), {
    clock,
    sendEmail: async () => { throw new Error('provider must not be called'); },
    getMessage: async () => ({ data: { payload: { headers: [] } } })
  });
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  assert.equal(result.sent, false);
  assert.equal(result.decision, 'DENY');
  const decisions = await guardDecisions(store);
  const final = decisions.find(d => d.detail.phase === 'final-recheck');
  assert.ok(final.detail.receipt.denyReasonCodes.includes('evidence-expired'));
  const admission = decisions.find(d => d.detail.phase === 'admission');
  assert.equal(admission.detail.decision, 'ALLOW_LOCAL_PREPARATION', 'evidence was still fresh at admission time');
});

test('final recheck blocks authority that expires between admission and the provider call', async () => {
  const store = await connectedStore();
  let calls = 0;
  const clock = () => { calls += 1; return monday; };
  const campaign = baseCampaign({ expiresAt: new Date(monday.getTime() + 1).toISOString() });
  await store.upsert('campaigns', campaign);
  const realMark = store.markOutboundReservation.bind(store);
  store.markOutboundReservation = async (id, status, patch) => {
    const result = await realMark(id, status, patch);
    // The expiry lands in the database, which is where an authority change
    // actually arrives. This used to mutate the in-memory `campaign` object and
    // the recheck read it back -- so the test passed while the guard was in
    // fact trusting whatever the sending process happened to be holding, which
    // is the defect it was meant to be guarding against.
    if (status === 'dispatching') {
      await store.patch('campaigns', campaign.id, { expiresAt: new Date(monday.getTime() - 1000).toISOString() });
    }
    return result;
  };
  const pipeline = new Pipeline(store, baseCfg(), {
    clock,
    sendEmail: async () => { throw new Error('provider must not be called'); },
    getMessage: async () => ({ data: { payload: { headers: [] } } })
  });
  const result = await pipeline.maybeSend(baseProspect(), campaign);
  assert.equal(result.sent, false);
  assert.equal(result.decision, 'DENY');
  const decisions = await guardDecisions(store);
  const final = decisions.find(d => d.detail.phase === 'final-recheck');
  assert.ok(final.detail.receipt.denyReasonCodes.includes('authority-campaign-expired'));
});

test('a reservation stuck in dispatching from an interrupted prior attempt blocks a fresh retry rather than silently resending', async () => {
  const store = await connectedStore();
  const stuck = await store.reserveOutboundSend({
    idempotencyKey: 'initial:pros', prospectId: 'pros', campaignId: 'camp', inbox: 'A',
    recipientEmail: 'info@clinic.example', dailyCap: 10, hourlyCap: 10, minGapSeconds: 0, now: monday.toISOString()
  });
  await store.markOutboundReservation(stuck.reservation.id, 'dispatching');
  const { pipeline, sends } = spyPipeline(store, baseCfg());
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'duplicate-dispatching');
  assert.equal(sends(), 0);
  assert.equal((await store.list('outboundReservations')).length, 1, 'no second reservation should ever be created for the same idempotency key');
});

test('cross-campaign mismatch is denied by the pipeline before any reservation', async () => {
  const store = await connectedStore();
  const { pipeline, sends } = spyPipeline(store, baseCfg());
  const prospect = baseProspect({ campaignId: 'a-different-campaign' });
  const result = await pipeline.maybeSend(prospect, baseCampaign());
  assert.equal(result.decision, 'DENY');
  assert.equal(sends(), 0);
  assert.equal((await store.list('outboundReservations')).length, 0);
});

test('an unconnected/unknown provider account is denied before any reservation', async () => {
  const store = await tempStore();
  const { pipeline, sends } = spyPipeline(store, baseCfg());
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  assert.equal(result.decision, 'DENY');
  assert.equal(sends(), 0);
  assert.equal((await store.list('outboundReservations')).length, 0);
});

test('a sender-health pause is enforced before any reservation', async () => {
  const store = await connectedStore();
  await store.recordOutboundEvent({ inbox: 'A', eventType: 'hard_bounce', recipientEmail: 'a@x.example' }, { hardBouncePauseThreshold: 1, complaintPauseThreshold: 1, failurePauseThreshold: 3 });
  const { pipeline, sends } = spyPipeline(store, baseCfg());
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  assert.equal(result.decision, 'DENY');
  assert.equal(sends(), 0);
  assert.equal((await store.list('outboundReservations')).length, 0);
});

test('a tight daily volume ceiling is enforced before a second reservation is attempted', async () => {
  const store = await connectedStore();
  await store.reserveOutboundSend({
    idempotencyKey: 'initial:other', prospectId: 'other', campaignId: 'camp', inbox: 'A',
    recipientEmail: 'other@clinic.example', dailyCap: 1, hourlyCap: 10, minGapSeconds: 0, now: monday.toISOString()
  });
  const cfg = baseCfg(); cfg.caps = { A: 1 };
  const campaign = baseCampaign({ dailyCaps: { A: 1 } });
  const { pipeline, sends } = spyPipeline(store, cfg);
  const result = await pipeline.maybeSend(baseProspect(), campaign);
  assert.equal(result.decision, 'DENY');
  assert.equal(sends(), 0);
  assert.equal((await store.list('outboundReservations')).length, 1, 'the pre-existing reservation only; the guard must stop before a second one is attempted');
});

test('malformed input (null prospect and campaign) is denied cleanly without throwing', async () => {
  const store = await connectedStore();
  const { pipeline, sends } = spyPipeline(store, baseCfg());
  const result = await pipeline.maybeSend(null, null);
  assert.equal(result.sent, false);
  assert.equal(result.decision, 'DENY');
  assert.ok(result.guard.denyReasonCodes.includes('malformed-input-prospect'));
  assert.ok(result.guard.denyReasonCodes.includes('malformed-input-campaign'));
  assert.equal(sends(), 0);
  assert.equal((await store.list('outboundReservations')).length, 0);
});

test('the same fixed reference time produces byte-identical admission decisions on identical fresh state', async () => {
  const storeA = await connectedStore();
  const storeB = await connectedStore();
  const { pipeline: pipelineA } = spyPipeline(storeA, baseCfg());
  const { pipeline: pipelineB } = spyPipeline(storeB, baseCfg());
  const resultA = await pipelineA.maybeSend(baseProspect(), baseCampaign());
  const resultB = await pipelineB.maybeSend(baseProspect(), baseCampaign());
  const decisionsA = await guardDecisions(storeA);
  const decisionsB = await guardDecisions(storeB);
  const admissionA = decisionsA.find(d => d.detail.phase === 'admission').detail;
  const admissionB = decisionsB.find(d => d.detail.phase === 'admission').detail;
  assert.deepEqual(admissionA.receipt.decision, admissionB.receipt.decision);
  assert.deepEqual(admissionA.receipt.denyReasonCodes, admissionB.receipt.denyReasonCodes);
  assert.equal(admissionA.actionIdentity, admissionB.actionIdentity);
  assert.equal(admissionA.receipt.timestamp, admissionB.receipt.timestamp);
  void resultA; void resultB;
});

test('a spy proves zero provider calls across every denied, review-required, and kill-switch-disabled path', async () => {
  const store = await connectedStore();
  let sends = 0;
  const sendEmail = async () => { sends += 1; return { data: { id: 'x', threadId: 'y' } }; };
  const clock = () => monday;

  // Denied: suppressed
  await store.add('suppressions', { id: 'sup', value: 'info@clinic.example', reason: 'manual', createdAt: monday.toISOString() });
  await new Pipeline(store, baseCfg(), { clock, sendEmail }).maybeSend(baseProspect(), baseCampaign());

  // Review required: autoSend disabled
  const store2 = await connectedStore();
  await new Pipeline(store2, baseCfg(), { clock, sendEmail }).maybeSend(baseProspect(), baseCampaign({ autoSend: false }));

  // Kill switch disabled
  const store3 = await connectedStore();
  await new Pipeline(store3, baseCfg({ outbound: { enabled: false, dryRun: true } }), { clock, sendEmail }).maybeSend(baseProspect(), baseCampaign());

  // Malformed input
  const store4 = await connectedStore();
  await new Pipeline(store4, baseCfg(), { clock, sendEmail }).maybeSend(undefined, undefined);

  // Unknown provider
  const store5 = await tempStore();
  await new Pipeline(store5, baseCfg(), { clock, sendEmail }).maybeSend(baseProspect(), baseCampaign());

  assert.equal(sends, 0, 'no denied, review-required, malformed, or kill-switch-disabled path may ever reach the provider');
});
