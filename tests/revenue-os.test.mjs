import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignExperimentVariant,
  buildOwnerGate,
  evaluateOpportunityPolicy,
  opportunityIdempotencyKey,
  scoreOpportunity,
  tenOfTenReadiness
} from '../src/revenue-os.mjs';

const now = new Date('2026-07-28T12:00:00.000Z');

const prospect = {
  id: 'pros_1',
  website: 'https://example.com',
  domain: 'example.com',
  country: 'GB',
  status: 'new',
  contact: {
    email: 'partners@example.com',
    source: 'website',
    verified: 'unverified'
  }
};

const opportunity = {
  serviceLane: 'white-label-qa',
  expectedValueCents: 50000,
  ownerMinutes: 15,
  expiresAt: '2026-08-10T00:00:00.000Z'
};

const evidence = [{
  id: 'ev_1',
  sourceUrl: 'https://example.com/partners',
  sourceType: 'official-partner',
  official: true,
  status: 'active',
  capturedAt: '2026-07-27T10:00:00.000Z',
  expiresAt: '2026-08-10T00:00:00.000Z'
}];

test('opportunity scoring is deterministic, transparent, and bounded', () => {
  const dimensions = {
    activeDemand: 9,
    abilityToPay: 7,
    capabilityFit: 10,
    evidenceConfidence: 9,
    timeToCash: 7,
    grossProfit: 8,
    ownerEfficiency: 9,
    deliveryEase: 8,
    recurringPotential: 6,
    strategicLeverage: 7
  };
  const first = scoreOpportunity(dimensions);
  const second = scoreOpportunity(dimensions);
  assert.deepEqual(first, second);
  assert(first.total >= 0 && first.total <= 100);
  assert.equal(Object.keys(first.components).length, 10);
});

test('policy passes a fresh official provider route with a published domain-matched contact', () => {
  const result = evaluateOpportunityPolicy({
    opportunity,
    prospect,
    evidence,
    suppressions: [],
    cfg: { revenueOs: { minExpectedValueCents: 25000, maxOwnerMinutes: 20, maxEvidenceAgeDays: 30 } },
    date: now
  });
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'pass');
  assert.deepEqual(result.reasonCodes, []);
  assert.deepEqual(result.evidenceIds, ['ev_1']);
});

test('policy accumulates deterministic rejection reasons', () => {
  const result = evaluateOpportunityPolicy({
    opportunity: {
      ...opportunity,
      serviceLane: 'unsupported',
      expectedValueCents: 1000,
      ownerMinutes: 40,
      expiresAt: '2026-07-20T00:00:00.000Z'
    },
    prospect: { ...prospect, status: 'opted-out' },
    evidence: [{ ...evidence[0], capturedAt: '2026-01-01T00:00:00.000Z' }],
    suppressions: ['partners@example.com', 'example.com'],
    cfg: { revenueOs: { minExpectedValueCents: 25000, maxOwnerMinutes: 20, maxEvidenceAgeDays: 30 } },
    date: now
  });
  assert.equal(result.ok, false);
  assert(result.reasonCodes.includes('unsupported-service-lane'));
  assert(result.reasonCodes.includes('expected-value-below-threshold'));
  assert(result.reasonCodes.includes('owner-minutes-above-threshold'));
  assert(result.reasonCodes.includes('opportunity-expired'));
  assert(result.reasonCodes.includes('missing-current-official-evidence'));
  assert(result.reasonCodes.includes('recipient-suppressed'));
  assert(result.reasonCodes.includes('domain-suppressed'));
  assert(result.reasonCodes.includes('prospect-terminal-status'));
});

test('opportunity idempotency keys are stable and lane-specific', () => {
  const input = {
    organizationDomain: 'https://Example.com/',
    serviceLane: 'website-qa',
    sourceUrl: 'https://example.com/careers'
  };
  assert.equal(opportunityIdempotencyKey(input), opportunityIdempotencyKey(input));
  assert.notEqual(
    opportunityIdempotencyKey(input),
    opportunityIdempotencyKey({ ...input, serviceLane: 'ai-workflow' })
  );
});

test('experiment assignment is stable', () => {
  const variants = ['A', 'B', 'C'];
  assert.equal(
    assignExperimentVariant('example.com|website-qa', variants),
    assignExperimentVariant('example.com|website-qa', variants)
  );
  assert(variants.includes(assignExperimentVariant('other.example|website-qa', variants)));
});

test('owner gates reject unsupported gate types and normalize approved gates', () => {
  assert.throws(() => buildOwnerGate({ gateType: 'routine-email', action: 'Send it' }));
  const gate = buildOwnerGate({
    gateType: 'marketplace-submission',
    expectedValueCents: 50000,
    currency: 'usd',
    ownerMinutes: 12,
    action: 'Submit the authenticated proposal',
    evidenceRequired: ['final proposal screenshot'],
    killCondition: 'Listing closed'
  });
  assert.equal(gate.status, 'open');
  assert.equal(gate.currency, 'USD');
  assert.equal(gate.ownerMinutes, 12);
});

test('10/10 readiness is evidence-gated rather than self-declared', () => {
  const incomplete = tenOfTenReadiness({
    deterministicChecks: true,
    browserChecks: true,
    migrationChecks: true,
    dryRunAuditable: true,
    evidenceCoverage: 1,
    duplicateRate: 0
  });
  assert.equal(incomplete.ready, false);
  assert(incomplete.score < 10);

  const complete = tenOfTenReadiness({
    deterministicChecks: true,
    browserChecks: true,
    migrationChecks: true,
    dryRunAuditable: true,
    duplicateRate: 0,
    hardBounceRate: 0.01,
    complaintRate: 0,
    evidenceCoverage: 0.99,
    positiveReplyRate: 0.04,
    paidPilots: 3,
    collectedRevenue: 1000,
    contributionMargin: 100,
    recurringClients: 1,
    ownerActionsPerDay: 3
  });
  assert.equal(complete.ready, true);
  assert.equal(complete.score, 10);
});
