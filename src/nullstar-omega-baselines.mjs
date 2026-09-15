// The baselines a capability score has to beat before it means anything.
//
// The previous generations carried B0 through B5 as null. A score with no
// comparator is a number, not a result: "UberBond answered 7 of 7" says
// nothing until you know what answering nothing clever would have scored.
//
// So every baseline must be present, and a baseline that genuinely cannot run
// must say why in a form someone else can check and eventually clear. An
// unexplained null is refused.

export const NULLSTAR_OMEGA_BASELINES_VERSION = 'uberbond.nullstar-omega-baselines.v1';

export const BASELINE_DEFINITIONS = Object.freeze({
  B0: 'Trivial non-model baseline. No capability at all -- a fixed answer, steelmanned by taking the best-scoring constant rather than a deliberately bad one.',
  B1: 'Raw frontier model with no UberBond harness, minimal necessary context, no tools.',
  B2: 'Strongest available single-model configuration.',
  B3: 'Reasonable multi-agent or role-separated baseline, built competently rather than crippled.',
  B4: 'Previous canonical UberBond at a frozen ancestor commit, same suite.',
  B5: 'Current UberBond at the exact head.'
});

export const BASELINE_IDS = Object.freeze(Object.keys(BASELINE_DEFINITIONS));

export const BASELINE_STATUSES = Object.freeze([
  'EXECUTED',
  'BLOCKED_EXTERNAL',
  'BLOCKED_AUTHORITY',
  'NOT_APPLICABLE'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

/**
 * Record one baseline.
 *
 * An executed baseline needs a score and what it was scored on. A blocked one
 * needs the four fields that turn "blocked" into something actionable: what
 * the dependency is, what was actually attempted, and what would clear it.
 * "Blocked" on its own is the null this exists to prevent.
 */
export function recordBaseline({
  id = null,
  status = null,
  score = null,
  tasksAttempted = null,
  tasksCorrect = null,
  method = null,
  reason = null,
  blockingDependency = null,
  whatWasTried = null,
  nextUnblockCondition = null,
  cost = null
} = {}) {
  const reasonCodes = [];
  const baselineId = text(id, 10);
  if (!baselineId || !BASELINE_IDS.includes(baselineId)) reasonCodes.push('known-baseline-id-required');
  if (!BASELINE_STATUSES.includes(String(status ?? ''))) reasonCodes.push('known-baseline-status-required');

  if (status === 'EXECUTED') {
    const n = Number(tasksAttempted);
    const correct = Number(tasksCorrect);
    if (!Number.isInteger(n) || n <= 0) reasonCodes.push('an-executed-baseline-must-say-how-many-tasks-it-attempted');
    if (!Number.isInteger(correct) || correct < 0) reasonCodes.push('an-executed-baseline-must-say-how-many-it-got-right');
    if (Number.isInteger(n) && Number.isInteger(correct) && correct > n) reasonCodes.push('correct-cannot-exceed-attempted');
    if (!text(method, 1000)) reasonCodes.push('an-executed-baseline-must-say-how-it-answered');
  }

  // The whole point of this module.
  if (status === 'BLOCKED_EXTERNAL' || status === 'BLOCKED_AUTHORITY') {
    if (!text(reason, 1000)) reasonCodes.push('a-blocked-baseline-must-say-why');
    if (!text(blockingDependency, 500)) reasonCodes.push('a-blocked-baseline-must-name-the-dependency');
    if (!text(whatWasTried, 1000)) reasonCodes.push('a-blocked-baseline-must-say-what-was-actually-attempted');
    if (!text(nextUnblockCondition, 500)) reasonCodes.push('a-blocked-baseline-must-say-what-would-clear-it');
  }

  if (reasonCodes.length) return fail('BASELINE_RECORD_INVALID', reasonCodes, { baselineId });

  const executed = status === 'EXECUTED';
  return {
    ok: true,
    status: 'BASELINE_RECORDED',
    id: baselineId,
    definition: BASELINE_DEFINITIONS[baselineId],
    baselineStatus: status,
    score: executed ? Number((Number(tasksCorrect) / Number(tasksAttempted)).toFixed(4)) : null,
    tasksAttempted: executed ? Number(tasksAttempted) : null,
    tasksCorrect: executed ? Number(tasksCorrect) : null,
    method: text(method, 1000),
    reason: text(reason, 1000),
    blockingDependency: text(blockingDependency, 500),
    whatWasTried: text(whatWasTried, 1000),
    nextUnblockCondition: text(nextUnblockCondition, 500),
    cost: cost ?? null,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Compile the set.
 *
 * Every baseline id must be present. A missing one is the unexplained null
 * this replaces, and a set with gaps cannot support a comparative claim.
 */
export function compileBaselineSet({ baselines = [], suiteVersion = null, sourceCommit = null } = {}) {
  const rows = (Array.isArray(baselines) ? baselines : []).filter(row => row?.ok);
  const byId = new Map(rows.map(row => [row.id, row]));

  const missing = BASELINE_IDS.filter(id => !byId.has(id));
  if (missing.length) {
    return fail('BASELINE_SET_INCOMPLETE', missing.map(id => `baseline-missing:${id}`), {
      note: 'A missing baseline is the unexplained null this set exists to replace. Record it as blocked with its dependency if it cannot run.'
    });
  }
  if (!text(suiteVersion, 120)) return fail('BASELINE_SET_INVALID', ['suite-version-required']);
  if (!text(sourceCommit, 60)) return fail('BASELINE_SET_INVALID', ['source-commit-required']);

  const executed = BASELINE_IDS.filter(id => byId.get(id).baselineStatus === 'EXECUTED');
  const blocked = BASELINE_IDS.filter(id => String(byId.get(id).baselineStatus).startsWith('BLOCKED'));

  const current = byId.get('B5');
  const trivial = byId.get('B0');

  // The comparison that matters most, and the one nobody runs: did the system
  // beat answering without thinking?
  let trivialComparison = 'NOT_COMPARABLE__ONE_OR_BOTH_DID_NOT_EXECUTE';
  if (current.baselineStatus === 'EXECUTED' && trivial.baselineStatus === 'EXECUTED') {
    const margin = Number((current.score - trivial.score).toFixed(4));
    trivialComparison = margin > 0
      ? `CURRENT_BEATS_TRIVIAL_BY_${margin}`
      : (margin === 0 ? 'CURRENT_TIES_TRIVIAL__THE_SUITE_MEASURES_NOTHING' : `TRIVIAL_BEATS_CURRENT_BY_${Math.abs(margin)}`);
  }

  return {
    ok: true,
    status: blocked.length ? 'BASELINE_SET_PARTIAL_WITH_NAMED_BLOCKERS' : 'BASELINE_SET_COMPLETE',
    version: NULLSTAR_OMEGA_BASELINES_VERSION,
    suiteVersion: text(suiteVersion, 120),
    sourceCommit: text(sourceCommit, 60),
    baselines: BASELINE_IDS.map(id => byId.get(id)),
    executedBaselines: executed,
    blockedBaselines: blocked,
    trivialComparison,
    unexplainedNulls: 0,
    truthBoundary: 'A BASELINE SET SAYS WHAT WAS COMPARED ON ONE SUITE AT ONE COMMIT. A MARGIN OVER A TRIVIAL BASELINE ON AN EASY SUITE IS STILL A MARGIN ON AN EASY SUITE.',
    businessEffectAuthority: 'NONE'
  };
}
