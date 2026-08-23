// The secret scanner has to tell a counter from a credential, and an effect
// ledger is a counter whose own key is called `credentialChanges`. It knew two
// of the three field names that spell a ledger in this codebase, so any result
// carrying a `businessEffectLedger` was rejected as secret-bearing -- a refusal
// that looked like a security finding and was really a vocabulary gap.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EFFECT_LEDGER_FIELDS,
  ZERO_BUSINESS_EFFECTS,
  ZERO_EXTERNAL_EFFECTS,
  isKnownEffectLedgerField,
  normalizeEffectLedger
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

test('a clean ledger under any of its names is not mistaken for a credential', () => {
  for (const [field, shape] of Object.entries(EFFECT_LEDGER_FIELDS)) {
    assert.equal(hasSecret({ [field]: { ...shape } }), false, `${field} was read as secret-bearing`);
  }
});

test('a ledger carrying a key outside its own shape is not exempt', () => {
  assert.equal(hasSecret({ externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS, mystery: 0 } }), true);
  assert.equal(hasSecret({ businessEffectLedger: { ...ZERO_BUSINESS_EFFECTS, apiKey: 'x' } }), true);
  // The relay ledger's `spendCents` is not a key of the business ledger, so a
  // business ledger carrying it stops being exempt.
  assert.equal(hasSecret({ businessEffectLedger: { ...ZERO_BUSINESS_EFFECTS, spendCents: 0 } }), true);
});

test('a result carrying a business-effect ledger passes the canonical contract', () => {
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

test('the scanner exemption stays loose on purpose: an incomplete ledger is a counter, not a credential', () => {
  // There is a standing temptation to make isKnownEffectLedgerField strict --
  // complete keys, finite non-negative values -- on the reasoning that a
  // partial ledger is not a real ledger. Strictness there is measurably wrong.
  //
  // The scanner's only question is "is this a counter or a credential". An
  // incomplete ledger is a counter with a missing field. Making it fail the
  // exemption sends it to the credential pattern, where `credentialChanges`
  // matches, and every caller of hasSecret then reports a missing counter as a
  // leaked secret -- which is the exact false positive that made every result
  // carrying a businessEffectLedger unprocessable.
  //
  // Completeness is enforced where it belongs: canonicalZeroEffectLedger and
  // normalizeEffectLedger, both of which reject this same value with a reason
  // that names the actual problem.
  const incomplete = { providerCalls: 0 };

  assert.equal(isKnownEffectLedgerField('externalEffectLedger', incomplete), true);
  assert.equal(hasSecret({ externalEffectLedger: incomplete }), false,
    'an incomplete ledger was reported as credential-bearing');

  // ...and it is still refused, by the check whose job that is.
  assert.deepEqual(
    validResult({
      outcome: 'x', changedArtifacts: [], testsActuallyRun: [],
      truthTable: [{ claim: 'x', status: 'v' }], decision: 'CONTINUE',
      externalEffectLedger: incomplete
    }),
    ['incomplete-external-effect-ledger-rejected']
  );
  assert.ok(normalizeEffectLedger('externalEffectLedger', incomplete)
    .reasonCodes.includes('effect-ledger-missing-keys'));
});

test('a business ledger normalizes onto the canonical spend key', () => {
  const normalized = normalizeEffectLedger('businessEffectLedger', {
    messages: 0, purchases: 0, deployments: 0, credentialChanges: 0,
    dnsChanges: 0, productionMutations: 0, businessSpendCents: 7
  });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.ledger.spendCents, 7, 'businessSpendCents did not map onto spendCents');
  assert.equal(normalized.ledger.providerCalls, 0);
  assert.equal(normalized.legacyAliasUsed, true);
});
