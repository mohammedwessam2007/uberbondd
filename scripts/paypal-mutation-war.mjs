import { mkdtempSync, cpSync, rmSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { classifySuiteRun, applyMutation } from './mutation-verdict.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUITE_TEST_TIMEOUT_MS = 120_000;
const SUITE_WALL_TIMEOUT_MS = 600_000;

export const PAYPAL_MUTATIONS = Object.freeze([
  Object.freeze({
    id: 'PAYPAL-01',
    guard: 'Sandbox PayPal can never create commercial payment truth',
    file: 'src/paypal-payment-truth-core.mjs',
    find: "  if (cfg.environment === 'sandbox') {",
    replace: '  if (false) {',
    suites: ['tests/paypal-payment-truth.test.mjs']
  }),
  Object.freeze({
    id: 'PAYPAL-02',
    guard: 'PayPal webhook authenticity requires verification_status SUCCESS',
    file: 'src/paypal-payment-truth-core.mjs',
    find: "  if (text(verification.payload?.verification_status, 40).toUpperCase() !== 'SUCCESS') {",
    replace: '  if (false) {',
    suites: ['tests/paypal-webhook-auth-hostile.test.mjs']
  }),
  Object.freeze({
    id: 'PAYPAL-03',
    guard: 'PayPal signature verification is bound to the configured webhook identity',
    file: 'src/paypal-payment-truth-core.mjs',
    find: '      webhook_id: cfg.webhookId,',
    replace: "      webhook_id: 'mutation-wrong-webhook-id',",
    suites: ['tests/paypal-webhook-auth-hostile.test.mjs']
  }),
  Object.freeze({
    id: 'PAYPAL-04',
    guard: 'Canonical PayPal module rejects replay identity drift and incomplete witness triads',
    file: 'src/paypal-payment-truth.mjs',
    find: '  if (!exactProviderIdentity || !exactEconomics || !exactTriadBinding) {',
    replace: '  if (false) {',
    suites: ['tests/paypal-module-replay-identity-hostile.test.mjs']
  }),
  Object.freeze({
    id: 'PAYPAL-05',
    guard: 'Unresolved provider reversal or dispute risk blocks retained-payment truth',
    file: 'src/payment-renewal-truth.mjs',
    find: "  if (unresolvedRetention.length) contradictions.push('provider-payment-retention-risk-unresolved');",
    replace: "  if (false) contradictions.push('provider-payment-retention-risk-unresolved');",
    suites: ['tests/paypal-payment-renewal-truth.test.mjs']
  })
]);

function runSuites(root, suites) {
  const result = spawnSync(process.execPath, ['--test', `--test-timeout=${SUITE_TEST_TIMEOUT_MS}`, ...suites], {
    cwd: root,
    encoding: 'utf8',
    timeout: SUITE_WALL_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    env: { ...process.env, NODE_OPTIONS: '' }
  });
  return {
    status: result.status,
    timedOut: result.error?.code === 'ETIMEDOUT',
    output: `${result.stdout || ''}${result.stderr || ''}`
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = [];
  for (const mutation of PAYPAL_MUTATIONS) {
    const root = mkdtempSync(join(tmpdir(), 'uberbond-paypal-mutation-'));
    try {
      for (const dir of ['src', 'tests', 'scripts', 'config', 'migrations', 'api']) {
        cpSync(join(repoRoot, dir), join(root, dir), { recursive: true });
      }
      cpSync(join(repoRoot, 'package.json'), join(root, 'package.json'));
      symlinkSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), 'dir');

      const applied = applyMutation(root, mutation);
      if (!applied.applied) {
        results.push({ ...mutation, verdict: applied.reason === 'anchor-ambiguous' ? 'ANCHOR_AMBIGUOUS' : 'ANCHOR_NOT_FOUND' });
        continue;
      }
      const syntax = spawnSync(process.execPath, ['--check', join(root, mutation.file)], { encoding: 'utf8' });
      if (syntax.status !== 0) {
        results.push({ ...mutation, verdict: 'MUTANT_DID_NOT_PARSE' });
        continue;
      }
      const run = runSuites(root, mutation.suites);
      results.push({ ...mutation, verdict: classifySuiteRun(run) });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const killed = results.filter(item => item.verdict === 'KILLED');
  for (const item of results) console.log(`${item.verdict.padEnd(22)} ${item.id.padEnd(10)} ${item.guard}`);
  console.log('');
  console.log(`paypal-mutation-war — ${results.length} mutations, ${killed.length} killed, ${results.length - killed.length} not killed`);
  process.exit(killed.length === results.length ? 0 : 1);
}
