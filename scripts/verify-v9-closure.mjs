import { spawnSync } from 'node:child_process';

if (!process.env.OMNIA_V9_TEST_DATABASE_URL) {
  console.log('OMNIA_V9_CLOSURE_FAIL=REAL_POSTGRES_REQUIRED');
  process.exit(2);
}

const result = spawnSync('npm', ['run', 'test:v9'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32'
});

if (result.status !== 0) {
  console.log('OMNIA_V9_CLOSURE_FAIL=V9_SUITE_FAILED');
  process.exit(result.status || 1);
}

console.log('OMNIA_V9_REAL_POSTGRES_FULL_SUITE_VERIFIED');
console.log('OMNIA_V9_CLOSURE_CIRCUIT_VERIFIED');
console.log('OMNIA_V9_CLOSURE_VERIFIED');
