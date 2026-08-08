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

const cedarResult = spawnSync(process.execPath, ['scripts/verify-v9-p3.mjs'], {
  encoding: 'utf8',
  env: process.env
});
let cedarReport = null;
try { cedarReport = JSON.parse(cedarResult.stdout); } catch { cedarReport = null; }
if (cedarResult.status !== 0 || cedarReport?.status !== 'P3_POLICY_VERIFIED') {
  console.log(cedarResult.stdout);
  console.log(cedarResult.stderr);
  console.log(`OMNIA_V9_CLOSURE_FAIL=CEDAR_POLICY_NOT_VERIFIED status=${cedarReport?.status || 'UNKNOWN'}`);
  process.exit(1);
}
console.log(`OMNIA_V9_CEDAR_POLICY_VERIFIED evaluator=${cedarReport.evaluator.packageName}@${cedarReport.evaluator.version} cedarVersion=${cedarReport.evaluator.cedarVersion} policyDigest=${cedarReport.policyDigest}`);

console.log('OMNIA_V9_CLOSURE_CIRCUIT_VERIFIED');
console.log('OMNIA_V9_CLOSURE_VERIFIED');
