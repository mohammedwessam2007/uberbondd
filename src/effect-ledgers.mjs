// The vocabulary of "what this did to the world outside UberBond".
//
// Two ledger shapes exist and both are load-bearing: the relay counts provider
// calls and cents, the autonomy loop counts business spend and does not know
// about providers at all. They were declared independently in the modules that
// used them, which is how the secret scanner ended up knowing about two of the
// three spellings -- `businessEffectLedger` fell through and every result
// carrying one was rejected as credential-bearing, because a ledger's own key
// `credentialChanges` matches the credential pattern.
//
// One module owns the shapes now, so a scanner or validator that needs to
// recognise a ledger has exactly one list to consult.

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
 * the key set that ledger is allowed to contain. A scanner uses this to tell a
 * counter from a credential.
 */
export const EFFECT_LEDGER_FIELDS = Object.freeze({
  externalEffectLedger: ZERO_EXTERNAL_EFFECTS,
  externalEffects: ZERO_EXTERNAL_EFFECTS,
  businessEffectLedger: ZERO_BUSINESS_EFFECTS
});

/** True when `key` names a ledger field and `value` contains only that ledger's keys. */
export function isKnownEffectLedgerField(key, value) {
  const shape = Object.hasOwn(EFFECT_LEDGER_FIELDS, key) ? EFFECT_LEDGER_FIELDS[key] : null;
  if (!shape) return false;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).every(effect => Object.hasOwn(shape, effect));
}
