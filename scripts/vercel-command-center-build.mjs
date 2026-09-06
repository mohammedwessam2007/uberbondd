import { spawnSync } from 'node:child_process';

const steps = [
  ['node', ['scripts/uberbond-feature-genome.mjs']],
  ['node', ['scripts/uberbond-feature-atom-atlas.mjs']],
  ['node', ['scripts/uberbond-synaptic-map.mjs']],
  ['node', ['--test',
    'tests/uberbond-command-center-status.test.mjs',
    'tests/uberbond-synaptic-map.test.mjs',
    'tests/uberbond-synaptic-cycle-binding.test.mjs'
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
    'tests/command-center-2-auth.test.mjs',
    'tests/command-center-2-policy.test.mjs'
  ]],
  ['npm', ['run', 'check:syntax']],
  ['npm', ['run', 'test:deterministic']],
  ['npm', ['run', 'test:mutation-war']],
  ['npm', ['run', 'test:whole-brain']],
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
  externalEffectAuthority: 'NONE'
}));
