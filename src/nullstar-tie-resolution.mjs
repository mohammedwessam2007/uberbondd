// What to do when candidates tie.
//
// A tie-break decides which implementation ships, and twice it decided on
// something carrying no information about behaviour.
//
// GA6 had three candidates at 1.0 and chose L2 over L3 because L2 was smaller.
// L2 turned out to confabulate on every difficulty-4 item while L3 refused
// cleanly, and nothing found that until a level existed which could ask.
// GA7 had two at 1.0 and chose M3 over M4 on registration order, because the
// size heuristic could not measure either. Checking by hand afterwards showed
// M4 silently drops trailing operations.
//
// Both times the tie meant the instrument could not separate them, and both
// times they were separable -- just not by anything the tournament ran. The
// second time it was only luck that the better one won.
//
// So a tie is treated as what it is: an unresolved question. Before size or
// ordering decides anything, the tied candidates are run against each other.
// If they disagree anywhere, they are not interchangeable and no tie-break
// available to the tournament can choose between them on evidence, so the
// honest outcome is that nothing is promoted. If they agree everywhere
// measurable, any of them will do and the cheapest rule is fine.

export const NULLSTAR_TIE_RESOLUTION_VERSION = 'uberbond.nullstar-tie-resolution.v1';

/**
 * Run tied candidates against each other and report where they differ.
 *
 * Dependencies are injected rather than imported so this can be tested with
 * fixtures instead of a whole generation.
 */
export function separability({
  candidates = [],
  family = null,
  probes = [],
  items = [],
  runProbes = null,
  scoreItem = null,
  baseSolvers = {},
  maxDisagreements = 6
} = {}) {
  if (candidates.length < 2) {
    return { separable: false, disagreements: [], comparisons: 0, verdict: 'NOTHING_TO_COMPARE' };
  }

  const disagreements = [];
  let comparisons = 0;

  const differ = values => new Set(values.map(value => JSON.stringify(value ?? null))).size > 1;
  const label = values => Object.fromEntries(candidates.map((entry, i) => [entry.name, values[i] ?? null]));

  if (runProbes) {
    for (const probe of probes) {
      comparisons += 1;
      const answers = candidates.map(entry => {
        try {
          return runProbes(entry.solver, [probe]).answers[0].given;
        } catch {
          // A thrown solver is a behaviour too, and a different one from
          // answering. Recording it as such keeps a crash from reading as
          // agreement.
          return '__THREW__';
        }
      });
      if (differ(answers)) disagreements.push({ on: `probe:${probe.id}`, answers: label(answers) });
    }
  }

  if (scoreItem && family) {
    for (const item of items) {
      comparisons += 1;
      const answers = candidates.map(entry => {
        try {
          return scoreItem(item, { ...baseSolvers, [family]: entry.solver }).response ?? null;
        } catch {
          return '__THREW__';
        }
      });
      if (differ(answers)) {
        disagreements.push({ on: `item:${item.taskId}`, answers: label(answers) });
        // One disagreement inside the generated set is enough to establish the
        // point; listing hundreds would bury it.
        break;
      }
    }
  }

  const separable = disagreements.length > 0;
  return {
    separable,
    comparisons,
    disagreements: disagreements.slice(0, maxDisagreements),
    verdict: separable
      ? 'TIED_CANDIDATES_BEHAVE_DIFFERENTLY__NO_TIE_BREAK_CAN_CHOOSE_ON_EVIDENCE_THE_TOURNAMENT_HAS'
      : 'TIED_CANDIDATES_AGREE_EVERYWHERE_MEASURED__INTERCHANGEABLE_HERE'
  };
}
