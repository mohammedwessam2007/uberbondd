import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

import { sealedAnswerDigest } from '../src/nullstar-omega-holdout.mjs';
import { compileSealedArchitectureTrial } from '../src/apex-sealed-tournament.mjs';
import {
  compileFrontierVmBurnInCampaign,
  certifyBurnInPair,
  assessAblationContribution,
  compileFalsificationChecklist
} from '../src/frontier-vm-burnin.mjs';

const suiteVersion = 'frontier-vm-burnin-test-v1';
const COMMITTED_AT = '2026-09-28T20:00:00.000Z';
const FROZEN_AT = '2026-09-28T20:01:00.000Z';
const OBSERVED_AT = '2026-09-28T20:02:00.000Z';

const stable = value => Array.isArray(value)
  ? value.map(stable)
  : (!value || typeof value !== 'object')
    ? value
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const rawDigest = value => crypto.createHash('sha256').update(String(value)).digest('hex');

function manifest(count = 20) {
  return Array.from({ length: count }, (_, i) => {
    const taskId = `task-${i + 1}`;
    const answer = `answer-${i + 1}`;
    return {
      taskId,
      family: 'REASONING',
      tier: 'SEALED_HOLDOUT',
      difficulty: 0.8,
      answerDigest: sealedAnswerDigest({ suiteVersion, taskId, answer })
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

function commitment(rows) {
  return {
    commitmentRef: 'holdout://frontier-vm-burnin',
    committedAt: COMMITTED_AT,
    sourceFreezeRef: 'source-freeze://frontier-vm-burnin',
    evaluatorRef: 'evaluator://independent',
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

function trial(architectureId, costUsd, processScore = 1, count = 20) {
  const rows = manifest(count);
  return compileSealedArchitectureTrial({
    architectureId,
    architectureClass: architectureId === 'direct-crown' ? 'INCUMBENT' : 'CHALLENGER',
    architectureDigest: digest({ architectureId }),
    architectureRevision: 'r1',
    architectureSourceRef: `source://${architectureId}`,
    architectureFrozenAt: FROZEN_AT,
    taskClass: 'reasoning',
    suiteVersion,
    corpusDigest: corpusDigestFor(rows),
    sealedManifest: rows,
    holdoutCommitment: commitment(rows),
    runs: rows.map((row, index) => ({
      taskId: row.taskId,
      runId: `${architectureId}-run-${index}`,
      evidenceRef: `runtime://${architectureId}/${index}`,
      observedAt: OBSERVED_AT,
      response: `answer-${index + 1}`,
      costUsd,
      latencyMs: 1000,
      founderMinutes: 0,
      verifierIndependent: true,
      holdoutPromptExposedToOptimizer: false,
      modelJudgedOwnIdentityMarkedAnswer: false
    })),
    processScore,
    processEvidenceRef: `review://${architectureId}`,
    verifierId: 'independent-verifier',
    architectureDesignerId: 'architecture-builder'
  });
}

test('burn-in campaign freezes direct Crown, full VM, and one ablation per compiler pass', () => {
  const out = compileFrontierVmBurnInCampaign({
    campaignId: 'campaign-1',
    taskClass: 'reasoning',
    crownArchitecture: { architectureId: 'direct-crown', architectureDigest: 'a'.repeat(64) },
    candidateArchitecture: { architectureId: 'frontier-vm', architectureDigest: 'b'.repeat(64) },
    compilerPasses: ['CSE', 'PARTIAL_EVALUATION', 'JEV_VECTORIZE'],
    minimumTaskCount: 100,
    monthlyBudgetUsd: 30,
    ablationBudgetFraction: 0.25
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.campaign.variants.length, 5);
  assert.equal(out.campaign.primaryBudgetUsd, 22.5);
  assert.equal(out.campaign.ablationBudgetUsd, 7.5);
  assert.equal(out.rawHoldoutsAuthorizedInRepository, false);
  assert.equal(out.promotionAuthority, 'NONE');
});

test('burn-in pair can mint canonical zero-loss evidence only from live sealed trial objects', () => {
  const baseline = trial('direct-crown', 0.02);
  const candidate = trial('frontier-vm', 0.005);
  assert.equal(baseline.ok, true, JSON.stringify(baseline));
  assert.equal(candidate.ok, true, JSON.stringify(candidate));

  const out = certifyBurnInPair({
    baselineTrial: baseline,
    candidateTrial: candidate,
    requireEconomicsImprovement: true,
    minimumTaskCount: 20
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'FRONTIER_VM_BURNIN_ZERO_LOSS_EVIDENCE_READY');
  assert.equal(out.economicsImproved, true);
  assert.equal(out.promotionAuthority, 'NONE');

  const copied = structuredClone(candidate);
  const forged = certifyBurnInPair({
    baselineTrial: baseline,
    candidateTrial: copied,
    requireEconomicsImprovement: true,
    minimumTaskCount: 20
  });
  assert.equal(forged.ok, false);
  assert.ok(forged.reasonCodes.includes('canonical-sealed-candidate-required'));
});

test('ablation reports whether removing a pass worsens cost or quality', () => {
  const full = trial('frontier-vm-full', 0.005);
  const ablation = trial('frontier-vm-ablate-cse', 0.01);
  const out = assessAblationContribution({
    fullCandidateTrial: full,
    ablationTrial: ablation,
    passName: 'CSE'
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.qualityRegression, false);
  assert.ok(out.costDeltaUsd > 0);
  assert.equal(out.interpretation, 'PASS_CONTRIBUTES_MEASURED_COST_COMPRESSION_WITHOUT_OBSERVED_QUALITY_GAIN_NEEDED');
});

test('falsification policy refuses any nonzero quality-loss tolerance', () => {
  const good = compileFalsificationChecklist();
  assert.equal(good.ok, true);
  assert.ok(good.killConditions.includes('ANY_PAIRED_REQUIRED_QUALITY_REGRESSION'));

  const bad = compileFalsificationChecklist({
    maxAllowedPairedRegressions: 1,
    maxAllowedQualityDelta: 0
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.reasonCodes.includes('quality-regression-tolerance-must-remain-zero'));
});
