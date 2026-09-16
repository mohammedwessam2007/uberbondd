// What an observer must declare before anything it says counts as evidence.
//
// Two observers lied in this repository, and neither was caught by a test.
// One matched the word "survived" inside guard descriptions and reported
// survivors from a run that killed every mutation. The other read the very
// file this session had written to declare the state it was supposedly
// observing, so the observation confirmed its own premise.
//
// Both were found by hand. This module makes both refusable.

import { createHash } from 'node:crypto';

export const NULLSTAR_OMEGA_OBSERVER_CONTRACT_VERSION = 'uberbond.nullstar-omega-observer-contract.v1';

// A separator that cannot occur inside a fact or a value.
const SEP = String.fromCharCode(0);

// How the observer gets at the fact.
export const PARSING_RULES = Object.freeze({
  // The producer emits structured output and the observer reads a field.
  STRUCTURED_FIELD: 'STRUCTURED_FIELD',
  // The observer reads an exit code.
  EXIT_CODE: 'EXIT_CODE',
  // The observer counts structured records.
  RECORD_COUNT: 'RECORD_COUNT',
  // The observer matches text. Always the weakest, and refused outright when
  // the same producer also emits something structured.
  TEXT_PATTERN: 'TEXT_PATTERN'
});

// How far the observation stands from the thing being claimed.
export const INDEPENDENCE_CLASSES = Object.freeze({
  // Produced by something that does not read the claim.
  INDEPENDENT: 'INDEPENDENT',
  // Computed from independent inputs by this session's code.
  DERIVED: 'DERIVED',
  // Reads an artifact this session authored to state the same thing.
  SELF_REFERENTIAL: 'SELF_REFERENTIAL',
  // Its inputs eventually include its own output.
  CYCLIC: 'CYCLIC'
});

const NON_EVIDENTIAL = new Set([INDEPENDENCE_CLASSES.SELF_REFERENTIAL, INDEPENDENCE_CLASSES.CYCLIC]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

/**
 * Declare an observer.
 *
 * `producesStructuredOutput` is the field that stops the prose failure: an
 * observer cannot choose text matching against a producer that also emits
 * structure. That is not a style preference. The mutation runner printed
 * "397 mutations, 397 killed, 0 not killed" and the observer matched a word
 * in the guard catalogue instead.
 */
export function declareObserver({
  id = null,
  observes = null,
  inputSource = null,
  producesStructuredOutput = null,
  parsingRule = null,
  expectedSchema = null,
  independenceClass = null,
  readsArtifactsAuthoredBy = [],
  claimArtifact = null,
  validationRule = null,
  failureState = null
} = {}) {
  const reasonCodes = [];
  const observerId = text(id, 200);
  if (!observerId) reasonCodes.push('observer-id-required');
  if (!text(observes, 500)) reasonCodes.push('observer-must-say-what-it-observes');
  if (!text(inputSource, 500)) reasonCodes.push('observer-must-name-its-input-source');
  if (!Object.hasOwn(PARSING_RULES, String(parsingRule ?? ''))) reasonCodes.push('known-parsing-rule-required');
  if (!Object.hasOwn(INDEPENDENCE_CLASSES, String(independenceClass ?? ''))) reasonCodes.push('known-independence-class-required');
  if (!text(validationRule, 1000)) reasonCodes.push('observer-must-state-how-a-bad-read-is-detected');
  if (!text(failureState, 200)) reasonCodes.push('observer-must-name-the-state-it-reports-on-failure');
  if (typeof producesStructuredOutput !== 'boolean') reasonCodes.push('must-say-whether-the-producer-emits-structured-output');

  // The prose failure, made refusable.
  if (producesStructuredOutput === true && parsingRule === PARSING_RULES.TEXT_PATTERN) {
    reasonCodes.push('text-matching-is-refused-when-the-producer-emits-structured-output');
  }
  if (parsingRule === PARSING_RULES.STRUCTURED_FIELD && !text(expectedSchema, 1000)) {
    reasonCodes.push('structured-reads-must-name-the-field-or-schema-they-expect');
  }

  // The self-reference failure, made refusable. An observation whose input was
  // written by the same session that is making the claim is not confirming
  // anything, whatever the independence class asserts.
  const authored = (Array.isArray(readsArtifactsAuthoredBy) ? readsArtifactsAuthoredBy : [])
    .map(entry => text(entry, 500))
    .filter(Boolean);
  const claim = text(claimArtifact, 500);
  const readsOwnClaim = claim !== null && authored.includes(claim);
  if (readsOwnClaim && independenceClass !== INDEPENDENCE_CLASSES.SELF_REFERENTIAL) {
    reasonCodes.push('an-observer-reading-the-artifact-that-states-its-own-claim-is-self-referential');
  }

  if (reasonCodes.length) {
    return fail('OBSERVER_DECLARATION_INVALID', reasonCodes, { observerId, readsOwnClaim });
  }

  const evidential = !NON_EVIDENTIAL.has(independenceClass);
  return {
    ok: true,
    status: evidential ? 'OBSERVER_DECLARED' : 'OBSERVER_DECLARED_NOT_EVIDENTIAL',
    version: NULLSTAR_OMEGA_OBSERVER_CONTRACT_VERSION,
    observer: {
      id: observerId,
      observes: text(observes, 500),
      inputSource: text(inputSource, 500),
      producesStructuredOutput,
      parsingRule,
      expectedSchema: text(expectedSchema, 1000),
      independenceClass,
      readsArtifactsAuthoredBy: authored,
      claimArtifact: claim,
      validationRule: text(validationRule, 1000),
      failureState: text(failureState, 200)
    },
    countsAsEvidence: evidential,
    why: evidential
      ? null
      : 'A self-referential or cyclic observation restates the claim it was meant to check. It may be recorded; it may not be counted as confirmation.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Two observers, one fact.
 *
 * Agreement is not proof -- two observers reading the same prose agree
 * beautifully. So this refuses a comparison where both derivations came from
 * the same input source, which is the shape the mutation failure had.
 */
export function differentialObservation({ fact = null, first = null, second = null } = {}) {
  const reasonCodes = [];
  const subject = text(fact, 500);
  if (!subject) reasonCodes.push('fact-under-observation-required');
  if (!first?.ok || !second?.ok) reasonCodes.push('two-declared-observers-required');
  if (reasonCodes.length) return fail('DIFFERENTIAL_INVALID', reasonCodes);

  const a = first.observer;
  const b = second.observer;
  if (a.id === b.id) return fail('DIFFERENTIAL_INVALID', ['two-distinct-observers-required']);
  if (a.inputSource === b.inputSource) {
    return fail('DIFFERENTIAL_INVALID', ['independent-derivations-must-not-share-an-input-source'], {
      sharedInputSource: a.inputSource,
      note: 'Two readings of the same output agree by construction. That is not corroboration.'
    });
  }

  return {
    ok: true,
    status: 'DIFFERENTIAL_READY',
    fact: subject,
    observers: [a.id, b.id],
    inputSources: [a.inputSource, b.inputSource],
    bothEvidential: first.countsAsEvidence && second.countsAsEvidence,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Compare what two observers actually returned.
 *
 * Disagreement opens a contradiction rather than picking a winner. The
 * observer that looks more authoritative is exactly the one that was wrong
 * last time.
 */
export function reconcileObservations({ differential = null, firstValue = null, secondValue = null } = {}) {
  if (!differential?.ok) return fail('RECONCILE_INVALID', ['prepared-differential-required']);
  const a = text(String(firstValue ?? ''), 500);
  const b = text(String(secondValue ?? ''), 500);
  if (a === null || b === null) return fail('RECONCILE_INVALID', ['both-observers-must-return-a-value']);

  if (a !== b) {
    return {
      ok: false,
      status: 'OBSERVER_CONTRADICTION',
      fact: differential.fact,
      observers: differential.observers,
      values: [a, b],
      reasonCodes: ['observers-disagree'],
      note: 'Neither reading is promoted. One of these observers is wrong and which one is not decidable from the disagreement alone.',
      businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    status: 'OBSERVATION_CORROBORATED',
    fact: differential.fact,
    observers: differential.observers,
    value: a,
    corroborationStrength: differential.bothEvidential ? 'INDEPENDENT_AGREEMENT' : 'AGREEMENT_WITH_A_NON_EVIDENTIAL_OBSERVER',
    digest: `sha256:${createHash('sha256').update(`${differential.fact}${SEP}${a}`).digest('hex').slice(0, 32)}`,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Walk a provenance graph and classify how an observation stands.
 *
 * `edges` maps a node to the nodes it reads. A node that transitively reaches
 * itself is cyclic; one that reaches an artifact this session authored to
 * state the claim is self-referential.
 */
export function classifyProvenance({ node = null, edges = {}, sessionAuthored = [] } = {}) {
  const start = text(node, 300);
  if (!start) return fail('PROVENANCE_INVALID', ['node-required']);

  const authored = new Set((Array.isArray(sessionAuthored) ? sessionAuthored : []).map(entry => String(entry)));
  const seen = new Set();
  const stack = [...(edges?.[start] ?? [])];
  let touchedAuthored = false;
  let cyclic = false;

  while (stack.length) {
    const current = String(stack.pop());
    if (current === start) { cyclic = true; continue; }
    if (seen.has(current)) continue;
    seen.add(current);
    if (authored.has(current)) touchedAuthored = true;
    for (const next of edges?.[current] ?? []) stack.push(next);
  }

  const klass = cyclic
    ? INDEPENDENCE_CLASSES.CYCLIC
    : touchedAuthored
      ? INDEPENDENCE_CLASSES.SELF_REFERENTIAL
      : (seen.size ? INDEPENDENCE_CLASSES.DERIVED : INDEPENDENCE_CLASSES.INDEPENDENT);

  return {
    ok: true,
    status: 'PROVENANCE_CLASSIFIED',
    node: start,
    independenceClass: klass,
    reachedNodes: [...seen],
    touchedSessionAuthored: touchedAuthored,
    countsAsEvidence: !NON_EVIDENTIAL.has(klass),
    businessEffectAuthority: 'NONE'
  };
}
