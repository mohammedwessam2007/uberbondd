import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sealedAnswerDigest } from '../src/nullstar-omega-holdout.mjs';
import {
  compileSealedArchitectureTrial,
  evaluateSealedArchitectureTournament
} from '../src/apex-sealed-tournament.mjs';

const suiteVersion = 'apex-sealed-test-v1';
const COMMITTED_AT = '2026-09-28T20:00:00.000Z';
const FROZEN_AT = '2026-09-28T20:01:00.000Z';
const OBSERVED_AT = '2026-09-28T20:02:00.000Z';

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

function fixture(count = 50) {
  const manifest = [];
  for (let i = 0; i < count; i += 1) {
    const taskId = `task-${String(i + 1).padStart(3, '0')}`;
    const answer = `answer-${i + 1}`;
    manifest.push({
      taskId,
      family: i % 2 === 0 ? 'REASONING' : 'DEBUGGING',
      tier: 'SEALED_HOLDOUT',
      difficulty: 0.7,
      answerDigest: sealedAnswerDigest({ suiteVersion, taskId, answer })
    });
  }
  return manifest;
}

function corpusDigestFor(manifest) {
  return rawDigest(JSON.stringify(manifest.map(row => [row.taskId, row.family, row.tier, row.answerDigest])));
}

function manifestDigestFor(manifest) {
  return digest(manifest.map(row => ({
    taskId: row.taskId,
    family: row.family,
    tier: row.tier,
    difficulty: row.difficulty,
    answerDigest: row.answerDigest
  })));
}

function commitmentFor(manifest) {
  return {
    commitmentRef: `holdout://${manifestDigestFor(manifest)}`,
    committedAt: COMMITTED_AT,
    sourceFreezeRef: 'source-freeze://sealed-suite-v1',
    evaluatorRef: 'evaluator://independent-v1',
    suiteVersion,
    corpusDigest: corpusDigestFor(manifest),
    manifestDigest: manifestDigestFor(manifest),
    taskCount: manifest.length,
    rawHoldoutsStoredInRepository: false,
    optimizerAccessBeforeEvaluation: false,
    candidateAccessBeforeEvaluation: false,
    plaintextAnswersExposedBeforeEvaluation: false,
    evaluatorIndependent: true
  };
}

function runsFor(manifest, correctCount, prefix, overrides = {}) {
  return manifest.map((task, index) => ({
    taskId: task.taskId,
    runId: `${prefix}-run-${index}`,
    evidenceRef: `runtime://${prefix}/${index}`,
    observedAt: OBSERVED_AT,
    response: index < correctCount ? `answer-${index + 1}` : (index % 3 === 0 ? null : `wrong-${index + 1}`),
    costUsd: 0.02,
    latencyMs: 1000 + index,
    founderMinutes: 0.01,
    verifierIndependent: true,
    holdoutPromptExposedToOptimizer: false,
    modelJudgedOwnIdentityMarkedAnswer: false,
    ...overrides
  }));
}

function compile(name, correctCount, manifest = fixture(), options = {}) {
  const architectureClass = options.architectureClass || (name === 'incumbent' ? 'INCUMBENT' : 'CHALLENGER');
  return compileSealedArchitectureTrial({
    architectureId: name,
    architectureClass,
    architectureDigest: digest({ architecture: name, revision: options.revision || 'r1' }),
    architectureRevision: options.revision || 'r1',
    architectureSourceRef: options.architectureSourceRef || `source://${name}`,
    architectureFrozenAt: FROZEN_AT,
    reproductionEvidenceRef: architectureClass === 'PUBLIC_BASELINE' ? `reproduction://${name}` : null,
    taskClass: 'reasoning',
    suiteVersion,
    corpusDigest: corpusDigestFor(manifest),
    sealedManifest: manifest,
    holdoutCommitment: commitmentFor(manifest),
    runs: runsFor(manifest, correctCount, name),
    processScore: name === 'challenger' ? 0.98 : 0.93,
    processEvidenceRef: `review://${name}`,
    verifierId: 'independent-verifier',
    architectureDesignerId: 'architecture-builder'
  });
}

const budgetPolicy = {
  normalization: 'COMMON_CEILING',
  maxMeanCostUsd: 0.05,
  maxMeanFounderMinutes: 0.05,
  maxMeanLatencyMs: 5000
};

test('sealed bridge binds manifest, commitment and frozen architecture without exposing responses or plaintext answers', () => {
  const manifest = fixture(20);
  const out = compile('incumbent', 18, manifest);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.statistics.sampleSize, 20);
  assert.equal(out.statistics.correct, 18);
  assert.equal(out.arenaTrial.verifiedSuccessRate, 0.9);
  assert.equal(out.architectureIdentity.architectureClass, 'INCUMBENT');
  assert.equal(out.holdoutCommitment.corpusDigest, corpusDigestFor(manifest));
  assert.equal(out.manifestDigest, manifestDigestFor(manifest));
  assert.equal(out.promotionAuthority, 'NONE');
  assert.equal(out.executionAuthority, 'NONE');
  assert.equal(out.sealedPromptAccessGranted, false);
  assert.equal(out.plaintextAnswerAccessGranted, false);
  const serialized = JSON.stringify(out);
  assert.equal(serialized.includes('answer-1'), false);
  assert.equal(serialized.includes('wrong-19'), false);
  assert.match(out.receiptDigest, /^[a-f0-9]{64}$/);
  assert.match(out.taskOutcomeDigest, /^[a-f0-9]{64}$/);
});

test('sealed bridge distinguishes abstention from an incorrect answer', () => {
  const manifest = fixture(20);
  const runs = runsFor(manifest, 18, 'mixed');
  runs[18].response = null;
  runs[19].response = 'wrong-20';
  const out = compileSealedArchitectureTrial({
    architectureId: 'mixed',
    architectureClass: 'CHALLENGER',
    architectureDigest: digest({ architecture: 'mixed' }),
    architectureRevision: 'r1',
    architectureSourceRef: 'source://mixed',
    architectureFrozenAt: FROZEN_AT,
    taskClass: 'reasoning',
    suiteVersion,
    corpusDigest: corpusDigestFor(manifest),
    sealedManifest: manifest,
    holdoutCommitment: commitmentFor(manifest),
    runs,
    processScore: 0.9,
    processEvidenceRef: 'review://mixed',
    verifierId: 'v2',
    architectureDesignerId: 'builder'
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.statistics.correct, 18);
  assert.equal(out.statistics.abstained, 1);
  assert.equal(out.statistics.incorrect, 1);
  assert.equal(out.statistics.falsePositiveRate, 0.05);
  assert.equal(out.statistics.abstentionRate, 0.05);
});

test('sealed bridge refuses incomplete coverage, duplicate evidence, self-verification, forged corpus identity and future evidence', () => {
  const manifest = fixture(20);
  const base = {
    architectureId: 'bad',
    architectureClass: 'CHALLENGER',
    architectureDigest: digest({ architecture: 'bad' }),
    architectureRevision: 'r1',
    architectureSourceRef: 'source://bad',
    architectureFrozenAt: FROZEN_AT,
    taskClass: 'reasoning',
    suiteVersion,
    corpusDigest: corpusDigestFor(manifest),
    sealedManifest: manifest,
    holdoutCommitment: commitmentFor(manifest),
    processScore: 1,
    processEvidenceRef: 'review://bad',
    verifierId: 'v',
    architectureDesignerId: 'b'
  };

  const incomplete = compileSealedArchitectureTrial({
    ...base,
    runs: runsFor(manifest, 20, 'incomplete').slice(0, 19)
  });
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.reasonCodes.includes('complete-sealed-manifest-coverage-required'));

  const duplicateRuns = runsFor(manifest, 20, 'duplicate');
  duplicateRuns[1].evidenceRef = duplicateRuns[0].evidenceRef;
  const duplicated = compileSealedArchitectureTrial({ ...base, runs: duplicateRuns });
  assert.equal(duplicated.ok, false);
  assert.ok(duplicated.reasonCodes.some(code => code.includes('independent-run-evidence-required')));

  const selfVerified = compileSealedArchitectureTrial({
    ...base,
    runs: runsFor(manifest, 20, 'self'),
    verifierId: 'same',
    architectureDesignerId: 'same'
  });
  assert.equal(selfVerified.ok, false);
  assert.ok(selfVerified.reasonCodes.includes('verifier-must-differ-from-architecture-designer'));

  const forgedCorpus = compileSealedArchitectureTrial({
    ...base,
    corpusDigest: 'f'.repeat(64),
    runs: runsFor(manifest, 20, 'forged')
  });
  assert.equal(forgedCorpus.ok, false);
  assert.ok(forgedCorpus.reasonCodes.includes('declared-corpus-digest-does-not-bind-sealed-manifest'));

  const future = new Date(Date.now() + 3600_000).toISOString();
  const futureRuns = runsFor(manifest, 20, 'future', { observedAt: future });
  const futureEvidence = compileSealedArchitectureTrial({ ...base, runs: futureRuns });
  assert.equal(futureEvidence.ok, false);
  assert.ok(futureEvidence.reasonCodes.some(code => code.includes('future-run-evidence-prohibited')));
});

test('tournament can nominate a statistically separated challenger only for independent replication under common ceilings', () => {
  const manifest = fixture(100);
  const incumbent = compile('incumbent', 70, manifest);
  const challenger = compile('challenger', 96, manifest);
  assert.equal(incumbent.ok, true);
  assert.equal(challenger.ok, true);

  const out = evaluateSealedArchitectureTournament({
    trials: [incumbent, challenger],
    incumbentArchitectureId: 'incumbent',
    budgetPolicy,
    minimumSampleSize: 20,
    qualityFloorDelta: 0
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.leaderArchitectureId, 'challenger');
  assert.equal(out.status, 'SEALED_CHALLENGER_REPLICATION_CANDIDATE');
  assert.equal(out.confidenceGate.clearSuccessSeparationVsIncumbent, true);
  assert.equal(out.replicationRequiredBeforePromotion, true);
  assert.equal(out.promotionAuthority, 'NONE');
  assert.equal(out.productionActivationAuthorized, false);
  assert.equal(out.globalRankAuthority, 'NONE');
});

test('public-frontier mode refuses too few reproducible public baselines and cannot manufacture a global rank', () => {
  const manifest = fixture(100);
  const incumbent = compile('incumbent', 70, manifest);
  const challenger = compile('challenger', 96, manifest);
  const baseline1 = compile('public-1', 75, manifest, { architectureClass: 'PUBLIC_BASELINE' });
  const baseline2 = compile('public-2', 78, manifest, { architectureClass: 'PUBLIC_BASELINE' });

  const blocked = evaluateSealedArchitectureTournament({
    trials: [incumbent, challenger, baseline1, baseline2],
    incumbentArchitectureId: 'incumbent',
    claimMode: 'PUBLIC_FRONTIER',
    minimumPublicBaselines: 3,
    budgetPolicy
  });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasonCodes.includes('minimum-public-baseline-coverage-not-met'));

  const baseline3 = compile('public-3', 80, manifest, { architectureClass: 'PUBLIC_BASELINE' });
  const reviewed = evaluateSealedArchitectureTournament({
    trials: [incumbent, challenger, baseline1, baseline2, baseline3],
    incumbentArchitectureId: 'incumbent',
    claimMode: 'PUBLIC_FRONTIER',
    minimumPublicBaselines: 3,
    budgetPolicy
  });
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed));
  assert.equal(reviewed.status, 'PUBLIC_REVIEW_SET_LEADER_REPLICATION_CANDIDATE');
  assert.equal(reviewed.globalRankAuthority, 'NONE');
  assert.equal(reviewed.percentileAuthority, 'REVIEWED_SET_ONLY');
});

test('tournament refuses corpus mismatch, duplicate architecture identity and common-ceiling violations', () => {
  const manifest = fixture(30);
  const a = compile('a', 25, manifest);
  const b = compile('b', 26, manifest);
  b.corpusDigest = 'd'.repeat(64);
  const mismatch = evaluateSealedArchitectureTournament({
    trials: [a, b],
    incumbentArchitectureId: 'a',
    budgetPolicy
  });
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.reasonCodes.some(code => code.includes('corpus-digest-mismatch')));

  const duplicate = evaluateSealedArchitectureTournament({
    trials: [a, { ...a, receiptDigest: 'e'.repeat(64) }],
    incumbentArchitectureId: 'a',
    budgetPolicy
  });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.reasonCodes.some(code => code.includes('unique-architecture-required')));

  const slow = compile('slow', 29, manifest);
  slow.economics.meanLatencyMs = 60_000;
  const ceiling = evaluateSealedArchitectureTournament({
    trials: [a, slow],
    incumbentArchitectureId: 'a',
    budgetPolicy
  });
  assert.equal(ceiling.ok, false);
  assert.ok(ceiling.reasonCodes.some(code => code.includes('common-latency-ceiling-exceeded')));
});


test('sealed tournament refuses any caller attempt to reopen a nonzero quality delta', () => {
  const manifest = fixture(30);
  const incumbent = compile('incumbent-zero-loss-guard', 25, manifest);
  const challenger = compile('challenger-zero-loss-guard', 25, manifest);
  const out = evaluateSealedArchitectureTournament({
    trials: [incumbent, challenger],
    incumbentArchitectureId: 'incumbent-zero-loss-guard',
    budgetPolicy,
    minimumSampleSize: 20,
    qualityFloorDelta: 0.000001
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('absolute-frontier-quality-delta-must-be-zero'));
});


test('same aggregate quality with a swapped task regression cannot become a zero-loss compression candidate', () => {
  const manifest = fixture(20);
  const incumbent = compile('incumbent', 18, manifest);

  const challengerRuns = runsFor(manifest, 18, 'challenger-swap', { costUsd: 0.005 });
  challengerRuns[17].response = 'wrong-18';
  challengerRuns[18].response = 'answer-19';

  const challenger = compileSealedArchitectureTrial({
    architectureId: 'challenger',
    architectureClass: 'CHALLENGER',
    architectureDigest: digest({ architecture: 'challenger-swap', revision: 'r1' }),
    architectureRevision: 'r1',
    architectureSourceRef: 'source://challenger-swap',
    architectureFrozenAt: FROZEN_AT,
    taskClass: 'reasoning',
    suiteVersion,
    corpusDigest: corpusDigestFor(manifest),
    sealedManifest: manifest,
    holdoutCommitment: commitmentFor(manifest),
    runs: challengerRuns,
    processScore: 0.98,
    processEvidenceRef: 'review://challenger-swap',
    verifierId: 'independent-verifier',
    architectureDesignerId: 'architecture-builder'
  });

  assert.equal(incumbent.ok, true);
  assert.equal(challenger.ok, true);
  assert.equal(incumbent.statistics.verifiedSuccessRate, challenger.statistics.verifiedSuccessRate);

  const out = evaluateSealedArchitectureTournament({
    trials: [incumbent, challenger],
    incumbentArchitectureId: 'incumbent',
    budgetPolicy,
    minimumSampleSize: 20,
    qualityFloorDelta: 0
  });

  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.leaderArchitectureId, 'challenger');
  assert.equal(out.zeroLossGate.certifiedVsIncumbent, false);
  assert.ok(out.zeroLossGate.certificationVsIncumbent.reasonCodes.includes('paired-task-regression-detected'));
  assert.equal(out.status, 'SEALED_CHALLENGER_SIGNAL_REQUIRES_REPLICATION');
});
