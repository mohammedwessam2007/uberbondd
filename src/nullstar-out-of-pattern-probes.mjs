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

/** Probes that gate a promotion. Candidates must never be tuned on these. */
export const GATING_PROBES = Object.freeze({
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
  const surface = { primitives: [...PROBE_SURFACE.primitives], data: [...PROBE_SURFACE.data] };
  const answers = probes.map(probe => {
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
