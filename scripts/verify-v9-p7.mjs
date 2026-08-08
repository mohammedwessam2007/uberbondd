import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['--test', 'tests/omnia-v9-authorization-bound-receipt.test.mjs'], {
  stdio: 'inherit',
  env: process.env
});

if (result.status !== 0) {
  console.log('P7_AUTHORIZATION_BINDING_FAIL');
  process.exit(result.status || 1);
}

console.log('P7_AUTHORIZATION_BINDING_SEMANTICS_VERIFIED');
console.log('P7_NOTE=P6_REAL_POSTGRES_CONCURRENCY_REMAINS_A_SEPARATE_INCOMPLETE_GATE_UNLESS_OMNIA_V9_TEST_DATABASE_URL_WAS_EXECUTED');
