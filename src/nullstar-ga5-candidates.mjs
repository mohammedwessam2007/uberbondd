// GA5 candidates. GA4's composing candidates with the operator search repaired.
//
// GA4 promoted nothing. Its two composing candidates passed the out-of-pattern
// gate 3 of 3 and lost in-distribution to a defect of mine rather than to a
// limit of composing: the operator was read from the span between the two named
// quantities, and "the average of the mean and the midrange" puts it before the
// first one. That target failed every time; the other three were perfect.
//
// K1 is GA4's null candidate carried forward unchanged, so the comparison that
// matters -- lookup against composition -- is the same comparison.

export const NULLSTAR_GA5_CANDIDATES_VERSION = 'uberbond.nullstar-ga5-candidates.v1';

export { j1OneMorePattern as k1OneMorePattern } from './nullstar-ga4-candidates.mjs';
import { j1OneMorePattern } from './nullstar-ga4-candidates.mjs';

const quantitiesOf = data => {
  const high = Math.max(...data);
  const low = Math.min(...data);
  return {
    mean: data.reduce((a, b) => a + b, 0) / data.length,
    midrange: (high + low) / 2,
    spread: high - low,
    size: data.length
  };
};

const NEEDS = {
  mean: ['sum', 'count'],
  midrange: ['max', 'min'],
  spread: ['max', 'min'],
  size: ['count']
};

const QUANTITY_PHRASES = [
  { key: 'spread', phrase: 'spread between largest and smallest' },
  { key: 'size', phrase: 'how many numbers there are' },
  { key: 'midrange', phrase: 'midrange' },
  { key: 'mean', phrase: 'mean' }
];

const report = (value, needs, surface) => {
  if (!Number.isFinite(value)) return null;
  const available = new Set(surface.primitives ?? []);
  return { answer: value.toFixed(4), used: [...new Set(needs)].filter(name => available.has(name)) };
};

/** Quantities the prompt names, in order, ignoring mentions inside a longer match. */
function namedQuantities(text) {
  const found = [];
  for (const entry of QUANTITY_PHRASES) {
    const at = text.indexOf(entry.phrase);
    if (at < 0) continue;
    if (found.some(prior => at >= prior.at && at < prior.at + prior.phrase.length)) continue;
    found.push({ ...entry, at });
  }
  return found.sort((a, b) => a.at - b.at);
}

/**
 * Operators, and where the word sits relative to the quantities it joins.
 *
 * This is the repair. English puts some of these between the operands -- "a
 * minus b" -- and some in front of both -- "the average of a and b". Searching
 * only the span between them finds the first kind and silently misses the
 * second, which is what cost GA4 a quarter of the family.
 *
 * Prefix operators are checked first: "the average of the mean and the
 * midrange" also contains "and", and a symmetric reading of that would be
 * addition rather than a mean of the two.
 */
const OPERATORS = [
  { word: 'average of', position: 'PREFIX', apply: (a, b) => (a + b) / 2 },
  { word: 'divided by', position: 'INFIX', apply: (a, b) => (b === 0 ? a : a / b) },
  { word: 'minus', position: 'INFIX', apply: (a, b) => a - b },
  { word: 'plus', position: 'INFIX', apply: (a, b) => a + b },
  { word: 'times', position: 'INFIX', apply: (a, b) => a * b }
];

/**
 * Find the operator joining two quantities, looking in the right place for each
 * kind: in front of the first for a prefix operator, between the two for an
 * infix one. Position is part of what an operator is, not a detail.
 */
function findOperator(text, first, second) {
  const before = text.slice(0, first.at);
  const between = text.slice(first.at, second.at + second.phrase.length);
  for (const operator of OPERATORS) {
    const where = operator.position === 'PREFIX' ? before : between;
    if (where.includes(operator.word)) return operator;
  }
  return null;
}

function compose(surface, prompt) {
  const data = surface.data ?? [];
  if (data.length === 0) return null;
  const text = String(prompt ?? '').toLowerCase();
  const q = quantitiesOf(data);
  const mentioned = namedQuantities(text);
  if (mentioned.length === 0) return null;

  if (mentioned.length === 1) {
    const only = mentioned[0];
    return { result: report(q[only.key], NEEDS[only.key], surface), unaccounted: 0 };
  }

  const [first, second] = mentioned;
  const operator = findOperator(text, first, second);
  if (!operator) return { result: null, unaccounted: mentioned.length };

  return {
    result: report(operator.apply(q[first.key], q[second.key]), [...NEEDS[first.key], ...NEEDS[second.key]], surface),
    unaccounted: mentioned.length - 2
  };
}

/** K2. Composition with the operator located wherever its kind puts it. */
export function k2OperatorRepaired(surface, prompt) {
  return compose(surface, prompt)?.result ?? null;
}

/** K3. K2, refusing when a named quantity is left over. */
export function k3CompositionalStrict(surface, prompt) {
  const outcome = compose(surface, prompt);
  if (!outcome || outcome.unaccounted > 0) return null;
  return outcome.result;
}

/**
 * K4. Resolve the sentence into operand, operator, operand structurally.
 *
 * K2 and K3 ask whether known phrases appear. This one segments the clause and
 * reads whatever occupies each slot, so an operator word it has never seen
 * produces a refusal at a known position rather than a silent fallback to
 * whichever pattern happens to match. Included to test whether the repair in K2
 * is a genuine fix or one more special case.
 */
export function k4StructuralParse(surface, prompt) {
  const data = surface.data ?? [];
  if (data.length === 0) return null;
  const text = String(prompt ?? '').toLowerCase().split('.')[0];
  const q = quantitiesOf(data);
  const mentioned = namedQuantities(text);
  if (mentioned.length === 0) return null;
  if (mentioned.length === 1) return report(q[mentioned[0].key], NEEDS[mentioned[0].key], surface);

  const [first, second] = mentioned;
  const head = text.slice(0, first.at);
  const joint = text.slice(first.at + first.phrase.length, second.at);

  const prefix = OPERATORS.find(entry => entry.position === 'PREFIX' && head.includes(entry.word));
  const infix = OPERATORS.find(entry => entry.position === 'INFIX' && joint.includes(entry.word));

  // Both slots filled is ambiguous, and guessing which one governs is how a
  // parser starts inventing readings. Refuse instead.
  if (prefix && infix) return null;
  const operator = prefix ?? infix;
  if (!operator) return null;

  return report(operator.apply(q[first.key], q[second.key]), [...NEEDS[first.key], ...NEEDS[second.key]], surface);
}

export const GA5_CANDIDATES = Object.freeze({
  K1_ONE_MORE_PATTERN: j1OneMorePattern,
  K2_OPERATOR_REPAIRED: k2OperatorRepaired,
  K3_COMPOSITIONAL_STRICT: k3CompositionalStrict,
  K4_STRUCTURAL_PARSE: k4StructuralParse
});
