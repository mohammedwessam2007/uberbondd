// GA1 candidates for the forecasting bottleneck.
//
// The incumbent tests one hypothesis -- a constant first difference -- and
// returns null for anything else. These are four materially different
// mechanisms rather than four tunings of that one, because retrying the same
// mechanism with cosmetic changes is how a generation gets spent learning
// nothing.
//
// Every candidate receives the surface only. None may branch on a task id or a
// seed, and none may be tuned on the held-out seeds.

export const NULLSTAR_GA1_CANDIDATES_VERSION = 'uberbond.nullstar-ga1-candidates.v1';

const differences = series => series.slice(1).map((value, i) => value - series[i]);
const allEqual = list => list.length > 0 && list.every(value => value === list[0]);

/**
 * C1. Take successive differences until one order is constant, then build the
 * next term back up through the same orders.
 *
 * This generalises the incumbent instead of replacing it: order 1 is the case
 * the incumbent already handled.
 */
export function c1PolynomialDifference(surface) {
  const series = (surface.series ?? []).map(Number);
  if (series.length < 3) return null;

  let level = series;
  const lastOfEachOrder = [];
  for (let order = 0; order < series.length - 1; order += 1) {
    lastOfEachOrder.push(level[level.length - 1]);
    const next = differences(level);
    if (next.length === 0) return null;
    if (allEqual(next)) {
      // Rebuild: the next term is the running sum back up through the orders.
      let carry = next[0];
      for (let i = lastOfEachOrder.length - 1; i >= 0; i -= 1) carry += lastOfEachOrder[i];
      return String(carry);
    }
    level = next;
  }
  return null;
}

/**
 * C2. Enumerate a fixed set of candidate rules, keep the ones consistent with
 * every observed term, and refuse when more than one survives.
 *
 * Refusing on ambiguity is the point: a rule that fits six terms two different
 * ways has not been identified.
 */
export function c2HypothesisTournament(surface) {
  const series = (surface.series ?? []).map(Number);
  if (series.length < 3) return null;

  const rules = [
    { id: 'linear', fit: s => { const step = s[1] - s[0]; return s.every((v, i) => i === 0 || v - s[i - 1] === step) ? () => s[s.length - 1] + step : null; } },
    { id: 'quadratic', fit: s => {
      const first = differences(s);
      const second = differences(first);
      if (!allEqual(second)) return null;
      return () => s[s.length - 1] + first[first.length - 1] + second[0];
    } },
    { id: 'geometric', fit: s => {
      if (s.some(v => v === 0)) return null;
      const ratio = s[1] / s[0];
      return s.every((v, i) => i === 0 || v / s[i - 1] === ratio) ? () => s[s.length - 1] * ratio : null;
    } },
    { id: 'constant', fit: s => (allEqual(s) ? () => s[0] : null) }
  ];

  const survivors = rules.map(rule => ({ id: rule.id, predict: rule.fit(series) })).filter(row => row.predict);
  if (survivors.length === 0) return null;
  // Several rules agreeing on the same next value is not ambiguity.
  const predictions = [...new Set(survivors.map(row => String(row.predict())))];
  if (predictions.length > 1) return null;
  return predictions[0];
}

/**
 * C3. Search for a linear recurrence over the last k terms.
 *
 * A different representational commitment: rather than assuming polynomial
 * structure, assume each term is a fixed combination of its predecessors.
 */
export function c3RecurrenceSearch(surface) {
  const series = (surface.series ?? []).map(Number);
  if (series.length < 4) return null;

  // k = 2 covers both linear-with-offset and Fibonacci-like structure.
  for (const k of [1, 2]) {
    for (let a = -3; a <= 3; a += 1) {
      for (let b = -3; b <= 3; b += 1) {
        for (let offset = -30; offset <= 30; offset += 1) {
          const predict = i => (k === 1 ? a * series[i - 1] + offset : a * series[i - 1] + b * series[i - 2] + offset);
          let fits = true;
          for (let i = k; i < series.length; i += 1) {
            if (predict(i) !== series[i]) { fits = false; break; }
          }
          if (fits) {
            const n = series.length;
            return String(k === 1 ? a * series[n - 1] + offset : a * series[n - 1] + b * series[n - 2] + offset);
          }
        }
      }
    }
  }
  return null;
}

/**
 * C4. Try additive and multiplicative structure side by side and take whichever
 * is exactly consistent.
 *
 * The narrowest of the four. Included because a candidate set where every
 * member is sophisticated cannot show that sophistication was what mattered.
 */
export function c4RatioAndDifference(surface) {
  const series = (surface.series ?? []).map(Number);
  if (series.length < 2) return null;

  const step = series[1] - series[0];
  if (series.every((v, i) => i === 0 || v - series[i - 1] === step)) return String(series[series.length - 1] + step);

  if (!series.some(v => v === 0)) {
    const ratio = series[1] / series[0];
    if (series.every((v, i) => i === 0 || v / series[i - 1] === ratio)) return String(series[series.length - 1] * ratio);
  }
  return null;
}

export const GA1_CANDIDATES = Object.freeze({
  C1_POLYNOMIAL_DIFFERENCE: c1PolynomialDifference,
  C2_HYPOTHESIS_TOURNAMENT: c2HypothesisTournament,
  C3_RECURRENCE_SEARCH: c3RecurrenceSearch,
  C4_RATIO_AND_DIFFERENCE: c4RatioAndDifference
});
