import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const liteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(liteRoot, '..');
const publicDir = path.join(liteRoot, 'public');
const restartRecoveryReceiptPath = '/tmp/uberbond-restart-recovery-receipt.json';
process.env.UBERBOND_RESTART_RECOVERY_RECEIPT_PATH = restartRecoveryReceiptPath;

const steps = [
  ['hydrate-embedded-postgres-fixture', 'node', ['scripts/hydrate-embedded-postgres-fixture.mjs']],
  ['rebuild-embedded-postgres-linux-x64', 'npm', ['rebuild', '@embedded-postgres/linux-x64']],
  ['prepare-embedded-postgres-fixture', 'node', ['scripts/prepare-embedded-postgres-fixture.mjs']],
  ['restart-recovery-drill', 'node', ['scripts/with-real-postgres.mjs', 'node', 'scripts/deploy-restart-recovery-drill.mjs', '--output', restartRecoveryReceiptPath]],
  ['runtime-proof-tests', 'node', ['--test', 'tests/runtime-proof-ingestion.test.mjs', 'tests/runtime-cut-evidence-overlay.test.mjs', 'tests/provider-neutral-runtime-acceptance.test.mjs']],
  ['terminal-realization', 'node', ['scripts/terminal-realization.mjs']],
  ['feature-genome', 'node', ['scripts/uberbond-feature-genome.mjs']],
  ['feature-atom-atlas', 'node', ['scripts/uberbond-feature-atom-atlas.mjs']],
  ['synaptic-map', 'node', ['scripts/uberbond-synaptic-map.mjs']],
  ['repository-deep-atlas', 'node', ['scripts/uberbond-repository-deep-atlas.mjs']],
  ['ultimate-graph', 'node', ['scripts/uberbond-ultimate-graph.mjs']],
  ['check-uberbond-js', 'node', ['--check', 'public/uberbond.js']],
  ['check-uberbond-graph-js', 'node', ['--check', 'public/uberbond-graph.js']],
  ['visual-cortex-tests', 'node', ['--test',
    'tests/uberbond-repository-deep-atlas.test.mjs',
    'tests/uberbond-repository-deep-atlas-growth-safe.test.mjs',
    'tests/uberbond-ultimate-graph.test.mjs',
    'tests/ultimate-graph-api.test.mjs',
    'tests/command-center-owner-auth-hostile.test.mjs',
    'tests/lite-owner-bearer-source.test.mjs'
  ]]
];

function digest(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

const rows = [];
let earliestFailure = null;
for (const [id, command, args] of steps) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024
  });
  const row = {
    id,
    command,
    args,
    durationMs: Date.now() - started,
    status: result.status,
    signal: result.signal ?? null,
    spawnErrorCode: result.error?.code ? String(result.error.code) : null,
    stdoutBytes: Buffer.byteLength(String(result.stdout || '')),
    stderrBytes: Buffer.byteLength(String(result.stderr || '')),
    stdoutDigest: digest(result.stdout || ''),
    stderrDigest: digest(result.stderr || ''),
    passed: !result.error && result.status === 0
  };
  rows.push(row);
  if (!row.passed && !earliestFailure) earliestFailure = id;
}

await mkdir(publicDir, { recursive: true });
const receipt = {
  schemaVersion: 'uberbond.lite-build-forensics.v1',
  status: earliestFailure ? 'DIAGNOSTIC_FAILURES_OBSERVED' : 'DIAGNOSTIC_ALL_STEPS_PASSED',
  diagnosticOnly: true,
  productionPromotionAuthority: 'NONE',
  sourceBranch: 'diag/lite-build-forensics-20260929',
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  earliestFailure,
  rows,
  secretBoundary: 'NO_CHILD_STDOUT_OR_STDERR_CONTENT_IS_EXPORTED; ONLY LENGTHS_AND_SHA256_DIGESTS_ARE_PUBLISHED',
  externalEffectAuthority: 'DIAGNOSTIC_PREVIEW_ONLY'
};
await writeFile(path.join(publicDir, 'build-forensics.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  ok: true,
  status: 'LITE_BUILD_FORENSICS_COMPLETE',
  earliestFailure,
  failedStepCount: rows.filter(row => !row.passed).length,
  publicReceipt: 'public/build-forensics.json',
  diagnosticOnly: true,
  productionPromotionAuthority: 'NONE'
}));
