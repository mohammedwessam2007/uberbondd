import test from 'node:test';
import assert from 'node:assert/strict';
import { sealedAnswerDigest } from '../src/nullstar-omega-holdout.mjs';
import {
  compileSealedArchitectureTrial,
  evaluateSealedArchitectureTournament
} from '../src/apex-sealed-tournament.mjs';

const suiteVersion = 'apex-sealed-test-v1';
const corpusDigest = 'c'.repeat(64);

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

function runsFor(manifest, correctCount, prefix) {
  return manifest.map((task, index) => ({
    taskId: task.taskId,
    runId: `${prefix}-run-${index}`,
    evidenceRef: `runtime://${prefix}/${index}`,
    response: index < correctCount ? `answer-${index + 1}` : (index % 3 === 0 ? null : `wrong-${index + 1}`),
    costUsd: 0.02,
    latencyMs: 1000 + index,
    founderMinutes: 0.01
  }));
}

function compile(name, correctCount, manifest = fixture()) {
  return compileSealedArchitectureTrial({
    architectureId: name,
    taskClass: 'reasoning',
    suiteVersion,
    corpusDigest,
    sealedManifest: manifest,
    runs: runsFor(manifest, correctCount, name),
    processScore: name === 'challenger' ? 0.98 : 0.93,
    processEvidenceRef: `review://${name}`,
    verifierId: 'independent-verifier',
    architectureDesignerId: 'architecture-builder'
  });
}

test('sealed bridge compiles exact-digest task results without exposing responses or plaintext answers', () => {
  const manifest = fixture(20);
  const out = compile('incumbent', 18, manifest);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.statistics.sampleSize, 20);
  assert.equal(out.statistics.correct, 18);
  assert.equal(out.arenaTrial.verifiedSuccessRate, 0.9);
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
    taskClass: 'reasoning',
    suiteVersion,
    corpusDigest,
    sealedManifest: manifest,
    runs,
    processScore: 0.9,
    processEvidenceRef: 'review://mixed',
    verifierId: 'v2',
    architectureDesignerId: 'builder'
  });
  assert.equal(out.ok, true);
  assert.equal(out.statistics.correct, 18);
  assert.equal(out.statistics.abstained, 1);
  assert.equal(out.statistics.incorrect, 1);
  assert.equal(out.statistics.falsePositiveRate, 0.05);
  assert.equal(out.statistics.abstentionRate, 0.05);
});

test('sealed bridge refuses incomplete coverage, duplicate run evidence, and self-verification identity', () => {
  const manifest = fixture(20);
  const incomplete = compileSealedArchitectureTrial({
    architectureId: 'incomplete',
    taskClass: 'reasoning',
    suiteVersion,
    corpusDigest,
    sealedManifest: manifest,
    runs: runsFor(manifest, 20, 'incomplete').slice(0, 19),
    processScore: 1,
    processEvidenceRef: 'review://incomplete',
    verifierId: 'v',
    architectureDesignerId: 'b'
  });
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.reasonCodes.includes('complete-sealed-manifest-coverage-required'));

  const duplicateRuns = runsFor(manifest, 20, 'duplicate');
  duplicateRuns[1].evidenceRef = duplicateRuns[0].evidenceRef;
  const duplicated = compileSealedArchitectureTrial({
    architectureId: 'duplicate',
    taskClass: 'reasoning',
    suiteVersion,
    corpusDigest,
    sealedManifest: manifest,
    runs: duplicateRuns,
    processScore: 1,
    processEvidenceRef: 'review://duplicate',
    verifierId: 'v',
    architectureDesignerId: 'b'
  });
  assert.equal(duplicated.ok, false);
  assert.ok(duplicated.reasonCodes.some(code => code.includes('independent-run-evidence-required')));

  const selfVerified = compileSealedArchitectureTrial({
    architectureId: 'self',
    taskClass: 'reasoning',
    suiteVersion,
    corpusDigest,
    sealedManifest: manifest,
    runs: runsFor(manifest, 20, 'self'),
    processScore: 1,
    processEvidenceRef: 'review://self',
    verifierId: 'same',
    architectureDesignerId: 'same'
  });
  assert.equal(selfVerified.ok, false);
  assert.ok(selfVerified.reasonCodes.includes('verifier-must-differ-from-architecture-designer'));
});

test('tournament can nominate a statistically separated challenger only for independent replication', () => {
  const manifest = fixture(100);
  const incumbent = compile('incumbent', 70, manifest);
  const challenger = compile('challenger', 96, manifest);
  assert.equal(incumbent.ok, true);
  assert.equal(challenger.ok, true);

  const out = evaluateSealedArchitectureTournament({
    trials: [incumbent, challenger],
    incumbentArchitectureId: 'incumbent',
    minimumSampleSize: 20,
    qualityFloorDelta: 0.01
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.leaderArchitectureId, 'challenger');
  assert.equal(out.status, 'SEALED_CHALLENGER_REPLICATION_CANDIDATE');
  assert.equal(out.confidenceGate.clearSuccessSeparation, true);
  assert.equal(out.replicationRequiredBeforePromotion, true);
  assert.equal(out.promotionAuthority, 'NONE');
  assert.equal(out.productionActivationAuthorized, false);
});

test('tournament refuses corpus mismatch and duplicate architecture identity', () => {
  const manifest = fixture(30);
  const a = compile('a', 25, manifest);
  const b = compile('b', 26, manifest);
  b.corpusDigest = 'd'.repeat(64);
  const mismatch = evaluateSealedArchitectureTournament({
    trials: [a, b],
    incumbentArchitectureId: 'a'
  });
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.reasonCodes.some(code => code.includes('corpus-digest-mismatch')));

  const duplicate = evaluateSealedArchitectureTournament({
    trials: [a, { ...a, receiptDigest: 'e'.repeat(64) }],
    incumbentArchitectureId: 'a'
  });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.reasonCodes.some(code => code.includes('unique-architecture-required')));
});
