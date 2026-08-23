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

// ---------------------------------------------------------------------------
// Effect state: four answers, not two.
//
// A counter set to 0 answers "how many". It does not answer "did anyone look".
// Those are different claims and the system collapsed them: a worker that
// genuinely made no provider calls and a worker that crashed mid-dispatch and
// never found out both shipped `providerCalls: 0`, and both were accepted as
// proof that nothing reached the outside world. The second one is not proof of
// anything. It is the exact shape of an effect that already happened.
//
//   ZERO_EFFECT         every dimension was observed and every one was zero.
//                       The only state that may be treated as proof.
//   EFFECT_OCCURRED     at least one dimension is a positive count.
//   EFFECT_UNKNOWN      at least one dimension may have happened and cannot be
//                       determined -- a lost provider response, a crash between
//                       dispatch and receipt. Never zero.
//   EFFECT_NOT_OBSERVED at least one dimension was never looked at. Silence.
//                       Also never zero.
//
// A dimension declares non-observation by carrying the sentinel in place of a
// number, so an incomplete ledger stays a refusal: omitting a key is still a
// malformed claim, not a way to say "I did not check".

export const EFFECT_OBSERVATION = Object.freeze({
  NOT_OBSERVED: 'NOT_OBSERVED',
  UNKNOWN: 'UNKNOWN'
});

export const EFFECT_STATES = Object.freeze({
  ZERO_EFFECT: 'ZERO_EFFECT',
  EFFECT_OCCURRED: 'EFFECT_OCCURRED',
  EFFECT_UNKNOWN: 'EFFECT_UNKNOWN',
  EFFECT_NOT_OBSERVED: 'EFFECT_NOT_OBSERVED'
});

function observationSentinel(value) {
  return value === EFFECT_OBSERVATION.NOT_OBSERVED || value === EFFECT_OBSERVATION.UNKNOWN;
}

/**
 * Classify one complete ledger into an effect state.
 *
 * Completeness is enforced exactly as `normalizeEffectLedger` enforces it: the
 * key set must be exact. What this adds is that a present key may carry an
 * observation sentinel instead of a count.
 *
 * Precedence is EFFECT_OCCURRED > EFFECT_UNKNOWN > EFFECT_NOT_OBSERVED >
 * ZERO_EFFECT. A positive count is the strongest statement about reality
 * available, so it names the state -- but `unknownKeys` and `notObservedKeys`
 * are always returned, so a caller can never lose the fact that the ledger was
 * also incomplete in a way a single label cannot carry.
 */
export function classifyEffectLedger(fieldName, value) {
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

  const invalidKeys = [];
  const occurredKeys = [];
  const unknownKeys = [];
  const notObservedKeys = [];
  const observedZeroKeys = [];

  for (const key of expectedKeys) {
    const counter = value[key];
    if (counter === EFFECT_OBSERVATION.UNKNOWN) { unknownKeys.push(key); continue; }
    if (counter === EFFECT_OBSERVATION.NOT_OBSERVED) { notObservedKeys.push(key); continue; }
    if (!validCounter(counter)) { invalidKeys.push(key); continue; }
    if (counter > 0) occurredKeys.push(key);
    else observedZeroKeys.push(key);
  }

  if (invalidKeys.length) {
    return { ok: false, reasonCodes: ['effect-ledger-invalid-counter'], invalidKeys };
  }

  const state = occurredKeys.length ? EFFECT_STATES.EFFECT_OCCURRED
    : unknownKeys.length ? EFFECT_STATES.EFFECT_UNKNOWN
      : notObservedKeys.length ? EFFECT_STATES.EFFECT_NOT_OBSERVED
        : EFFECT_STATES.ZERO_EFFECT;

  return {
    ok: true,
    state,
    sourceField: fieldName,
    ledger: { ...value },
    occurredKeys,
    unknownKeys,
    notObservedKeys,
    observedZeroKeys,
    // One predicate for the only question that matters at a safety boundary.
    provenZero: state === EFFECT_STATES.ZERO_EFFECT
  };
}

/**
 * True only when every dimension was observed and every one was zero.
 *
 * Deliberately not `state !== EFFECT_OCCURRED`. Unknown and not-observed are
 * not weaker versions of zero; they are the absence of the evidence that would
 * make zero a claim at all.
 */
export function isProvenZeroEffect(fieldName, value) {
  const classified = classifyEffectLedger(fieldName, value);
  return classified.ok === true && classified.provenZero === true;
}

/** A ledger asserting that a dimension may have occurred and cannot be determined. */
export function unknownEffectLedger(keys = CANONICAL_EFFECT_KEYS) {
  const declared = new Set(keys);
  return Object.freeze(Object.fromEntries(CANONICAL_EFFECT_KEYS.map(key =>
    [key, declared.has(key) ? EFFECT_OBSERVATION.UNKNOWN : 0])));
}

/** A ledger asserting that a dimension was never looked at. */
export function notObservedEffectLedger(keys = CANONICAL_EFFECT_KEYS) {
  const declared = new Set(keys);
  return Object.freeze(Object.fromEntries(CANONICAL_EFFECT_KEYS.map(key =>
    [key, declared.has(key) ? EFFECT_OBSERVATION.NOT_OBSERVED : 0])));
}
