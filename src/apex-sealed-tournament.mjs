import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { scoreSealedResponse } from './nullstar-omega-holdout.mjs';
import { evaluateReasoningArchitectureArena } from './apex-reasoning-hypercompiler.mjs';

export const APEX_SEALED_TOURNAMENT_VERSION = 'uberbond.apex-sealed-tournament.v1';

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
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
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

function normalizeRun(raw, index) {
  const taskId = text(raw?.taskId, 200);
  const evidenceRef = text(raw?.evidenceRef, 1000);
  const runId = text(raw?.runId, 300);
  const response = raw?.response == null ? null : text(raw.response, 20000);
  const costUsd = finite(raw?.costUsd, 0, 1_000_000);
  const latencyMs = finite(raw?.latencyMs, 0, 86_400_000);
  const founderMinutes = finite(raw?.founderMinutes, 0, 100000);
  const reasons = [];
  if (!taskId || !runId || !evidenceRef) reasons.push(`run-${index}:identity-and-evidence-required`);
  if (raw?.response != null && response == null) reasons.push(`run-${index}:bounded-response-required`);
  if ([costUsd, latencyMs, founderMinutes].some(value => value == null)) reasons.push(`run-${index}:bounded-economics-required`);
  return reasons.length ? { ok: false, reasonCodes: reasons } : {
    ok: true,
    run: { taskId, runId, evidenceRef, response, costUsd, latencyMs, founderMinutes }
  };
}

export function compileSealedArchitectureTrial({
  architectureId,
  taskClass,
  suiteVersion,
  corpusDigest,
  sealedManifest = [],
  runs = [],
  processScore,
  processEvidenceRef,
  verifierId,
  architectureDesignerId = null
} = {}) {
  const arch = text(architectureId, 200)?.toLowerCase();
  const klass = text(taskClass, 160)?.toLowerCase();
  const suite = text(suiteVersion, 120);
  const corpus = text(corpusDigest, 128);
  const process = finite(processScore, 0, 1);
  const processRef = text(processEvidenceRef, 1000);
  const verifier = text(verifierId, 300);
  const designer = architectureDesignerId == null ? null : text(architectureDesignerId, 300);
  const reasons = [];
  if (!arch || !klass || !suite || !corpus) reasons.push('architecture-task-suite-corpus-required');
  if (process == null || !processRef || !verifier) reasons.push('independent-process-evidence-required');
  if (designer && verifier === designer) reasons.push('verifier-must-differ-from-architecture-designer');

  const manifest = normalizeManifest(sealedManifest);
  if (!manifest.ok) reasons.push(...manifest.reasonCodes);
  if (!Array.isArray(runs) || runs.length === 0 || runs.length > 100000) reasons.push('bounded-run-list-required');
  if (reasons.length) return fail('SEALED_ARCHITECTURE_TRIAL_REFUSED', reasons);

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

  const evidenceSummary = {
    architectureId: arch,
    taskClass: klass,
    suiteVersion: suite,
    corpusDigest: corpus,
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
    corpusDigest: corpus,
    architectureId: arch,
    taskClass: klass,
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
      processEvidenceRef: processRef
    },
    taskOutcomeDigest: digest(evidenceSummary.taskOutcomes),
    receiptDigest,
    optimizerVisiblePayload: {
      architectureId: arch,
      taskClass: klass,
      suiteVersion: suite,
      corpusDigest: corpus,
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
    truthBoundary: 'THE BRIDGE SCORES AGAINST SEALED ANSWER DIGESTS AND RETURNS AGGREGATES. IT DOES NOT REVEAL SEALED PROMPTS OR PLAINTEXT ANSWERS, PROVE ZERO HISTORICAL LEAKAGE, OR GRANT PRODUCTION PROMOTION.'
  });
}

export function evaluateSealedArchitectureTournament({
  trials = [],
  incumbentArchitectureId,
  minimumSampleSize = 20,
  qualityFloorDelta = 0.01
} = {}) {
  const incumbentId = text(incumbentArchitectureId, 200)?.toLowerCase();
  const minSamples = integer(minimumSampleSize, 1, 1_000_000);
  const reasons = [];
  if (!incumbentId || minSamples == null) reasons.push('incumbent-and-minimum-sample-required');
  if (!Array.isArray(trials) || trials.length < 2 || trials.length > 1000) reasons.push('two-to-1000-trials-required');
  if (reasons.length) return fail('SEALED_ARCHITECTURE_TOURNAMENT_REFUSED', reasons);

  const accepted = [];
  const seenArchitectures = new Set();
  const seenReceipts = new Set();
  let suiteVersion = null;
  let corpusDigest = null;
  let taskClass = null;

  for (const [index, trial] of trials.entries()) {
    if (!trial?.ok || trial?.status !== 'SEALED_ARCHITECTURE_TRIAL_COMPILED' || !trial?.arenaTrial) {
      reasons.push(`trial-${index}:compiled-sealed-trial-required`);
      continue;
    }
    const arch = text(trial.architectureId, 200)?.toLowerCase();
    if (!arch || seenArchitectures.has(arch)) reasons.push(`trial-${index}:unique-architecture-required`);
    else seenArchitectures.add(arch);
    if (!trial.receiptDigest || seenReceipts.has(trial.receiptDigest)) reasons.push(`trial-${index}:independent-receipt-required`);
    else seenReceipts.add(trial.receiptDigest);
    if (trial.statistics?.sampleSize < minSamples) reasons.push(`trial-${index}:minimum-sample-not-met`);
    suiteVersion ??= trial.suiteVersion;
    corpusDigest ??= trial.corpusDigest;
    taskClass ??= trial.taskClass;
    if (trial.suiteVersion !== suiteVersion) reasons.push(`trial-${index}:suite-version-mismatch`);
    if (trial.corpusDigest !== corpusDigest) reasons.push(`trial-${index}:corpus-digest-mismatch`);
    if (trial.taskClass !== taskClass) reasons.push(`trial-${index}:task-class-mismatch`);
    accepted.push(trial);
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
  const clearSuccessSeparation = Boolean(
    challenger
    && leader?.statistics?.successInterval95
    && incumbent?.statistics?.successInterval95
    && leader.statistics.successInterval95.lower > incumbent.statistics.successInterval95.upper
  );
  const falsePositiveNotWorse = Boolean(
    leader?.statistics?.falsePositiveInterval95
    && incumbent?.statistics?.falsePositiveInterval95
    && leader.statistics.falsePositiveInterval95.upper <= incumbent.statistics.falsePositiveInterval95.upper
  );

  let status = 'SEALED_INCUMBENT_RETAINS_LEAD';
  if (challenger && clearSuccessSeparation && falsePositiveNotWorse) status = 'SEALED_CHALLENGER_REPLICATION_CANDIDATE';
  else if (challenger) status = 'SEALED_CHALLENGER_SIGNAL_REQUIRES_REPLICATION';

  return envelope({
    ok: true,
    status,
    suiteVersion,
    corpusDigest,
    taskClass,
    incumbentArchitectureId: incumbentId,
    arena,
    leaderArchitectureId: leaderId,
    confidenceGate: {
      clearSuccessSeparation,
      falsePositiveNotWorse,
      rule: 'A CHALLENGER MAY ADVANCE TO INDEPENDENT REPLICATION ONLY WHEN ITS 95% SUCCESS INTERVAL IS CLEARLY ABOVE THE INCUMBENT AND ITS FALSE-POSITIVE UPPER BOUND IS NOT WORSE.'
    },
    optimizerVisibleResults: accepted.map(trial => trial.optimizerVisiblePayload),
    sealedPromptAccessGranted: false,
    plaintextAnswerAccessGranted: false,
    replicationRequiredBeforePromotion: challenger,
    promotionAuthority: 'NONE',
    productionActivationAuthorized: false,
    truthBoundary: 'A SEALED TOURNAMENT MAY NOMINATE A REPLICATION CANDIDATE. IT CANNOT PROMOTE OR ACTIVATE A REASONING ARCHITECTURE, AND IT DOES NOT PROVE THE HOLDOUT WAS NEVER SEEN OUTSIDE THIS HARNESS.'
  });
}
