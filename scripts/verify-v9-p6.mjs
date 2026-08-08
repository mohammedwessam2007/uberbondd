import { spawnSync } from 'node:child_process';

const hasRealPostgres = Boolean(process.env.OMNIA_V9_TEST_DATABASE_URL);
const result = spawnSync(process.execPath, ['--test', 'tests/omnia-v9-receipt-store.test.mjs'], {
  stdio: 'inherit',
  env: process.env
});

if (result.error) {
  console.error(JSON.stringify({ status: 'INCOMPLETE', layer: 'P6', reason: result.error.message }));
  process.exit(2);
}

if (result.status !== 0) {
  console.error(JSON.stringify({ status: 'FAIL', layer: 'P6', exitCode: result.status }));
  process.exit(result.status || 1);
}

if (!hasRealPostgres) {
  console.error(JSON.stringify({
    status: 'INCOMPLETE',
    layer: 'P6',
    reason: 'OMNIA_V9_TEST_DATABASE_URL is required for multi-connection PostgreSQL race verification',
    verified: ['PGlite schema and immutable receipt semantics'],
    unverified: ['real PostgreSQL concurrent identical-writer race', 'real PostgreSQL contradictory-writer race']
  }));
  process.exit(2);
}

console.log(JSON.stringify({
  status: 'P6_RECEIPT_UNIQUENESS_VERIFIED',
  layer: 'P6',
  scope: 'database-enforced one-consequence/one-receipt identity with multi-connection PostgreSQL races',
  nonClaims: [
    'not production authorization',
    'not proof of recipient delivery',
    'tenant identity is database-bound but not yet cryptographically embedded in P5 receipt content',
    'not independent CI evidence unless executed by CI'
  ]
}));
