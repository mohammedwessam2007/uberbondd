import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { scoreSealedResponse } from './nullstar-omega-holdout.mjs';
import { evaluateReasoningArchitectureArena } from './apex-reasoning-hypercompiler.mjs';

export const APEX_SEALED_TOURNAMENT_VERSION = 'uberbond.apex-sealed-tournament.v1.1';
export const APEX_TOURNAMENT_CLAIM_MODES = Object.freeze(['TASK_CLASS', 'PUBLIC_FRONTIER']);
export const APEX_ARCHITECTURE_CLASSES = Object.freeze(['INCUMBENT', 'CHALLENGER', 'PUBLIC_BASELINE']);

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function envelope(extra = {}) {
  return {
    policyVersion: APEX_SEALED_TOURNAMENT_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function fail(status, reasonCodes, extra = {}) {
  return envelope({
    ok: false,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    ...extra
  });
}
function text(value, max = 5000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
function timestamp(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function rawDigest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function manifestCorpusDigest(rows) {
  return rawDigest(JSON.stringify(rows.map(row => [row.taskId, row.family, row.tier, row.answerDigest])));
}
function manifestCommitmentDigest(rows) {
  return digest(rows.map(row => ({
    taskId: row.taskId,
    family: row.family,
    tier: row.tier,
    difficulty: row.difficulty,
    answerDigest: row.answerDigest
  })));
}
function wilson(successes, total, z = 1.959963984540054) {
  if (!Number.isSafeInteger(successes) || !Number.isSafeInteger(total) || total <= 0 || successes < 0 || successes > total) return null;
  const p = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin = z * Math.sqrt((p * (1 - p) / total) + (z2 / (4 * total * total))) / denom;
  return {
    lower: Number(Math.max(0, center - margin).toFixed(6)),
    upper: Number(Math.min(1, center + margin).toFixed(6))
  };
}

function normalizeManifest(manifest = []) {
  if (!Array.isArray(manifest) || manifest.length === 0 || manifest.length > 100000) {
    return { ok: false, reasonCodes: ['bounded-sealed-manifest-required'] };
  }
  const rows = [];
  const seen = new Set();
  const reasons = [];
  for (const [index, raw] of manifest.entries()) {
    const taskId = text(raw?.taskId, 200);
    const family = text(raw?.family, 120);
    const tier = text(raw?.tier, 40);
    const answerDigest = text(raw?.answerDigest, 128);
    const difficulty = finite(raw?.difficulty, 0, 1);
    if (!taskId || seen.has(taskId)) reasons.push(`manifest-${index}:unique-task-id-required`);
    else seen.add(taskId);
    if (!family) reasons.push(`manifest-${index}:family-required`);
    if (tier !== 'SEALED_HOLDOUT') reasons.push(`manifest-${index}:sealed-holdout-tier-required`);
    if (!answerDigest || !/^[a-f0-9]{64}$/i.test(answerDigest)) reasons.push(`manifest-${index}:sha256-answer-digest-required`);
    if (difficulty == null) reasons.push(`manifest-${index}:difficulty-required`);
    if (!reasons.some(reason => reason.startsWith(`manifest-${index}:`))) {
      rows.push({ taskId, family, tier, answerDigest: answerDigest.toLowerCase(), difficulty });
    }
  }
  return reasons.length ? { ok: false, reasonCodes: reasons } : { ok: true, rows };
}

export function sealedManifestCommitmentDigest(sealedManifest = []) {
  const normalized = normalizeManifest(sealedManifest);
  return normalized.ok ? manifestCommitmentDigest(normalized.rows) : null;
}

export function sealedCorpusDigestFromManifest(sealedManifest = []) {
  const normalized = normalizeManifest(sealedManifest);
  return normalized.ok ? manifestCorpusDigest(normalized.rows) : null;
}

function normalizeCommitment(raw = {}, { suiteVersion, corpusDigest, manifestDigest, taskCount } = {}) {
  const commitmentRef = text(raw?.commitmentRef, 1200);
  const committedAt = timestamp(raw?.committedAt);
  const sourceFreezeRef = text(raw?.sourceFreezeRef, 1200);
  const evaluatorRef = text(raw?.evaluatorRef, 1200);
  const committedSuite = text(raw?.suiteVersion, 120);
  const committedCorpus = text(raw?.corpusDigest, 128);
  const committedManifest = text(raw?.manifestDigest, 128);
  const committedCount = integer(raw?.taskCount, 1, 100000);
  const reasons = [];
  if (!commitmentRef || !committedAt || !sourceFreezeRef || !evaluatorRef) reasons.push('holdout-commitment-provenance-required');
  if (committedAt && Date.parse(committedAt) > Date.now() + 60_000) reasons.push('future-holdout-commitment-prohibited');
  if (committedSuite !== suiteVersion) reasons.push('holdout-commitment-suite-mismatch');
  if (committedCorpus !== corpusDigest) reasons.push('holdout-commitment-corpus-mismatch');
  if (committedManifest !== manifestDigest) reasons.push('holdout-commitment-manifest-mismatch');
  if (committedCount !== taskCount) reasons.push('holdout-commitment-task-count-mismatch');
  if (raw?.rawHoldoutsStoredInRepository !== false) reasons.push('raw-holdouts-must-remain-outside-repository');
  if (raw?.optimizerAccessBeforeEvaluation !== false) reasons.push('optimizer-holdout-access-must-be-false');
  if (raw?.candidateAccessBeforeEvaluation !== false) reasons.push('candidate-holdout-access-must-be-false');
  if (raw?.plaintextAnswersExposedBeforeEvaluation !== false) reasons.push('plaintext-answer-exposure-must-be-false');
  if (raw?.evaluatorIndependent !== true) reasons.push('independent-evaluator-required');
  return reasons.length ? { ok: false, reasonCodes: reasons } : {
    ok: true,
    commitment: {
      commitmentRef,
      committedAt,
      sourceFreezeRef,
      evaluatorRef,
      suiteVersion: committedSuite,
      corpusDigest: committedCorpus,
      manifestDigest: committedManifest,
      taskCount: committedCount,
      rawHoldoutsStoredInRepository: false,
      optimizerAccessBeforeEvaluation: false,
      candidateAccessBeforeEvaluation: false,
      plaintextAnswersExposedBeforeEvaluation: false,
      evaluatorIndependent: true
    }
  };
}

function normalizeRun(raw, index) {
  const taskId = text(raw?.taskId, 200);
  const evidenceRef = text(raw?.evidenceRef, 1000);
  const runId = text(raw?.runId, 300);
  const observedAt = timestamp(raw?.observedAt);
  const response = raw?.response == null ? null : text(raw.response, 20000);
  const costUsd = finite(raw?.costUsd, 0, 1_000_000);
  const latencyMs = finite(raw?.latencyMs, 0, 86_400_000);
  const founderMinutes = finite(raw?.founderMinutes, 0, 100000);
  const reasons = [];
  if (!taskId || !runId || !evidenceRef || !observedAt) reasons.push(`run-${index}:identity-time-and-evidence-required`);
  if (raw?.response != null && response == null) reasons.push(`run-${index}:bounded-response-required`);
  if ([costUsd, latencyMs, founderMinutes].some(value => value == null)) reasons.push(`run-${index}:bounded-economics-required`);
  if (raw?.verifierIndependent !== true) reasons.push(`run-${index}:independent-verifier-required`);
  if (raw?.holdoutPromptExposedToOptimizer === true) reasons.push(`run-${index}:optimizer-holdout-leakage-prohibited`);
  if (raw?.modelJudgedOwnIdentityMarkedAnswer === true) reasons.push(`run-${index}:identity-marked-self-judging-prohibited`);
  if (observedAt && Date.parse(observedAt) > Date.now() + 60_000) reasons.push(`run-${index}:future-run-evidence-prohibited`);
  return reasons.length ? { ok: false, reasonCodes: reasons } : {
    ok: true,
    run: {
      taskId, runId, evidenceRef, observedAt, response, costUsd, latencyMs, founderMinutes,
      verifierIndependent: true,
      holdoutPromptExposedToOptimizer: false,
      modelJudgedOwnIdentityMarkedAnswer: false
    }
  };
}

export function compileSealedArchitectureTrial({
  architectureId,
  architectureClass = 'CHALLENGER',
  architectureDigest,
  architectureRevision,
  architectureSourceRef,
  architectureFrozenAt,
  reproductionEvidenceRef = null,
  taskClass,
  suiteVersion,
  corpusDigest,
  sealedManifest = [],
  holdoutCommitment,
  runs = [],
  processScore,
  processEvidenceRef,
  verifierId,
  architectureDesignerId = null
} = {}) {
  const arch = text(architectureId, 200)?.toLowerCase();
  const archClass = text(architectureClass, 80)?.toUpperCase();
  const archDigest = text(architectureDigest, 128);
  const archRevision = text(architectureRevision, 240);
  const archSource = text(architectureSourceRef, 1200);
  const frozenAt = timestamp(architectureFrozenAt);
  const reproductionRef = reproductionEvidenceRef == null ? null : text(reproductionEvidenceRef, 1200);
  const klass = text(taskClass, 160)?.toLowerCase();
  const suite = text(suiteVersion, 120);
  const corpus = text(corpusDigest, 128);
  const process = finite(processScore, 0, 1);
  const processRef = text(processEvidenceRef, 1000);
  const verifier = text(verifierId, 300);
  const designer = architectureDesignerId == null ? null : text(architectureDesignerId, 300);
  const reasons = [];
  if (!arch || !APEX_ARCHITECTURE_CLASSES.includes(archClass) || !archDigest || !/^[a-f0-9]{64}$/i.test(archDigest) || !archRevision || !archSource || !frozenAt) reasons.push('complete-frozen-architecture-identity-required');
  if (!klass || !suite || !corpus) reasons.push('task-suite-and-corpus-required');
  if (process == null || !processRef || !verifier) reasons.push('independent-process-evidence-required');
  if (designer && verifier === designer) reasons.push('verifier-must-differ-from-architecture-designer');
  if (archClass === 'PUBLIC_BASELINE' && !reproductionRef) reasons.push('public-baseline-reproduction-evidence-required');

  const manifest = normalizeManifest(sealedManifest);
  if (!manifest.ok) reasons.push(...manifest.reasonCodes);
  if (!Array.isArray(runs) || runs.length === 0 || runs.length > 100000) reasons.push('bounded-run-list-required');
  if (reasons.length) return fail('SEALED_ARCHITECTURE_TRIAL_REFUSED', reasons);

  const computedCorpusDigest = manifestCorpusDigest(manifest.rows);
  const computedManifestDigest = manifestCommitmentDigest(manifest.rows);
  if (computedCorpusDigest !== corpus) {
    return fail('SEALED_ARCHITECTURE_TRIAL_REFUSED', ['declared-corpus-digest-does-not-bind-sealed-manifest'], {
      declaredCorpusDigest: corpus,
      computedCorpusDigest
    });
  }
  const commitment = normalizeCommitment(holdoutCommitment, {
    suiteVersion: suite,
    corpusDigest: computedCorpusDigest,
    manifestDigest: computedManifestDigest,
    taskCount: manifest.rows.length
  });
  if (!commitment.ok) return fail('SEALED_ARCHITECTURE_TRIAL_REFUSED', commitment.reasonCodes);
  if (Date.parse(frozenAt) > Date.now() + 60_000) return fail('SEALED_ARCHITECTURE_TRIAL_REFUSED', ['future-architecture-freeze-prohibited']);

  const manifestByTask = new Map(manifest.rows.map(row => [row.taskId, row]));
  const seenTaskIds = new Set();
  const seenRunIds = new Set();
  const seenEvidenceRefs = new Set();
  const outcomes = [];
  const runReasons = [];

  for (const [index, raw] of runs.entries()) {
    const normalized = normalizeRun(raw, index);
    if (!normalized.ok) {
      runReasons.push(...normalized.reasonCodes);
      continue;
    }
    const run = normalized.run;
    if (!manifestByTask.has(run.taskId)) {
      runReasons.push(`run-${index}:task-not-in-sealed-manifest`);
      continue;
    }
    if (Date.parse(run.observedAt) < Date.parse(frozenAt)) runReasons.push(`run-${index}:observation-predates-architecture-freeze`);
    if (Date.parse(run.observedAt) < Date.parse(commitment.commitment.committedAt)) runReasons.push(`run-${index}:observation-predates-holdout-commitment`);
    if (seenTaskIds.has(run.taskId)) runReasons.push(`run-${index}:one-run-per-task-required`);
    if (seenRunIds.has(run.runId)) runReasons.push(`run-${index}:unique-run-id-required`);
    if (seenEvidenceRefs.has(run.evidenceRef)) runReasons.push(`run-${index}:independent-run-evidence-required`);
    seenTaskIds.add(run.taskId);
    seenRunIds.add(run.runId);
    seenEvidenceRefs.add(run.evidenceRef);

    const task = manifestByTask.get(run.taskId);
    const scored = scoreSealedResponse({
      suiteVersion: suite,
      taskId: task.taskId,
      answerDigest: task.answerDigest,
      response: run.response
    });
    if (!scored?.ok) {
      runReasons.push(`run-${index}:sealed-score-refused`);
      continue;
    }
    outcomes.push({
      taskId: task.taskId,
      family: task.family,
      difficulty: task.difficulty,
      outcome: scored.outcome,
      runId: run.runId,
      evidenceRef: run.evidenceRef,
      observedAt: run.observedAt,
      costUsd: run.costUsd,
      latencyMs: run.latencyMs,
      founderMinutes: run.founderMinutes
    });
  }

  if (runReasons.length) return fail('SEALED_ARCHITECTURE_TRIAL_REFUSED', runReasons);
  if (outcomes.length !== manifest.rows.length) {
    return fail('SEALED_ARCHITECTURE_TRIAL_REFUSED', ['complete-sealed-manifest-coverage-required'], {
      expectedTasks: manifest.rows.length,
      observedRuns: outcomes.length
    });
  }

  const correct = outcomes.filter(row => row.outcome === 'CORRECT').length;
  const incorrect = outcomes.filter(row => row.outcome === 'INCORRECT').length;
  const abstained = outcomes.filter(row => row.outcome === 'ABSTAINED').length;
  const sampleSize = outcomes.length;
  const verifiedSuccessRate = correct / sampleSize;
  const falsePositiveRate = incorrect / sampleSize;
  const abstentionRate = abstained / sampleSize;
  const totalCostUsd = outcomes.reduce((sum, row) => sum + row.costUsd, 0);
  const meanLatencyMs = outcomes.reduce((sum, row) => sum + row.latencyMs, 0) / sampleSize;
  const totalFounderMinutes = outcomes.reduce((sum, row) => sum + row.founderMinutes, 0);
  const meanCostUsd = totalCostUsd / sampleSize;
  const meanFounderMinutes = totalFounderMinutes / sampleSize;
  const successInterval95 = wilson(correct, sampleSize);
  const falsePositiveInterval95 = wilson(incorrect, sampleSize);

  const architectureIdentity = {
    architectureId: arch,
    architectureClass: archClass,
    architectureDigest: archDigest,
    architectureRevision: archRevision,
    architectureSourceRef: archSource,
    architectureFrozenAt: frozenAt,
    reproductionEvidenceRef: reproductionRef
  };
  const evidenceSummary = {
    architectureIdentity,
    taskClass: klass,
    suiteVersion: suite,
    corpusDigest: computedCorpusDigest,
    manifestDigest: computedManifestDigest,
    holdoutCommitmentRef: commitment.commitment.commitmentRef,
    sampleSize,
    correct,
    incorrect,
    abstained,
    verifiedSuccessRate,
    falsePositiveRate,
    abstentionRate,
    processScore: process,
    processEvidenceRef: processRef,
    verifierId: verifier,
    architectureDesignerId: designer,
    totalCostUsd,
    meanLatencyMs,
    totalFounderMinutes,
    taskOutcomes: outcomes.map(row => ({
      taskId: row.taskId,
      family: row.family,
      difficulty: row.difficulty,
      outcome: row.outcome,
      runId: row.runId,
      evidenceRef: row.evidenceRef
    }))
  };
  const receiptDigest = digest(evidenceSummary);
  const evidenceRef = `apex-sealed://sha256:${receiptDigest}`;
  const arenaTrial = {
    architectureId: arch,
    taskClass: klass,
    verifiedSuccessRate: Number(verifiedSuccessRate.toFixed(6)),
    processScore: process,
    falsePositiveRate: Number(falsePositiveRate.toFixed(6)),
    costUsd: Number(meanCostUsd.toFixed(8)),
    latencyMs: Number(meanLatencyMs.toFixed(3)),
    founderMinutes: Number(meanFounderMinutes.toFixed(6)),
    sampleSize,
    evidenceRef
  };

  return envelope({
    ok: true,
    status: 'SEALED_ARCHITECTURE_TRIAL_COMPILED',
    suiteVersion: suite,
    corpusDigest: computedCorpusDigest,
    manifestDigest: computedManifestDigest,
    architectureId: arch,
    architectureIdentity,
    taskClass: klass,
    holdoutCommitment: commitment.commitment,
    arenaTrial,
    statistics: {
      sampleSize,
      correct,
      incorrect,
      abstained,
      verifiedSuccessRate: arenaTrial.verifiedSuccessRate,
      falsePositiveRate: arenaTrial.falsePositiveRate,
      abstentionRate: Number(abstentionRate.toFixed(6)),
      successInterval95,
      falsePositiveInterval95
    },
    economics: {
      totalCostUsd: Number(totalCostUsd.toFixed(8)),
      meanCostUsd: arenaTrial.costUsd,
      meanLatencyMs: arenaTrial.latencyMs,
      totalFounderMinutes: Number(totalFounderMinutes.toFixed(6)),
      meanFounderMinutes: arenaTrial.founderMinutes
    },
    verifier: {
      verifierId: verifier,
      architectureDesignerId: designer,
      processEvidenceRef: processRef,
      evaluatorRef: commitment.commitment.evaluatorRef
    },
    taskOutcomeDigest: digest(evidenceSummary.taskOutcomes),
    receiptDigest,
    optimizerVisiblePayload: {
      architectureIdentity,
      taskClass: klass,
      suiteVersion: suite,
      corpusDigest: computedCorpusDigest,
      manifestDigest: computedManifestDigest,
      arenaTrial,
      statistics: {
        sampleSize,
        correct,
        incorrect,
        abstained,
        verifiedSuccessRate: arenaTrial.verifiedSuccessRate,
        falsePositiveRate: arenaTrial.falsePositiveRate,
        abstentionRate: Number(abstentionRate.toFixed(6)),
        successInterval95,
        falsePositiveInterval95
      },
      taskOutcomeDigest: digest(evidenceSummary.taskOutcomes)
    },
    sealedPromptAccessGranted: false,
    plaintextAnswerAccessGranted: false,
    promotionAuthority: 'NONE',
    executionAuthority: 'NONE',
    truthBoundary: 'THE BRIDGE BINDS THE SUPPLIED SEALED MANIFEST TO THE DECLARED CORPUS AND PRECOMMITTED HOLDOUT RECEIPT, SCORES SALTED ANSWER DIGESTS, AND RETURNS AGGREGATES. IT DOES NOT PROVE ZERO HISTORICAL LEAKAGE OUTSIDE THE HARNESS OR GRANT PRODUCTION PROMOTION.'
  });
}

export function evaluateSealedArchitectureTournament({
  trials = [],
  incumbentArchitectureId,
  claimMode = 'TASK_CLASS',
  minimumPublicBaselines = 3,
  budgetPolicy = {},
  minimumSampleSize = 20,
  qualityFloorDelta = 0.01
} = {}) {
  const incumbentId = text(incumbentArchitectureId, 200)?.toLowerCase();
  const mode = text(claimMode, 80)?.toUpperCase();
  const minSamples = integer(minimumSampleSize, 1, 1_000_000);
  const minBaselines = integer(minimumPublicBaselines, 1, 64);
  const maxMeanCostUsd = finite(budgetPolicy?.maxMeanCostUsd, 0.000001, 1_000_000);
  const maxMeanFounderMinutes = finite(budgetPolicy?.maxMeanFounderMinutes, 0, 100000);
  const maxMeanLatencyMs = finite(budgetPolicy?.maxMeanLatencyMs, 1, 86_400_000);
  const normalization = text(budgetPolicy?.normalization, 120)?.toUpperCase();
  const reasons = [];
  if (!incumbentId || minSamples == null) reasons.push('incumbent-and-minimum-sample-required');
  if (!APEX_TOURNAMENT_CLAIM_MODES.includes(mode)) reasons.push('recognized-claim-mode-required');
  if (minBaselines == null) reasons.push('bounded-public-baseline-count-required');
  if (normalization !== 'COMMON_CEILING' || maxMeanCostUsd == null || maxMeanFounderMinutes == null || maxMeanLatencyMs == null) reasons.push('common-quality-preserving-budget-ceiling-required');
  if (!Array.isArray(trials) || trials.length < 2 || trials.length > 1000) reasons.push('two-to-1000-trials-required');
  if (reasons.length) return fail('SEALED_ARCHITECTURE_TOURNAMENT_REFUSED', reasons);

  const accepted = [];
  const seenArchitectures = new Set();
  const seenReceipts = new Set();
  let suiteVersion = null;
  let corpusDigest = null;
  let manifestDigest = null;
  let commitmentRef = null;
  let taskClass = null;

  for (const [index, trial] of trials.entries()) {
    if (!trial?.ok || trial?.status !== 'SEALED_ARCHITECTURE_TRIAL_COMPILED' || !trial?.arenaTrial || !trial?.architectureIdentity) {
      reasons.push(`trial-${index}:compiled-sealed-trial-required`);
      continue;
    }
    const arch = text(trial.architectureId, 200)?.toLowerCase();
    if (!arch || seenArchitectures.has(arch)) reasons.push(`trial-${index}:unique-architecture-required`);
    else seenArchitectures.add(arch);
    if (!trial.receiptDigest || seenReceipts.has(trial.receiptDigest)) reasons.push(`trial-${index}:independent-receipt-required`);
    else seenReceipts.add(trial.receiptDigest);
    if (trial.statistics?.sampleSize < minSamples) reasons.push(`trial-${index}:minimum-sample-not-met`);
    if (trial.economics?.meanCostUsd > maxMeanCostUsd) reasons.push(`trial-${index}:common-cost-ceiling-exceeded`);
    if (trial.economics?.meanFounderMinutes > maxMeanFounderMinutes) reasons.push(`trial-${index}:common-founder-minute-ceiling-exceeded`);
    if (trial.economics?.meanLatencyMs > maxMeanLatencyMs) reasons.push(`trial-${index}:common-latency-ceiling-exceeded`);
    suiteVersion ??= trial.suiteVersion;
    corpusDigest ??= trial.corpusDigest;
    manifestDigest ??= trial.manifestDigest;
    commitmentRef ??= trial.holdoutCommitment?.commitmentRef;
    taskClass ??= trial.taskClass;
    if (trial.suiteVersion !== suiteVersion) reasons.push(`trial-${index}:suite-version-mismatch`);
    if (trial.corpusDigest !== corpusDigest) reasons.push(`trial-${index}:corpus-digest-mismatch`);
    if (trial.manifestDigest !== manifestDigest) reasons.push(`trial-${index}:manifest-digest-mismatch`);
    if (trial.holdoutCommitment?.commitmentRef !== commitmentRef) reasons.push(`trial-${index}:holdout-commitment-mismatch`);
    if (trial.taskClass !== taskClass) reasons.push(`trial-${index}:task-class-mismatch`);
    accepted.push(trial);
  }

  const publicBaselines = accepted.filter(trial => trial.architectureIdentity.architectureClass === 'PUBLIC_BASELINE');
  if (mode === 'PUBLIC_FRONTIER') {
    if (publicBaselines.length < minBaselines) reasons.push('minimum-public-baseline-coverage-not-met');
    if (publicBaselines.some(trial => !trial.architectureIdentity.reproductionEvidenceRef)) reasons.push('public-baseline-reproduction-evidence-required');
  }
  if (reasons.length) return fail('SEALED_ARCHITECTURE_TOURNAMENT_REFUSED', reasons);
  if (!seenArchitectures.has(incumbentId)) return fail('SEALED_ARCHITECTURE_TOURNAMENT_REFUSED', ['incumbent-trial-required']);

  const arena = evaluateReasoningArchitectureArena({
    trials: accepted.map(trial => trial.arenaTrial),
    taskClass,
    minimumSampleSize: minSamples,
    qualityFloorDelta
  });
  if (!arena.ok) return arena;

  const leaderId = arena.promotionCandidateId;
  const leader = accepted.find(trial => trial.architectureId === leaderId) ?? null;
  const incumbent = accepted.find(trial => trial.architectureId === incumbentId) ?? null;
  const challenger = Boolean(leader && leader.architectureId !== incumbentId);
  const alternatives = accepted.filter(trial => trial.architectureId !== leaderId);
  const clearSuccessSeparationVsIncumbent = Boolean(
    challenger
    && leader?.statistics?.successInterval95
    && incumbent?.statistics?.successInterval95
    && leader.statistics.successInterval95.lower > incumbent.statistics.successInterval95.upper
  );
  const falsePositiveNotWorseVsIncumbent = Boolean(
    leader?.statistics?.falsePositiveInterval95
    && incumbent?.statistics?.falsePositiveInterval95
    && leader.statistics.falsePositiveInterval95.upper <= incumbent.statistics.falsePositiveInterval95.upper
  );
  const separatedFromAllReviewed = Boolean(
    leader?.statistics?.successInterval95
    && alternatives.length
    && alternatives.every(other =>
      other?.statistics?.successInterval95
      && leader.statistics.successInterval95.lower > other.statistics.successInterval95.upper
    )
  );
  const falsePositiveNotWorseThanAllReviewed = Boolean(
    leader?.statistics?.falsePositiveInterval95
    && alternatives.length
    && alternatives.every(other =>
      other?.statistics?.falsePositiveInterval95
      && leader.statistics.falsePositiveInterval95.upper <= other.statistics.falsePositiveInterval95.upper
    )
  );

  let status = 'SEALED_INCUMBENT_RETAINS_LEAD';
  if (challenger && clearSuccessSeparationVsIncumbent && falsePositiveNotWorseVsIncumbent) status = 'SEALED_CHALLENGER_REPLICATION_CANDIDATE';
  else if (challenger) status = 'SEALED_CHALLENGER_SIGNAL_REQUIRES_REPLICATION';
  if (
    mode === 'PUBLIC_FRONTIER'
    && challenger
    && separatedFromAllReviewed
    && falsePositiveNotWorseThanAllReviewed
  ) status = 'PUBLIC_REVIEW_SET_LEADER_REPLICATION_CANDIDATE';

  return envelope({
    ok: true,
    status,
    claimMode: mode,
    suiteVersion,
    corpusDigest,
    manifestDigest,
    holdoutCommitmentRef: commitmentRef,
    taskClass,
    incumbentArchitectureId: incumbentId,
    reviewedArchitectureCount: accepted.length,
    publicBaselineCount: publicBaselines.length,
    budgetPolicy: {
      normalization: 'COMMON_CEILING',
      maxMeanCostUsd,
      maxMeanFounderMinutes,
      maxMeanLatencyMs
    },
    arena,
    leaderArchitectureId: leaderId,
    confidenceGate: {
      clearSuccessSeparationVsIncumbent,
      falsePositiveNotWorseVsIncumbent,
      separatedFromAllReviewed,
      falsePositiveNotWorseThanAllReviewed,
      rule: 'A CHALLENGER MAY ADVANCE TO INDEPENDENT REPLICATION ONLY AFTER QUALITY-FIRST SEALED EVALUATION. PUBLIC-REVIEW-SET LEADERSHIP REQUIRES CLEAR SUCCESS SEPARATION FROM EVERY REVIEWED BASELINE UNDER THE SAME CEILING AND NO WORSE FALSE-POSITIVE UPPER BOUND.'
    },
    optimizerVisibleResults: accepted.map(trial => trial.optimizerVisiblePayload),
    sealedPromptAccessGranted: false,
    plaintextAnswerAccessGranted: false,
    replicationRequiredBeforePromotion: challenger,
    promotionAuthority: 'NONE',
    productionActivationAuthorized: false,
    globalRankAuthority: 'NONE',
    percentileAuthority: 'REVIEWED_SET_ONLY',
    truthBoundary: 'A SEALED TOURNAMENT MAY NOMINATE A TASK-CLASS OR PUBLIC-REVIEW-SET REPLICATION CANDIDATE. EVEN CLEAR SEPARATION ACROSS THE REVIEWED SET DOES NOT ESTABLISH WORLD-BEST STATUS OR A GLOBAL PERCENTILE WITHOUT REPRESENTATIVE COVERAGE, INDEPENDENT REPLICATION, FRESH MODEL IDENTITIES AND APPROPRIATE EXTERNAL SETTLEMENT.'
  });
}
