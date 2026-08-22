// Canonical effect-ledger shapes.
//
// There were three copies of "what a zero-effect ledger looks like": one in
// cloud-agent-relay (external), one in agent-provider-worker (business), one
// in agent-autonomy-loop (business again, under a third name). Three copies of
// a safety contract is how one of them silently stops matching the others.
//
// The split that matters is which side of the boundary an effect sits on:
//
//   EXTERNAL  -- anything the process did outside itself, provider calls
//                included. `providerCalls`/`spendCents` are compute, which a
//                bounded worker is allowed to consume under a reservation.
//   BUSINESS  -- anything that reached a customer, a payment rail, DNS,
//                credentials, or production. A worker is never allowed any of
//                these, so this ledger must read all-zero to finish a task.
//
// This module imports nothing, so every consumer can depend on it without
// creating a cycle.

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

export const ZERO_BUSINESS_EFFECTS = Object.freeze({
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  businessSpendCents: 0
});

// The property names that carry a ledger, mapped to the shape each one must
// have. A secret scanner has to know these by name: the ledgers' own key names
// (`credentialChanges`) match any sane credential-shaped-key rule, so without
// this map a perfectly clean ledger is rejected as secret-bearing.
export const LEDGER_FIELDS = Object.freeze({
  externalEffectLedger: ZERO_EXTERNAL_EFFECTS,
  externalEffects: ZERO_EXTERNAL_EFFECTS,
  businessEffectLedger: ZERO_BUSINESS_EFFECTS
});

export function isLedgerField(key) {
  return Object.hasOwn(LEDGER_FIELDS, key);
}

/**
 * True when `value` is exactly the ledger `shape` describes: an object whose
 * every key is known to the shape and whose every value is a finite number.
 *
 * Both halves are load-bearing for the secret scanner that calls this. An
 * unknown key means the object is not really a ledger, so it must be scanned
 * normally. A non-numeric value means somebody put a string where a counter
 * belongs, which is exactly where a credential would be smuggled -- so that
 * also falls through to normal scanning rather than being waved past.
 */
export function isLedgerShaped(value, shape) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (!keys.every(key => Object.hasOwn(shape, key))) return false;
  return keys.every(key => typeof value[key] === 'number' && Number.isFinite(value[key]));
}

/** True when every counter the shape names reads zero. */
export function isZeroLedger(value, shape) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(shape).every(([key, zero]) => Number(value[key] || 0) === zero);
}

/** True when the ledger declares an effect the shape does not name at all. */
export function hasUnknownLedgerKey(value, shape) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  return Object.keys(value).some(key => !Object.hasOwn(shape, key));
}
