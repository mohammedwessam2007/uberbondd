import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['--test', 'tests/omnia-v9-pre-effect-authority-reconciliation.test.mjs'], {
  stdio: 'inherit',
  env: process.env
});

if (result.status !== 0) {
  console.log('P8_PRE_EFFECT_RECONCILIATION_FAIL');
  process.exit(result.status || 1);
}

console.log('P8_PRE_EFFECT_RECONCILIATION_SEMANTICS_VERIFIED');
console.log('P8_NOTE=THIS_VERIFIES_RECONCILIATION_SEMANTICS_WHEN_EXECUTED;_P6_REAL_POSTGRES_CONCURRENCY_REMAINS_A_SEPARATE_GATE');
