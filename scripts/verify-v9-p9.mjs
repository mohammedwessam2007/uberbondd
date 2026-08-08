import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['--test', 'tests/omnia-v9-authority-transition-ledger.test.mjs'], {
  stdio: 'inherit',
  env: process.env
});

if (result.status !== 0) {
  console.log('P9_AUTHORITY_TRANSITION_FAIL');
  process.exit(result.status || 1);
}

console.log('P9_AUTHORITY_TRANSITION_VERIFIER_LOGIC_VERIFIED');
if (process.env.OMNIA_V9_TEST_DATABASE_URL) {
  console.log('P9_REAL_POSTGRES_TRIGGER_GATE_VERIFIED');
} else {
  console.log('P9_REAL_POSTGRES_TRIGGER_GATE_INCOMPLETE');
  console.log('P9_NOTE=SET_OMNIA_V9_TEST_DATABASE_URL_TO_VERIFY_DATABASE_TRIGGER_ATOMICITY_AND_APPEND_ONLY_ENFORCEMENT');
}
