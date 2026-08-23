// The vocabulary of "what this did to the world outside UberBond".
//
// Two ledger shapes still exist because they answer different questions: the
// relay counts provider calls and provider spend, while the autonomy loop
// records business consequences and business spend. Both are load-bearing.
// What must not differ between them is the meaning of a signed ledger: every
// canonical key must be present, no unknown key may be smuggled in, and every
// value must be a finite non-negative number. Silence is not a zero.

/** Relay/worker external-effect ledger. Spelled `externalEffectLedger` or `externalEffects`. */
export const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

/** Autonomy-loop business-effect ledger. Spelled `businessEffectLedger`. */
export const ZERO_BUSINESS_EFFECTS = Object.freeze({
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  businessSpendCents: 0
});

/**
 * Every key a payload field may legitimately spell a ledger under, mapped to
 * the exact key set that ledger is required to contain. A scanner uses this to
 * tell a consequence counter from a credential-shaped object.
 */
export const EFFECT_LEDGER_FIELDS = Object.freeze({
  externalEffectLedger: ZERO_EXTERNAL_EFFECTS,
  externalEffects: ZERO_EXTERNAL_EFFECTS,
  businessEffectLedger: ZERO_BUSINESS_EFFECTS
});

function effectLedgerShape(field) {
  return Object.hasOwn(EFFECT_LEDGER_FIELDS, field) ? EFFECT_LEDGER_FIELDS[field] : null;
}

/**
 * True only when `field` names a canonical ledger and `value` is a complete,
 * exact, finite, non-negative instance of that shape.
 *
 * This deliberately does not require zero. A valid non-zero ledger is still a
 * ledger and must reach the consequence validator, where it is rejected (or
 * accounted for) for the right reason instead of being mislabeled as a secret.
 */
export function isKnownEffectLedgerField(field, value) {
  const shape = effectLedgerShape(field);
  if (!shape || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  const expected = Object.keys(shape);
  const actual = Object.keys(value);
  if (actual.length !== expected.length) return false;
  if (expected.some(key => !Object.hasOwn(value, key))) return false;
  if (actual.some(key => !Object.hasOwn(shape, key))) return false;
  return expected.every(key => {
    const amount = value[key];
    return typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;
  });
}

/** True only for a complete canonical ledger carrying exactly its signed zero values. */
export function isZeroEffectLedgerField(field, value) {
  const shape = effectLedgerShape(field);
  if (!shape || !isKnownEffectLedgerField(field, value)) return false;
  return Object.keys(shape).every(key => value[key] === shape[key]);
}
