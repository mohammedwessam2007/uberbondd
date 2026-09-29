import fs from 'node:fs';
import { assessFrontierVmActivationReadiness } from '../src/frontier-vm-activation-readiness.mjs';

const CAMPAIGN_PATH = 'config/frontier-vm-v5-longitudinal-campaign.json';
const CLOUD_PATH = 'config/ubermind-cloud-cognition-resources.json';
const REQUIRED = [
  'open router/13_FRONTIER_INTELLIGENCE_VIRTUAL_MACHINE.md',
  'open router/14_COGNITIVE_COMPILER_SPEC.json',
  'open router/14_COGNITIVE_SUPERCOMPILER_AND_CAPITAL_FLYWHEEL.md',
  'open router/15_NOVELTY_BOUNDARY_AND_UPGRADE_CEILING.md',
  'open router/16_PRIOR_ART_MATRIX_AND_RESEARCH_HYPOTHESIS.md',
  'open router/17_LONGITUDINAL_FRONTIER_VM_EXPERIMENT.md',
  'src/frontier-intelligence-vm.mjs',
  'src/cognitive-superoptimizer.mjs',
  'src/frontier-vm-longitudinal-evaluator.mjs',
  'src/frontier-vm-burnin.mjs',
  'src/frontier-vm-activation-readiness.mjs',
  'tests/frontier-intelligence-vm.test.mjs',
  'tests/cognitive-superoptimizer.test.mjs',
  'tests/frontier-vm-longitudinal-evaluator.test.mjs',
  'tests/frontier-vm-burnin.test.mjs',
  'tests/frontier-vm-activation-readiness.test.mjs',
  CAMPAIGN_PATH,
  CLOUD_PATH
];

const args = new Set(process.argv.slice(2));
const mode = args.has('--unattended') ? 'UNATTENDED' : args.has('--all') ? 'ALL' : 'INTERACTIVE';

const failures = [];
for (const path of REQUIRED) if (!fs.existsSync(path)) failures.push(`missing:${path}`);

function readJson(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch (error) {
    failures.push(`invalid-json:${path}:${error.message}`);
    return null;
  }
}

const campaignConfig = readJson(CAMPAIGN_PATH);
const cloudConfig = readJson(CLOUD_PATH);

if (campaignConfig) {
  if (campaignConfig?.quality?.maxIntentionalDelta !== 0) failures.push('quality-delta-not-zero');
  if (campaignConfig?.quality?.pairedTaskRegressionAllowed !== 0) failures.push('paired-regressions-not-zero');
  if (campaignConfig?.budget?.monthlyAllInTargetUsd !== 30) failures.push('monthly-target-not-30');
  if (campaignConfig?.budget?.protectedCrownEscrowUsd < 15) failures.push('crown-escrow-below-15');
  if (campaignConfig?.budget?.automaticSpendAuthority !== false) failures.push('automatic-spend-authority-must-be-false');
  if (campaignConfig?.crown?.permanentVendorLoyalty !== false) failures.push('permanent-vendor-loyalty-forbidden');
  if (campaignConfig?.crown?.liveSnapshotRequired !== true) failures.push('live-crown-snapshot-required');
  const burn = campaignConfig?.phases?.find(row => row.id === 'BURN_IN');
  if (!burn || burn.minimumFreshPairedTasks < 40 || burn.directCrownBaselineRequired !== true) failures.push('burn-in-contract-invalid');
  if (!Array.isArray(campaignConfig?.ablations) || !campaignConfig.ablations.includes('V5_FULL') || !campaignConfig.ablations.includes('DIRECT_CROWN')) {
    failures.push('required-ablations-missing');
  }
}

if (cloudConfig) {
  const cloudBudget = cloudConfig.requiredResources?.find(row => row.id === 'cognition-budget');
  const crownEscrow = cloudConfig.requiredResources?.find(row => row.id === 'crown-escrow');
  if (String(cloudBudget?.default) !== '30') failures.push('cloud-resource-budget-not-30');
  if (String(crownEscrow?.default) !== '15') failures.push('cloud-resource-crown-escrow-not-15');
  if (cloudConfig?.qualityPolicy?.maxQualityDelta !== 0) failures.push('cloud-resource-quality-delta-not-zero');
}

const readiness = assessFrontierVmActivationReadiness({
  mode,
  env: process.env,
  campaignConfig: campaignConfig || {},
  cloudConfig: cloudConfig || {},
  sourceReady: failures.length === 0
});

const out = {
  ...readiness,
  status: failures.length
    ? 'FRONTIER_VM_V5_SOURCE_BROKEN'
    : readiness.status,
  sourceFailures: failures,
  sourceReady: failures.length === 0,
  mode,
  requiredOwnerActions: [
    ...(!readiness.resources?.openRouterCredentialPresent
      ? ['Create/store one OpenRouter API key in TypingMind for interactive use and/or protected UberBond runtime for unattended use.']
      : []),
    ...(!readiness.resources?.liveCrownSnapshotPresent
      ? ['Refresh current market evidence and bind UBERMIND_LIVE_CROWN_SNAPSHOT_REF to the chosen task-class Crown snapshot.']
      : []),
    ...(!readiness.resources?.freshTaskSourcePresent
      ? ['Bind UBERMIND_FRESH_TASK_SOURCE_REF to a fresh task source/custodian that has not been optimized against.']
      : [])
  ],
  providerCallsPerformed: 0,
  paidInferencePerformed: 0,
  executionAuthority: 'NONE',
  truthBoundary: 'This doctor is zero-spend and zero-inference. READY authorizes only preparation for a controlled paired burn-in; it does not prove frontier equivalence, compression, novelty, or permission to spend.'
};

console.log(JSON.stringify(out, null, 2));
if (!out.ok) process.exitCode = 1;
