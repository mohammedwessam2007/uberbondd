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
    'src/noetic-autocompiler.mjs': [
      'validateCanonicalZeroLossCertificate',
      'minimumAccuracy = 1',
      'maximumCalibrationError = 0',
      'accuracyDrop > 0 || calibrationWorsening > 0',
      'IMMEDIATE_DECOMPILE_TO_FRONTIER_AND_REVALIDATE'
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
