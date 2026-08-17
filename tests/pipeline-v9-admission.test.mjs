import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Pipeline } from '../src/pipeline.mjs';
import { Store } from '../src/store.mjs';
import { createApproval } from '../src/omnia-v9/kernel.mjs';
import { signDigestHex } from '../src/omnia-v9/canonical.mjs';

// Proves the wiring of the V9 consequence boundary (src/consequence-boundary.mjs)
// into Pipeline.maybeSend: off by default (zero behavior change for every
// existing caller), and when turned on, composed with -- never bypassing --
// the Guard checks that already ran. sendEmailFn is always a local stub;
// no test here makes a real network call.

const monday = new Date('2026-07-13T10:00:00.000Z');

function baseCampaign(overrides = {}) {
  return { id: 'camp', approved: true, autoSend: true, allowedCountries: ['GB'], minScore: 60, dailyCaps: { A: 10 }, maxFollowups: 0, ...overrides };
}

function baseCfg(overrides = {}) {
  return {
    outbound: {
      enabled: true, dryRun: false, allowedCountries: ['United Kingdom'], hourlyCaps: { A: 3 }, minGapSeconds: 0,
      businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75, maxEvidenceAgeDays: 45,
      hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3, v9AdmissionRequired: false,
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

async function connectedStore(inbox = 'A') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-pipeline-v9-'));
  const store = new Store(dir);
  await store.init();
  await store.add('accounts', { id: `acct-${inbox}`, slot: inbox, connected: true, email: `outreach-${inbox}@uberbond.example`, tokens: 'unused' });
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

async function v9Decisions(store) {
  return (await store.list('auditLog')).filter(entry => entry.type === 'omnia_v9_consequence_boundary_decision');
}

function permissiveV9Context() {
  const keyPair = crypto.generateKeyPairSync('ed25519');
  const notBefore = new Date(monday.getTime() - 60_000).toISOString();
  const expiresAt = new Date(monday.getTime() + 3600_000).toISOString();
  const approval = createApproval({
    approvalId: 'appr-1', issuerId: 'owner', keyId: 'owner-key-1', tenantId: 'UberBond',
    actorIds: ['pipeline.maybeSend'], operations: ['outbound.email.send'],
    resourcePrefixes: ['gmail-inbox:'], purposes: ['cold-outreach'], effectClasses: ['COMMUNICATE_EXTERNAL'],
    maxBlastRadius: 5, maxCostUsd: 10, maxUses: 100, notBefore, expiresAt, issuedAt: notBefore
  }, digest => signDigestHex(digest, keyPair.privateKey));
  return {
    approvals: [approval], keyResolver: () => keyPair.publicKey,
    evidenceRequirementResolver: () => ({ minCount: 0, allowedOrigins: null }),
    policyAuthorizer: () => ({ decision: 'ALLOW', reasons: ['owner-approved-for-test'] }),
    policyVersion: 'test-policy-v1', policyDigest: 'a'.repeat(64), constitutionDigest: 'b'.repeat(64)
  };
}

test('v9AdmissionRequired defaults to false: sends proceed exactly as before, V9 is never consulted', async () => {
  const store = await connectedStore();
  const cfg = baseCfg();
  const { pipeline, sends } = spyPipeline(store, cfg);
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  assert.equal(result.sent, true);
  assert.equal(sends(), 1);
  assert.equal((await v9Decisions(store)).length, 0, 'V9 must not be consulted when the flag is off');
});

test('v9AdmissionRequired=true with no v9Context fails closed: sendEmailFn is never called', async () => {
  const store = await connectedStore();
  const cfg = baseCfg({ outbound: { v9AdmissionRequired: true } });
  const { pipeline, sends } = spyPipeline(store, cfg);
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  assert.equal(result.sent, false);
  assert.equal(sends(), 0, 'the provider must never be called when V9 does not admit the action');
  assert.notEqual(result.decision, 'ALLOW');
  const decisions = await v9Decisions(store);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].detail.v9Consulted, true);
});

test('v9AdmissionRequired=true cancels the reservation on denial rather than leaving it dangling', async () => {
  const store = await connectedStore();
  const cfg = baseCfg({ outbound: { v9AdmissionRequired: true } });
  const { pipeline } = spyPipeline(store, cfg);
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  const reservation = await store.get('outboundReservations', result.reservation.id);
  assert.equal(reservation.status, 'cancelled');
});

test('v9AdmissionRequired=true with a genuine owner-supplied policy context (real signed approval) allows the send through -- the composition is real end to end', async () => {
  const store = await connectedStore();
  const cfg = baseCfg({ outbound: { v9AdmissionRequired: true } });
  const { pipeline, sends } = spyPipeline(store, cfg, { v9Context: permissiveV9Context() });
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  assert.equal(result.sent, true);
  assert.equal(sends(), 1);
  const decisions = await v9Decisions(store);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].detail.finalDecision, 'ALLOW');
});

test('a Guard denial (e.g. suppression) with v9AdmissionRequired=true still short-circuits before V9 -- no V9 decision is ever logged', async () => {
  const store = await connectedStore();
  await store.add('suppressions', { id: 'sup1', value: 'info@clinic.example', reason: 'manual', createdAt: monday.toISOString() });
  const cfg = baseCfg({ outbound: { v9AdmissionRequired: true } });
  const { pipeline, sends } = spyPipeline(store, cfg, { v9Context: permissiveV9Context() });
  const result = await pipeline.maybeSend(baseProspect(), baseCampaign());
  assert.equal(result.sent, false);
  assert.equal(sends(), 0);
  assert.equal((await v9Decisions(store)).length, 0, 'Guard already denied -- V9 must never be reached, even with a fully permissive V9 context available');
});

test('a duplicate/idempotent replay is still handled by the pre-existing contract even with v9AdmissionRequired=true', async () => {
  const store = await connectedStore();
  const cfg = baseCfg({ outbound: { v9AdmissionRequired: true } });
  const { pipeline: first } = spyPipeline(store, cfg, { v9Context: permissiveV9Context() });
  const prospect = baseProspect();
  const campaign = baseCampaign();
  const firstResult = await first.maybeSend(prospect, campaign);
  assert.equal(firstResult.sent, true);

  const { pipeline: second, sends: secondSends } = spyPipeline(store, cfg, { v9Context: permissiveV9Context() });
  const secondResult = await second.maybeSend({ ...prospect, status: 'sent' }, campaign);
  assert.equal(secondResult.sent, true);
  assert.equal(secondResult.duplicate, true);
  assert.equal(secondSends(), 0, 'a replay must never call the provider a second time');
});
