import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  compileModelAdaptationPlan,
  evaluateAdaptedServingArtifact,
  MODEL_ADAPTATION_LIFECYCLE_VERSION,
  ADAPTATION_PRIOR_STAGES
} from '../src/model-adaptation-lifecycle.mjs';
import { COMPOUND_INTELLIGENCE_EVALUATION_VERSION } from '../src/compound-intelligence-evaluation.mjs';
import { CAPABILITY_SCALED_SECURITY_VERSION } from '../src/capability-scaled-security.mjs';

const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
};
const digest = value => `sha256:${crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')}`;
const D = char => `sha256:${char.repeat(64)}`;

function example(exampleId, split, char, overrides = {}) {
  return {
    exampleId,
    contentDigest: D(char),
    split,
    sourceRef: `source:${exampleId}`,
    provenanceRef: `provenance:${exampleId}`,
    licenseStatus: 'USABLE',
    consentBasis: 'PUBLIC_LICENSED_NO_PERSONAL_DATA',
    privacyStatus: 'CLEARED',
    labelClass: 'OBSERVED',
    groundTruthEligible: true,
    ...overrides
  };
}

function normalizedDatasetDigest(dataset) {
  const examples = dataset.examples.map(raw => {
    const labelClass = String(raw.labelClass).toUpperCase();
    const synthetic = ['SYNTHETIC_LABELLED', 'ADVERSARIAL_GENERATED'].includes(labelClass);
    return {
      exampleId: raw.exampleId,
      contentDigest: raw.contentDigest.toLowerCase(),
      split: raw.split.toUpperCase(),
      sourceRef: raw.sourceRef,
      provenanceRef: raw.provenanceRef,
      licenseStatus: raw.licenseStatus.toUpperCase(),
      consentBasis: raw.consentBasis.toUpperCase(),
      privacyStatus: raw.privacyStatus.toUpperCase(),
      labelClass,
      synthetic,
      groundTruthEligible: raw.groundTruthEligible === true
    };
  }).sort((a, b) => a.exampleId.localeCompare(b.exampleId));
  return digest({ datasetId: dataset.datasetId, revision: dataset.revision, examples });
}

function dataset() {
  return {
    datasetId: 'adapt-data',
    revision: 'data@3',
    examples: [
      example('train-1', 'TRAIN', '1'),
      example('train-adv', 'TRAIN', '2', { labelClass: 'ADVERSARIAL_GENERATED', groundTruthEligible: false }),
      example('dev-1', 'DEV', '3', { labelClass: 'HUMAN_VERIFIED' }),
      example('held-1', 'HELDOUT', '4')
    ]
  };
}

function planInput() {
  const data = dataset();
  const datasetDigest = normalizedDatasetDigest(data);
  return {
    candidateId: 'adapted-model',
    method: 'LORA',
    baseModel: {
      modelId: 'open-base',
      revision: 'base@7',
      weightsDigest: D('a'),
      licenseRef: 'license:open-base',
      entitlementRef: 'entitlement:owner-compute',
      ownershipClass: 'OPEN_LOCAL',
      supportedMethods: ['LORA', 'FINE_TUNE']
    },
    residualBottleneck: {
      metric: 'heldout-quality',
      measurementEvidenceRef: 'eval:residual-bottleneck',
      baselineScore: 0.61,
      targetScore: 0.70
    },
    priorStages: ADAPTATION_PRIOR_STAGES.map(stage => ({ stage, status: 'INSUFFICIENT', evidenceRef: `prior:${stage}` })),
    dataset: data,
    contaminationScan: {
      scannerRef: 'scanner:dedupe-v2',
      scanEvidenceRef: 'scan:receipt-1',
      scannedDatasetDigest: datasetDigest,
      observedAt: '2026-09-09T00:00:00Z',
      exactHoldoutExposureCount: 0,
      nearDuplicateCrossSplitCount: 0
    },
    computeAuthority: {
      authorized: true,
      authorityRef: 'compute-authority:bounded-1',
      maxComputeUnits: 1000,
      maxSpendCents: 500,
      expiresAt: '2026-09-10T00:00:00Z'
    },
    proposedAt: '2026-09-09T00:30:00Z'
  };
}

const expectPlanReason = (input, reason) => {
  const out = compileModelAdaptationPlan(input);
  assert.equal(out.ok, false, JSON.stringify(out));
  assert.ok(out.reasonCodes.includes(reason), JSON.stringify(out));
};

test('adaptation plan is bounded and grants no training or promotion authority', () => {
  const out = compileModelAdaptationPlan(planInput());
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'MODEL_ADAPTATION_TRAINING_PLAN_ADMISSIBLE__EXECUTION_SEPARATE');
  assert.equal(out.trainingAuthority, 'NONE');
  assert.equal(out.promotionAuthority, 'NONE');
  assert.equal(out.plan.dataset.syntheticExamples, 1);
  assert.equal(out.plan.dataset.splitCounts.HELDOUT, 1);
});

test('adaptation is last resort after every cheaper stage is dispositioned', () => {
  const input = planInput();
  input.priorStages.pop();
  expectPlanReason(input, 'all-cheaper-prior-improvement-stages-must-be-dispositioned');
});

test('base model must authorize the requested adaptation method', () => {
  const input = planInput();
  input.method = 'DISTILLATION';
  expectPlanReason(input, 'base-model-does-not-support-requested-adaptation-method');
});

test('dataset requires usable license consent privacy provenance and all three splits', () => {
  const license = planInput();
  license.dataset.examples[0].licenseStatus = 'UNKNOWN';
  expectPlanReason(license, 'valid-provenance-license-consent-privacy-split-dataset-required');
  const split = planInput();
  split.dataset.examples = split.dataset.examples.filter(row => row.split !== 'HELDOUT');
  split.contaminationScan.scannedDatasetDigest = normalizedDatasetDigest(split.dataset);
  expectPlanReason(split, 'valid-provenance-license-consent-privacy-split-dataset-required');
});

test('synthetic or adversarial data cannot silently become ground truth', () => {
  const input = planInput();
  input.dataset.examples[1].groundTruthEligible = true;
  expectPlanReason(input, 'valid-provenance-license-consent-privacy-split-dataset-required');
});

test('exact duplicate content across train and heldout is refused before training', () => {
  const input = planInput();
  input.dataset.examples.find(row => row.split === 'HELDOUT').contentDigest = input.dataset.examples.find(row => row.split === 'TRAIN').contentDigest;
  expectPlanReason(input, 'content-digest-cross-split-leakage');
});

test('contamination scan binds exact dataset and refuses known exposure or near duplicates', () => {
  const mismatch = planInput();
  mismatch.contaminationScan.scannedDatasetDigest = D('f');
  expectPlanReason(mismatch, 'contamination-scan-must-bind-exact-dataset');
  const exposed = planInput();
  exposed.contaminationScan.exactHoldoutExposureCount = 1;
  expectPlanReason(exposed, 'contaminated-or-cross-split-near-duplicate-dataset-refused');
  const near = planInput();
  near.contaminationScan.nearDuplicateCrossSplitCount = 2;
  expectPlanReason(near, 'contaminated-or-cross-split-near-duplicate-dataset-refused');
});

test('contamination evidence must be fresh and predate the proposal', () => {
  const future = planInput();
  future.contaminationScan.observedAt = '2026-09-09T01:00:00Z';
  expectPlanReason(future, 'fresh-preproposal-contamination-scan-required');
  const stale = planInput();
  stale.contaminationScan.observedAt = '2026-09-07T00:00:00Z';
  expectPlanReason(stale, 'fresh-preproposal-contamination-scan-required');
});

test('compute authority must be explicit bounded current and numeric', () => {
  const expired = planInput();
  expired.computeAuthority.expiresAt = '2026-09-09T00:20:00Z';
  expectPlanReason(expired, 'compute-authority-expired-before-plan');
  const forged = planInput();
  forged.computeAuthority.maxComputeUnits = '1000';
  expectPlanReason(forged, 'explicit-bounded-compute-authority-required');
});

test('residual bottleneck must be measured and target genuine improvement', () => {
  const input = planInput();
  input.residualBottleneck.targetScore = input.residualBottleneck.baselineScore;
  expectPlanReason(input, 'measured-residual-bottleneck-with-improvement-target-required');
});

function servingFixture() {
  const planResult = compileModelAdaptationPlan(planInput());
  assert.equal(planResult.ok, true, JSON.stringify(planResult));
  const trainingReceipt = {
    planDigest: planResult.planDigest,
    datasetDigest: planResult.plan.dataset.datasetDigest,
    trainedWeightsDigest: D('b'),
    trainerRuntimeDigest: D('c'),
    trainerId: 'trainer-a',
    evidenceRef: 'training:observed-receipt',
    observedAt: '2026-09-09T02:00:00Z',
    actualComputeUnits: 800,
    actualSpendCents: 300
  };
  const servingCore = {
    modelId: 'adapted-model',
    revision: 'serve@1',
    sourceTrainedWeightsDigest: D('b'),
    weightsDigest: D('d'),
    runtimeDigest: D('e'),
    quantizationRef: 'quant:int8-v1',
    hardwareRef: 'hardware:gpu-class-a',
    transformEvidenceRef: 'transform:trained-to-serving'
  };
  const servingArtifactDigest = digest(servingCore);
  const compoundEvaluation = {
    ok: true,
    version: COMPOUND_INTELLIGENCE_EVALUATION_VERSION,
    status: 'COMPOUND_INTELLIGENCE_GAIN_SUPPORTED_WITHIN_DEFINED_SCOPE',
    asiStatus: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    promotionAuthority: 'NONE',
    receiptHash: D('f'),
    receipt: {
      componentRevisions: [
        { componentId: 'adapted-model', revision: servingArtifactDigest, lineageRef: 'lineage:adapted-model' },
        { componentId: 'independent-tool', revision: 'tool@1', lineageRef: 'lineage:tool' }
      ]
    }
  };
  const securityAdmission = {
    ok: true,
    version: CAPABILITY_SCALED_SECURITY_VERSION,
    status: 'C26_SECURITY_ADMISSION_READY_FOR_SEPARATE_EFFECT_GATE',
    businessEffectAuthority: 'NONE',
    asiClaim: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    subjectDigest: D('9'),
    subject: {
      capabilityId: 'adapted-model',
      sourceHash: D('d'),
      composition: { selfModifying: false }
    }
  };
  return {
    planResult,
    trainingReceipt,
    servingArtifact: servingCore,
    servingEvaluation: {
      servingArtifactDigest,
      evidenceRef: 'serving-eval:observed',
      evaluatorId: 'serving-evaluator',
      compoundEvaluation
    },
    securityAdmission,
    recovery: {
      verifierId: 'recovery-verifier',
      rollbackRef: 'rollback:old-model',
      priorWeightsDigest: D('a'),
      restoredWeightsDigest: D('a'),
      canaryEvidenceRef: 'canary:served-model',
      canaryPassed: true,
      restorePassed: true
    },
    revocation: {
      revocationRef: 'revocation:served-model',
      verifierId: 'revocation-verifier',
      servingArtifactDigest,
      revocationPathTested: true
    },
    observedAt: '2026-09-09T03:00:00Z'
  };
}

const expectServingReason = (input, reason) => {
  const out = evaluateAdaptedServingArtifact(input);
  assert.equal(out.ok, false, JSON.stringify(out));
  assert.ok(out.reasonCodes.includes(reason), JSON.stringify(out));
};

test('exact served artifact can become eligible only for a separate promotion decision', () => {
  const out = evaluateAdaptedServingArtifact(servingFixture());
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.version, MODEL_ADAPTATION_LIFECYCLE_VERSION);
  assert.equal(out.status, 'ADAPTED_SERVING_ARTIFACT_ELIGIBLE_FOR_SEPARATE_PROMOTION_DECISION');
  assert.equal(out.trainingAuthority, 'NONE');
  assert.equal(out.promotionAuthority, 'NONE');
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.asiStatus, 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
  assert.match(out.servingBoundary, /TRAINED_WEIGHTS_ARE_NOT_THE_SERVED_ARTIFACT/);
});

test('training receipt must bind exact plan and dataset and remain inside compute envelope', () => {
  const plan = servingFixture();
  plan.trainingReceipt.planDigest = D('0');
  expectServingReason(plan, 'training-receipt-plan-digest-mismatch');
  const data = servingFixture();
  data.trainingReceipt.datasetDigest = D('0');
  expectServingReason(data, 'training-receipt-dataset-digest-mismatch');
  const compute = servingFixture();
  compute.trainingReceipt.actualComputeUnits = 1001;
  expectServingReason(compute, 'training-compute-exceeded-authorized-envelope');
  const spend = servingFixture();
  spend.trainingReceipt.actualSpendCents = 501;
  expectServingReason(spend, 'training-spend-exceeded-authorized-envelope');
});

test('serving artifact must descend from exact trained weights after quantization transform', () => {
  const input = servingFixture();
  input.servingArtifact.sourceTrainedWeightsDigest = D('0');
  expectServingReason(input, 'serving-artifact-must-descend-from-exact-trained-weights');
});

test('C13 evaluation must bind and include exact served artifact revision', () => {
  const wrapper = servingFixture();
  wrapper.servingEvaluation.servingArtifactDigest = D('0');
  expectServingReason(wrapper, 'evaluation-must-bind-exact-serving-artifact');
  const unrelated = servingFixture();
  unrelated.servingEvaluation.compoundEvaluation.receipt.componentRevisions[0].revision = 'different-serving-artifact';
  expectServingReason(unrelated, 'c13-evaluation-must-include-exact-serving-artifact-as-component');
});

test('serving evaluator must be independent of trainer', () => {
  const input = servingFixture();
  input.servingEvaluation.evaluatorId = input.trainingReceipt.trainerId;
  expectServingReason(input, 'independent-serving-evaluator-required');
});

test('C26 security admission must secure exact served model and weights', () => {
  const model = servingFixture();
  model.securityAdmission.subject.capabilityId = 'other-model';
  expectServingReason(model, 'c26-security-admission-must-bind-exact-serving-model-and-weights');
  const weights = servingFixture();
  weights.securityAdmission.subject.sourceHash = D('0');
  expectServingReason(weights, 'c26-security-admission-must-bind-exact-serving-model-and-weights');
});

test('quantized serving artifact needs canary plus successful restore of exact old weights', () => {
  const canary = servingFixture();
  canary.recovery.canaryPassed = false;
  expectServingReason(canary, 'canary-and-old-version-restore-proof-required');
  const restore = servingFixture();
  restore.recovery.restoredWeightsDigest = D('8');
  expectServingReason(restore, 'canary-and-old-version-restore-proof-required');
});

test('recovery verifier is independent of trainer and serving evaluator', () => {
  const trainer = servingFixture();
  trainer.recovery.verifierId = trainer.trainingReceipt.trainerId;
  expectServingReason(trainer, 'recovery-verifier-must-be-independent-of-trainer');
  const evaluator = servingFixture();
  evaluator.recovery.verifierId = evaluator.servingEvaluation.evaluatorId;
  expectServingReason(evaluator, 'recovery-verifier-must-be-independent-of-serving-evaluator');
});

test('revocation proof binds exact served artifact and independent verifier', () => {
  const wrong = servingFixture();
  wrong.revocation.servingArtifactDigest = D('0');
  expectServingReason(wrong, 'exact-serving-revocation-proof-required');
  const coupled = servingFixture();
  coupled.revocation.verifierId = coupled.recovery.verifierId;
  expectServingReason(coupled, 'revocation-verifier-must-be-independent');
});

test('trained checkpoint alone never counts as serving or promotion proof', () => {
  const input = servingFixture();
  delete input.servingArtifact;
  const out = evaluateAdaptedServingArtifact(input);
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('exact-serving-artifact-identity-required'));
  assert.equal(out.promotionAuthority, 'NONE');
});
