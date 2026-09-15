// A task that cannot be answered by reading the answer.
//
// The previous corpus scored every tree 6 of 6 against itself, because for
// each task the expected answer and the observation were the same expression
// over the same file. Nothing separated a capable system from a `cat`.
//
// The fix is structural rather than a matter of writing harder questions: a
// task must establish its truth by one path and be answered by a different
// one, and a task whose two paths coincide is refused at definition time.

import { createHash } from 'node:crypto';

export const NULLSTAR_OMEGA_INDEPENDENT_SUITE_VERSION = 'uberbond.nullstar-omega-independent-suite.v1';

// Where a value can come from. Two of these being equal is what makes a task
// tautological, so the vocabulary is closed and small.
export const EVIDENCE_PATHS = Object.freeze({
  // Read a field out of an artifact this repository generated.
  GENERATED_ARTIFACT: 'GENERATED_ARTIFACT',
  // Compute from source text directly, without consulting any artifact.
  SOURCE_ANALYSIS: 'SOURCE_ANALYSIS',
  // Run a command and read its result.
  EXECUTED_COMMAND: 'EXECUTED_COMMAND',
  // Read git history.
  VERSION_CONTROL: 'VERSION_CONTROL',
  // A value sealed before the tree changed, so answering requires prediction.
  SEALED_PRIOR_STATE: 'SEALED_PRIOR_STATE',
  // Derived by reasoning over several of the above, with no single lookup.
  MULTI_STEP_DERIVATION: 'MULTI_STEP_DERIVATION'
});

export const SUITE_FAMILIES = Object.freeze([
  'SCIENCE', 'RESEARCH', 'FORECASTING', 'CAUSALITY',
  'PLANNING', 'TOOL_USE', 'INVENTION'
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
 * Define one task.
 *
 * The two refusals here are the whole module. A task whose answer path equals
 * its observation path is a tautology, and one whose two paths read the same
 * concrete locator is the same tautology wearing different labels -- reading
 * `counts.rows` out of a file twice is not two paths because the second read
 * agrees by construction.
 */
export function defineIndependentTask({
  taskId = null,
  family = null,
  question = null,
  answerPath = null,
  answerLocator = null,
  observePath = null,
  observeLocator = null,
  difficulty = null,
  whyIndependent = null
} = {}) {
  const reasonCodes = [];
  const id = text(taskId, 200);
  if (!id) reasonCodes.push('task-id-required');
  if (!SUITE_FAMILIES.includes(String(family ?? ''))) reasonCodes.push('known-family-required');
  if (!text(question, 1000)) reasonCodes.push('question-required');
  if (!Object.hasOwn(EVIDENCE_PATHS, String(answerPath ?? ''))) reasonCodes.push('known-answer-path-required');
  if (!Object.hasOwn(EVIDENCE_PATHS, String(observePath ?? ''))) reasonCodes.push('known-observe-path-required');

  const answerAt = text(answerLocator, 500);
  const observeAt = text(observeLocator, 500);
  if (!answerAt) reasonCodes.push('answer-locator-required');
  if (!observeAt) reasonCodes.push('observe-locator-required');

  // Number(null) is 0, which is finite and in range, so a missing difficulty
  // would have been silently accepted as the easiest possible task. Unknown is
  // not zero.
  const level = typeof difficulty === 'number' ? difficulty : NaN;
  if (!Number.isFinite(level) || level < 0 || level > 1) reasonCodes.push('difficulty-between-zero-and-one-required');
  if (!text(whyIndependent, 1000)) reasonCodes.push('task-must-say-why-its-two-paths-are-independent');

  // The defect, refused.
  if (answerPath && observePath && answerPath === observePath) {
    reasonCodes.push(`tautological-task-answer-and-observation-share-a-path:${answerPath}`);
  }
  if (answerAt && observeAt && answerAt === observeAt) {
    reasonCodes.push('tautological-task-answer-and-observation-read-the-same-locator');
  }

  if (reasonCodes.length) return fail('INDEPENDENT_TASK_INVALID', reasonCodes, { taskId: id });

  return {
    ok: true,
    status: 'INDEPENDENT_TASK_DEFINED',
    task: {
      taskId: id,
      family,
      question: text(question, 1000),
      answerPath,
      answerLocator: answerAt,
      observePath,
      observeLocator: observeAt,
      difficulty: level,
      whyIndependent: text(whyIndependent, 1000)
    },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Compile a suite.
 *
 * A suite whose tasks cluster in one family measures one thing and reports it
 * as several, so family spread is required rather than encouraged.
 */
export function compileIndependentSuite({ suiteVersion = null, tasks = [], generatedAt = new Date().toISOString() } = {}) {
  const version = text(suiteVersion, 120);
  if (!version) return fail('SUITE_INVALID', ['suite-version-required']);

  const rows = (Array.isArray(tasks) ? tasks : []).filter(row => row?.ok).map(row => row.task);
  const rejected = (Array.isArray(tasks) ? tasks : []).filter(row => row && !row.ok);
  if (rejected.length) {
    return fail('SUITE_CONTAINS_REJECTED_TASKS', ['every-task-must-be-valid'], {
      rejectedTaskIds: rejected.map(row => row.taskId ?? null),
      rejectedReasons: rejected.flatMap(row => row.reasonCodes ?? [])
    });
  }
  if (rows.length === 0) return fail('SUITE_INVALID', ['at-least-one-task-required']);

  const ids = rows.map(row => row.taskId);
  if (new Set(ids).size !== ids.length) return fail('SUITE_INVALID', ['duplicate-task-id']);

  const families = [...new Set(rows.map(row => row.family))];
  if (families.length < 2) {
    return fail('SUITE_INVALID', ['a-suite-in-one-family-measures-one-thing'], { families });
  }

  const byFamily = Object.fromEntries(SUITE_FAMILIES.map(family => [family, rows.filter(row => row.family === family).length]));

  return {
    ok: true,
    status: 'INDEPENDENT_SUITE_COMPILED',
    version: NULLSTAR_OMEGA_INDEPENDENT_SUITE_VERSION,
    suiteVersion: version,
    generatedAt,
    counts: { tasks: rows.length, families: families.length, byFamily },
    tasks: rows,
    tautologyCheck: 'EVERY TASK ESTABLISHES ITS ANSWER BY A DIFFERENT PATH AND LOCATOR THAN IT IS ANSWERED BY. A TASK WHERE THOSE COINCIDE IS REFUSED AT DEFINITION TIME.',
    digest: `sha256:${createHash('sha256').update(JSON.stringify({ version, ids: ids.slice().sort() })).digest('hex')}`,
    truthBoundary: 'AN INDEPENDENT SUITE CAN SEPARATE SYSTEMS. IT DOES NOT FOLLOW THAT IT MEASURES THE CAPABILITY ITS FAMILY IS NAMED AFTER.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Retire a suite without deleting it.
 *
 * Contaminated history stays readable. A retired suite keeps its scores and
 * carries the reason, so a later reader can see why a 1.0 in the record does
 * not mean what it looks like.
 */
export function retireSuite({ suiteVersion = null, reason = null, evidenceRef = null, replacedBy = null } = {}) {
  const reasonCodes = [];
  if (!text(suiteVersion, 120)) reasonCodes.push('suite-version-required');
  if (!text(reason, 2000)) reasonCodes.push('retirement-must-state-the-defect');
  if (!text(evidenceRef, 500)) reasonCodes.push('retirement-must-point-at-the-evidence');
  if (reasonCodes.length) return fail('RETIREMENT_INVALID', reasonCodes);

  return {
    ok: true,
    status: 'SUITE_RETIRED',
    suiteVersion: text(suiteVersion, 120),
    reason: text(reason, 2000),
    evidenceRef: text(evidenceRef, 500),
    replacedBy: text(replacedBy, 120),
    historyPolicy: 'SCORES FROM THIS SUITE REMAIN IN THE RECORD AND REMAIN READABLE. THEY ARE MARKED CONTAMINATED RATHER THAN DELETED, BECAUSE DELETING THEM WOULD HIDE WHY THE EARLIER GENERATIONS LOOKED PERFECT.',
    comparableWithSuccessor: false,
    businessEffectAuthority: 'NONE'
  };
}
