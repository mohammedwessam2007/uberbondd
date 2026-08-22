import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZERO_EXTERNAL_EFFECTS,
  ZERO_BUSINESS_EFFECTS,
  LEDGER_FIELDS,
  isLedgerField,
  isLedgerShaped,
  isZeroLedger,
  hasUnknownLedgerKey
} from '../src/effect-ledger.mjs';
import { ZERO_EFFECTS, hasSecret, validResult } from '../src/cloud-agent-relay.mjs';

const ZERO_EXTERNAL = { ...ZERO_EXTERNAL_EFFECTS };
const ZERO_BUSINESS = { ...ZERO_BUSINESS_EFFECTS };

function completeResult(overrides = {}) {
  return {
    outcome: 'complete',
    changedArtifacts: [],
    testsActuallyRun: [{ command: 'fixture', status: 'PASS' }],
    truthTable: [{ claim: 'complete', status: 'VERIFIED_BY_FIXTURE' }],
    externalEffectLedger: { ...ZERO_EXTERNAL },
    decision: 'DONE',
    businessEffectLedger: { ...ZERO_BUSINESS },
    ...overrides
  };
}

test('the relay re-exports the one canonical external ledger, not a second copy', () => {
  assert.equal(ZERO_EFFECTS, ZERO_EXTERNAL_EFFECTS);
});

test('the two ledgers are distinguishable: only the business ledger meters business spend', () => {
  assert.ok(Object.hasOwn(ZERO_BUSINESS_EFFECTS, 'businessSpendCents'));
  assert.ok(!Object.hasOwn(ZERO_BUSINESS_EFFECTS, 'providerCalls'));
  assert.ok(Object.hasOwn(ZERO_EXTERNAL_EFFECTS, 'providerCalls'));
  assert.ok(Object.hasOwn(ZERO_EXTERNAL_EFFECTS, 'spendCents'));
});

// The regression this file exists for. `businessEffectLedger` carries a key
// called `credentialChanges`; a credential-shaped-key rule matches it; the
// scanner therefore rejected every canonical worker result as secret-bearing.
// Wired into the autonomy pump, that meant no task could ever complete.
test('a clean business ledger is not mistaken for a smuggled credential', () => {
  assert.equal(hasSecret({ businessEffectLedger: { ...ZERO_BUSINESS } }), false);
  assert.equal(hasSecret(completeResult()), false);
  assert.deepEqual(validResult(completeResult()), []);
});

test('every ledger field name the codebase uses is exempted, and no others', () => {
  assert.deepEqual(
    Object.keys(LEDGER_FIELDS).sort(),
    ['businessEffectLedger', 'externalEffectLedger', 'externalEffects']
  );
  assert.equal(isLedgerField('businessEffectLedger'), true);
  assert.equal(isLedgerField('credentials'), false);
});

test('the exemption does not become a hiding place: a string under a ledger key is still scanned', () => {
  for (const field of Object.keys(LEDGER_FIELDS)) {
    const zero = field === 'businessEffectLedger' ? ZERO_BUSINESS : ZERO_EXTERNAL;
    assert.equal(
      hasSecret({ [field]: { ...zero, messages: 'Bearer abcdefghijklmnopqrst' } }),
      true,
      `${field} must not launder a bearer token`
    );
    assert.equal(
      hasSecret({ [field]: { ...zero, messages: 'sk-abcdefghijklmnopqrst' } }),
      true,
      `${field} must not launder an api key`
    );
  }
});

test('an unknown effect key means the object is not a ledger and is refused', () => {
  assert.equal(hasSecret({ businessEffectLedger: { ...ZERO_BUSINESS, mysteryWrite: 0 } }), true);
  assert.equal(hasSecret({ externalEffectLedger: { ...ZERO_EXTERNAL, mysteryWrite: 0 } }), true);
});

test('a non-zero business effect cannot pass the worker result contract', () => {
  assert.deepEqual(
    validResult(completeResult({ businessEffectLedger: { ...ZERO_BUSINESS, purchases: 1 } })),
    ['nonzero-business-effect-ledger-rejected']
  );
  assert.deepEqual(
    validResult(completeResult({ businessEffectLedger: { ...ZERO_BUSINESS, businessSpendCents: 1 } })),
    ['nonzero-business-effect-ledger-rejected']
  );
});

test('an unknown business effect key cannot pass the worker result contract', () => {
  assert.deepEqual(
    validResult(completeResult({ businessEffectLedger: { ...ZERO_BUSINESS, wireTransfers: 0 } })),
    ['unknown-business-effect-key-rejected']
  );
});

test('a malformed business ledger is refused rather than ignored', () => {
  assert.deepEqual(validResult(completeResult({ businessEffectLedger: null })), ['business-effect-ledger-invalid']);
  assert.deepEqual(validResult(completeResult({ businessEffectLedger: [] })), ['business-effect-ledger-invalid']);
  assert.deepEqual(validResult(completeResult({ businessEffectLedger: 'zero' })), ['business-effect-ledger-invalid']);
});

test('a result that omits the business ledger entirely is still accepted by this transport', () => {
  const { businessEffectLedger, ...withoutBusiness } = completeResult();
  assert.deepEqual(validResult(withoutBusiness), []);
});

test('shape helpers refuse non-numeric and non-object ledgers', () => {
  assert.equal(isLedgerShaped({ ...ZERO_BUSINESS }, ZERO_BUSINESS_EFFECTS), true);
  assert.equal(isLedgerShaped({ ...ZERO_BUSINESS, messages: '0' }, ZERO_BUSINESS_EFFECTS), false);
  assert.equal(isLedgerShaped({ ...ZERO_BUSINESS, messages: NaN }, ZERO_BUSINESS_EFFECTS), false);
  assert.equal(isLedgerShaped(null, ZERO_BUSINESS_EFFECTS), false);
  assert.equal(isLedgerShaped([], ZERO_BUSINESS_EFFECTS), false);
  assert.equal(isZeroLedger({ ...ZERO_BUSINESS }, ZERO_BUSINESS_EFFECTS), true);
  assert.equal(isZeroLedger({ ...ZERO_BUSINESS, messages: 1 }, ZERO_BUSINESS_EFFECTS), false);
  assert.equal(hasUnknownLedgerKey(null, ZERO_BUSINESS_EFFECTS), true);
});

test('the canonical ledgers are frozen, so no importer can widen the contract at runtime', () => {
  assert.throws(() => { ZERO_BUSINESS_EFFECTS.purchases = 5; }, TypeError);
  assert.throws(() => { ZERO_EXTERNAL_EFFECTS.spendCents = 5; }, TypeError);
});
