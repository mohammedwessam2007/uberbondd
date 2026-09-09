import { spawnSync } from 'node:child_process';

const fixturePreparation = process.platform === 'linux' && process.arch === 'x64'
  ? [['npm', ['rebuild', '@embedded-postgres/linux-x64']], ['node', ['scripts/prepare-embedded-postgres-fixture.mjs']]]
  : [];

const steps = [
  ...fixturePreparation,
  // C11-B/C12 executes before repository-derived atlases. It requires clean
  // truth inputs (provider workspace metadata may already be dirty), regenerates
  // readiness + Sovereign coverage + the exact denominator-bound zero-orphan
  // execution graph, then cross-checks them against git HEAD and C11-A. Only
  // the four declared generated truth outputs may be newly dirtied. This is
  // source/canon accounting only: no runtime, customer, commercial, life-outcome
  // or ASI evidence is created.
  ['node', ['scripts/current-truth-regeneration.mjs']],
  // The finite terminal tribunal must execute on the same exact checkout that
  // passed current-truth regeneration. It may certify only its declared finite
  // engineering denominator; runtime, provider, commercial, personal-reality
  // and ASI facets remain explicitly evidence-gated inside the tribunal itself.
  ['node', ['scripts/terminal-realization.mjs']],
  ['node', ['scripts/uberbond-feature-genome.mjs']],
  ['node', ['scripts/uberbond-feature-atom-atlas.mjs']],
  ['node', ['scripts/uberbond-synaptic-map.mjs']],
  ['node', ['scripts/uberbond-repository-deep-atlas.mjs']],
  ['node', ['--test', 'tests/uberbond-repository-deep-atlas.test.mjs', 'tests/secret-leakage-sweep.test.mjs']],
  ['node', ['scripts/uberbond-ultimate-graph.mjs']],
  ['node', ['--test', 'tests/uberbond-command-center-status.test.mjs', 'tests/uberbond-synaptic-map.test.mjs', 'tests/uberbond-synaptic-cycle-binding.test.mjs', 'tests/uberbond-ultimate-graph.test.mjs', 'tests/uberbond-ultimate-graph-cycle-binding.test.mjs', 'tests/ultimate-graph-api.test.mjs']],
  ['node', ['--test', 'tests/wessam-continuity.test.mjs', 'tests/lifetime-context-memory.test.mjs', 'tests/capability-world-harvester.test.mjs', 'tests/compute-sovereignty-capacity.test.mjs', 'tests/organism-metabolism.test.mjs', 'tests/pre-customer-revenue-readiness.test.mjs']],
  ['node', ['--test', 'tests/admin-ephemeral-client-hostile.test.mjs', 'tests/command-center-2-auth.test.mjs', 'tests/command-center-2-policy.test.mjs']],
  ['node', ['scripts/reachability-report.mjs']],
  ['npm', ['run', 'check:syntax']],
  ['npm', ['run', 'readiness']],
  ['npm', ['run', 'test:deterministic']],
  ...fixturePreparation,
  ['npm', ['run', 'test:mutation-war']],
  ['npm', ['run', 'test:whole-brain']],
  ['npm', ['run', 'readiness']]
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env: process.env, encoding: 'utf8', stdio: 'inherit' });
  if (result.error) {
    console.error(`build step failed to start: ${command} ${args.join(' ')}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(JSON.stringify({
  ok: true,
  status: 'VERCEL_NIGHT10_TERMINAL_SOURCE_GATE_PASSED',
  exactHeadTruthRegenerationRequired: true,
  finiteEngineeringTribunalRequired: true,
  sovereignCoverageDenominatorRequired: true,
  zeroOrphanCanonicalExecutionGraphRequired: true,
  ultimateGraphRequired: true,
  deepAtlasPersistencePrivacyRequired: true,
  adminEphemeralBearerRequired: true,
  reachabilityLiveComputedRequired: true,
  exactCheckoutReadinessBeforeDeterministic: true,
  externalEffectAuthority: 'NONE'
}));
