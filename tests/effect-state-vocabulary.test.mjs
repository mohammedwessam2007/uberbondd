// Silence is not zero, and "I don't know" is not zero either.
//
// A counter set to 0 answers "how many". It does not answer "did anyone look".
// The system collapsed those: a worker that genuinely made no provider calls
// and a worker that crashed between dispatch and receipt both shipped
// `providerCalls: 0`, and both were accepted as proof that nothing reached the
// outside world. The second is not proof of anything -- it is the exact shape
// an already-delivered effect takes when nobody was watching.
//
// These tests pin the four-way split and, more importantly, pin that only one
// of the four may ever be treated as proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyEffectLedger,
  isProvenZeroEffect,
  unknownEffectLedger,
  notObservedEffectLedger,
  EFFECT_STATES,
  EFFECT_OBSERVATION,
  ZERO_EXTERNAL_EFFECTS,
  ZERO_BUSINESS_EFFECTS,
  CANONICAL_EFFECT_KEYS
} from '../src/effect-ledgers.mjs';
import { canonicalZeroEffectLedger, validResult } from '../src/cloud-agent-relay.mjs';

const FIELD = 'externalEffectLedger';

test('the four states are distinguishable', () => {
  assert.equal(classifyEffectLedger(FIELD, ZERO_EXTERNAL_EFFECTS).state, EFFECT_STATES.ZERO_EFFECT);
  assert.equal(classifyEffectLedger(FIELD, { ...ZERO_EXTERNAL_EFFECTS, messages: 3 }).state, EFFECT_STATES.EFFECT_OCCURRED);
  assert.equal(classifyEffectLedger(FIELD, unknownEffectLedger(['providerCalls'])).state, EFFECT_STATES.EFFECT_UNKNOWN);
  assert.equal(classifyEffectLedger(FIELD, notObservedEffectLedger(['messages'])).state, EFFECT_STATES.EFFECT_NOT_OBSERVED);
});

test('only an observed, complete zero counts as proof of zero', () => {
  assert.equal(isProvenZeroEffect(FIELD, ZERO_EXTERNAL_EFFECTS), true);
  assert.equal(isProvenZeroEffect(FIELD, unknownEffectLedger(['providerCalls'])), false);
  assert.equal(isProvenZeroEffect(FIELD, notObservedEffectLedger(['providerCalls'])), false);
  assert.equal(isProvenZeroEffect(FIELD, { ...ZERO_EXTERNAL_EFFECTS, spendCents: 1 }), false);
  // The historical hole: an incomplete ledger must not read as zero.
  assert.equal(isProvenZeroEffect(FIELD, {}), false);
  assert.equal(isProvenZeroEffect(FIELD, { messages: 0 }), false);
});

test('a single unknown dimension taints the whole ledger', () => {
  for (const key of CANONICAL_EFFECT_KEYS) {
    const ledger = { ...ZERO_EXTERNAL_EFFECTS, [key]: EFFECT_OBSERVATION.UNKNOWN };
    const classified = classifyEffectLedger(FIELD, ledger);
    assert.equal(classified.state, EFFECT_STATES.EFFECT_UNKNOWN, `${key} did not taint the ledger`);
    assert.deepEqual(classified.unknownKeys, [key]);
    assert.equal(classified.provenZero, false);
  }
});

test('a positive count names the state but never hides an unknown dimension', () => {
  const classified = classifyEffectLedger(FIELD, {
    ...ZERO_EXTERNAL_EFFECTS,
    messages: 2,
    providerCalls: EFFECT_OBSERVATION.UNKNOWN
  });
  assert.equal(classified.state, EFFECT_STATES.EFFECT_OCCURRED);
  assert.deepEqual(classified.occurredKeys, ['messages']);
  assert.deepEqual(classified.unknownKeys, ['providerCalls'],
    'a label that drops the unknown dimension loses the thing the operator needs');
  assert.equal(classified.provenZero, false);
});

test('completeness is still required: a sentinel is a declaration, not an excuse to omit', () => {
  const missing = classifyEffectLedger(FIELD, { providerCalls: EFFECT_OBSERVATION.UNKNOWN });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('effect-ledger-missing-keys'));

  const invented = classifyEffectLedger(FIELD, { ...ZERO_EXTERNAL_EFFECTS, sneaky: 0 });
  assert.equal(invented.ok, false);
  assert.ok(invented.reasonCodes.includes('effect-ledger-unknown-keys'));
});

test('a near-miss sentinel is an invalid counter, not an observation claim', () => {
  for (const impostor of ['unknown', 'Unknown', 'NOT OBSERVED', 'UNKNOWN ', '', null]) {
    const classified = classifyEffectLedger(FIELD, { ...ZERO_EXTERNAL_EFFECTS, messages: impostor });
    assert.equal(classified.ok, false, `${JSON.stringify(impostor)} was accepted as an observation sentinel`);
    assert.ok(classified.reasonCodes.includes('effect-ledger-invalid-counter'));
  }
});

test('the business ledger classifies on its own key set', () => {
  assert.equal(classifyEffectLedger('businessEffectLedger', ZERO_BUSINESS_EFFECTS).state, EFFECT_STATES.ZERO_EFFECT);
  const unknownSpend = { ...ZERO_BUSINESS_EFFECTS, businessSpendCents: EFFECT_OBSERVATION.UNKNOWN };
  assert.equal(classifyEffectLedger('businessEffectLedger', unknownSpend).state, EFFECT_STATES.EFFECT_UNKNOWN);
  // Canonical keys are not business keys; mixing them is a refusal.
  assert.equal(classifyEffectLedger('businessEffectLedger', ZERO_EXTERNAL_EFFECTS).ok, false);
});

test('the relay tells the three refusals apart', () => {
  assert.deepEqual(canonicalZeroEffectLedger(ZERO_EXTERNAL_EFFECTS), []);
  assert.deepEqual(canonicalZeroEffectLedger({ ...ZERO_EXTERNAL_EFFECTS, messages: 2 }),
    ['nonzero-external-effect-ledger-rejected']);
  assert.deepEqual(canonicalZeroEffectLedger(unknownEffectLedger(['providerCalls'])),
    ['unknown-external-effect-ledger-rejected']);
  assert.deepEqual(canonicalZeroEffectLedger(notObservedEffectLedger(['messages'])),
    ['unobserved-external-effect-ledger-rejected']);
  // The historical vocabulary other callers match on is unchanged.
  assert.deepEqual(canonicalZeroEffectLedger({ messages: 0 }),
    ['incomplete-external-effect-ledger-rejected']);
  assert.deepEqual(canonicalZeroEffectLedger({ ...ZERO_EXTERNAL_EFFECTS, messages: '0' }),
    ['nonzero-external-effect-ledger-rejected']);
});

test('a worker declaring uncertainty is refused, and told what it actually said', () => {
  const base = {
    outcome: 'did the thing',
    decision: 'DONE',
    changedArtifacts: ['a.mjs'],
    testsActuallyRun: ['a.test.mjs'],
    truthTable: [{ claim: 'it works', status: 'PASS' }]
  };
  const uncertain = validResult({ ...base, externalEffectLedger: unknownEffectLedger(['providerCalls']) });
  assert.deepEqual(uncertain, ['unknown-external-effect-ledger-rejected'],
    'a worker that honestly cannot tell must not be accused of making calls');
  const clean = validResult({ ...base, externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS } });
  assert.deepEqual(clean, []);
});

test('every module reads one ledger definition, not its own copy', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const offenders = readdirSync('src')
    .filter(name => name.endsWith('.mjs'))
    .filter(name => /const ZERO_EXTERNAL_EFFECTS = Object\.freeze/.test(readFileSync(`src/${name}`, 'utf8')))
    .filter(name => name !== 'effect-ledgers.mjs');
  assert.deepEqual(offenders, [],
    'fifteen byte-identical copies of the canonical ledger drifted independently once already; '
    + 'import it from src/effect-ledgers.mjs instead');
});
