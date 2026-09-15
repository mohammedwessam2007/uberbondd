// Items a generation's candidates were not selected on, and cannot have been.
//
// GA3 promoted a solver that answers every question its generator asks and
// none built from the same parts in a new arrangement -- and on one of those it
// did not refuse, it returned the answer to a different question. The
// tournament could not have caught this: every item it scored was in-pattern by
// construction, so the selection pressure ran toward matching phrases rather
// than composing.
//
// These probes exist outside the generator for that reason. They reuse its
// primitives and its phrasing conventions and change only the combination,
// which is the narrowest step outside a training distribution available. A
// candidate that handles the generator and fails these has learned the
// generator.
//
// Two rules keep them honest. They are never scored into the headline mean --
// they gate, they do not inflate. And the set used to gate a promotion is held
// back from the set used to report generalization afterwards, so a candidate
// cannot be tuned against the probe that judges it and then be congratulated by
// the same items.

export const NULLSTAR_OUT_OF_PATTERN_PROBES_VERSION = 'uberbond.nullstar-out-of-pattern-probes.v1';

const DATA = [6, 13, 3, 18, 8, 12];

const quantities = data => {
  const high = Math.max(...data);
  const low = Math.min(...data);
  return {
    mean: data.reduce((a, b) => a + b, 0) / data.length,
    midrange: (high + low) / 2,
    spread: high - low,
    size: data.length
  };
};

const q = quantities(DATA);

// ---------------------------------------------------------------------------
// FORECASTING and RESEARCH.
//
// The invention probes exist because GA3's winner was caught being a lookup.
// GA1 and GA2 were never caught, but they were never cleared either: both
// promoted out of a three-way tie, and an ablation afterwards showed a minimal
// fix matching the winner in each case. F010 records them as unattributable and
// stays open.
//
// These cannot make those tournaments attributable -- a tournament is
// undiscriminating or it is not, and no test run afterwards changes what it
// separated. What they can do is answer the question underneath: whether the
// promoted solvers are actually better than the minimal fixes they tied, on
// items neither was selected against.
// ---------------------------------------------------------------------------

const FORECAST_PROBES_GATING = [
  {
    id: 'cubic-series',
    // The generator emits constant first and second differences and nothing
    // else. A solver that walks to whatever order goes constant answers this;
    // one that hard-codes the two orders the generator uses cannot.
    surface: { series: [1, 8, 27, 64, 125] },
    groundTruth: '216',
    whyIncluded: 'A third-order series. The generator never emits one.'
  },
  {
    id: 'alternating-constant-second-difference',
    surface: { series: [5, 6, 9, 14, 21] },
    groundTruth: '30',
    whyIncluded: 'Second difference constant at 2, but starting from a first difference of 1 rather than the generator\'s shapes.'
  },
  {
    id: 'flat-series',
    surface: { series: [7, 7, 7, 7] },
    groundTruth: '7',
    whyIncluded: 'Zero first difference. Degenerate, and a solver dividing or searching carelessly can miss it.'
  }
];

const FORECAST_PROBES_REPORTING = [
  { id: 'quartic-series', surface: { series: [1, 16, 81, 256, 625, 1296] }, groundTruth: '2401' },
  { id: 'descending-linear', surface: { series: [20, 17, 14, 11] }, groundTruth: '8' },
  { id: 'second-difference-negative', surface: { series: [10, 14, 16, 16, 14] }, groundTruth: '10' }
];

const RESEARCH_PROBES_GATING = [
  {
    id: 'fresh-secondhand-beats-stale-primary',
    // The case GA2's declaration named as its own hypothesis and the generator
    // never builds: no replication present, so a ladder that simply learned
    // REPLICATED_MEASUREMENT has nothing to reach for.
    surface: {
      sources: [
        { claim: '41', quality: 'PRIMARY_MEASUREMENT', observedAt: '2015-03-01' },
        { claim: '58', quality: 'SECONDHAND_SUMMARY', observedAt: '2026-08-01' },
        { claim: '58', quality: 'SECONDHAND_SUMMARY', observedAt: '2026-08-14' }
      ]
    },
    groundTruth: '58',
    whyIncluded: 'Eleven years of staleness against a corroborated recent summary, with no replication to shortcut the ranking.'
  },
  {
    id: 'recent-primary-beats-recent-assertion',
    surface: {
      sources: [
        { claim: '12', quality: 'UNSOURCED_ASSERTION', observedAt: '2026-09-01' },
        { claim: '19', quality: 'PRIMARY_MEASUREMENT', observedAt: '2026-08-28' }
      ]
    },
    groundTruth: '19',
    whyIncluded: 'The opposite direction. A solver that overcorrected into recency-only fails this, and recency-only was disqualified in GA2 for exactly that.'
  },
  {
    id: 'single-source',
    surface: { sources: [{ claim: '33', quality: 'SECONDHAND_SUMMARY', observedAt: '2026-01-01' }] },
    groundTruth: '33',
    whyIncluded: 'One source of middling quality. There is nothing to rank, and the answer is still the answer.'
  }
];

const RESEARCH_PROBES_REPORTING = [
  {
    id: 'stale-replication-against-fresh-primary',
    surface: {
      sources: [
        { claim: '4', quality: 'REPLICATED_MEASUREMENT', observedAt: '2012-06-01' },
        { claim: '9', quality: 'PRIMARY_MEASUREMENT', observedAt: '2026-09-01' }
      ]
    },
    groundTruth: '9'
  },
  {
    id: 'all-equally-stale',
    surface: {
      sources: [
        { claim: '2', quality: 'UNSOURCED_ASSERTION', observedAt: '2020-01-01' },
        { claim: '77', quality: 'PRIMARY_MEASUREMENT', observedAt: '2020-01-01' },
        { claim: '2', quality: 'SECONDHAND_SUMMARY', observedAt: '2020-01-01' }
      ]
    },
    groundTruth: '77'
  },
  {
    id: 'two-primaries-disagree',
    surface: {
      sources: [
        { claim: '100', quality: 'PRIMARY_MEASUREMENT', observedAt: '2019-01-01' },
        { claim: '140', quality: 'PRIMARY_MEASUREMENT', observedAt: '2026-06-01' }
      ]
    },
    groundTruth: '140'
  }
];

/** Probes that gate a promotion. Candidates must never be tuned on these. */
export const GATING_PROBES = Object.freeze({
  FORECASTING: Object.freeze(FORECAST_PROBES_GATING),
  RESEARCH: Object.freeze(RESEARCH_PROBES_GATING),
  INVENTION: Object.freeze([
    {
      id: 'mean-plus-midrange',
      prompt: 'Report the mean plus the midrange. No primitive computes it; compose one.',
      groundTruth: (q.mean + q.midrange).toFixed(4),
      // The one GA3's winner got wrong by answering a different question: this
      // prompt contains the substring "report the mean".
      whyIncluded: 'A longer prompt containing a shorter pattern. Substring matching answers the shorter one.'
    },
    {
      id: 'midrange-minus-mean',
      prompt: 'Report the midrange minus the mean. No primitive computes it; compose one.',
      groundTruth: (q.midrange - q.mean).toFixed(4),
      whyIncluded: 'The generator only ever asks for mean minus midrange. Order matters and a solver that ignores it gets the sign wrong.'
    },
    {
      id: 'spread-over-mean',
      prompt: 'Report the spread between largest and smallest divided by the mean. No primitive computes it; compose one.',
      groundTruth: (q.spread / q.mean).toFixed(4),
      whyIncluded: 'Both quantities appear in the generator, joined by an operator the generator never uses between them.'
    }
  ])
});

/** Probes held back for reporting. Never used to gate, so never trained against. */
export const REPORTING_PROBES = Object.freeze({
  FORECASTING: Object.freeze(FORECAST_PROBES_REPORTING),
  RESEARCH: Object.freeze(RESEARCH_PROBES_REPORTING),
  INVENTION: Object.freeze([
    {
      id: 'midrange-plus-spread',
      prompt: 'Report the midrange plus the spread between largest and smallest. No primitive computes it; compose one.',
      groundTruth: (q.midrange + q.spread).toFixed(4)
    },
    {
      id: 'mean-minus-spread',
      prompt: 'Report the mean minus the spread between largest and smallest. No primitive computes it; compose one.',
      groundTruth: (q.mean - q.spread).toFixed(4)
    },
    {
      id: 'midrange-over-count',
      prompt: 'Report the midrange divided by how many numbers there are. No primitive computes it; compose one.',
      groundTruth: (q.midrange / q.size).toFixed(4)
    }
  ])
});

export const PROBE_SURFACE = Object.freeze({
  primitives: Object.freeze(['sum', 'count', 'max', 'min']),
  data: Object.freeze([...DATA])
});

/**
 * Run a solver against a probe set.
 *
 * Refusing and answering wrongly are counted apart on purpose. A mean treats
 * them the same, and they are not the same: a solver that returns nothing when
 * it cannot compose is behaving correctly at the edge of its competence, while
 * one that returns a confident number for a question it did not understand is
 * the failure the whole apparatus exists to catch.
 */
export function runProbes(solver, probes) {
  // Invention probes all share one surface and differ only in the prompt.
  // Forecasting and research probes carry their own, because for those families
  // the surface IS the question.
  const defaultSurface = { primitives: [...PROBE_SURFACE.primitives], data: [...PROBE_SURFACE.data] };
  const answers = probes.map(probe => {
    const surface = probe.surface
      ? JSON.parse(JSON.stringify(probe.surface))
      : defaultSurface;
    let response = null;
    try {
      response = solver(surface, probe.prompt);
    } catch {
      response = null;
    }
    const given = response?.answer ?? (typeof response === 'string' ? response : null);
    return {
      id: probe.id,
      expected: probe.groundTruth,
      given: given ?? null,
      correct: given === probe.groundTruth,
      refused: given === null || given === undefined
    };
  });

  const correct = answers.filter(row => row.correct).length;
  const refused = answers.filter(row => row.refused).length;
  const confabulated = answers.filter(row => !row.correct && !row.refused).length;

  return {
    of: answers.length,
    correct,
    refused,
    confabulated,
    correctRate: answers.length ? Number((correct / answers.length).toFixed(4)) : 0,
    answers
  };
}

/**
 * Whether a candidate may be promoted on out-of-pattern behaviour.
 *
 * Confabulation is disqualifying at any score. A solver that cannot compose is
 * usable; one that answers a question nobody asked is not, because nothing
 * downstream can tell its wrong answers from its right ones.
 */
export function gateVerdict(result, { minimumCorrectRate = 0 } = {}) {
  if (result.confabulated > 0) {
    return {
      passes: false,
      reason: `CONFABULATES__${result.confabulated}_OF_${result.of}_ANSWERED_A_DIFFERENT_QUESTION`
    };
  }
  if (result.correctRate < minimumCorrectRate) {
    return {
      passes: false,
      reason: `BELOW_OUT_OF_PATTERN_MINIMUM__${result.correctRate}_UNDER_${minimumCorrectRate}`
    };
  }
  return { passes: true, reason: null };
}
