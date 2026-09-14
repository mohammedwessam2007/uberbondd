import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateUberWarmMailbox, compileUberWarmFleet } from '../src/uberwarm-reputation-lab.mjs';
import { buildUberVerifyDecision } from '../src/uberverify-contact-hygiene.mjs';
import { rankUberLookalikes } from '../src/uberlookalike-account-expander.mjs';

const NOW = new Date('2026-09-14T18:00:00Z');

function mailbox(overrides = {}) {
  return {
    mailboxId: 'mbx-1',
    address: 'mohamed@uberbond.cloud',
    authenticationStatus: 'AUTHENTICATED',
    warmupStatus: 'WARMUP_COMPLETE',
    paused: false,
    currentDailyCap: 10,
    ...overrides
  };
}

function healthyObservations(overrides = {}) {
  return {
    warmupDays: 21,
    observedDeliveries: 100,
    complaintRate: 0,
    hardBounceRate: 0.01,
    inboxPlacementRate: 0.95,
    providerDailyCap: 40,
    ...overrides
  };
}

test('UberWarm blocks unauthenticated mailboxes and grants zero external authority', () => {
  const result = evaluateUberWarmMailbox({ mailboxState: mailbox({ authenticationStatus: 'UNKNOWN' }), observations: healthyObservations(), now: NOW });
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.recommendedColdDailyCap, 0);
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.equal(result.messagesSent, 0);
});

test('UberWarm refuses cold-send capacity before warmup completes', () => {
  const result = evaluateUberWarmMailbox({ mailboxState: mailbox({ warmupStatus: 'WARMUP_ACTIVE' }), observations: healthyObservations({ warmupDays: 10 }), now: NOW });
  assert.equal(result.state, 'WARMING');
  assert.equal(result.recommendedColdDailyCap, 0);
});

test('UberWarm quarantines harmful observed complaint signals', () => {
  const result = evaluateUberWarmMailbox({ mailboxState: mailbox(), observations: healthyObservations({ complaintRate: 0.01 }), now: NOW });
  assert.equal(result.state, 'QUARANTINED');
  assert.equal(result.recommendedColdDailyCap, 0);
  assert.ok(result.reasonCodes.includes('complaint-rate-above-policy'));
});

test('UberWarm permits only a bounded ramp on healthy observed signals', () => {
  const result = evaluateUberWarmMailbox({ mailboxState: mailbox(), observations: healthyObservations(), now: NOW });
  assert.equal(result.state, 'RAMP');
  assert.equal(result.recommendedColdDailyCap, 15);
  assert.equal(result.externalEffectAuthority, 'NONE');
});

test('UberWarm keeps missing observability in a tiny canary instead of pretending health', () => {
  const result = evaluateUberWarmMailbox({ mailboxState: mailbox(), observations: { warmupDays: 21, providerDailyCap: 40 }, now: NOW });
  assert.equal(result.state, 'LIMITED_CANARY');
  assert.equal(result.recommendedColdDailyCap, 5);
  assert.ok(result.reasonCodes.includes('placement-unobserved'));
});

test('UberWarm fleet total is only a recommendation and sends nothing', () => {
  const fleet = compileUberWarmFleet({
    mailboxes: [mailbox(), mailbox({ mailboxId: 'mbx-2', address: 'ops@uberbond.agency', currentDailyCap: 5 })],
    observationsByMailbox: { 'mbx-1': healthyObservations(), 'mbx-2': healthyObservations({ observedDeliveries: 50 }) },
    now: NOW
  });
  assert.equal(fleet.readyMailboxCount, 2);
  assert.equal(fleet.externalEffectAuthority, 'NONE');
  assert.equal(fleet.messagesSent, 0);
});

function directSource(email = 'buyer@example.com', overrides = {}) {
  return {
    value: email,
    sourceType: 'public_website',
    sourceUrl: 'https://example.com/team',
    evidenceClass: 'DIRECT_PUBLIC',
    confidence: 0.95,
    exact: true,
    inferred: false,
    observedAt: NOW.toISOString(),
    ...overrides
  };
}

function verification(state = 'VALID', email = 'buyer@example.com') {
  return {
    route: email,
    state,
    provider: 'licensed-test-provider',
    evidenceClass: 'LICENSED_PROVIDER',
    confidence: 0.95,
    checkedAt: NOW.toISOString()
  };
}

test('UberVerify accepts direct source evidence plus a VALID verification only for a later authorization gate', () => {
  const result = buildUberVerifyDecision({
    route: 'buyer@example.com',
    sourceEvidence: [directSource()],
    verifications: [verification('VALID')],
    now: NOW
  });
  assert.equal(result.status, 'VERIFIED_FOR_AUTHORIZATION_GATE');
  assert.equal(result.usableForOutreachPreparation, true);
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.equal(result.messagesSent, 0);
});

test('UberVerify refuses inferred private routes even if a verifier says VALID', () => {
  const result = buildUberVerifyDecision({
    route: 'guessed@example.com',
    sourceEvidence: [{
      value: 'guessed@example.com', sourceType: 'model_inference', evidenceClass: 'MODEL_INFERENCE',
      confidence: 0.99, exact: false, inferred: true, observedAt: NOW.toISOString()
    }],
    verifications: [verification('VALID', 'guessed@example.com')],
    now: NOW
  });
  assert.equal(result.usableForOutreachPreparation, false);
  assert.ok(result.reasonCodes.includes('inferred-private-address-never-satisfies-route'));
});

test('UberVerify suppression dominates otherwise-valid evidence', () => {
  const result = buildUberVerifyDecision({
    route: 'buyer@example.com',
    sourceEvidence: [directSource()],
    verifications: [verification('VALID')],
    suppressions: [{ email: 'buyer@example.com' }],
    now: NOW
  });
  assert.equal(result.status, 'REJECT_SUPPRESSED');
  assert.equal(result.usableForOutreachPreparation, false);
});

test('UberVerify rejects an observed invalid verification', () => {
  const result = buildUberVerifyDecision({
    route: 'buyer@example.com',
    sourceEvidence: [directSource()],
    verifications: [verification('INVALID')],
    now: NOW
  });
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.usableForOutreachPreparation, false);
});

const seed = {
  accountId: 'seed-1',
  name: 'Seed HVAC',
  domain: 'seed.example',
  tags: ['hvac', 'local-service', 'booking'],
  features: { employees: 20, region: 'gcc', recurring: true },
  confidence: 1
};

test('UberLookalike ranks explainable public account similarity without creating authority', () => {
  const result = rankUberLookalikes({
    seeds: [seed],
    candidates: [
      { accountId: 'near', name: 'Near', domain: 'near.example', tags: ['hvac', 'local-service', 'booking'], features: { employees: 22, region: 'gcc', recurring: true }, confidence: 0.9 },
      { accountId: 'far', name: 'Far', domain: 'far.org', tags: ['biotech'], features: { employees: 500, region: 'us', recurring: false }, confidence: 1 }
    ],
    minScore: 0.1
  });
  assert.equal(result.candidates[0].accountId, 'near');
  assert.equal(result.candidates[0].requiresIndependentQualification, true);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('UberLookalike ignores contact-route features rather than turning them into prospect identity', () => {
  const result = rankUberLookalikes({
    seeds: [{ ...seed, features: { ...seed.features, email: 'seed@secret.test', phone: '+111' } }],
    candidates: [{ accountId: 'candidate', tags: seed.tags, features: { ...seed.features, email: 'candidate@secret.test', phone: '+222' }, confidence: 1 }],
    minScore: 0
  });
  assert.equal(result.forbiddenContactFeaturesIgnored, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.externalEffects, 0);
});

test('UberLookalike excludes suppressed candidates', () => {
  const result = rankUberLookalikes({
    seeds: [seed],
    candidates: [{ accountId: 'candidate', tags: seed.tags, features: seed.features, confidence: 1, suppressed: true }],
    minScore: 0
  });
  assert.equal(result.returnedCount, 0);
});
