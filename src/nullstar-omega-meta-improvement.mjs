// Section 310. Measure the improvement process, not the thing it improves.
//
// A generation series that keeps scoring 1.0 tells you nothing about whether
// the machinery choosing what to fix is any good. The question here is
// narrower and harder to fake: when the bottleneck engine named a symptom and
// the next generation was built in response, did that symptom actually go
// away?
//
// A process that names a bottleneck, acts, and sees the same symptom again is
// not improving, however much other activity happened in between.

export const NULLSTAR_OMEGA_META_IMPROVEMENT_VERSION = 'uberbond.nullstar-omega-meta-improvement.v1';

// Each symptom has to come with a machine-checkable resolution or the verdict
// degenerates into reading the symptom prose sympathetically.
export const SYMPTOM_KINDS = Object.freeze({
  // Every measured dimension sits at the ceiling. Resolved only when the
  // measured values spread apart -- not when more ceiling-scoring dimensions
  // are added.
  INSTRUMENT_SATURATED: 'INSTRUMENT_SATURATED',
  // Too few dimensions measured. Resolved when the measured count rises.
  COVERAGE_INSUFFICIENT: 'COVERAGE_INSUFFICIENT',
  // The aggregate has not moved. Resolved when it moves in either direction.
  NO_MOVEMENT: 'NO_MOVEMENT'
});

// Evidence recorded before the successor existed is worth more than evidence
// assembled afterwards, and the difference has to survive into the verdict.
export const EPISODE_EVIDENCE_CLASSES = Object.freeze({
  PROSPECTIVE: 'PROSPECTIVE',
  RETROSPECTIVE_RECONSTRUCTION: 'RETROSPECTIVE_RECONSTRUCTION'
});

// The rule each symptom kind is actually judged by.
//
// A declaration that states its criterion in prose can drift from the kind it
// commits to, and the kind is what decides. That happened: the stale-readings
// declaration wrote a criterion about how the mean is computed and committed
// the kind INSTRUMENT_SATURATED, whose rule asks whether the scores separated.
// The two did not agree, the committed kind won, and a real fix scored as a
// persistence. Quoting the rule at declaration time is what stops the drift.
export const RESOLUTION_RULES = Object.freeze({
  INSTRUMENT_SATURATED: 'Resolved only if the spread between the measured scores is wider than before. Coverage growth does not resolve it.',
  COVERAGE_INSUFFICIENT: 'Resolved only if the count of measured dimensions rises. Score movement does not resolve it.',
  NO_MOVEMENT: 'Resolved only if the mean of the measured scores changes in either direction.'
});

/**
 * The rule a symptom kind will be judged by, so a declaration can quote it
 * rather than paraphrase it.
 */
export function resolutionRuleFor(symptomKind) {
  return RESOLUTION_RULES[String(symptomKind ?? '')] ?? null;
}

/**
 * Check a declaration before its successor is built.
 *
 * The point is to fail at declaration time, when the answer is still unknown
 * and correcting the kind costs nothing, rather than at scoring time when
 * correcting it would be retrofitting.
 */
export function validateDeclaration({ symptomKind = null, statedResolutionRule = null } = {}) {
  const rule = resolutionRuleFor(symptomKind);
  if (!rule) {
    return {
      ok: false,
      status: 'DECLARATION_INVALID',
      reasonCodes: ['known-symptom-kind-required'],
      knownKinds: Object.keys(RESOLUTION_RULES),
      businessEffectAuthority: 'NONE'
    };
  }
  const stated = String(statedResolutionRule ?? '').trim();
  if (stated !== rule) {
    return {
      ok: false,
      status: 'DECLARATION_CRITERION_DOES_NOT_MATCH_THE_COMMITTED_SYMPTOM_KIND',
      reasonCodes: ['stated-rule-must-match-the-rule-the-symptom-kind-is-judged-by'],
      symptomKind,
      statedResolutionRule: stated || null,
      ruleThatWillBeApplied: rule,
      note: 'The symptom kind decides the score. A criterion that says something else will not be the one applied.',
      businessEffectAuthority: 'NONE'
    };
  }
  return {
    ok: true,
    status: 'DECLARATION_VALID',
    symptomKind,
    ruleThatWillBeApplied: rule,
    businessEffectAuthority: 'NONE'
  };
}

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

const measured = vector => Object.entries(vector && typeof vector === 'object' ? vector : {})
  .filter(([, score]) => Number.isFinite(score))
  .map(([dimension, score]) => ({ dimension, score: Number(score) }));

const spread = rows => (rows.length < 2 ? 0 : Math.max(...rows.map(r => r.score)) - Math.min(...rows.map(r => r.score)));

const mean = rows => (rows.length === 0 ? null : rows.reduce((sum, r) => sum + r.score, 0) / rows.length);

/**
 * One episode: a bottleneck was named at `generation`, work happened, and the
 * successor generation was measured. Did the named symptom resolve?
 */
export function evaluateSelectionEpisode({
  generation = null,
  successorGeneration = null,
  bottleneckId = null,
  symptomKind = null,
  beforeVector = null,
  afterVector = null,
  evidenceClass = EPISODE_EVIDENCE_CLASSES.RETROSPECTIVE_RECONSTRUCTION
} = {}) {
  const reasonCodes = [];
  if (!generation) reasonCodes.push('generation-required');
  if (!successorGeneration) reasonCodes.push('successor-generation-required');
  if (!bottleneckId) reasonCodes.push('bottleneck-id-required');
  if (!Object.hasOwn(SYMPTOM_KINDS, String(symptomKind ?? ''))) reasonCodes.push('known-symptom-kind-required');
  if (!Object.hasOwn(EPISODE_EVIDENCE_CLASSES, String(evidenceClass ?? ''))) reasonCodes.push('known-evidence-class-required');

  const before = measured(beforeVector);
  const after = measured(afterVector);
  if (before.length === 0) reasonCodes.push('before-vector-must-measure-something');
  if (reasonCodes.length) return fail('EPISODE_INVALID', reasonCodes);

  // The successor may simply not have measured the dimension the symptom was
  // about. That is untested, which is neither resolution nor persistence.
  if (after.length === 0) {
    return {
      ok: true,
      status: 'SYMPTOM_UNTESTED',
      generation,
      successorGeneration,
      bottleneckId,
      symptomKind,
      evidenceClass,
      note: 'The successor measured nothing, so the symptom was neither resolved nor reproduced.',
      businessEffectAuthority: 'NONE'
    };
  }

  const beforeSpread = spread(before);
  const afterSpread = spread(after);
  const beforeMean = mean(before);
  const afterMean = mean(after);

  let resolved = false;
  let why = '';
  if (symptomKind === SYMPTOM_KINDS.INSTRUMENT_SATURATED) {
    // Widening a saturated instrument is the tempting non-fix: coverage goes
    // up, the picture looks busier, and every new reading is still at the
    // ceiling. Only separation counts.
    resolved = afterSpread > beforeSpread;
    why = resolved
      ? `Measured scores separated: spread ${beforeSpread} to ${afterSpread}.`
      : `Scores are still flat at spread ${afterSpread}. Coverage moved from ${before.length} to ${after.length} dimensions, which is not the same as the instrument separating.`;
  } else if (symptomKind === SYMPTOM_KINDS.COVERAGE_INSUFFICIENT) {
    resolved = after.length > before.length;
    why = resolved
      ? `Measured dimensions rose from ${before.length} to ${after.length}.`
      : `Measured dimensions did not rise: ${before.length} to ${after.length}.`;
  } else {
    resolved = beforeMean !== afterMean;
    why = resolved
      ? `Aggregate moved from ${beforeMean} to ${afterMean}.`
      : `Aggregate did not move from ${beforeMean}.`;
  }

  // Something may have changed that the bottleneck never named. That is worth
  // separating from a clean resolution, because crediting it would let any
  // activity count as a successful diagnosis.
  const movedElsewhere = !resolved
    && (after.length !== before.length || afterMean !== beforeMean);

  return {
    ok: true,
    status: resolved ? 'SYMPTOM_RESOLVED' : movedElsewhere ? 'MOVED_ELSEWHERE' : 'SYMPTOM_PERSISTED',
    generation,
    successorGeneration,
    bottleneckId,
    symptomKind,
    evidenceClass,
    beforeCoverage: before.length,
    afterCoverage: after.length,
    beforeSpread,
    afterSpread,
    beforeMean,
    afterMean,
    why,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Verdict over the episodes.
 *
 * Deliberately hard to pass. One episode is an anecdote. Retrospective
 * episodes can show a process failing -- the symptom either came back or it
 * did not -- but they cannot show it succeeding, because the symptom kind was
 * chosen with the successor already visible.
 */
export function metaImprovementVerdict(episodes = []) {
  const rows = (Array.isArray(episodes) ? episodes : []).filter(row => row?.ok);
  if (rows.length < 2) {
    return {
      ok: true,
      status: 'META_IMPROVEMENT_NOT_ESTABLISHED',
      reason: 'fewer-than-two-completed-selection-episodes',
      episodes: rows.length,
      businessEffectAuthority: 'NONE'
    };
  }

  const resolved = rows.filter(row => row.status === 'SYMPTOM_RESOLVED');
  const persisted = rows.filter(row => row.status === 'SYMPTOM_PERSISTED');
  const elsewhere = rows.filter(row => row.status === 'MOVED_ELSEWHERE');
  const untested = rows.filter(row => row.status === 'SYMPTOM_UNTESTED');
  const prospective = rows.filter(row => row.evidenceClass === EPISODE_EVIDENCE_CLASSES.PROSPECTIVE);

  // A named symptom either resolved or it did not. MOVED_ELSEWHERE says why it
  // did not -- something shifted that the bottleneck never named -- and that is
  // worth recording, but it cannot rescue the verdict.
  //
  // This was a live loophole. The G4->G5 episode flipped from SYMPTOM_PERSISTED
  // to MOVED_ELSEWHERE when a later generation recomputed one of its own
  // dimension scores, which moved the mean without measuring anything new, and
  // the verdict climbed back to working on that bookkeeping change alone. Any
  // generation could dodge a persistence by nudging an unrelated number.
  const unresolved = persisted.length + elsewhere.length;

  // The failing verdict is reachable from retrospective evidence. The passing
  // one is not.
  if (persisted.length === rows.length) {
    return {
      ok: true,
      status: 'IMPROVEMENT_PROCESS_NOT_WORKING',
      episodes: rows.length,
      resolved: 0,
      persisted: persisted.length,
      movedElsewhere: 0,
      untested: 0,
      prospectiveEpisodes: prospective.length,
      finding: 'Every named symptom survived the work done in response to it.',
      truthBoundary: 'THIS SAYS THE SELECTIONS DID NOT RESOLVE WHAT THEY NAMED. IT DOES NOT SAY THE WORK WAS WORTHLESS.',
      businessEffectAuthority: 'NONE'
    };
  }

  const status = prospective.length >= 2 && resolved.length > unresolved
    ? 'IMPROVEMENT_PROCESS_WORKING'
    : 'META_IMPROVEMENT_NOT_ESTABLISHED';

  return {
    ok: true,
    status,
    episodes: rows.length,
    resolved: resolved.length,
    persisted: persisted.length,
    movedElsewhere: elsewhere.length,
    untested: untested.length,
    prospectiveEpisodes: prospective.length,
    unresolved,
    reason: status === 'META_IMPROVEMENT_NOT_ESTABLISHED'
      ? 'a-working-verdict-needs-at-least-two-prospective-episodes-and-more-resolutions-than-non-resolutions'
      : null,
    truthBoundary: 'A PROCESS THAT RESOLVES ITS OWN NAMED SYMPTOMS IS WORKING ON ITS OWN TERMS. THAT IS NOT THE SAME AS THE SYSTEM GETTING MORE CAPABLE.',
    businessEffectAuthority: 'NONE'
  };
}
