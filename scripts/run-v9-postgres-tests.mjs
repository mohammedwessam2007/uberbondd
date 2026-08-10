import { spawn } from 'node:child_process';

const databaseUrl = String(process.env.OMNIA_V9_TEST_DATABASE_URL || '').trim();
if (!databaseUrl) {
  console.error('OMNIA_V9_TEST_DATABASE_URL is required; refusing to report a database-backed closure run with skipped cases.');
  process.exit(2);
}

const files = [
  'tests/omnia-v9-authority-transition-ledger.test.mjs',
  'tests/omnia-v9-authorization-bound-receipt.test.mjs',
  'tests/omnia-v9-canary-concurrency-races.test.mjs',
  'tests/omnia-v9-external-effect-concurrency.test.mjs',
  'tests/omnia-v9-external-effect-crash-recovery.test.mjs',
  'tests/omnia-v9-external-effect-property.test.mjs',
  'tests/omnia-v9-external-effect-state-machine.test.mjs',
  'tests/omnia-v9-gmail-effect-adapter-dispatch-recovery.test.mjs',
  'tests/omnia-v9-pre-effect-authority-reconciliation.test.mjs',
  'tests/omnia-v9-proof-store.test.mjs',
  'tests/omnia-v9-receipt-store.test.mjs'
];

// Multiple files migrate the same shared real-Postgres database; several of
// them do not coordinate via the advisory-lock pattern used elsewhere (see
// tests/omnia-v9-canary-concurrency-races.test.mjs), so Node's default
// concurrent file execution can race two sessions' "CREATE TABLE IF NOT
// EXISTS" against the same catalog row and fail with a duplicate-key error
// on pg_type -- a real PostgreSQL DDL hazard, not a product defect. Forcing
// one file at a time serializes migrations, matching how this suite is
// documented to run in CI.
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  stdio: 'inherit',
  env: { ...process.env, OMNIA_V9_TEST_DATABASE_URL: databaseUrl }
});
const exitCode = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
process.exit(exitCode);
