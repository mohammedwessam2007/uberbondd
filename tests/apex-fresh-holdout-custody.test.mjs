import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { sealedAnswerDigest } from '../src/nullstar-omega-holdout.mjs';
import {
  apexManifestCorpusDigest,
  apexManifestCommitmentDigest,
  compileSealedArchitectureTrial
} from '../src/apex-sealed-tournament.mjs';
import {
  compileApexFreshHoldoutRequest,
  admitApexFreshHoldout,
  evaluateFreshApexCampaign
} from '../src/apex-fresh-holdout-custody.mjs';

const SHA = 'a'.repeat(40);
const FROZEN = '2026-09-28T18:00:00.000Z';
const COMMITTED = '2026-09-28T18:05:00.000Z';
const OBSERVED = '2026-09-28T18:10:00.000Z';
const FAMILIES = [
  'REASONING','MATHEMATICS','SCIENCE','SOFTWARE_ENGINEERING',
  'DEBUGGING','RESEARCH','CAUSAL_INFERENCE','PLANNING'
];

const H = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const registry = JSON.parse(readFileSync('config/apex-evidence-contamination-registry.json', 'utf8'));

function cohort({ publicFrontier = false } = {}) {
  const rows = [
    {
      architectureId: 'incumbent',
      architectureClass: 'INCUMBENT',
      architectureDigest: H({ id: 'incumbent' }),
      architectureRevision: 'r1',
      architectureSourceRef: 'source://incumbent'
    },
    {
      architectureId: 'challenger',
      architectureClass: 'CHALLENGER',
      architectureDigest: H({ id: 'challenger' }),
      architectureRevision: 'r1',
      architectureSourceRef: 'source://challenger'
    }
  ];
  if (publicFrontier) {
    for (const id of ['public-1','public-2','public-3']) {
      rows.push({
        architectureId: id,
        architectureClass: 'PUBLIC_BASELINE',
        architectureDigest: H({ id }),
        architectureRevision: 'r1',
        architectureSourceRef: `source://${id}`,
        reproductionEvidenceRef: `reproduction://${id}`
      });
    }
  }
  return rows;
}

function request({ publicFrontier = false, overrides = {} } = {}) {
  return compileApexFreshHoldoutRequest({
    campaignId: publicFrontier ? 'public-campaign' : 'campaign-1',
    candidateRevision: SHA,
    architectureFrozenAt: FROZEN,
    architectureCohort: cohort({ publicFrontier }),
    taskClass: 'frontier-reasoning',
    taskFamilies: FAMILIES,
    tasksPerFamily: 12,
    evidencePurpose: 'CONFIRMATORY',
    claimMode: publicFrontier ? 'PUBLIC_FRONTIER' : 'TASK_CLASS',
    minimumPublicBaselines: 3,
    optimizer: {
      id: 'apex-optimizer',
      lineageRef: 'lineage://optimizer-v1',
      contextRef: 'context://optimizer-v1',
      evidenceRefs: ['evidence://optimizer-source']
    },
    evaluator: {
      id: 'independent-evaluator',
      lineageRef: 'lineage://evaluator-v1',
      contextRef: 'context://evaluator-v1',
      evidenceRefs: ['evidence://evaluator-rubric']
    },
    developmentCaseIds: ['dev-1','dev-2'],
    candidateExposedCaseIds: ['dev-1','dev-2'],
    rubricRef: 'rubric://frontier-reasoning-v1',
    ...overrides
  });
}

function manifestFor(req) {
  const rows = [];
  let n = 0;
  for (const family of req.request.taskFamilies) {
    for (let i = 0; i < req.request.tasksPerFamily; i += 1) {
      n += 1;
      const taskId = `opaque-${String(n).padStart(3, '0')}`;
      const answer = `sealed-answer-${n}`;
      rows.push({
        taskId,
        family,
        tier: 'SEALED_HOLDOUT',
        difficulty: 0.7,
        answerDigest: sealedAnswerDigest({
          suiteVersion: `${req.request.requiredSuiteVersionPrefix}nonce-1`,
          taskId,
          answer
        })
      });
    }
  }
  return rows;
}

function commitmentFor(req, manifest, overrides = {}) {
  const suiteVersion = `${req.request.requiredSuiteVersionPrefix}nonce-1`;
  return {
    suiteVersion,
    commitment: {
      commitmentRef: `holdout://${H({ campaign: req.request.campaignId, suiteVersion })}`,
      committedAt: COMMITTED,
      sourceFreezeRef: req.request.sourceFreezeRef,
      evaluatorRef: req.request.evaluator.id,
      suiteVersion,
      corpusDigest: apexManifestCorpusDigest(manifest),
      manifestDigest: apexManifestCommitmentDigest(manifest),
      taskCount: manifest.length,
      rawHoldoutsStoredInRepository: false,
      optimizerAccessBeforeEvaluation: false,
      candidateAccessBeforeEvaluation: false,
      plaintextAnswersExposedBeforeEvaluation: false,
      evaluatorIndependent: true,
      ...overrides
    }
  };
}

function admit(req) {
  const manifest = manifestFor(req);
  const { suiteVersion, commitment } = commitmentFor(req, manifest);
  const admission = admitApexFreshHoldout({
    frozenRequest: req.request,
    requestDigest: req.requestDigest,
    suiteVersion,
    sealedManifest: manifest,
    holdoutCommitment: commitment,
    contaminationRegistry: registry
  });
  return { admission, manifest, commitment, suiteVersion };
}

function trialFor({ admission, manifest, commitment }, identity, correctCount) {
  const runs = manifest.map((task, index) => ({
    taskId: task.taskId,
    runId: `${identity.architectureId}-run-${index}`,
    evidenceRef: `runtime://${identity.architectureId}/${index}`,
    observedAt: OBSERVED,
    response: index < correctCount ? `sealed-answer-${index + 1}` : (index % 4 === 0 ? null : `wrong-${index + 1}`),
    costUsd: 0.02,
    latencyMs: 1200 + index,
    founderMinutes: 0.01,
    verifierIndependent: true,
    holdoutPromptExposedToOptimizer: false,
    modelJudgedOwnIdentityMarkedAnswer: false
  }));
  return compileSealedArchitectureTrial({
    ...identity,
    architectureFrozenAt: FROZEN,
    taskClass: admission.admission.taskClass,
    suiteVersion: admission.admission.suiteVersion,
    corpusDigest: admission.admission.corpusDigest,
    sealedManifest: manifest,
    holdoutCommitment: commitment,
    runs,
    processScore: identity.architectureId === 'challenger' ? 0.98 : 0.9,
    processEvidenceRef: `review://${identity.architectureId}`,
    verifierId: 'independent-verifier',
    architectureDesignerId: 'architecture-builder'
  });
}

test('confirmatory request freezes exact source, evaluator independence, broad family quotas and architecture cohort', () => {
  const out = request();
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.request.expectedTaskCount, 96);
  assert.equal(out.request.taskFamilies.length, 8);
  assert.equal(out.request.architectureCohort.length, 2);
  assert.match(out.request.architectureCohortDigest, /^[a-f0-9]{64}$/);
  assert.equal(out.tournamentAdmissionAuthority, 'ELIGIBLE_AFTER_FRESH_CUSTODY_ADMISSION');
  assert.equal(out.promotionAuthority, 'NONE');
});

test('request refuses shared evaluator lineage and underpowered confirmatory corpus', () => {
  const shared = request({
    overrides: {
      evaluator: {
        id: 'other-evaluator',
        lineageRef: 'lineage://optimizer-v1',
        contextRef: 'context://other',
        evidenceRefs: ['evidence://other']
      }
    }
  });
  assert.equal(shared.ok, false);
  assert.ok(shared.reasonCodes.includes('optimizer-evaluator-lineage-must-differ'));

  const tiny = request({ overrides: { taskFamilies: FAMILIES.slice(0, 4), tasksPerFamily: 6 } });
  assert.equal(tiny.ok, false);
  assert.ok(tiny.reasonCodes.includes('confirmatory-requires-at-least-eight-families-and-96-tasks'));
});

test('fresh custody admission binds exact quotas, manifest, commitment and independent evaluator without raw prompts or answers', () => {
  const req = request();
  const { admission } = admit(req);
  assert.equal(admission.ok, true, JSON.stringify(admission));
  assert.equal(admission.admission.taskCount, 96);
  assert.equal(admission.admission.sourceFreezeRef, req.request.sourceFreezeRef);
  assert.equal(admission.admission.architectureCohortDigest, req.request.architectureCohortDigest);
  assert.equal(admission.tournamentAdmissionAuthority, 'ELIGIBLE_FOR_FRESH_SEALED_TOURNAMENT');
  assert.equal(admission.promotionAuthority, 'NONE');
  assert.equal(JSON.stringify(admission).includes('sealed-answer-1'), false);
});

test('known evaluated or voided Omega commitments and retired suites cannot become fresh APEX evidence', () => {
  const req = request();
  const manifest = manifestFor(req);
  const base = commitmentFor(req, manifest);

  const reused = admitApexFreshHoldout({
    frozenRequest: req.request,
    requestDigest: req.requestDigest,
    suiteVersion: base.suiteVersion,
    sealedManifest: manifest,
    holdoutCommitment: {
      ...base.commitment,
      commitmentRef: 'fcb8217cbed560bb790050f4d113bf20c174f3773b031c8aa6a0673b2535adb0'
    },
    contaminationRegistry: registry
  });
  assert.equal(reused.ok, false);
  assert.ok(reused.reasonCodes.includes('retired-evaluated-or-voided-commitment-reuse-prohibited'));

  const retiredRequest = structuredClone(req.request);
  retiredRequest.requiredSuiteVersionPrefix = 'omega-local-evidence-suite-1.0.0';
  const retiredDigest = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(retiredRequest).sort().map(k=>[k,retiredRequest[k]])))).digest('hex');
  const retired = admitApexFreshHoldout({
    frozenRequest: retiredRequest,
    requestDigest: retiredDigest,
    suiteVersion: 'omega-local-evidence-suite-1.0.0',
    sealedManifest: manifest,
    holdoutCommitment: base.commitment,
    contaminationRegistry: registry
  });
  assert.equal(retired.ok, false);
});

test('raw seeds/prompts and candidate exposure to a holdout are refused', () => {
  const req = request();
  const manifest = manifestFor(req);
  const base = commitmentFor(req, manifest);

  const rawLeak = admitApexFreshHoldout({
    frozenRequest: req.request,
    requestDigest: req.requestDigest,
    suiteVersion: base.suiteVersion,
    sealedManifest: manifest,
    holdoutCommitment: { ...base.commitment, seed: 'secret-seed' },
    contaminationRegistry: registry
  });
  assert.equal(rawLeak.ok, false);
  assert.ok(rawLeak.reasonCodes.includes('raw-seed-salt-prompt-answer-material-prohibited'));

  const exposedReq = structuredClone(req);
  exposedReq.request.candidateExposedCaseIds = [manifest[0].taskId];
  exposedReq.requestDigest = createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(exposedReq.request).sort().map(k=>[k,exposedReq.request[k]])))).digest('hex');
  const exposed = admitApexFreshHoldout({
    frozenRequest: exposedReq.request,
    requestDigest: exposedReq.requestDigest,
    suiteVersion: base.suiteVersion,
    sealedManifest: manifest,
    holdoutCommitment: base.commitment,
    contaminationRegistry: registry
  });
  assert.equal(exposed.ok, false);
});

test('fresh campaign requires every frozen architecture and preserves reviewed-set-only authority', () => {
  const req = request({ publicFrontier: true });
  const pack = admit(req);
  assert.equal(pack.admission.ok, true, JSON.stringify(pack.admission));

  const scores = new Map([
    ['incumbent', 68],
    ['challenger', 95],
    ['public-1', 74],
    ['public-2', 77],
    ['public-3', 80]
  ]);
  const trials = req.request.architectureCohort.map(identity =>
    trialFor(pack, identity, scores.get(identity.architectureId))
  );
  assert.equal(trials.every(trial => trial.ok), true, JSON.stringify(trials.filter(trial => !trial.ok)));

  const result = evaluateFreshApexCampaign({
    admission: pack.admission,
    trials,
    incumbentArchitectureId: 'incumbent',
    budgetPolicy: {
      normalization: 'COMMON_CEILING',
      maxMeanCostUsd: 0.05,
      maxMeanFounderMinutes: 0.05,
      maxMeanLatencyMs: 5000
    },
    minimumSampleSize: 80,
    qualityFloorDelta: 0.01
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'FRESH_PUBLIC_REVIEW_SET_LEADER_REPLICATION_CANDIDATE');
  assert.equal(result.leaderArchitectureId, 'challenger');
  assert.equal(result.globalRankAuthority, 'NONE');
  assert.equal(result.percentileAuthority, 'REVIEWED_SET_ONLY');
  assert.equal(result.promotionAuthority, 'NONE');

  const cherryPicked = evaluateFreshApexCampaign({
    admission: pack.admission,
    trials: trials.filter(trial => trial.architectureId !== 'public-3'),
    incumbentArchitectureId: 'incumbent',
    budgetPolicy: {
      normalization: 'COMMON_CEILING',
      maxMeanCostUsd: 0.05,
      maxMeanFounderMinutes: 0.05,
      maxMeanLatencyMs: 5000
    }
  });
  assert.equal(cherryPicked.ok, false);
  assert.ok(cherryPicked.reasonCodes.includes('complete-frozen-architecture-cohort-required'));
});
