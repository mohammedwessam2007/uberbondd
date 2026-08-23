// Credential-shaped strings below are test fixtures, not live secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_EFFECT_KEYS,
  ZERO_CANONICAL_EFFECTS,
  ZERO_EXTERNAL_EFFECTS,
  ZERO_BUSINESS_EFFECTS,
  normalizeEffectLedger,
  toLegacyBusinessEffectLedger,
  isCanonicalZeroEffectLedger
} from '../src/effect-ledgers.mjs';

test('external ledger is already canonical and aliases the canonical zero', () => {
  assert.equal(ZERO_EXTERNAL_EFFECTS, ZERO_CANONICAL_EFFECTS);
  const result = normalizeEffectLedger('externalEffectLedger', { ...ZERO_EXTERNAL_EFFECTS });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ledger, ZERO_CANONICAL_EFFECTS);
  assert.equal(result.legacyAliasUsed, false);
});

test('legacy business spend maps to canonical spendCents with providerCalls zero', () => {
  const result = normalizeEffectLedger('businessEffectLedger', {
    ...ZERO_BUSINESS_EFFECTS,
    messages: 2,
    businessSpendCents: 19
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ledger, {
    ...ZERO_CANONICAL_EFFECTS,
    messages: 2,
    spendCents: 19
  });
  assert.equal(result.legacyAliasUsed, true);
});

test('missing keys can never become zero-effect proof', () => {
  const result = normalizeEffectLedger('externalEffectLedger', {});
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('effect-ledger-missing-keys'));
  assert.equal(isCanonicalZeroEffectLedger({}), false);
});

test('unknown keys fail closed rather than disappearing during normalization', () => {
  const result = normalizeEffectLedger('externalEffectLedger', {
    ...ZERO_EXTERNAL_EFFECTS,
    mysteryEffect: 0
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('effect-ledger-unknown-keys'));
  assert.deepEqual(result.unknownKeys, ['mysteryEffect']);
});

test('negative fractional NaN and string counters are rejected', () => {
  for (const bad of [-1, 0.5, Number.NaN, '0']) {
    const result = normalizeEffectLedger('externalEffectLedger', {
      ...ZERO_EXTERNAL_EFFECTS,
      messages: bad
    });
    assert.equal(result.ok, false, String(bad));
    assert.ok(result.reasonCodes.includes('effect-ledger-invalid-counter'));
  }
});

test('unknown ledger field names fail closed', () => {
  const result = normalizeEffectLedger('madeUpLedger', { ...ZERO_EXTERNAL_EFFECTS });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['unknown-effect-ledger-field']);
});

test('canonical to legacy roundtrip preserves representable business effects', () => {
  const canonical = {
    ...ZERO_CANONICAL_EFFECTS,
    messages: 3,
    purchases: 1,
    spendCents: 420
  };
  const legacy = toLegacyBusinessEffectLedger(canonical);
  assert.equal(legacy.ok, true);
  const roundTrip = normalizeEffectLedger('businessEffectLedger', legacy.ledger);
  assert.equal(roundTrip.ok, true);
  assert.deepEqual(roundTrip.ledger, canonical);
});

test('provider calls cannot be silently lost when converting to legacy business shape', () => {
  const result = toLegacyBusinessEffectLedger({
    ...ZERO_CANONICAL_EFFECTS,
    providerCalls: 1
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['provider-calls-not-representable-in-business-ledger']);
});

test('zero proof requires every canonical key and an actual numeric zero', () => {
  assert.equal(isCanonicalZeroEffectLedger({ ...ZERO_CANONICAL_EFFECTS }), true);
  for (const key of CANONICAL_EFFECT_KEYS) {
    assert.equal(isCanonicalZeroEffectLedger({ ...ZERO_CANONICAL_EFFECTS, [key]: 1 }), false, key);
  }
});
