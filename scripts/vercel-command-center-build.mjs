import { spawnSync } from 'node:child_process';

const fixturePreparation = process.platform === 'linux' && process.arch === 'x64'
  ? [['npm', ['rebuild', '@embedded-postgres/linux-x64']], ['node', ['scripts/prepare-embedded-postgres-fixture.mjs']]]
  : [];

const steps = [
  ...fixturePreparation,
  ['node', ['--test', 'tests/sovereign-native-local-worker.test.mjs']],
  ['node', ['--test', 'tests/semantic-enforcement-evidence.test.mjs']],
  ['node', ['--test', 'tests/sovereign-short-field-parent-coverage.test.mjs']],
  ['node', ['--test', 'tests/sovereign-coverage-source-semantics.test.mjs']],
  // Resurrection gate. Run first-party civilization and independence contracts
  // before the known terminal semantic residue so a later refusal cannot hide
  // whether UberGraph/UberMind/UberDNA/UberCloud/Ubercel actually executed.
  ['node', ['--test',
    'tests/knowledge-labyrinth-ubergraph.test.mjs',
    'tests/ubermind-cognitive-exchange.test.mjs',
    'tests/uberdna-software-genome.test.mjs',
    'tests/sovereign-compute-cell-fabric.test.mjs',
    'tests/economic-metabolism.test.mjs',
    'tests/ubercloud-sovereign-fabric.test.mjs',
    'tests/ubercel-deployment-control-plane.test.mjs',
    'tests/uber-sovereign-stack.test.mjs'
  ]],
  ['node', ['scripts/supporting-civilization-organs-doctor.mjs']],
  ['node', ['--check', 'scripts/sovereign-founder-console-server.mjs']],
  ['node', ['--test', 'tests/sovereign-founder-console.test.mjs', 'tests/sovereign-communication-center.test.mjs']],
  ['node', ['--test', 'tests/sovereign-release-courier.test.mjs']],
  ['bash', ['-n', 'ops/sovereign/install-offline-llama-runtime.sh']],
  ['node', ['--test', 'tests/sovereign-offline-llama-runtime.test.mjs']],
  ['node', ['--test',
    'tests/sandwich-method.test.mjs',
    'tests/sandwich-evidence-binding.test.mjs',
    'tests/sandwich-method-plan.test.mjs',
    'tests/sandwich-method-doctor.test.mjs',
    'tests/sandwich-agent-task.test.mjs',
    'tests/sandwich-blueprint-evolution.test.mjs'
  ]],
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
  const result = spawnSync(command, args, { cwd: process.cwd(), env: process.env, encoding:'utf8', stdio:'inherit' });
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
  exactHeadTruthRegenerationOwner: 'scripts/terminal-realization.mjs',
  finiteEngineeringTribunalRequired: true,
  sovereignCoverageDenominatorRequired: true,
  zeroOrphanCanonicalExecutionGraphRequired: true,
  ultimateGraphRequired: true,
  deepAtlasPersistencePrivacyRequired: true,
  adminEphemeralBearerRequired: true,
  reachabilityLiveComputedRequired: true,
  exactCheckoutReadinessBeforeDeterministic: true,
  nativeSovereignWorkerHostileGateRequired: true,
  semanticEnforcementEvidenceGateRequired: true,
  coverageSourceSemanticsGateRequired: true,
  supportingCivilizationOrgansGateRequired: true,
  uberCloudSovereigntyGateRequired: true,
  ubercelControlPlaneGateRequired: true,
  uberSovereignStackGateRequired: true,
  sandwichMethodFocusedGateRequired: true,
  sandwichEvidenceBindingGateRequired: true,
  sandwichAgentTaskBridgeGateRequired: true,
  sandwichBlueprintEvolutionGateRequired: true,
  externalEffectAuthority: 'NONE'
}));
