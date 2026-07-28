import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignExperimentVariant,
  buildOwnerGate,
  OwnerGatePolicyError,
  evaluateOpportunityPolicy,
  opportunityIdempotencyKey,
  scoreOpportunity,
  tenOfTenReadiness,
  OWNER_GATE_MIN_EXPECTED_VALUE_CENTS,
  OWNER_GATE_MAX_OWNER_MINUTES
} from '../src/revenue-os.mjs';
import { REASON_CODES } from '../src/policy-reason-codes.mjs';

const now = new Date('2026-07-28T12:00:00.000Z');
const future = '2026-08-10T00:00:00.000Z';

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
  expiresAt: future
};

const evidence = [{
  id: 'ev_1',
  sourceUrl: 'https://example.com/partners',
  sourceType: 'official-partner',
  official: true,
  status: 'active',
  capturedAt: '2026-07-27T10:00:00.000Z',
  expiresAt: future
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

test('policy accumulates deterministic rejection reasons, every one of which is a canonical registry code', () => {
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
  for (const code of result.reasonCodes) assert(REASON_CODES.includes(code), `${code} is not in the canonical registry`);
});

// PR #6 audit item 4: the old code emitted `contact-${contactResult.reason}`, which double-prefixed
// send-safety.mjs's own already-canonical-shaped 'contact-domain-mismatch' into
// 'contact-contact-domain-mismatch' -- a code absent from the registry.
test('policy: a contact-domain-mismatch is reported as the canonical code, not a double-prefixed one', () => {
  const result = evaluateOpportunityPolicy({
    opportunity,
    prospect: { ...prospect, contact: { email: 'someone@not-example.com', source: 'website', verified: 'unverified' } },
    evidence,
    suppressions: [],
    cfg: { revenueOs: { minExpectedValueCents: 25000, maxOwnerMinutes: 20, maxEvidenceAgeDays: 30 } },
    date: now
  });
  assert(result.reasonCodes.includes('contact-domain-mismatch'));
  assert(!result.reasonCodes.includes('contact-contact-domain-mismatch'));
});

test('policy: a missing contact is reported as a canonical code, not the raw send-safety reason', () => {
  const result = evaluateOpportunityPolicy({
    opportunity, prospect: { ...prospect, contact: {} }, evidence, suppressions: [],
    cfg: { revenueOs: { minExpectedValueCents: 25000, maxOwnerMinutes: 20, maxEvidenceAgeDays: 30 } }, date: now
  });
  assert(result.reasonCodes.includes('contact-not-officially-published'));
  assert(!result.reasonCodes.includes('contact-missing-contact'));
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

// --- buildOwnerGate: PR #6 audit item 8 (unsafe owner-gate contract) ---

function validGateInput(overrides = {}) {
  return {
    opportunityId: 'opp_1', gateType: 'marketplace-submission',
    expectedValueCents: 50000, currency: 'usd', ownerMinutes: 12,
    expiresAt: future, action: 'Submit the authenticated proposal',
    evidenceRequired: ['final proposal screenshot'], killCondition: 'Listing closed',
    now,
    ...overrides
  };
}

test('buildOwnerGate: a fully-compliant gate normalizes and links to its opportunity', () => {
  const gate = buildOwnerGate(validGateInput());
  assert.equal(gate.status, 'open');
  assert.equal(gate.currency, 'USD');
  assert.equal(gate.ownerMinutes, 12);
  assert.equal(gate.opportunityId, 'opp_1');
});

test('buildOwnerGate: rejects unsupported gate types', () => {
  assert.throws(() => buildOwnerGate(validGateInput({ gateType: 'routine-email' })), OwnerGatePolicyError);
});

test('buildOwnerGate: rejects a gate with no opportunityId -- gates must be linked', () => {
  assert.throws(() => buildOwnerGate(validGateInput({ opportunityId: '' })), (err) => err.code === 'opportunity-link-required');
});

test(`buildOwnerGate: rejects expectedValueCents below the ${OWNER_GATE_MIN_EXPECTED_VALUE_CENTS}-cent floor`, () => {
  assert.throws(() => buildOwnerGate(validGateInput({ expectedValueCents: OWNER_GATE_MIN_EXPECTED_VALUE_CENTS - 1 })), (err) => err.code === 'value-below-floor');
  assert.doesNotThrow(() => buildOwnerGate(validGateInput({ expectedValueCents: OWNER_GATE_MIN_EXPECTED_VALUE_CENTS })));
});

test(`buildOwnerGate: rejects ownerMinutes above the ${OWNER_GATE_MAX_OWNER_MINUTES}-minute ceiling`, () => {
  assert.throws(() => buildOwnerGate(validGateInput({ ownerMinutes: OWNER_GATE_MAX_OWNER_MINUTES + 1 })), (err) => err.code === 'owner-minutes-above-ceiling');
  assert.doesNotThrow(() => buildOwnerGate(validGateInput({ ownerMinutes: OWNER_GATE_MAX_OWNER_MINUTES })));
});

test('buildOwnerGate: rejects a missing or past expiresAt', () => {
  assert.throws(() => buildOwnerGate(validGateInput({ expiresAt: null })), (err) => err.code === 'expiry-required');
  assert.throws(() => buildOwnerGate(validGateInput({ expiresAt: '2026-01-01T00:00:00.000Z' })), (err) => err.code === 'expiry-not-future');
});

test('buildOwnerGate: rejects a missing action', () => {
  assert.throws(() => buildOwnerGate(validGateInput({ action: '' })), (err) => err.code === 'action-required');
});

// --- tenOfTenReadiness: PR #6 audit item 1 (missing telemetry falsely passing readiness) and the
// second-pass audit item 3 (restore the original commercial gates + full evidence provenance) ---

const PROVENANCE = { evidenceRef: 'TEST_EVIDENCE.log', source: 'test-harness', measurementWindow: '2026-07-01..2026-07-28', timestamp: '2026-07-28T12:00:00.000Z' };
const bool = (value) => ({ value, ...PROVENANCE });
const rate = (numerator, denominator) => ({ numerator, denominator, ...PROVENANCE });
const count = (value) => ({ value, ...PROVENANCE });

function completeMetrics(overrides = {}) {
  return {
    deterministicChecks: bool(true), browserChecks: bool(true), migrationChecks: bool(true), previewAuditable: bool(true),
    importAtomicity: bool(true), concurrencySafety: bool(true), auditCompleteness: bool(true),
    suppressionTesting: bool(true), killSwitchTesting: bool(true), incidentRecovery: bool(true),
    duplicates: rate(0, 40), hardBounces: rate(0, 60), complaints: rate(0, 60),
    evidenceCoverage: rate(40, 40), positiveReplies: rate(3, 60),
    revenueAttribution: rate(5, 5), acceptedPaidDelivery: rate(3, 3),
    paidPilots: count(3), collectedRevenueCents: count(150000), contributionMarginCents: count(100),
    recurringClients: count(1), ownerActionsPerDay: count(2),
    ...overrides
  };
}

test('tenOfTenReadiness: every gate passing with sufficient, fully-provenanced evidence yields ready:true, score:10', () => {
  const result = tenOfTenReadiness(completeMetrics());
  assert.equal(result.ready, true);
  assert.equal(result.score, 10);
  assert.equal(result.unknown, 0);
  assert.equal(result.coreGateCount, 19);
  assert.equal(result.additionalGateCount, 3);
  assert.equal(result.total, 22);
});

test('tenOfTenReadiness: an entirely empty metrics object is not ready, and every gate is unknown, not a false pass', () => {
  const result = tenOfTenReadiness({});
  assert.equal(result.ready, false);
  assert.equal(result.passed, 0);
  assert.equal(result.unknown, result.total);
  for (const gate of Object.values(result.gates)) assert.equal(gate.status, 'unknown');
});

test('tenOfTenReadiness: a missing rate denominator is unknown, not a silent pass (old `|| 0` behavior would have passed duplicateRate at 0/0)', () => {
  const result = tenOfTenReadiness(completeMetrics({ duplicates: undefined }));
  assert.equal(result.gates.duplicateRate.status, 'unknown');
  assert.equal(result.ready, false);
});

test('tenOfTenReadiness: a rate below its minimum sample size is unknown even if the observed rate looks perfect', () => {
  const result = tenOfTenReadiness(completeMetrics({ hardBounces: rate(0, 3) }));
  assert.equal(result.gates.hardBounceRate.status, 'unknown');
  assert.equal(result.gates.hardBounceRate.reason, 'insufficient-sample');
  assert.equal(result.ready, false);
});

test('tenOfTenReadiness: a rate at or above its minimum sample size and past its threshold fails, not unknown', () => {
  const result = tenOfTenReadiness(completeMetrics({ hardBounces: rate(5, 60) }));
  assert.equal(result.gates.hardBounceRate.status, 'fail');
  assert.equal(result.ready, false);
});

test('tenOfTenReadiness: a boolean gate explicitly set to false is fail, not unknown', () => {
  const result = tenOfTenReadiness(completeMetrics({ auditCompleteness: bool(false) }));
  assert.equal(result.gates.auditCompleteness.status, 'fail');
  assert.equal(result.ready, false);
});

// Second-pass audit item 3: evidence without full provenance (evidenceRef/source/measurementWindow/
// timestamp) is unknown, identical to missing evidence entirely -- a bare `true`/number is no
// longer accepted.
test('tenOfTenReadiness: a bare boolean/number with no provenance object is unknown, not a pass', () => {
  const result = tenOfTenReadiness(completeMetrics({ deterministicChecks: true, paidPilots: 3 }));
  assert.equal(result.gates.deterministicChecks.status, 'unknown');
  assert.equal(result.gates.paidPilots.status, 'unknown');
});

test('tenOfTenReadiness: evidence missing just one provenance field (e.g. timestamp) is unknown', () => {
  const incomplete = { value: true, evidenceRef: 'x', source: 'y', measurementWindow: 'z' }; // no timestamp
  const result = tenOfTenReadiness(completeMetrics({ deterministicChecks: incomplete }));
  assert.equal(result.gates.deterministicChecks.status, 'unknown');
});

// Second-pass audit item 3: the five gates this audit explicitly named as missing must exist,
// have real evidence structure (numerator/denominator or boolean value), and gate readiness like
// every other gate -- not be decorative.
test('tenOfTenReadiness: the five newly-restored commercial gates exist and fail closed on missing evidence', () => {
  const empty = tenOfTenReadiness({});
  for (const name of ['revenueAttribution', 'acceptedPaidDelivery', 'suppressionTesting', 'killSwitchTesting', 'incidentRecovery']) {
    assert(name in empty.gates, `missing gate: ${name}`);
    assert.equal(empty.gates[name].status, 'unknown');
  }
  const missingOneAttribution = tenOfTenReadiness(completeMetrics({ revenueAttribution: rate(4, 5) }));
  assert.equal(missingOneAttribution.gates.revenueAttribution.status, 'fail', 'revenueAttribution requires full (100%) attribution, not partial');
  assert.equal(missingOneAttribution.ready, false);
});

test('tenOfTenReadiness: importAtomicity/concurrencySafety/auditCompleteness are additional technical gates, not a substitute for any core gate, and still block readiness when unknown', () => {
  const result = tenOfTenReadiness(completeMetrics({ importAtomicity: undefined }));
  assert.equal(result.gates.importAtomicity.status, 'unknown');
  assert.equal(result.ready, false, 'an additional technical gate still counts toward overall readiness');
});
