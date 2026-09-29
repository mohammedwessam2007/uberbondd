import fs from 'node:fs';
import { assessFrontierVmActivationReadiness } from '../src/frontier-vm-activation-readiness.mjs';

const CONFIG_PATH='config/frontier-vm-v5-longitudinal-campaign.json';
const REQUIRED=[
  'open router/13_FRONTIER_INTELLIGENCE_VIRTUAL_MACHINE.md',
  'open router/14_COGNITIVE_COMPILER_SPEC.json',
  'open router/14_COGNITIVE_SUPERCOMPILER_AND_CAPITAL_FLYWHEEL.md',
  'open router/15_NOVELTY_BOUNDARY_AND_UPGRADE_CEILING.md',
  'open router/16_PRIOR_ART_MATRIX_AND_RESEARCH_HYPOTHESIS.md',
  'open router/17_LONGITUDINAL_FRONTIER_VM_EXPERIMENT.md',
  'src/frontier-intelligence-vm.mjs',
  'src/frontier-vm-activation-readiness.mjs',
  'src/frontier-vm-longitudinal-evaluator.mjs',
  'src/cognitive-superoptimizer.mjs',
  'src/frontier-vm-burnin.mjs',
  'tests/frontier-intelligence-vm.test.mjs',
  'tests/frontier-vm-activation-readiness.test.mjs',
  'tests/frontier-vm-longitudinal-evaluator.test.mjs',
  'tests/cognitive-superoptimizer.test.mjs',
  'tests/frontier-vm-burnin.test.mjs',
  CONFIG_PATH
];

const failures=[];
for(const path of REQUIRED) if(!fs.existsSync(path)) failures.push(`missing:${path}`);

let config=null;
try { config=JSON.parse(fs.readFileSync(CONFIG_PATH,'utf8')); }
catch(error){ failures.push(`invalid-config-json:${error.message}`); }

if(config){
  if(config?.quality?.maxIntentionalDelta!==0) failures.push('quality-delta-not-zero');
  if(config?.quality?.pairedTaskRegressionAllowed!==0) failures.push('paired-regressions-not-zero');
  if(config?.budget?.monthlyAllInTargetUsd!==30) failures.push('monthly-target-not-30');
  if(config?.budget?.protectedCrownEscrowUsd<15) failures.push('crown-escrow-below-15');
  if(config?.budget?.automaticSpendAuthority!==false) failures.push('automatic-spend-authority-must-be-false');
  if(config?.crown?.permanentVendorLoyalty!==false) failures.push('permanent-vendor-loyalty-forbidden');
  if(config?.crown?.liveSnapshotRequired!==true) failures.push('live-crown-snapshot-required');
  if(config?.activation?.defaultMode!=='TYPINGMIND_EXTERNAL_COCKPIT') failures.push('typingmind-must-remain-default-interactive-activation-mode');
  if(config?.activation?.repoRuntimeCredentialRequiredForTypingMind!==false) failures.push('typingmind-must-not-require-repo-runtime-secret');
  const burn=config?.phases?.find(row=>row.id==='BURN_IN');
  if(!burn||burn.minimumFreshPairedTasks<40||burn.directCrownBaselineRequired!==true) failures.push('burn-in-contract-invalid');
  if(!Array.isArray(config?.ablations)||!config.ablations.includes('V5_FULL')||!config.ablations.includes('DIRECT_CROWN')) failures.push('required-ablations-missing');
}

const sourceReady=failures.length===0;
const activationMode=String(process.env.UBERMIND_ACTIVATION_MODE||config?.activation?.defaultMode||'TYPINGMIND_EXTERNAL_COCKPIT').trim();
const readiness=assessFrontierVmActivationReadiness({
  activationMode,
  sourceReady,
  typingMindOpenRouterConnectionRef:process.env.UBERMIND_TYPINGMIND_OPENROUTER_CONNECTED_REF,
  runtimeOpenRouterCredentialPresent:Boolean(String(process.env.OPENROUTER_API_KEY||'').trim()),
  liveCrownSnapshotRef:process.env.UBERMIND_LIVE_CROWN_SNAPSHOT_REF,
  freshTaskSourceRef:process.env.UBERMIND_FRESH_TASK_SOURCE_REF,
  monthlyAllInTargetUsd:config?.budget?.monthlyAllInTargetUsd,
  protectedCrownEscrowUsd:config?.budget?.protectedCrownEscrowUsd,
  maxIntentionalDelta:config?.quality?.maxIntentionalDelta,
  pairedTaskRegressionAllowed:config?.quality?.pairedTaskRegressionAllowed,
  automaticSpendAuthority:config?.budget?.automaticSpendAuthority
});

console.log(JSON.stringify({
  ...readiness,
  status:!sourceReady?'FRONTIER_VM_V5_SOURCE_BROKEN':readiness.status,
  failures,
  monthlyBudgetTargetUsd:config?.budget?.monthlyAllInTargetUsd??null,
  protectedCrownEscrowUsd:config?.budget?.protectedCrownEscrowUsd??null,
  cockpit:config?.activation?.interactiveCockpit??null,
  providerCallsPerformed:0,
  truthBoundary:'READY means prerequisites for a controlled experiment are present. TypingMind cockpit mode does not require the OpenRouter secret in the repository runtime. This doctor does not call providers, spend money, or prove quality equivalence.'
},null,2));

if(!sourceReady) process.exitCode=1;
