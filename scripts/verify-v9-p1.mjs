import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const requiredFiles = [
  'migrations/005_omnia_v9_proof_store.sql',
  'src/omnia-v9/proof-store.mjs',
  'src/omnia-v9/persistent-admission.mjs',
  'tests/omnia-v9-proof-store.test.mjs'
];

const hashes = {};
let missing = false;
for (const path of requiredFiles) {
  try {
    hashes[path] = createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    missing = true;
  }
}

const syntaxTargets = requiredFiles.filter(path => path.endsWith('.mjs'));
const syntaxFailures = [];
for (const path of syntaxTargets) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status !== 0) syntaxFailures.push({ path, stderr: result.stderr });
}

let dependencyAvailable = true;
const dependencyProbe = spawnSync(process.execPath, ['--input-type=module', '--eval', "await import('@electric-sql/pglite')"], { encoding: 'utf8' });
if (dependencyProbe.status !== 0) dependencyAvailable = false;

let tests = null;
if (dependencyAvailable && !missing && syntaxFailures.length === 0) {
  const result = spawnSync(process.execPath, ['--test', 'tests/omnia-v9-proof-store.test.mjs'], { encoding: 'utf8' });
  tests = { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

let status;
if (missing || syntaxFailures.length) status = 'FAIL';
else if (!dependencyAvailable) status = 'INCOMPLETE';
else if (!tests || tests.exitCode !== 0) status = 'FAIL';
else status = 'P1_DATABASE_VERIFIED';

const report = {
  schemaVersion: 'omnia.v9.verify.p1',
  status,
  requiredFiles: hashes,
  syntaxFailures,
  dependency: {
    name: '@electric-sql/pglite',
    available: dependencyAvailable,
    stderr: dependencyAvailable ? '' : dependencyProbe.stderr
  },
  tests,
  truthRule: 'Missing database verification is INCOMPLETE, never PASS.'
};

console.log(JSON.stringify(report, null, 2));
process.exit(status === 'P1_DATABASE_VERIFIED' ? 0 : status === 'INCOMPLETE' ? 2 : 1);
