import fs from 'node:fs';

const CONFIG_PATH='config/frontier-vm-v5-longitudinal-campaign.json';
const REQUIRED=[
  'open router/13_FRONTIER_INTELLIGENCE_VIRTUAL_MACHINE.md',
  'open router/14_COGNITIVE_COMPILER_SPEC.json',
  'open router/14_COGNITIVE_SUPERCOMPILER_AND_CAPITAL_FLYWHEEL.md',
  'open router/15_NOVELTY_BOUNDARY_AND_UPGRADE_CEILING.md',
  'open router/16_PRIOR_ART_MATRIX_AND_RESEARCH_HYPOTHESIS.md',
  'open router/17_LONGITUDINAL_FRONTIER_VM_EXPERIMENT.md',
  'src/frontier-intelligence-vm.mjs',
  'src/frontier-vm-longitudinal-evaluator.mjs',
  'tests/frontier-intelligence-vm.test.mjs',
  'tests/frontier-vm-longitudinal-evaluator.test.mjs',
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
  const burn=config?.phases?.find(row=>row.id==='BURN_IN');
  if(!burn||burn.minimumFreshPairedTasks<40||burn.directCrownBaselineRequired!==true) failures.push('burn-in-contract-invalid');
  if(!Array.isArray(config?.ablations)||!config.ablations.includes('V5_FULL')||!config.ablations.includes('DIRECT_CROWN')) failures.push('required-ablations-missing');
}

const credentialPresent=Boolean(String(process.env.OPENROUTER_API_KEY||'').trim());
const liveCrownSnapshotRef=String(process.env.UBERMIND_LIVE_CROWN_SNAPSHOT_REF||'').trim();
const freshTaskSourceRef=String(process.env.UBERMIND_FRESH_TASK_SOURCE_REF||'').trim();

const externalBlockers=[];
if(!credentialPresent) externalBlockers.push('OPENROUTER_API_KEY_REQUIRED');
if(!liveCrownSnapshotRef) externalBlockers.push('LIVE_CROWN_SNAPSHOT_REF_REQUIRED');
if(!freshTaskSourceRef) externalBlockers.push('FRESH_TASK_SOURCE_REF_REQUIRED');

const sourceReady=failures.length===0;
console.log(JSON.stringify({
  ok:sourceReady&&externalBlockers.length===0,
  status:!sourceReady
    ? 'FRONTIER_VM_V5_SOURCE_BROKEN'
    : externalBlockers.length
      ? 'FRONTIER_VM_V5_PRE_LIVE_BLOCKED'
      : 'FRONTIER_VM_V5_READY_FOR_CONTROLLED_LIVE_BURN_IN',
  sourceReady,
  failures,
  externalBlockers,
  credentialPresent,
  liveCrownSnapshotRefPresent:Boolean(liveCrownSnapshotRef),
  freshTaskSourceRefPresent:Boolean(freshTaskSourceRef),
  monthlyBudgetTargetUsd:config?.budget?.monthlyAllInTargetUsd??null,
  protectedCrownEscrowUsd:config?.budget?.protectedCrownEscrowUsd??null,
  automaticSpendAuthority:false,
  providerCallsPerformed:0,
  truthBoundary:'READY means prerequisites for a controlled experiment are present. It does not prove quality equivalence, compression, or novelty and does not itself spend money.'
},null,2));

if(!sourceReady) process.exitCode=1;
