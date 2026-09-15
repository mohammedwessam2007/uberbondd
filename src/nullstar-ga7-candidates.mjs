// GA7 candidates: composing an arbitrary number of quantities.
//
// The GA6 winner reads the first two quantities a prompt names and drops the
// rest without saying so. On every difficulty-4 item it returns a confident
// wrong number -- the same failure class as F012, in the solver promoted to
// stop it, caught only once a level existed that could ask.
//
// M1 and M2 are carried forward unchanged so the comparison is honest: M1 is
// the incumbent that confabulates, M2 the sibling that refuses. M2 is included
// because refusing is a real option and it should be measured rather than
// assumed insufficient.

export const NULLSTAR_GA7_CANDIDATES_VERSION = 'uberbond.nullstar-ga7-candidates.v1';

import { k3CompositionalStrict } from './nullstar-ga5-candidates.mjs';
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

/** Every quantity the prompt names, in order, skipping mentions inside a longer phrase. */
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

/**
 * Fold the named quantities left to right through the operators between them.
 *
 * Three quantities need two operators, and each one sits between the pair it
 * joins. So instead of taking the first two and stopping, this walks every
 * adjacent pair and accumulates. Two quantities is the special case where the
 * walk runs once, which is why this does not need to be a separate path.
 *
 * A prefix operator only governs the first pair -- "the average of a and b,
 * minus c" is (average of a and b) minus c -- so it is looked for in front of
 * the first quantity and only there.
 */
function foldLeftToRight(surface, prompt) {
  const data = surface.data ?? [];
  if (data.length === 0) return null;
  const text = String(prompt ?? '').toLowerCase();
  const q = quantitiesOf(data);
  const named = namedQuantities(text);
  if (named.length === 0) return null;

  const available = new Set(surface.primitives ?? []);
  const report = (value, keys) => (Number.isFinite(value)
    ? { answer: value.toFixed(4), used: [...new Set(keys.flatMap(key => NEEDS[key]))].filter(name => available.has(name)) }
    : null);

  if (named.length === 1) return report(q[named[0].key], [named[0].key]);

  let accumulator = q[named[0].key];
  const usedKeys = [named[0].key];

  for (let i = 1; i < named.length; i += 1) {
    const left = named[i - 1];
    const right = named[i];
    const between = text.slice(left.at + left.phrase.length, right.at);
    // The prefix form governs only the first join.
    const head = i === 1 ? text.slice(0, left.at) : '';

    const operator = OPERATORS.find(entry => (entry.position === 'PREFIX' ? head : between).includes(entry.word));
    // A join this cannot read makes every later value meaningless, so the whole
    // answer is refused rather than the prefix returned as if complete.
    if (!operator) return null;

    accumulator = operator.apply(accumulator, q[right.key]);
    usedKeys.push(right.key);
  }

  return report(accumulator, usedKeys);
}

/**
 * Left-to-right, but respecting a comma as a grouping boundary.
 *
 * "the mean plus the midrange, minus the spread" reads the same folded left to
 * right, but "the mean plus the spread, divided by how many" does not: the
 * comma groups what precedes it, so the division applies to the sum rather than
 * to the spread alone. Left-to-right folding happens to agree with that here,
 * and this candidate exists to find out whether it agrees by luck.
 */
function foldWithClauseGrouping(surface, prompt) {
  const text = String(prompt ?? '').toLowerCase();
  const data = surface.data ?? [];
  if (data.length === 0) return null;

  const commaAt = text.indexOf(',');
  if (commaAt < 0) return foldLeftToRight(surface, prompt);

  const q = quantitiesOf(data);
  const available = new Set(surface.primitives ?? []);

  const head = text.slice(0, commaAt);
  const tail = text.slice(commaAt + 1);

  const headValue = foldLeftToRight(surface, head);
  if (!headValue) return null;

  const tailQuantities = namedQuantities(tail);
  if (tailQuantities.length === 0) return null;

  const operator = OPERATORS.find(entry =>
    entry.position === 'INFIX' && tail.slice(0, tailQuantities[0].at).includes(entry.word));
  if (!operator) return null;

  const value = operator.apply(Number(headValue.answer), q[tailQuantities[0].key]);
  if (!Number.isFinite(value)) return null;

  const keys = [...namedQuantities(head).map(entry => entry.key), tailQuantities[0].key];
  return {
    answer: value.toFixed(4),
    used: [...new Set(keys.flatMap(key => NEEDS[key]))].filter(name => available.has(name))
  };
}

export const GA7_CANDIDATES = Object.freeze({
  M1_TWO_QUANTITY_ONLY: UBERBOND_SOLVERS.INVENTION,
  M2_REFUSE_ON_LEFTOVER: k3CompositionalStrict,
  M3_LEFT_TO_RIGHT_NARY: foldLeftToRight,
  M4_CLAUSE_GROUPED_NARY: foldWithClauseGrouping
});
