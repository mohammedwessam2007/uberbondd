import { spawnSync } from 'node:child_process';

const steps = [
  ['node', ['scripts/uberbond-feature-genome.mjs']],
  ['node', ['scripts/uberbond-feature-atom-atlas.mjs']],
  ['node', ['scripts/uberbond-synaptic-map.mjs']],
  ['node', ['scripts/uberbond-repository-deep-atlas.mjs']],
  // The Deep Atlas writes a durable repository self-model. Test that artifact
  // immediately, before Ultimate Graph composition or the multi-thousand-test
  // deterministic tree, so a credential/fixture-marker persistence regression
  // fails at the boundary that created it instead of hours later in the siege.
  ['node', ['--test',
    'tests/uberbond-repository-deep-atlas.test.mjs',
    'tests/secret-leakage-sweep.test.mjs'
  ]],
  ['node', ['scripts/uberbond-ultimate-graph.mjs']],
  ['node', ['--test',
    'tests/uberbond-command-center-status.test.mjs',
    'tests/uberbond-synaptic-map.test.mjs',
    'tests/uberbond-synaptic-cycle-binding.test.mjs',
    'tests/uberbond-ultimate-graph.test.mjs',
    'tests/uberbond-ultimate-graph-cycle-binding.test.mjs',
    'tests/ultimate-graph-api.test.mjs'
  ]],
  ['node', ['--test',
    'tests/wessam-continuity.test.mjs',
    'tests/lifetime-context-memory.test.mjs',
    'tests/capability-world-harvester.test.mjs',
    'tests/compute-sovereignty-capacity.test.mjs',
    'tests/organism-metabolism.test.mjs',
    'tests/pre-customer-revenue-readiness.test.mjs'
  ]],
  ['node', ['--test',
    'tests/admin-ephemeral-client-hostile.test.mjs',
    'tests/command-center-2-auth.test.mjs',
    'tests/command-center-2-policy.test.mjs'
  ]],
  ['node', ['scripts/reachability-report.mjs']],
  ['npm', ['run', 'check:syntax']],
  // Canon freshness is part of the deterministic suite. Refresh present-tense
  // readiness against this exact checkout before asking that suite to judge it;
  // otherwise an immutable old receipt can masquerade as current state until
  // the very last build step and create an avoidable always-red terminal gate.
  ['npm', ['run', 'readiness']],
  ['npm', ['run', 'test:deterministic']],
  ['npm', ['run', 'test:mutation-war']],
  ['npm', ['run', 'test:whole-brain']],
  // Re-emit readiness after every proof step so the terminal workspace ends
  // with a current exact-checkout artifact rather than the pre-proof snapshot.
  ['npm', ['run', 'readiness']]
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.error) {
    console.error(`build step failed to start: ${command} ${args.join(' ')}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(JSON.stringify({
  ok: true,
  status: 'VERCEL_NIGHT10_TERMINAL_SOURCE_GATE_PASSED',
  ultimateGraphRequired: true,
  deepAtlasPersistencePrivacyRequired: true,
  adminEphemeralBearerRequired: true,
  reachabilityLiveComputedRequired: true,
  exactCheckoutReadinessBeforeDeterministic: true,
  externalEffectAuthority: 'NONE'
}));
