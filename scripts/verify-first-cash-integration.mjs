/**
 * Offline, zero-effect regression proof for UberBond's first-cash integration.
 * No credentials, network clients, provider calls, or live customer effects.
 * Hosted CI / production still require their separate checks.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FIRST_CASH_OFFLINE_SUITES = Object.freeze([
  'tests/egypt-self-service-route-inventory.test.mjs',
  'tests/pr1377-offline-verification.test.mjs',
  'tests/egypt-self-service-commercial-route.test.mjs',
  'tests/winnr-expansion-planner.test.mjs',
  'tests/winnr-real-30-domain-slots.test.mjs',
  'tests/phoenix-money-policy-integration.test.mjs',
  'tests/prospect-evidence-freshness.test.mjs',
  'tests/delivery-and-partners.test.mjs',
  'tests/global-green-lane-router.test.mjs',
  'tests/revenue-singularity-evidence-bridge.test.mjs',
  'tests/outreach-launch-gate.test.mjs',
  'tests/first-cash-five-pr-integration.test.mjs',
  'tests/uberbond-deep-atlas-streamed-digest.test.mjs'
]);

export function verifyFirstCashOffline({ spawn = spawnSync, cwd = root } = {}) {
  const missing = FIRST_CASH_OFFLINE_SUITES.filter(path => !existsSync(resolve(cwd, path)));
  if (missing.length) return { ok: false, exitCode: 2, missing };
  const output = spawn(process.execPath, ['--test', ...FIRST_CASH_OFFLINE_SUITES], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, OUTBOUND_INTEGRATION_MODE: 'off' },
    timeout: 120_000
  });
  return { ok: output.status === 0, exitCode: output.status ?? 1, signal: output.signal || null };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyFirstCashOffline();
  if (!result.ok) console.error('FIRST_CASH_OFFLINE_VERIFICATION_FAILED', result);
  process.exitCode = result.exitCode;
}
