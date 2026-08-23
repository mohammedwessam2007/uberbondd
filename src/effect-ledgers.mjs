// Canonical vocabulary for "what this did to the world outside UberBond".
//
// Historical code writes two shapes:
//   externalEffectLedger / externalEffects -> `spendCents`
//   businessEffectLedger                  -> `businessSpendCents`
//
// They remain accepted at the compatibility boundary, but every new validator
// can normalize either spelling into one canonical shape. That lets the system
// migrate without a flag-day rewrite and prevents "zero" from meaning different
// things depending on which subsystem produced the receipt.

export const CANONICAL_EFFECT_KEYS = Object.freeze([
  'providerCalls',
  'messages',
  'purchases',
  'deployments',
  'credentialChanges',
  'dnsChanges',
  'productionMutations',
  'spendCents'
]);

export const ZERO_CANONICAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

/** Relay/worker external-effect ledger. Canonical spelling. */
export const ZERO_EXTERNAL_EFFECTS = ZERO_CANONICAL_EFFECTS;

/**
 * Legacy autonomy-loop business-effect ledger. Kept only for compatibility
 * with already-persisted receipts and call sites while the migration proceeds.
 */
export const ZERO_BUSINESS_EFFECTS = Object.freeze({
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  businessSpendCents: 0
});

/** Every field name currently accepted at an input/receipt compatibility boundary. */
export const EFFECT_LEDGER_FIELDS = Object.freeze({
  externalEffectLedger: ZERO_EXTERNAL_EFFECTS,
  externalEffects: ZERO_EXTERNAL_EFFECTS,
  businessEffectLedger: ZERO_BUSINESS_EFFECTS
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function exactOwnKeys(value, expectedKeys) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/** True when `key` names a ledger field and `value` contains only that ledger's keys. */
export function isKnownEffectLedgerField(key, value) {
  const shape = Object.hasOwn(EFFECT_LEDGER_FIELDS, key) ? EFFECT_LEDGER_FIELDS[key] : null;
  if (!shape || !isPlainObject(value)) return false;
  return Object.keys(value).every(effect => Object.hasOwn(shape, effect));
}

/**
 * Normalize one complete historical/canonical ledger into the canonical shape.
 *
 * This is deliberately strict: missing counters, unknown counters, negative or
 * non-integer values, and ambiguous spend aliases are refusals. A partial `{}`
 * must never become proof of zero business effects.
 */
export function normalizeEffectLedger(fieldName, value) {
  const shape = Object.hasOwn(EFFECT_LEDGER_FIELDS, fieldName) ? EFFECT_LEDGER_FIELDS[fieldName] : null;
  if (!shape) return { ok: false, reasonCodes: ['unknown-effect-ledger-field'] };
  if (!isPlainObject(value)) return { ok: false, reasonCodes: ['effect-ledger-object-required'] };

  const expectedKeys = Object.keys(shape);
  if (!exactOwnKeys(value, expectedKeys)) {
    const missing = expectedKeys.filter(key => !Object.hasOwn(value, key));
    const unknown = Object.keys(value).filter(key => !Object.hasOwn(shape, key));
    return {
      ok: false,
      reasonCodes: [
        ...(missing.length ? ['effect-ledger-missing-keys'] : []),
        ...(unknown.length ? ['effect-ledger-unknown-keys'] : [])
      ],
      missingKeys: missing,
      unknownKeys: unknown
    };
  }

  const invalid = Object.entries(value)
    .filter(([, counter]) => !validCounter(counter))
    .map(([key]) => key);
  if (invalid.length) {
    return { ok: false, reasonCodes: ['effect-ledger-invalid-counter'], invalidKeys: invalid };
  }

  if (fieldName === 'businessEffectLedger') {
    return {
      ok: true,
      ledger: {
        providerCalls: 0,
        messages: value.messages,
        purchases: value.purchases,
        deployments: value.deployments,
        credentialChanges: value.credentialChanges,
        dnsChanges: value.dnsChanges,
        productionMutations: value.productionMutations,
        spendCents: value.businessSpendCents
      },
      sourceField: fieldName,
      legacyAliasUsed: true
    };
  }

  return {
    ok: true,
    ledger: { ...value },
    sourceField: fieldName,
    legacyAliasUsed: false
  };
}

/** Convert a canonical ledger back to the legacy business shape during migration. */
export function toLegacyBusinessEffectLedger(canonical) {
  const normalized = normalizeEffectLedger('externalEffectLedger', canonical);
  if (!normalized.ok) return normalized;
  const value = normalized.ledger;
  if (value.providerCalls !== 0) {
    return { ok: false, reasonCodes: ['provider-calls-not-representable-in-business-ledger'] };
  }
  return {
    ok: true,
    ledger: {
      messages: value.messages,
      purchases: value.purchases,
      deployments: value.deployments,
      credentialChanges: value.credentialChanges,
      dnsChanges: value.dnsChanges,
      productionMutations: value.productionMutations,
      businessSpendCents: value.spendCents
    }
  };
}

/** Complete, canonical zero-effect proof. */
export function isCanonicalZeroEffectLedger(value) {
  const normalized = normalizeEffectLedger('externalEffectLedger', value);
  return normalized.ok && CANONICAL_EFFECT_KEYS.every(key => normalized.ledger[key] === 0);
}
