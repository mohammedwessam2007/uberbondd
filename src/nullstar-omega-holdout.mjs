// A sealed evaluation corpus: tasks whose answers the candidate never sees.
//
// An evaluation a builder can read is not an evaluation, it is a specification.
// That distinction is the entire reason this file exists separately from the
// visible suites: those measure whether something works, this measures whether
// an improvement generalizes to work nobody tuned against.
//
// So the corpus stores answer *digests*, never answers. A candidate can match a
// digest only by producing the right answer, which is the point; it cannot read
// the digest and work backwards. Bodies are salted per suite version and task
// id, so a digest of a common answer ("42", "true") is not matchable against a
// public corpus -- which would leak exactly the tasks a small answer space
// makes easiest to guess.
//
// Nothing here executes a task. Sealing is a data discipline; running the
// corpus is a separate step with a separate receipt, so the thing that holds
// the answers is never also the thing that reports the score.
import { createHash } from 'node:crypto';
import { ZERO_CONSEQUENCE_EFFECTS } from './effect-ledgers.mjs';

export const NULLSTAR_OMEGA_HOLDOUT_VERSION = 'uberbond.nullstar-omega-holdout.v1';

/** Corpus tiers. A task lives in exactly one, and SEALED never becomes VISIBLE. */
export const CORPUS_TIERS = Object.freeze(['DEVELOPMENT', 'VISIBLE_EVAL', 'SEALED_HOLDOUT']);

/** Evaluation families, closed so a family cannot be invented to fit a result. */
export const TASK_FAMILIES = Object.freeze([
  'REASONING', 'MATHEMATICS', 'SCIENCE', 'SOFTWARE_ENGINEERING', 'DEBUGGING',
  'RESEARCH', 'FORECASTING', 'CAUSAL_INFERENCE', 'PLANNING', 'TOOL_SELECTION',
  'INVENTION', 'CROSS_DOMAIN_TRANSFER', 'UNKNOWN_UNKNOWN', 'LONG_HORIZON',
  'SELF_DIAGNOSIS', 'MEMORY', 'RETRIEVAL', 'CONTEXT_SELECTION',
  'RESOURCE_EFFICIENCY', 'ROBUSTNESS', 'CALIBRATED_REFUSAL'
]);

const SEP = '\u0000';

const text = (value, max = 4000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const digest = value => createHash('sha256').update(String(value)).digest('hex');

function refuse(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: NULLSTAR_OMEGA_HOLDOUT_VERSION,
    status: 'NULLSTAR_OMEGA_HOLDOUT_REFUSED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_CONSEQUENCE_EFFECTS },
    ...extra
  };
}

/**
 * The digest a sealed answer is stored under.
 *
 * Salted with suite version and task id, so the same answer in two suites
 * produces two digests and neither matches a public corpus.
 */
export function sealedAnswerDigest({ suiteVersion, taskId, answer }) {
  return digest(`${suiteVersion}${SEP}${taskId}${SEP}${answer}`);
}

export function normalizeTask(input = {}, { suiteVersion = null } = {}) {
  const taskId = text(input.taskId, 200);
  const family = text(input.family, 80);
  const tier = text(input.tier, 40);
  const prompt = text(input.prompt, 20000);
  const difficulty = Number(input.difficulty);

  const reasons = [];
  if (!taskId) reasons.push('task-id-required');
  if (!TASK_FAMILIES.includes(family)) reasons.push(`recognized-task-family-required:${taskId || '<unidentified>'}`);
  if (!CORPUS_TIERS.includes(tier)) reasons.push(`recognized-corpus-tier-required:${taskId || '<unidentified>'}`);
  if (!prompt) reasons.push(`task-prompt-required:${taskId || '<unidentified>'}`);
  if (!Number.isFinite(difficulty) || difficulty < 0 || difficulty > 1) reasons.push(`task-difficulty-0-to-1-required:${taskId || '<unidentified>'}`);

  const answer = text(input.answer, 20000);
  const suppliedDigest = text(input.answerDigest, 128);
  if (!answer && !suppliedDigest) reasons.push(`task-answer-or-digest-required:${taskId || '<unidentified>'}`);
  if (tier === 'SEALED_HOLDOUT' && answer && !suiteVersion) reasons.push('sealing-requires-suite-version');
  if (reasons.length) return refuse(reasons);

  const answerDigest = suppliedDigest || sealedAnswerDigest({ suiteVersion, taskId, answer });

  return {
    ok: true,
    taskId,
    family,
    tier,
    prompt,
    difficulty,
    answerDigest,
    // The plaintext answer is returned only for non-sealed tiers. A sealed task
    // that carried its answer out of this function would break the seal on the
    // first caller that logged the corpus.
    answer: tier === 'SEALED_HOLDOUT' ? null : (answer || null),
    sealed: tier === 'SEALED_HOLDOUT'
  };
}

/**
 * Compiles a corpus and refuses one whose seal is already broken.
 *
 * Leakage is checked here rather than at scoring time on purpose: a leaked
 * corpus is unusable for every future generation, not only the run that
 * happened to notice.
 */
export function compileHoldoutCorpus({ suiteVersion = null, tasks = [], generatedAt = new Date().toISOString() } = {}) {
  const version = text(suiteVersion, 120);
  if (!version) return refuse(['suite-version-required']);
  if (!Array.isArray(tasks) || tasks.length === 0) return refuse(['corpus-tasks-required']);

  const normalized = [];
  const reasons = [];
  const seen = new Set();
  for (const raw of tasks) {
    const task = normalizeTask(raw, { suiteVersion: version });
    if (!task.ok) { reasons.push(...task.reasonCodes); continue; }
    if (seen.has(task.taskId)) { reasons.push(`duplicate-task-id:${task.taskId}`); continue; }
    seen.add(task.taskId);
    normalized.push(task);
  }
  if (reasons.length) return refuse(reasons);

  const sealed = normalized.filter(task => task.sealed);
  if (sealed.length === 0) return refuse(['corpus-must-contain-at-least-one-sealed-task']);

  // A sealed task whose digest appears anywhere in the visible corpus is
  // leaked. Cheap, and it runs on every compile rather than being remembered
  // as a rule somebody is supposed to follow.
  const visibleText = normalized.filter(task => !task.sealed).map(task => `${task.prompt} ${task.answer || ''}`).toString().toLowerCase();
  const leaked = sealed.filter(task => visibleText.includes(task.answerDigest.toLowerCase()));
  if (leaked.length) return refuse(leaked.map(task => `sealed-answer-digest-appears-in-visible-corpus:${task.taskId}`));

  const byTier = Object.fromEntries(CORPUS_TIERS.map(tier => [tier, normalized.filter(task => task.tier === tier).length]));
  const byFamily = {};
  for (const task of normalized) byFamily[task.family] = (byFamily[task.family] || 0) + 1;

  return {
    ok: true,
    version: NULLSTAR_OMEGA_HOLDOUT_VERSION,
    status: 'NULLSTAR_OMEGA_HOLDOUT_CORPUS_SEALED',
    suiteVersion: version,
    generatedAt,
    counts: { tasks: normalized.length, sealed: sealed.length, byTier, byFamily },
    // Only identities and digests travel in the manifest. Sealed prompts stay
    // with the runner rather than in the file that gets committed.
    manifest: normalized.map(task => ({
      taskId: task.taskId,
      family: task.family,
      tier: task.tier,
      difficulty: task.difficulty,
      answerDigest: task.answerDigest
    })),
    tasks: normalized,
    corpusDigest: digest(JSON.stringify(normalized.map(task => [task.taskId, task.family, task.tier, task.answerDigest]))),
    truthBoundary:
      'A_SEALED_CORPUS_MEANS_ANSWERS_ARE_STORED_AS_SALTED_DIGESTS_AND_ARE_NOT_RETURNED_FOR_SEALED_TASKS. '
      + 'IT_DOES_NOT_PROVE_A_CANDIDATE_NEVER_SAW_THESE_TASKS_ELSEWHERE, AND_SCORING_IS_A_SEPARATE_STEP_WITH_ITS_OWN_RECEIPT.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_CONSEQUENCE_EFFECTS }
  };
}

/**
 * Scores a response without revealing the answer.
 *
 * Exact-digest match only. A fuzzy scorer here would be the place to quietly
 * lower the bar after seeing results.
 */
export function scoreSealedResponse({ suiteVersion, taskId, answerDigest, response } = {}) {
  const version = text(suiteVersion, 120);
  const id = text(taskId, 200);
  const expected = text(answerDigest, 128);
  if (!version || !id || !expected) {
    return { ok: false, status: 'SEALED_SCORE_REFUSED', reasonCodes: ['suite-task-and-digest-required'], businessEffectAuthority: 'NONE' };
  }
  const supplied = text(response, 20000);
  const observed = supplied === null ? null : sealedAnswerDigest({ suiteVersion: version, taskId: id, answer: supplied });
  return {
    ok: true,
    status: 'SEALED_RESPONSE_SCORED',
    taskId: id,
    // An abstention is a distinct outcome from a wrong answer. Collapsing them
    // punishes calibrated refusal, which the constitution asks to reward.
    outcome: supplied === null ? 'ABSTAINED' : (observed === expected ? 'CORRECT' : 'INCORRECT'),
    businessEffectAuthority: 'NONE'
  };
}
