import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['--test', 'tests/omnia-v9-execution-receipt.test.mjs'], {
  stdio: 'inherit',
  env: process.env
});

if (result.error) {
  console.error(JSON.stringify({ status: 'INCOMPLETE', layer: 'P5', reason: result.error.message }));
  process.exit(2);
}

if (result.status !== 0) {
  console.error(JSON.stringify({ status: 'FAIL', layer: 'P5', exitCode: result.status }));
  process.exit(result.status || 1);
}

console.log(JSON.stringify({
  status: 'P5_RECEIPTS_VERIFIED',
  layer: 'P5',
  scope: 'shadow execution-receipt semantics and durable receipt projection',
  nonClaims: [
    'not production authorization',
    'not proof of recipient delivery',
    'not concurrency-safe unique persistence yet',
    'not external provider settlement evidence',
    'not independent GitHub CI evidence unless executed by CI'
  ]
}));
