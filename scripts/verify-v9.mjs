import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const required = [
  'src/omnia-v9/canonical.mjs','src/omnia-v9/schema.mjs','src/omnia-v9/kernel.mjs','src/omnia-v9/outbound-shadow.mjs','tests/omnia-v9.test.mjs'
];
const hashes = {};
let incomplete = false;
for (const path of required) {
  try { hashes[path] = createHash('sha256').update(readFileSync(path)).digest('hex'); }
  catch { incomplete = true; }
}
const syntax = required.filter(p => p.endsWith('.mjs')).map(path => ({ path, result: spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' }) }));
const tests = spawnSync(process.execPath, ['--test', 'tests/omnia-v9.test.mjs'], { encoding: 'utf8' });
const failedSyntax = syntax.filter(x => x.result.status !== 0).map(x => x.path);
const status = incomplete ? 'INCOMPLETE' : (failedSyntax.length || tests.status !== 0 ? 'FAIL' : 'P0_KERNEL_VERIFIED');
const report = { schemaVersion: 'omnia.v9.verify.p0', status, requiredFiles: hashes, failedSyntax, tests: { exitCode: tests.status, stdout: tests.stdout, stderr: tests.stderr } };
console.log(JSON.stringify(report, null, 2));
process.exit(status === 'P0_KERNEL_VERIFIED' ? 0 : 1);
