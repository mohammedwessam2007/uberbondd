// The secret scanner has to tell a counter from a credential, and an effect
// ledger is a counter whose own key is called `credentialChanges`. The ledger
// exemption is therefore allowed only for a complete canonical shape. Silence
// is not a signed zero.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EFFECT_LEDGER_FIELDS,
  ZERO_BUSINESS_EFFECTS,
  ZERO_EXTERNAL_EFFECTS,
  isKnownEffectLedgerField,
  isZeroEffectLedgerField
} from '../src/effect-ledgers.mjs';
import { ZERO_EFFECTS, hasSecret, validResult } from '../src/cloud-agent-relay.mjs';

test('the relay re-exports the shared external-effect shape rather than a copy', () => {
  assert.deepEqual(ZERO_EFFECTS, ZERO_EXTERNAL_EFFECTS);
  assert.equal(ZERO_EFFECTS, ZERO_EXTERNAL_EFFECTS);
});

test('every ledger field name the codebase writes is known to the scanner', () => {
  assert.deepEqual(
    Object.keys(EFFECT_LEDGER_FIELDS).sort(),
    ['businessEffectLedger', 'externalEffectLedger', 'externalEffects']
  );
});

test('a clean complete ledger under any of its names is not mistaken for a credential', () => {
  for (const [field, shape] of Object.entries(EFFECT_LEDGER_FIELDS)) {
    assert.equal(isKnownEffectLedgerField(field, { ...shape }), true, `${field} was not structurally recognised`);
    assert.equal(isZeroEffectLedgerField(field, { ...shape }), true, `${field} did not prove signed zero`);
    assert.equal(hasSecret({ [field]: { ...shape } }), false, `${field} was read as secret-bearing`);
  }
});

test('an incomplete ledger never earns the scanner exemption', () => {
  assert.equal(isKnownEffectLedgerField('externalEffectLedger', {}), false);
  assert.equal(isKnownEffectLedgerField('businessEffectLedger', {}), false);

  const missingExternal = { ...ZERO_EXTERNAL_EFFECTS };
  delete missingExternal.providerCalls;
  assert.equal(isKnownEffectLedgerField('externalEffectLedger', missingExternal), false);
  assert.equal(isZeroEffectLedgerField('externalEffectLedger', missingExternal), false);

  const missingBusiness = { ...ZERO_BUSINESS_EFFECTS };
  delete missingBusiness.businessSpendCents;
  assert.equal(isKnownEffectLedgerField('businessEffectLedger', missingBusiness), false);
  assert.equal(isZeroEffectLedgerField('businessEffectLedger', missingBusiness), false);
});

test('a ledger carrying a key outside its own shape is not exempt', () => {
  assert.equal(isKnownEffectLedgerField('externalEffectLedger', { ...ZERO_EXTERNAL_EFFECTS, mystery: 0 }), false);
  assert.equal(isKnownEffectLedgerField('businessEffectLedger', { ...ZERO_BUSINESS_EFFECTS, apiKey: 0 }), false);
  assert.equal(hasSecret({ externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS, mystery: 0 } }), true);
  assert.equal(hasSecret({ businessEffectLedger: { ...ZERO_BUSINESS_EFFECTS, apiKey: 'x' } }), true);
  assert.equal(hasSecret({ businessEffectLedger: { ...ZERO_BUSINESS_EFFECTS, spendCents: 0 } }), true);
});

test('ledger values must be finite non-negative numbers, not zero-shaped coercions', () => {
  for (const bad of [NaN, Infinity, -1, '0', null, false]) {
    assert.equal(isKnownEffectLedgerField('externalEffectLedger', { ...ZERO_EXTERNAL_EFFECTS, messages: bad }), false);
    assert.equal(isZeroEffectLedgerField('externalEffectLedger', { ...ZERO_EXTERNAL_EFFECTS, messages: bad }), false);
  }
});

test('a valid non-zero ledger remains a ledger but is not a zero-effect proof', () => {
  const external = { ...ZERO_EXTERNAL_EFFECTS, providerCalls: 1 };
  const business = { ...ZERO_BUSINESS_EFFECTS, businessSpendCents: 1 };
  assert.equal(isKnownEffectLedgerField('externalEffectLedger', external), true);
  assert.equal(isKnownEffectLedgerField('businessEffectLedger', business), true);
  assert.equal(isZeroEffectLedgerField('externalEffectLedger', external), false);
  assert.equal(isZeroEffectLedgerField('businessEffectLedger', business), false);
});

test('externalEffects and externalEffectLedger are exact aliases of one shape', () => {
  assert.equal(EFFECT_LEDGER_FIELDS.externalEffects, ZERO_EXTERNAL_EFFECTS);
  assert.equal(EFFECT_LEDGER_FIELDS.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
  assert.equal(isZeroEffectLedgerField('externalEffects', { ...ZERO_EXTERNAL_EFFECTS }), true);
});

test('a result carrying a complete business-effect ledger passes the canonical contract', () => {
  const result = {
    outcome: 'researched',
    changedArtifacts: [],
    testsActuallyRun: [],
    truthTable: [{ claim: 'researched', status: 'RESEARCH_ONLY' }],
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    decision: 'CONTINUE',
    businessEffectLedger: { ...ZERO_BUSINESS_EFFECTS }
  };
  assert.deepEqual(validResult(result), []);
});

test('isKnownEffectLedgerField refuses non-objects and unknown names', () => {
  assert.equal(isKnownEffectLedgerField('externalEffectLedger', []), false);
  assert.equal(isKnownEffectLedgerField('externalEffectLedger', null), false);
  assert.equal(isKnownEffectLedgerField('externalEffectLedger', 'zero'), false);
  assert.equal(isKnownEffectLedgerField('somethingElse', { ...ZERO_EXTERNAL_EFFECTS }), false);
});
