import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST,
  ABSOLUTE_FRONTIER_QUALITY_DELTA,
  ABSOLUTE_FRONTIER_MIN_EVIDENCE_CONFIDENCE
} from '../src/absolute-frontier-quality-invariant.mjs';

const lock = JSON.parse(fs.readFileSync('./config/absolute-frontier-quality-lock.json', 'utf8'));
const campaign = JSON.parse(fs.readFileSync('./config/apex-frontier-quality-compression-campaign.json', 'utf8'));

test('independent policy lock matches executable zero-loss invariant', () => {
  assert.equal(lock.policyDigest, ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST);
  assert.equal(lock.qualityDelta, 0);
  assert.equal(ABSOLUTE_FRONTIER_QUALITY_DELTA, 0);
  assert.equal(lock.minimumEvidenceConfidence, ABSOLUTE_FRONTIER_MIN_EVIDENCE_CONFIDENCE);
  assert.equal(lock.degradedCouncilAllowed, false);
  assert.equal(lock.weakeningAuthority, 'NONE');
});

test('Wave 1 campaign is pinned to the same zero-loss policy digest', () => {
  assert.equal(campaign.qualityFloorPolicy.maxQualityDelta, 0);
  assert.equal(campaign.qualityFloorPolicy.absoluteQualityPolicyDigest, ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST);
});

test('protected cognition sources retain all zero-loss enforcement hooks', () => {
  const required = {
    'src/apex-reasoning-hypercompiler.mjs': [
      'qualityFloorDelta = ABSOLUTE_FRONTIER_QUALITY_DELTA',
      'validateAbsoluteFrontierQualityPolicy({ qualityDelta })',
      'const qualityFloor = bestQuality',
      'verifiedSuccessRate === bestQuality'
    ],
    'src/apex-sealed-tournament.mjs': [
      'qualityFloorDelta = ABSOLUTE_FRONTIER_QUALITY_DELTA',
      'certifyPairedZeroLoss',
      'pairedTaskOutcomes',
      'SEALED_ZERO_LOSS_COMPRESSION_REPLICATION_CANDIDATE'
    ],
    'src/apex-fresh-campaign.mjs': [
      'absoluteQualityPolicyDigest',
      'validateAbsoluteFrontierQualityPolicy',
      'maxQualityDelta: 0'
    ],
    'src/frontier-cognitive-fabric.mjs': [
      'DEFAULT_FRONTIER_QUALITY_DELTA = ABSOLUTE_FRONTIER_QUALITY_DELTA',
      'ABSOLUTE_FRONTIER_MIN_EVIDENCE_CONFIDENCE',
      'validateAbsoluteFrontierQualityPolicy({ qualityDelta, minimumEvidenceConfidence: confidence, allowDegradedCouncil: false })',
      'absoluteQualityInvariant: qualityInvariantAttestation()',
      "FRONTIER_REASONING_TIERS = Object.freeze(['FRONTIER_MAX', 'COUNCIL_MAX'])"
    ],
    'src/frontier-reasoning-runtime.mjs': [
      'validateQualityInvariantAttestation',
      'validateAdmittedFrontierPlan',
      'isFrontierSimulationExecutorFactory',
      'isCanonicalModelExecutorFactory',
      'member-object-does-not-match-admitted-plan'
    ],
    'src/frontier-cognitive-admission.mjs': [
      'const admittedPlans = new WeakMap()',
      'validateAdmittedFrontierPlan',
      'process-bound-admitted-frontier-plan-required'
    ],
    'src/frontier-council-runtime.mjs': [
      'validateAdmittedFrontierPlan',
      'absolute-frontier-degraded-council-prohibited',
      'independent-adjudicator-required'
    ],
    'src/agent-model-executor-factory.mjs': [
      'const canonicalModelExecutorFactories = new WeakSet()',
      'isCanonicalModelExecutorFactory'
    ],
    'src/avengers-execution-guard.mjs': [
      'executeFrontierCouncil({',
      'executeFrontierMember({ planResult'
    ],
    'src/reasoning-architecture-lab.mjs': [
      'qualityFloorDelta = ABSOLUTE_FRONTIER_QUALITY_DELTA'
    ],
    'src/ubermind-cognitive-exchange.mjs': [
      "reasoningTier='FRONTIER_MAX'",
      'SEMANTIC_COGNITION_NEVER_FALLS_BELOW_FRONTIER_MAX'
    ],
    'src/canonical-zero-loss-certificate.mjs': [
      'validateCompiledSealedArchitectureTrial',
      'provenanceValidator: validateCompiledSealedArchitectureTrial',
      'CANONICAL_UNTAMPERED_SEALED_TRIAL_PAIR',
      'canonical-zero-loss-certificate-producer-origin-required'
    ],
    'src/openrouter-agent-executor.mjs': [
      "data_collection: 'deny'",
      "modelFallbacks: 'PROHIBITED_BY_EXECUTOR'",
      "openrouter-model-identity-mismatch",
      "actual-cost-exceeds-reserved-ceiling",
      "openrouter-response-cache-public-data-only"
    ],
    'src/frontier-quality-market-compiler.mjs': [
      "QUEUE_FOR_BUDGET_NOT_QUALITY_DOWNGRADE",
      "WEAKER_MODEL_AS_FINAL_AUTHORITY",
      "SEMANTIC_CACHE_SHADOW_ONLY",
      "majorityVoteAuthority: 'NONE'",
      "lossySummarizationAuthorized: false",
      "modelFallbacks: 'PROHIBITED_UNLESS_SEPARATELY_ZERO_LOSS_CERTIFIED'",
      "createMonthlyCloudCognitionBudget",
      "QUEUE_NOT_DOWNGRADE"
    ],
    'src/openrouter-market-catalog.mjs': [
      "semanticAuthority: 'NONE'",
      "CATALOG_PRESENCE_AND_LIST_PRICING_ARE_DISCOVERY_EVIDENCE_ONLY"
    ],
    'src/noetic-autocompiler.mjs': [
      'validateCanonicalZeroLossCertificate',
      'minimumAccuracy = 1',
      'maximumCalibrationError = 0',
      'accuracyDrop > 0 || calibrationWorsening > 0',
      'IMMEDIATE_DECOMPILE_TO_FRONTIER_AND_REVALIDATE'
    ],
    'src/frontier-intelligence-vm.mjs': [
      'BACKEND_AUTHORITY_MUST_MEET_OR_EXCEED_REQUIRED_QUALITY_TYPE',
      "requiredQualityType === 'Q_UNKNOWN'",
      "backend = 'MULTI_FRONTIER'",
      'NEVER_SPEND_THE_REQUIRED_QUALITY_FALLBACK_ON_AN_UNPROVEN_CHEAP_PATH'
    ],
    'src/cognitive-superoptimizer.mjs': [
      'SUPEROPTIMIZATION_CANDIDATE_SHADOW_ONLY',
      'DECOMPILE_AND_ESCALATE_TO_REQUIRED_FRONTIER',
      'validateCanonicalZeroLossCertificate',
      'automaticPromotionAuthorized: false'
    ],
    'src/frontier-vm-longitudinal-evaluator.mjs': [
      'QUALITY_REGRESSION_DETECTED__DEOPTIMIZE',
      'pairedRegressions',
      'frontierResidualRatio'
    ],
    'src/frontier-vm-burnin.mjs': [
      'certifyCanonicalZeroLoss',
      'validateCanonicalZeroLossCertificate',
      'promotionAuthority: \'NONE\'',
      'quality-regression-tolerance-must-remain-zero'
    ],
    'scripts/jev-calibration-doctor.mjs': [
      'minimumAccuracy:1',
      'maximumCalibrationError:0',
      'pairedZeroLossCertificateRequired:true'
    ]
  };
  for (const [path, tokens] of Object.entries(required)) {
    const source = fs.readFileSync(path, 'utf8');
    for (const token of tokens) assert.equal(source.includes(token), true, `${path}: ${token}`);
  }
});

test('protected sources do not reintroduce known quality weakening defaults', () => {
  const patterns = [
    /qualityFloorDelta\s*=\s*0\.(?!0\b)\d+/,
    /DEFAULT_FRONTIER_QUALITY_DELTA\s*=\s*0\.(?!0\b)\d+/,
    /maxQualityDelta\s*:\s*0\.(?!0\b)\d+/,
    /reasoningTier\s*=\s*['"](?:FAST|STANDARD|DEEP)['"]/,
    /status\s*:\s*['"]COUNCIL_DEGRADED['"]/,
    /minimumAccuracy\s*=\s*0\.98/,
    /maximumCalibrationError\s*=\s*0\.02/,
    /accuracyDrop\s*>=\s*0\.05/,
    /calibrationWorsening\s*>=\s*0\.05/
  ];
  for (const path of lock.protectedSurfaces.filter(item => item.endsWith('.mjs'))) {
    const source = fs.readFileSync(path, 'utf8');
    for (const pattern of patterns) assert.equal(pattern.test(source), false, `${path}: ${pattern}`);
  }
});
