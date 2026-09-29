import fs from 'node:fs';
import {
  ABSOLUTE_FRONTIER_QUALITY_DELTA,
  ABSOLUTE_FRONTIER_MIN_EVIDENCE_CONFIDENCE,
  ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST
} from '../src/absolute-frontier-quality-invariant.mjs';

const lock = JSON.parse(fs.readFileSync('./config/absolute-frontier-quality-lock.json', 'utf8'));
const campaign = JSON.parse(fs.readFileSync('./config/apex-frontier-quality-compression-campaign.json', 'utf8'));

const checks = [];
const fail = (code, detail = null) => checks.push({ ok: false, code, detail });
const pass = code => checks.push({ ok: true, code });

if (lock.policyDigest !== ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST) fail('policy-lock-digest-mismatch');
else pass('policy-lock-digest-matches');

if (lock.qualityDelta !== ABSOLUTE_FRONTIER_QUALITY_DELTA || ABSOLUTE_FRONTIER_QUALITY_DELTA !== 0) fail('quality-delta-not-zero');
else pass('quality-delta-zero');

if (lock.minimumEvidenceConfidence !== ABSOLUTE_FRONTIER_MIN_EVIDENCE_CONFIDENCE) fail('minimum-evidence-confidence-lock-mismatch');
else pass('minimum-evidence-confidence-locked');

if (lock.degradedCouncilAllowed !== false) fail('degraded-council-lock-weakened');
else pass('degraded-council-prohibited');

if (lock.weakeningAuthority !== 'NONE') fail('quality-weakening-authority-present');
else pass('quality-weakening-authority-none');

if (campaign?.qualityFloorPolicy?.maxQualityDelta !== 0) fail('campaign-quality-delta-not-zero');
else pass('campaign-quality-delta-zero');

if (campaign?.qualityFloorPolicy?.absoluteQualityPolicyDigest !== ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST) fail('campaign-policy-digest-mismatch');
else pass('campaign-policy-digest-matches');

const sourceContracts = {
  'src/apex-reasoning-hypercompiler.mjs': [
    "qualityFloorDelta = ABSOLUTE_FRONTIER_QUALITY_DELTA",
    "validateAbsoluteFrontierQualityPolicy({ qualityDelta })",
    "const qualityFloor = bestQuality",
    "verifiedSuccessRate === bestQuality"
  ],
  'src/apex-sealed-tournament.mjs': [
    "qualityFloorDelta = ABSOLUTE_FRONTIER_QUALITY_DELTA",
    "certifyPairedZeroLoss",
    "pairedTaskOutcomes",
    "SEALED_ZERO_LOSS_COMPRESSION_REPLICATION_CANDIDATE"
  ],
  'src/apex-fresh-campaign.mjs': [
    "absoluteQualityPolicyDigest",
    "validateAbsoluteFrontierQualityPolicy",
    "maxQualityDelta: 0",
    "const preparedFreshCampaigns = new WeakMap()",
    "validatePreparedFreshApexCampaign"
  ],
  'src/frontier-cognitive-fabric.mjs': [
    "DEFAULT_FRONTIER_QUALITY_DELTA = ABSOLUTE_FRONTIER_QUALITY_DELTA",
    "ABSOLUTE_FRONTIER_MIN_EVIDENCE_CONFIDENCE",
    "validateAbsoluteFrontierQualityPolicy({ qualityDelta, minimumEvidenceConfidence: confidence, allowDegradedCouncil: false })",
    "absoluteQualityInvariant: qualityInvariantAttestation()",
    "FRONTIER_REASONING_TIERS = Object.freeze(['FRONTIER_MAX', 'COUNCIL_MAX'])",
    "exactly-one-canonical-frontier-crown-baseline-required",
    "pairedZeroLossCertified",
    "frontierCrownDigest"
  ],
  'src/frontier-reasoning-runtime.mjs': [
    "validateQualityInvariantAttestation",
    "validateAdmittedFrontierPlan",
    "isFrontierSimulationExecutorFactory",
    "isCanonicalModelExecutorFactory",
    "member-object-does-not-match-admitted-plan"
  ],
  'src/frontier-crown.mjs': [
    "const canonicalCrowns = new WeakMap()",
    "validatePreparedFreshApexCampaign",
    "certifyCanonicalZeroLoss",
    "validateCanonicalZeroLossCertificate",
    "FRONTIER_CROWN_REQUIRES_COUNCIL_SYNTHESIS",
    "frontier-crown-stale-or-invalid-time",
    "validateCampaignFrontierCrownCertificate"
  ],
  'src/frontier-cognitive-admission.mjs': [
    "const admittedPlans = new WeakMap()",
    "const canonicalLiveBenchmarks = new WeakMap()",
    "validateAdmittedFrontierPlan",
    "process-bound-admitted-frontier-plan-required",
    "validateCampaignFrontierCrownCertificate",
    "canonical-frontier-crown-certificate-required",
    "paired-zero-loss-against-frontier-baseline-required",
    "CANONICAL_FRONTIER_CROWN_BASELINE",
    "CANONICAL_FRONTIER_CROWN_PAIRED_ZERO_LOSS_CANDIDATE"
  ],
  'src/frontier-callability-provenance.mjs': [
    "const liveReceipts = new WeakMap()",
    "canonical-probe-producer-origin-required",
    "trustedForLiveExecution: !simulationOnly"
  ],
  'src/frontier-simulation-executor.mjs': [
    "const simulationFactories = new WeakSet()",
    "simulationFactories.add(factory)",
    "isFrontierSimulationExecutorFactory"
  ],
  'src/frontier-council-runtime.mjs': [
    "validateAdmittedFrontierPlan",
    "absolute-frontier-degraded-council-prohibited",
    "independent-adjudicator-required"
  ],
  'src/agent-model-executor-factory.mjs': [
    "const canonicalModelExecutorFactories = new WeakSet()",
    "isCanonicalModelExecutorFactory"
  ],
  'src/avengers-execution-guard.mjs': [
    "executeFrontierCouncil({",
    "executeFrontierMember({ planResult"
  ],
  'src/reasoning-architecture-lab.mjs': [
    "qualityFloorDelta = ABSOLUTE_FRONTIER_QUALITY_DELTA"
  ],
  'src/ubermind-cognitive-exchange.mjs': [
    "reasoningTier='FRONTIER_MAX'",
    "SEMANTIC_COGNITION_NEVER_FALLS_BELOW_FRONTIER_MAX"
  ],
  'src/canonical-zero-loss-certificate.mjs': [
    "validateCompiledSealedArchitectureTrial",
    "provenanceValidator: validateCompiledSealedArchitectureTrial",
    "CANONICAL_UNTAMPERED_SEALED_TRIAL_PAIR",
    "canonical-zero-loss-certificate-producer-origin-required"
  ],
  'src/noetic-autocompiler.mjs': [
    "validateCanonicalZeroLossCertificate",
    "minimumAccuracy = 1",
    "maximumCalibrationError = 0",
    "accuracyDrop > 0 || calibrationWorsening > 0",
    "IMMEDIATE_DECOMPILE_TO_FRONTIER_AND_REVALIDATE"
  ],
  'scripts/jev-calibration-doctor.mjs': [
    "minimumAccuracy:1",
    "maximumCalibrationError:0",
    "pairedZeroLossCertificateRequired:true"
  ]
};

for (const [path, required] of Object.entries(sourceContracts)) {
  const source = fs.readFileSync(path, 'utf8');
  for (const token of required) {
    if (!source.includes(token)) fail('protected-source-contract-missing', { path, token });
  }
}

const forbiddenPatterns = [
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
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) fail('forbidden-quality-weakening-pattern', { path, pattern: String(pattern) });
  }
}

const failed = checks.filter(row => !row.ok);
console.log(JSON.stringify({
  ok: failed.length === 0,
  status: failed.length ? 'ABSOLUTE_FRONTIER_QUALITY_LOCK_BROKEN' : 'ABSOLUTE_FRONTIER_QUALITY_LOCK_INTACT',
  policyDigest: ABSOLUTE_FRONTIER_QUALITY_POLICY_DIGEST,
  checks,
  weakeningAuthority: 'NONE',
  providerCalls: 0,
  spendUsd: 0,
  externalEffectsAuthorized: false
}, null, 2));

if (failed.length) process.exitCode = 1;
