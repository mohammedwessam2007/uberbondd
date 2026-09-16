// GA4 candidates for the invention family, under the out-of-pattern gate.
//
// The incumbent is GA3's winner. It scores 1.0 on every item the generator
// emits, answers none built from the same parts in a new arrangement, and on
// one of those returns the answer to a different question -- "Report the mean
// plus the midrange" contains "report the mean", so the shorter pattern claims
// the longer sentence.
//
// J1 is the null candidate: one more pattern, nothing else. J2 fixes only the
// substring bug. Both leave the solver a lookup. J3 and J4 compose. If a lookup
// wins, composing was never the gap.

export const NULLSTAR_GA4_CANDIDATES_VERSION = 'uberbond.nullstar-ga4-candidates.v1';

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

const report = (value, needs, surface) => {
  if (!Number.isFinite(value)) return null;
  const available = new Set(surface.primitives ?? []);
  return { answer: value.toFixed(4), used: [...new Set(needs)].filter(name => available.has(name)) };
};

// The phrases that name a quantity, longest first so "the spread between
// largest and smallest" is not shadowed by a shorter fragment of itself.
const QUANTITY_PHRASES = [
  { key: 'spread', phrase: 'spread between largest and smallest' },
  { key: 'size', phrase: 'how many numbers there are' },
  { key: 'midrange', phrase: 'midrange' },
  { key: 'mean', phrase: 'mean' }
];

// ---------------------------------------------------------------------------
// J1. One more pattern. The null candidate.
// ---------------------------------------------------------------------------

const J1_PATTERNS = [
  { test: t => t.includes('average of the mean and the midrange'), value: q => (q.mean + q.midrange) / 2, needs: ['sum', 'count', 'max', 'min'] },
  { test: t => t.includes('mean plus the midrange'), value: q => q.mean + q.midrange, needs: ['sum', 'count', 'max', 'min'] },
  { test: t => t.includes('mean minus the midrange'), value: q => q.mean - q.midrange, needs: ['sum', 'count', 'max', 'min'] },
  { test: t => t.includes('mean divided by the spread'), value: q => (q.spread === 0 ? q.mean : q.mean / q.spread), needs: ['sum', 'count', 'max', 'min'] },
  { test: t => t.includes('spread between largest and smallest, divided by how many'), value: q => q.spread / q.size, needs: ['max', 'min', 'count'] },
  { test: t => t.includes('report the mean'), value: q => q.mean, needs: ['sum', 'count'] }
];

export function j1OneMorePattern(surface, prompt) {
  const data = surface.data ?? [];
  if (data.length === 0) return null;
  const text = String(prompt ?? '').toLowerCase();
  const q = quantitiesOf(data);
  const hit = J1_PATTERNS.find(entry => entry.test(text));
  return hit ? report(hit.value(q), hit.needs, surface) : null;
}

// ---------------------------------------------------------------------------
// J2. Anchored patterns. Fixes the confabulation without composing.
// ---------------------------------------------------------------------------

/**
 * Which quantities the prompt names, in the order it names them.
 *
 * Shared by J2 and the composing candidates: J2 uses it only to notice that a
 * matched pattern left a quantity unexplained, which is what separates a silent
 * wrong answer from a refusal.
 */
function namedQuantities(text) {
  const found = [];
  for (const entry of QUANTITY_PHRASES) {
    const at = text.indexOf(entry.phrase);
    if (at < 0) continue;
    // "mean" inside "...divided by the mean" is a real mention; "mean" inside a
    // longer phrase already claimed is not, so skip anything overlapping a
    // longer match already taken.
    if (found.some(prior => at >= prior.at && at < prior.at + prior.phrase.length)) continue;
    found.push({ ...entry, at });
  }
  return found.sort((a, b) => a.at - b.at);
}

const PATTERN_ACCOUNTS_FOR = {
  'average of the mean and the midrange': ['mean', 'midrange'],
  'mean minus the midrange': ['mean', 'midrange'],
  'mean divided by the spread': ['mean', 'spread'],
  'spread between largest and smallest, divided by how many': ['spread', 'size'],
  'report the mean': ['mean']
};

const J2_PATTERNS = [
  { phrase: 'average of the mean and the midrange', value: q => (q.mean + q.midrange) / 2, needs: ['sum', 'count', 'max', 'min'] },
  { phrase: 'mean minus the midrange', value: q => q.mean - q.midrange, needs: ['sum', 'count', 'max', 'min'] },
  { phrase: 'mean divided by the spread', value: q => (q.spread === 0 ? q.mean : q.mean / q.spread), needs: ['sum', 'count', 'max', 'min'] },
  { phrase: 'spread between largest and smallest, divided by how many', value: q => q.spread / q.size, needs: ['max', 'min', 'count'] },
  { phrase: 'report the mean', value: q => q.mean, needs: ['sum', 'count'] }
];

export function j2AnchoredPatterns(surface, prompt) {
  const data = surface.data ?? [];
  if (data.length === 0) return null;
  const text = String(prompt ?? '').toLowerCase();
  const q = quantitiesOf(data);

  const hit = J2_PATTERNS.find(entry => text.includes(entry.phrase));
  if (!hit) return null;

  // A pattern that explains only part of what was asked has not understood the
  // question. Refusing here is the whole point of this candidate.
  const mentioned = new Set(namedQuantities(text).map(entry => entry.key));
  const accounted = new Set(PATTERN_ACCOUNTS_FOR[hit.phrase] ?? []);
  for (const key of mentioned) {
    if (!accounted.has(key)) return null;
  }
  return report(hit.value(q), hit.needs, surface);
}

// ---------------------------------------------------------------------------
// J3 and J4. Compose from named parts.
// ---------------------------------------------------------------------------

/** The operator joining two named quantities, read from the text between them. */
function operatorBetween(text, first, second) {
  const between = text.slice(first.at, second.at + second.phrase.length);
  if (between.includes('average of')) return (a, b) => (a + b) / 2;
  if (between.includes('plus')) return (a, b) => a + b;
  if (between.includes('minus')) return (a, b) => a - b;
  if (between.includes('divided by')) return (a, b) => (b === 0 ? a : a / b);
  if (between.includes('times')) return (a, b) => a * b;
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
    return { result: report(q[only.key], NEEDS[only.key], surface), mentioned, unaccounted: 0 };
  }

  const [first, second] = mentioned;
  const operator = operatorBetween(text, first, second);
  if (!operator) return { result: null, mentioned, unaccounted: mentioned.length };

  const value = operator(q[first.key], q[second.key]);
  const needs = [...NEEDS[first.key], ...NEEDS[second.key]];
  return { result: report(value, needs, surface), mentioned, unaccounted: mentioned.length - 2 };
}

/** J3. Compose whatever the prompt names. */
export function j3Compositional(surface, prompt) {
  return compose(surface, prompt)?.result ?? null;
}

/**
 * J4. Compose, but refuse when a named quantity is left over.
 *
 * Three quantities joined by two operators is a question this cannot answer,
 * and answering the first two of them would be the same class of mistake the
 * incumbent makes.
 */
export function j4CompositionalStrict(surface, prompt) {
  const outcome = compose(surface, prompt);
  if (!outcome || outcome.unaccounted > 0) return null;
  return outcome.result;
}

export const GA4_CANDIDATES = Object.freeze({
  J1_ONE_MORE_PATTERN: j1OneMorePattern,
  J2_ANCHORED_PATTERNS: j2AnchoredPatterns,
  J3_COMPOSITIONAL: j3Compositional,
  J4_COMPOSITIONAL_STRICT: j4CompositionalStrict
});
