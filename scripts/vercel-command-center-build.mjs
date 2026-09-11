import { spawnSync } from 'node:child_process';

const fixturePreparation = process.platform === 'linux' && process.arch === 'x64'
  ? [['npm', ['rebuild', '@embedded-postgres/linux-x64']], ['node', ['scripts/prepare-embedded-postgres-fixture.mjs']]]
  : [];

const steps = [
  ...fixturePreparation,
  // The native sovereign worker is part of the bootstrap control plane. Run its
  // hostile contract before terminal realization so a pre-existing semantic
  // backlog cannot hide a regression in the mechanism that is meant to repair
  // that backlog. This only adds a gate; it grants no worker/promotion authority.
  ['node', ['--test', 'tests/sovereign-native-local-worker.test.mjs']],
  // Semantic evidence binding participates directly in terminal realization.
  // Execute its exact-name/state-preservation regressions before the known
  // semantic backlog so a terminal refusal cannot hide a binder regression.
  ['node', ['--test', 'tests/semantic-enforcement-evidence.test.mjs']],
  // The short parented-field accounting repair changes evidence classification
  // immediately before terminal realization. Run its hostile contract first so
  // a terminal semantic refusal cannot hide a regression in the repair itself.
  // This test gate grants no implementation, authority, privacy, runtime,
  // commercial, provider, personal-reality, or ASI status.
  ['node', ['--test', 'tests/sovereign-short-field-parent-coverage.test.mjs']],
  // The source-list semantic types feed the same exact terminal denominator.
  // Prove conceptual donors remain preserved, human evaluation criteria remain
  // structural, and genuine supporting cognitive systems remain finite before
  // terminal realization consumes the regenerated matrix.
  ['node', ['--test', 'tests/sovereign-coverage-source-semantics.test.mjs']],
  // PR #703 resurrection gate. These are the near-term civilization organs plus
  // the provider-independent UberCloud and the Uber sovereign-stack truth audit.
  // Run them before terminal realization so the known semantic residue cannot
  // masquerade as evidence that these new source contracts were exercised.
  ['node', ['--test',
    'tests/knowledge-labyrinth-ubergraph.test.mjs',
    'tests/ubermind-cognitive-exchange.test.mjs',
    'tests/uberdna-software-genome.test.mjs',
    'tests/sovereign-compute-cell-fabric.test.mjs',
    'tests/economic-metabolism.test.mjs',
    'tests/ubercloud-sovereign-fabric.test.mjs',
    'tests/uber-sovereign-stack.test.mjs'
  ]],
  ['node', ['scripts/supporting-civilization-organs-doctor.mjs']],
  // The founder Communication Center is the human-to-sovereign boundary. Parse
  // and execute its focused contracts before terminal realization so an unrelated
  // semantic backlog cannot hide a dialogue/history/auth regression.
  ['node', ['--check', 'scripts/sovereign-founder-console-server.mjs']],
  ['node', ['--test', 'tests/sovereign-founder-console.test.mjs', 'tests/sovereign-communication-center.test.mjs']],
  // PR-scoped admission gate: the signed-release courier is part of the sovereign
  // control plane, and terminal realization currently refuses on a known semantic
  // backlog before the deterministic tail. Execute its provenance, idempotency,
  // authority-isolation and hostile recovery contract before that expected refusal.
  ['node', ['--test', 'tests/sovereign-release-courier.test.mjs']],
  // PR-scoped admission gate: terminal realization currently refuses on a known
  // semantic backlog before the repository-wide syntax/test tail can execute.
  // Prove the offline runtime installer itself is syntactically valid and its
  // hostile authority/recovery contract executes before that expected refusal.
  ['bash', ['-n', 'ops/sovereign/install-offline-llama-runtime.sh']],
  ['node', ['--test', 'tests/sovereign-offline-llama-runtime.test.mjs']],
  // PR-scoped Sandwich admission gate. The exact-current terminal tribunal has
  // an independent regeneration refusal that can stop this build before the
  // deterministic tail. Run the self-completion protocol's own hostile contract
  // first so that unrelated terminal backlog cannot masquerade as Sandwich test
  // evidence. This proves only these source contracts on this checkout.
  ['node', ['--test',
    'tests/sandwich-method.test.mjs',
    'tests/sandwich-evidence-binding.test.mjs',
    'tests/sandwich-method-plan.test.mjs',
    'tests/sandwich-method-doctor.test.mjs',
    'tests/sandwich-agent-task.test.mjs',
    'tests/sandwich-blueprint-evolution.test.mjs'
  ]],
  // The finite terminal tribunal owns exact-checkout truth regeneration as its
  // first internal step. Running current-truth-regeneration separately here
  // would dirty its generated truth inputs and correctly make the tribunal's
  // second regeneration refuse the workspace. One owner, one regeneration.
  // The tribunal may certify only its declared finite engineering denominator;
  // runtime, provider, commercial, personal-reality and ASI facets remain
  // explicitly evidence-gated inside the tribunal itself.
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
  uberSovereignStackGateRequired: true,
  sandwichMethodFocusedGateRequired: true,
  sandwichEvidenceBindingGateRequired: true,
  sandwichAgentTaskBridgeGateRequired: true,
  sandwichBlueprintEvolutionGateRequired: true,
  externalEffectAuthority: 'NONE'
}));
