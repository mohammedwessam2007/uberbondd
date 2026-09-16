// GA8 candidates: compositions with structure rather than a flat sequence.
//
// The GA7 winner folds left to right, which is right for every level up to 4
// and wrong the moment a comma sets off a trailing clause. On every level-5
// item it returns a confident wrong number.
//
// N2 is here to test whether refusing is the ceiling. If a prompt's structure
// cannot be proven, declining to answer is a legitimate position and it should
// be measured rather than assumed insufficient -- the same role M2 played in
// GA7, where it turned out not to be enough.

export const NULLSTAR_GA8_CANDIDATES_VERSION = 'uberbond.nullstar-ga8-candidates.v1';

import { UBERBOND_SOLVERS } from './nullstar-cognitive-solvers.mjs';

const QUANTITY_PHRASES = [
  { key: 'spread', phrase: 'spread between largest and smallest' },
  { key: 'size', phrase: 'how many numbers there are' },
  { key: 'midrange', phrase: 'midrange' },
  { key: 'mean', phrase: 'mean' }
];

const NEEDS = {
  mean: ['sum', 'count'],
  midrange: ['max', 'min'],
  spread: ['max', 'min'],
  size: ['count']
};

const OPERATORS = [
  { word: 'average of', position: 'PREFIX', apply: (a, b) => (a + b) / 2 },
  { word: 'divided by', position: 'INFIX', apply: (a, b) => (b === 0 ? a : a / b) },
  { word: 'minus', position: 'INFIX', apply: (a, b) => a - b },
  { word: 'plus', position: 'INFIX', apply: (a, b) => a + b },
  { word: 'times', position: 'INFIX', apply: (a, b) => a * b }
];

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

function namedQuantities(text) {
  const found = [];
  for (const entry of QUANTITY_PHRASES) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(entry.phrase, from);
      if (at < 0) break;
      from = at + entry.phrase.length;
      if (found.some(prior => at >= prior.at && at < prior.at + prior.phrase.length)) continue;
      found.push({ ...entry, at });
    }
  }
  return found.sort((a, b) => a.at - b.at);
}

const finish = (value, keys, surface) => {
  if (!Number.isFinite(value)) return null;
  const available = new Set(surface.primitives ?? []);
  return {
    answer: value.toFixed(4),
    used: [...new Set(keys.flatMap(key => NEEDS[key]))].filter(name => available.has(name))
  };
};

/** Fold a span with no internal grouping, left to right. */
function foldSpan(text, quantities) {
  const named = namedQuantities(text);
  if (named.length === 0) return null;
  if (named.length === 1) return { value: quantities[named[0].key], keys: [named[0].key] };

  let accumulator = quantities[named[0].key];
  const keys = [named[0].key];
  for (let i = 1; i < named.length; i += 1) {
    const left = named[i - 1];
    const right = named[i];
    const between = text.slice(left.at + left.phrase.length, right.at);
    const head = i === 1 ? text.slice(0, left.at) : '';
    const operator = OPERATORS.find(entry => (entry.position === 'PREFIX' ? head : between).includes(entry.word));
    if (!operator) return null;
    accumulator = operator.apply(accumulator, quantities[right.key]);
    keys.push(right.key);
  }
  return { value: accumulator, keys };
}

/**
 * N2. Refuse any prompt whose structure cannot be proven.
 *
 * A comma means grouping this candidate does not model, so it declines rather
 * than guessing. Included to measure whether refusing is the ceiling: it will
 * score zero at level 5 and confabulate nothing, and if that is the best
 * available the generation should say so.
 */
export function n2RefuseOnComma(surface, prompt) {
  const text = String(prompt ?? '').toLowerCase().split('.')[0];
  if (text.includes(',')) return null;
  return UBERBOND_SOLVERS.INVENTION(surface, prompt);
}

/**
 * N3. Resolve the clause after the comma before joining it.
 *
 * "A, plus B divided by C" is A + (B / C): the comma sets off a trailing clause
 * that is a complete expression in its own right, and the operator immediately
 * after the comma joins the two halves. So the tail is folded first, then
 * joined, rather than every quantity being poured into one running total.
 */
export function n3ClauseFirst(surface, prompt) {
  const data = surface.data ?? [];
  if (data.length === 0) return null;
  const text = String(prompt ?? '').toLowerCase().split('.')[0];
  const quantities = quantitiesOf(data);

  const comma = text.indexOf(',');
  if (comma < 0) {
    const flat = foldSpan(text, quantities);
    return flat ? finish(flat.value, flat.keys, surface) : null;
  }

  const head = text.slice(0, comma);
  const tail = text.slice(comma + 1);

  const headResult = foldSpan(head, quantities);
  if (!headResult) return null;

  // The joining operator sits at the start of the tail, before its first
  // quantity. Everything after that quantity belongs to the tail's own fold.
  const tailNamed = namedQuantities(tail);
  if (tailNamed.length === 0) return null;
  const joinRegion = tail.slice(0, tailNamed[0].at);
  const join = OPERATORS.find(entry => entry.position === 'INFIX' && joinRegion.includes(entry.word));
  if (!join) return null;

  // Fold the tail from its first quantity onward, so a trailing operation is
  // part of the clause rather than dropped.
  const tailResult = foldSpan(tail.slice(tailNamed[0].at), quantities);
  if (!tailResult) return null;

  return finish(join.apply(headResult.value, tailResult.value), [...headResult.keys, ...tailResult.keys], surface);
}

/**
 * N4. Split on every comma and reduce the resulting clauses.
 *
 * N3 handles one comma. This treats the prompt as a list of clauses joined by
 * the operators that open each one, which is the same idea without assuming
 * there is exactly one boundary.
 */
export function n4Recursive(surface, prompt) {
  const data = surface.data ?? [];
  if (data.length === 0) return null;
  const text = String(prompt ?? '').toLowerCase().split('.')[0];
  const quantities = quantitiesOf(data);

  const parts = text.split(',');
  if (parts.length === 1) {
    const flat = foldSpan(text, quantities);
    return flat ? finish(flat.value, flat.keys, surface) : null;
  }

  const first = foldSpan(parts[0], quantities);
  if (!first) return null;

  let accumulator = first.value;
  const keys = [...first.keys];

  for (const part of parts.slice(1)) {
    const named = namedQuantities(part);
    if (named.length === 0) return null;
    const join = OPERATORS.find(entry => entry.position === 'INFIX' && part.slice(0, named[0].at).includes(entry.word));
    if (!join) return null;
    const clause = foldSpan(part.slice(named[0].at), quantities);
    if (!clause) return null;
    accumulator = join.apply(accumulator, clause.value);
    keys.push(...clause.keys);
  }

  return finish(accumulator, keys, surface);
}

export const GA8_CANDIDATES = Object.freeze({
  N1_LEFT_TO_RIGHT: UBERBOND_SOLVERS.INVENTION,
  N2_REFUSE_ON_COMMA: n2RefuseOnComma,
  N3_CLAUSE_FIRST: n3ClauseFirst,
  N4_RECURSIVE: n4Recursive
});
