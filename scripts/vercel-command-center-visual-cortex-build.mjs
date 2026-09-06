import { spawnSync } from 'node:child_process';

const TERMINAL_FURNACE_BRANCH = 'gpt/terminal-furnace-c708';
const terminalFurnaceRequested =
  process.env.VERCEL_GIT_COMMIT_REF === TERMINAL_FURNACE_BRANCH &&
  process.env.UBERBOND_TERMINAL_FURNACE_ACTIVE !== '1';

if (terminalFurnaceRequested) {
  const result = spawnSync('node', ['scripts/vercel-command-center-build.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, UBERBOND_TERMINAL_FURNACE_ACTIVE: '1' },
    stdio: 'inherit'
  });
  if (result.error) {
    console.error(`terminal furnace failed to start: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

const steps = [
  ['node', ['scripts/uberbond-feature-genome.mjs']],
  ['node', ['scripts/uberbond-feature-atom-atlas.mjs']],
  ['node', ['scripts/uberbond-synaptic-map.mjs']],
  ['node', ['scripts/uberbond-repository-deep-atlas.mjs']],
  ['node', ['scripts/uberbond-ultimate-graph.mjs']],
  ['node', ['--check', 'api/ultimate-graph.mjs']],
  ['node', ['--check', 'public/uberbond.js']],
  ['node', ['--check', 'public/uberbond-graph.js']],
  ['node', ['--test',
    'tests/uberbond-command-center-status.test.mjs',
    'tests/uberbond-command-center-normalizer.test.mjs',
    'tests/uberbond-synaptic-map.test.mjs',
    'tests/uberbond-repository-deep-atlas.test.mjs',
    'tests/uberbond-ultimate-graph.test.mjs',
    'tests/uberbond-ultimate-graph-cycle-binding.test.mjs',
    'tests/ultimate-graph-api.test.mjs',
    'tests/command-center-2-auth.test.mjs',
    'tests/command-center-2-policy.test.mjs',
    'tests/admin-ephemeral-client-hostile.test.mjs',
    'tests/command-center-owner-auth-hostile.test.mjs'
  ]]
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  });
  if (result.error) {
    console.error(`visual-cortex build step failed to start: ${command} ${args.join(' ')}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(JSON.stringify({
  ok: true,
  status: 'VERCEL_COMMAND_CENTER_VISUAL_CORTEX_GATE_PASSED',
  scope: 'COMMAND_CENTER_AND_ULTIMATE_GRAPH_ONLY',
  wholeRepositoryCertification: 'NOT_IMPLIED',
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE'
}));
