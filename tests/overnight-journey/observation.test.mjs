import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  JOURNEY_STEP_TYPES,
  JOURNEY_STEP_STATUSES,
  observeSyntheticJourney
} from '../../src/overnight/journey/observation.mjs';
import { EFFECT_STATES, ZERO_EXTERNAL_EFFECTS } from '../../src/effect-ledgers.mjs';
import { authorization, observation, receipt, steps, TEST_DATE } from './fixtures.mjs';

test('a complete authorized journey is normalized as observed and proven zero-effect', () => {
  const result = observation();
  assert.equal(result.ok, true);
  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(result.steps.map(step => step.stepType), JOURNEY_STEP_TYPES);
  assert.deepEqual(result.steps.map(step => step.status), JOURNEY_STEP_TYPES.map(() => 'PASS'));
  assert.equal(result.observations.length, 5);
  assert.ok(result.observations.every(item => item.relation === 'OBSERVED'));
  assert.ok(result.observations.every(item => item.evidenceRefs.includes(result.receipt.receiptId)));
  assert.equal(result.effectState, EFFECT_STATES.ZERO_EFFECT);
  assert.deepEqual(result.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
  assert.deepEqual(result.receipt.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
});

test('the same deterministic input produces the same run identity', () => {
  const a = observation();
  const b = observation();
  assert.equal(a.ok, true);
  assert.deepEqual(a, b);
});

test('a failed supplied step stays observed while absent required steps stay derived', () => {
  const result = observeSyntheticJourney({
    checkId: 'check_partial',
    journeyId: 'journey_consultation_funnel',
    subjectRef: 'org_test_target',
    authorization: authorization({ journeyId: 'journey_consultation_funnel' }),
    receipt: receipt({ checkId: 'check_partial', receiptId: 'receipt_partial' }),
    steps: steps({ FORM: 'PASS', CRM_RECEIPT: 'FAIL' }).slice(0, 2),
    date: TEST_DATE
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'BROKEN');
  const failed = result.observations.find(item => item.stepType === 'CRM_RECEIPT');
  const missing = result.observations.find(item => item.stepType === 'CHECKOUT');
  assert.equal(failed.status, 'FAIL');
  assert.equal(failed.relation, 'OBSERVED');
  assert.equal(missing.status, 'NOT_RUN');
  assert.equal(missing.relation, 'DERIVED');
  assert.match(missing.derivationRule, /required-step-absent/);
});

test('authorization must explicitly permit this zero-effect operation', () => {
  for (const bad of [
    { decision: 'DENY' },
    { operation: 'EMAIL_SEND' },
    { capability: 'OUTBOUND_SEND' },
    { effectClass: 'EXTERNAL_EFFECT' },
    { intentId: '' },
    { nonce: '' },
    { expiresAt: '2026-08-25T01:00:00.000Z' }
  ]) {
    const result = observation({ authorizationOverrides: bad });
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.ok(result.reasonCodes.some(code => code.startsWith('synthetic-check-') || code.startsWith('authorization-')));
  }
});

test('non-zero, unknown, and incomplete effect receipts are refused', () => {
  const ledgers = [
    { ...ZERO_EXTERNAL_EFFECTS, providerCalls: 1 },
    { ...ZERO_EXTERNAL_EFFECTS, providerCalls: 'UNKNOWN' },
    (() => { const value = { ...ZERO_EXTERNAL_EFFECTS }; delete value.providerCalls; return value; })()
  ];
  for (const externalEffectLedger of ledgers) {
    const result = observation({ receiptOverrides: { externalEffectLedger } });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('receipt-effect-ledger-invalid') || result.reasonCodes.includes('synthetic-check-requires-proven-zero-effect'));
  }
});

test('unknown step types, duplicate step types, and missing witness references fail closed', () => {
  const unknown = observation({ stepOverrides: [{ stepType: 'PAYMENT_PROVIDER', status: 'PASS', evidenceRef: 'witness:x' }] });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.reasonCodes.some(code => code.startsWith('unknown-step-type')));

  const duplicate = observation({ stepOverrides: [{ stepType: 'FORM', status: 'PASS', evidenceRef: 'witness:duplicate' }] });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.reasonCodes.some(code => code.startsWith('duplicate-step-type')));

  const missingEvidence = observation({
    statusByType: { FORM: 'FAIL' },
    stepOverrides: [],
    receiptOverrides: { receiptId: 'receipt_missing_evidence' }
  });
  // The fixture supplies all five witnesses; explicitly test the lower-level input instead.
  const direct = observeSyntheticJourney({
    checkId: 'check_missing_witness',
    journeyId: 'journey_consultation_funnel',
    authorization: authorization(),
    receipt: receipt({ checkId: 'check_missing_witness', receiptId: 'receipt_missing_witness' }),
    steps: [{ stepType: 'FORM', status: 'PASS', observedAt: TEST_DATE, evidenceRef: '' }],
    date: TEST_DATE
  });
  assert.equal(missingEvidence.ok, true);
  assert.equal(direct.ok, false);
  assert.ok(direct.reasonCodes.some(code => code.startsWith('step-evidence-reference-required')));
});

test('the journey module contains no browser or provider invocation surface', () => {
  const source = readFileSync('src/overnight/journey/observation.mjs', 'utf8');
  assert.doesNotMatch(source, /playwright|puppeteer|\bfetch\s*\(|\baxios\b/i);
});

test('the public status vocabulary remains finite and explicit', () => {
  assert.deepEqual(JOURNEY_STEP_STATUSES, ['PASS', 'FAIL', 'NOT_RUN', 'UNKNOWN']);
});
