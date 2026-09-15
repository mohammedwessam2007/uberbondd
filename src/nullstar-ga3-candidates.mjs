// GA3 candidates for the invention bottleneck.
//
// The level-3 item names a quantity in the prompt and hands over primitives
// that individually compute none of it. The incumbent always composes the mean
// from sum and count, whatever was asked, so it answers one target in four and
// scores near zero.
//
// I1 is here for a reason GA1 and GA2 got wrong. Both promoted a winner out of
// a three-way tie and both turned out, on a later ablation, to have bought the
// one fix every candidate shared rather than the mechanism under test. So this
// set includes the null candidate: I1 hard-codes a single formula and reads
// nothing. If the prompt-reading candidates cannot beat it, there is no
// attributable capability here and the generation says so.

export const NULLSTAR_GA3_CANDIDATES_VERSION = 'uberbond.nullstar-ga3-candidates.v1';

/** The statistics the primitives can be assembled into, and what each costs. */
const stats = data => {
  const high = Math.max(...data);
  const low = Math.min(...data);
  return {
    mean: { value: data.reduce((a, b) => a + b, 0) / data.length, needs: ['sum', 'count'] },
    midrange: { value: (high + low) / 2, needs: ['max', 'min'] },
    spread: { value: high - low, needs: ['max', 'min'] },
    count: { value: data.length, needs: ['count'] }
  };
};

const fixed = (value, needs) => ({ answer: value.toFixed(4), used: needs });

/**
 * I1. Compute one level-3 formula and ignore the prompt. The null candidate.
 *
 * Not a strawman: it is the minimal change that closes part of the gap, and it
 * is what a tournament without it would have silently been measuring.
 */
export function i1HardcodeOneTarget(surface) {
  const data = surface.data ?? [];
  if (data.length === 0) return null;
  const s = stats(data);
  return fixed((s.mean.value + s.midrange.value) / 2, ['sum', 'count', 'max', 'min']);
}

/**
 * I2. Use all four primitives, still without reading the prompt.
 *
 * Tests whether the gap is arity -- the incumbent reaching for two primitives
 * where the target needs four -- rather than the target being unknown.
 */
export function i2ArityWidened(surface) {
  const data = surface.data ?? [];
  if (data.length === 0) return null;
  const s = stats(data);
  // A composition touching every primitive, chosen without reference to what
  // was asked. If arity were the problem this would do well.
  return fixed((s.mean.value + s.midrange.value + s.spread.value) / 3, ['sum', 'count', 'max', 'min']);
}

/**
 * The quantities a prompt can name, longest phrase first.
 *
 * Order matters: "the spread between largest and smallest, divided by how many
 * numbers there are" contains "the spread between largest and smallest", so a
 * shorter pattern tested first would claim the whole prompt and compute the
 * wrong thing.
 */
const PROMPT_TARGETS = [
  {
    key: 'mean-midrange-average',
    test: text => text.includes('average of the mean and the midrange'),
    compose: s => ({ value: (s.mean.value + s.midrange.value) / 2, needs: [...s.mean.needs, ...s.midrange.needs] })
  },
  {
    key: 'mean-minus-midrange',
    test: text => text.includes('mean minus the midrange'),
    compose: s => ({ value: s.mean.value - s.midrange.value, needs: [...s.mean.needs, ...s.midrange.needs] })
  },
  {
    key: 'mean-over-spread',
    test: text => text.includes('mean divided by the spread'),
    compose: s => ({
      value: s.spread.value === 0 ? s.mean.value : s.mean.value / s.spread.value,
      needs: [...s.mean.needs, ...s.spread.needs]
    })
  },
  {
    key: 'spread-over-count',
    test: text => text.includes('spread between largest and smallest, divided by how many'),
    compose: s => ({ value: s.spread.value / s.count.value, needs: [...s.spread.needs, ...s.count.needs] })
  },
  {
    key: 'mean',
    test: text => text.includes('report the mean'),
    compose: s => ({ value: s.mean.value, needs: s.mean.needs })
  }
];

/**
 * I3. Read the named quantity out of the prompt, then assemble it.
 *
 * The primitives available are fixed; what changes between items is which
 * combination was asked for. So the composition is derived from the question
 * rather than decided in advance.
 */
export function i3PromptDirected(surface, prompt) {
  const data = surface.data ?? [];
  if (data.length === 0) return null;
  const text = String(prompt ?? '').toLowerCase();
  const s = stats(data);

  const target = PROMPT_TARGETS.find(entry => entry.test(text));
  if (!target) return null;

  const { value, needs } = target.compose(s);
  const available = new Set(surface.primitives ?? []);
  // Reporting a primitive the surface never offered would be claiming a route
  // that does not exist.
  const used = [...new Set(needs)].filter(name => available.has(name));
  return fixed(value, used);
}

/**
 * I4. Build the composition out of parts rather than matching a whole phrase.
 *
 * I3 recognises complete formulas, so a prompt combining known quantities in an
 * unseen way defeats it. This finds which quantities the prompt mentions and
 * which operation joins them, which is the same capability at a smaller grain.
 */
export function i4CompositionalSearch(surface, prompt) {
  const data = surface.data ?? [];
  if (data.length === 0) return null;
  const text = String(prompt ?? '').toLowerCase();
  const s = stats(data);

  const NAMES = [
    { key: 'midrange', phrase: 'midrange' },
    { key: 'spread', phrase: 'spread between largest and smallest' },
    { key: 'count', phrase: 'how many numbers there are' },
    { key: 'mean', phrase: 'mean' }
  ];

  // Mentioned quantities, in the order the prompt names them, so "a minus b"
  // does not silently become "b minus a".
  const mentioned = NAMES
    .map(entry => ({ ...entry, at: text.indexOf(entry.phrase) }))
    .filter(entry => entry.at >= 0)
    .sort((a, b) => a.at - b.at);

  if (mentioned.length === 0) return null;

  const needs = [...new Set(mentioned.flatMap(entry => s[entry.key].needs))];
  const available = new Set(surface.primitives ?? []);
  const used = needs.filter(name => available.has(name));

  if (mentioned.length === 1) return fixed(s[mentioned[0].key].value, used);

  const [first, second] = mentioned;
  const a = s[first.key].value;
  const b = s[second.key].value;

  // The operator is named between the two quantities, not anywhere in the
  // sentence: "the mean divided by the spread" and "the average of the mean and
  // the midrange" both contain other words that would mislead a global search.
  const between = text.slice(first.at, second.at + second.phrase.length);
  if (between.includes('average of')) return fixed((a + b) / 2, used);
  if (between.includes('minus')) return fixed(a - b, used);
  if (between.includes('divided by')) return fixed(b === 0 ? a : a / b, used);
  if (between.includes('plus')) return fixed(a + b, used);
  return null;
}

export const GA3_CANDIDATES = Object.freeze({
  I1_HARDCODE_ONE_TARGET: i1HardcodeOneTarget,
  I2_ARITY_WIDENED: i2ArityWidened,
  I3_PROMPT_DIRECTED: i3PromptDirected,
  I4_COMPOSITIONAL_SEARCH: i4CompositionalSearch
});
