import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sealedAnswerDigest } from '../src/nullstar-omega-holdout.mjs';
import {
  compileSealedArchitectureTrial,
  validateCompiledSealedArchitectureTrial
} from '../src/apex-sealed-tournament.mjs';
import {
  buildLiveFrontierBenchmarkFromSealedTrial,
  validateLiveFrontierBenchmark
} from '../src/frontier-cognitive-admission.mjs';

const suiteVersion = 'live-benchmark-provenance-v1';
const COMMITTED_AT = '2026-09-29T01:00:00.000Z';
const FROZEN_AT = '2026-09-29T01:01:00.000Z';
const OBSERVED_AT = '2026-09-29T01:02:00.000Z';

const stable = value => Array.isArray(value)
  ? value.map(stable)
  : (!value || typeof value !== 'object'
      ? value
      : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const rawDigest = value => crypto.createHash('sha256').update(String(value)).digest('hex');

const profile = {
  id: 'mimo-pro',
  provider: 'xiaomi',
  model: 'mimo-v2.6-pro',
  revision: '2026-09-22'
};

function manifest(count = 20) {
  return Array.from({ length: count }, (_, i) => {
    const taskId = `task-${i + 1}`;
    return {
      taskId,
      family: 'REASONING',
      tier: 'SEALED_HOLDOUT',
      difficulty: 0.8,
      answerDigest: sealedAnswerDigest({ suiteVersion, taskId, answer: `answer-${i + 1}` })
    };
  });
}

function corpusDigestFor(rows) {
  return rawDigest(JSON.stringify(rows.map(row => [row.taskId, row.family, row.tier, row.answerDigest])));
}
function manifestDigestFor(rows) {
  return digest(rows.map(row => ({
    taskId: row.taskId,
    family: row.family,
    tier: row.tier,
    difficulty: row.difficulty,
    answerDigest: row.answerDigest
  })));
}
function commitmentFor(rows) {
  return {
    commitmentRef: `holdout://${manifestDigestFor(rows)}`,
    committedAt: COMMITTED_AT,
    sourceFreezeRef: 'source-freeze://benchmark-subject-v1',
    evaluatorRef: 'evaluator://independent-v1',
    suiteVersion,
    corpusDigest: corpusDigestFor(rows),
    manifestDigest: manifestDigestFor(rows),
    taskCount: rows.length,
    rawHoldoutsStoredInRepository: false,
    optimizerAccessBeforeEvaluation: false,
    candidateAccessBeforeEvaluation: false,
    plaintextAnswersExposedBeforeEvaluation: false,
    evaluatorIndependent: true
  };
}

function compileSubjectTrial({ withSubject = true } = {}) {
  const rows = manifest();
  return compileSealedArchitectureTrial({
    architectureId: 'single-model-mimo-pro',
    architectureClass: 'CHALLENGER',
    architectureDigest: digest({ architecture: 'single-model-mimo-pro', revision: 'r1' }),
    architectureRevision: 'r1',
    architectureSourceRef: 'source://single-model-mimo-pro',
    architectureFrozenAt: FROZEN_AT,
    taskClass: 'reasoning',
    suiteVersion,
    corpusDigest: corpusDigestFor(rows),
    sealedManifest: rows,
    holdoutCommitment: commitmentFor(rows),
    runs: rows.map((row, i) => ({
      taskId: row.taskId,
      runId: `run-${i}`,
      evidenceRef: `runtime://mimo-pro/${i}`,
      observedAt: OBSERVED_AT,
      response: `answer-${i + 1}`,
      costUsd: 0.001,
      latencyMs: 100,
      founderMinutes: 0,
      observedProvider: profile.provider,
      observedModel: profile.model,
      observedRevision: profile.revision,
      providerRequestId: `req-mimo-pro-${i}`,
      identityVerification: 'OBSERVED',
      verifierIndependent: true,
      holdoutPromptExposedToOptimizer: false,
      modelJudgedOwnIdentityMarkedAnswer: false
    })),
    processScore: 1,
    processEvidenceRef: 'review://mimo-pro',
    verifierId: 'independent-verifier',
    architectureDesignerId: 'architecture-builder',
    ...(withSubject ? {
      benchmarkSubject: {
        ...profile,
        exclusiveCognitiveSubject: true
      }
    } : {})
  });
}

test('canonical sealed single-model trial mints a live benchmark bound to exact provider/model/revision', () => {
  const trial = compileSubjectTrial();
  assert.equal(trial.ok, true, JSON.stringify(trial));
  assert.equal(validateCompiledSealedArchitectureTrial(trial).ok, true);
  const out = buildLiveFrontierBenchmarkFromSealedTrial({
    sealedTrial: trial,
    profile,
    taskClasses: ['reasoning'],
    now: new Date('2026-09-29T01:03:00.000Z')
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.benchmark.candidate.provider, profile.provider);
  assert.equal(out.benchmark.candidate.model, profile.model);
  assert.equal(out.benchmark.observedRevision, profile.revision);
  assert.equal(out.benchmark.quality, 1);
  assert.equal(out.benchmark.liveRoutingAuthority, 'SEALED_TRIAL_DERIVED_ONLY');
  assert.equal(validateLiveFrontierBenchmark(out.benchmark).ok, true);
});

test('copied or mutated benchmark JSON loses live routing authority', () => {
  const trial = compileSubjectTrial();
  const out = buildLiveFrontierBenchmarkFromSealedTrial({
    sealedTrial: trial,
    profile,
    taskClasses: ['reasoning'],
    now: new Date('2026-09-29T01:03:00.000Z')
  });
  const copied = structuredClone(out.benchmark);
  assert.equal(validateLiveFrontierBenchmark(copied).ok, false);
  assert.ok(validateLiveFrontierBenchmark(copied).reasonCodes.includes('canonical-untampered-live-frontier-benchmark-required'));

  out.benchmark.quality = 0.1;
  assert.equal(validateLiveFrontierBenchmark(out.benchmark).ok, false);
});

test('a sealed architecture trial without a pre-frozen exclusive model subject cannot mint model routing quality', () => {
  const trial = compileSubjectTrial({ withSubject: false });
  assert.equal(trial.ok, true);
  const out = buildLiveFrontierBenchmarkFromSealedTrial({
    sealedTrial: trial,
    profile,
    taskClasses: ['reasoning'],
    now: new Date('2026-09-29T01:03:00.000Z')
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('exclusive-sealed-benchmark-subject-required'));
});

test('post-hoc profile substitution is rejected even when the trial itself is canonical', () => {
  const trial = compileSubjectTrial();
  const out = buildLiveFrontierBenchmarkFromSealedTrial({
    sealedTrial: trial,
    profile: { ...profile, model: 'mimo-v2.6-flash' },
    taskClasses: ['reasoning'],
    now: new Date('2026-09-29T01:03:00.000Z')
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('sealed-benchmark-subject-profile-mismatch'));
});


test('a trial labeled as one model cannot use another model in even one sealed run', () => {
  const rows = manifest();
  const runs = rows.map((row, i) => ({
    taskId: row.taskId,
    runId: `identity-run-${i}`,
    evidenceRef: `runtime://mimo-pro/identity/${i}`,
    observedAt: OBSERVED_AT,
    response: `answer-${i + 1}`,
    costUsd: 0.001,
    latencyMs: 100,
    founderMinutes: 0,
    observedProvider: profile.provider,
    observedModel: i === 3 ? 'mimo-v2.6-flash' : profile.model,
    observedRevision: profile.revision,
    providerRequestId: `req-identity-${i}`,
    identityVerification: 'OBSERVED',
    verifierIndependent: true,
    holdoutPromptExposedToOptimizer: false,
    modelJudgedOwnIdentityMarkedAnswer: false
  }));
  const trial = compileSealedArchitectureTrial({
    architectureId: 'mimo-pro-with-one-substituted-run',
    architectureClass: 'CHALLENGER',
    architectureDigest: digest({ architecture: 'mimo-pro-with-one-substituted-run', revision: 'r1' }),
    architectureRevision: 'r1',
    architectureSourceRef: 'source://mimo-pro-with-one-substituted-run',
    architectureFrozenAt: FROZEN_AT,
    taskClass: 'reasoning',
    suiteVersion,
    corpusDigest: corpusDigestFor(rows),
    sealedManifest: rows,
    holdoutCommitment: commitmentFor(rows),
    runs,
    processScore: 1,
    processEvidenceRef: 'review://identity-substitution',
    verifierId: 'independent-verifier',
    architectureDesignerId: 'architecture-builder',
    benchmarkSubject: { ...profile, exclusiveCognitiveSubject: true }
  });
  assert.equal(trial.ok, false);
  assert.ok(trial.reasonCodes.some(code => code.includes('benchmark-subject-runtime-identity-not-proven')));
});
