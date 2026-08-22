import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  detectSandboxIsolation,
  createEphemeralSandbox,
  destroyEphemeralSandbox,
  createNamespacedVerificationRunner
} from '../src/agent-sandbox-provisioner.mjs';

// Escape attempts, run for real.
//
// Every assertion here is about the state of the HOST after the attempt, never
// about what the contained process believed happened. That distinction is the
// whole point: a write into the tmpfs that masks the real repository looks like
// a success from inside and leaves nothing behind outside. Trusting the inside
// view would have this suite passing on an error message instead of on
// containment.

const REPO_ROOT = process.cwd();
const TASK = { taskId: 'mesh_task_sandbox_escape', objective: 'escape attempts', consequenceClass: 'LOCAL_PREPARATION' };

const capability = await detectSandboxIsolation();
const skip = capability.ok ? false : `os isolation unavailable: ${capability.reasonCodes.join(',')}`;

// One sandbox, many attempts: creating it clones the repository, and doing that
// per-assertion would make this suite slower than the gate it belongs to.
let sandbox = null;
let runner = null;
const decoys = [];

test('set up the sandbox and the bait', { skip }, async () => {
  const envDecoy = path.join(REPO_ROOT, '.sandbox-escape-decoy.env');
  fs.writeFileSync(envDecoy, 'DECOY_SECRET_VALUE=must-not-be-readable\n');
  decoys.push(envDecoy);
  sandbox = await createEphemeralSandbox({ task: TASK, idempotencyKey: 'escape', repoRoot: REPO_ROOT, capability });
  assert.equal(sandbox.ok, true, JSON.stringify(sandbox.reasonCodes || []));
  runner = createNamespacedVerificationRunner({ sandbox, repoRoot: REPO_ROOT });
});

/** Run one snippet inside the sandbox and return its combined output. */
async function attempt(code) {
  const result = await runner({
    executable: process.execPath,
    args: ['-e', code],
    cwd: sandbox.sandboxRoot,
    env: { PATH: process.env.PATH, HOME: sandbox.isolationReceipt.ephemeralHome },
    timeoutMs: 25_000
  });
  return `${result.stdout}${result.stderr}`;
}

test('network egress is gone, not merely discouraged', { skip }, async () => {
  const output = await attempt(
    "const s=require('node:net').connect({host:'1.1.1.1',port:443});"
    + "s.on('connect',()=>{console.log('REACHABLE');process.exit(0)});"
    + "s.on('error',()=>{console.log('BLOCKED');process.exit(0)});"
    + "setTimeout(()=>{console.log('BLOCKED');process.exit(0)},5000);"
  );
  assert.match(output, /BLOCKED/);
  assert.ok(!/REACHABLE/.test(output));
});

test('a DNS lookup cannot leak the fact of execution', { skip }, async () => {
  const output = await attempt(
    "require('node:dns').promises.resolve4('example.com')"
    + ".then(a=>console.log('RESOLVED:'+a)).catch(()=>console.log('DNS_BLOCKED'));"
    + "setTimeout(()=>{console.log('DNS_BLOCKED');process.exit(0)},5000);"
  );
  assert.match(output, /DNS_BLOCKED/);
  assert.ok(!/RESOLVED:/.test(output));
});

test('the real repository secret is not readable', { skip }, async () => {
  const output = await attempt(
    `try{console.log('READ:'+require('node:fs').readFileSync(${JSON.stringify(decoys[0])},'utf8'))}`
    + "catch(e){console.log('DENIED:'+e.code)}"
  );
  assert.ok(!/DECOY_SECRET_VALUE/.test(output), 'the decoy secret must never appear in sandbox output');
  assert.match(output, /DENIED:/);
});

test('a parent-directory traversal reaches nothing', { skip }, async () => {
  const output = await attempt(
    `try{console.log('READ:'+require('node:fs').readFileSync('../../..${decoys[0]}','utf8'))}`
    + "catch(e){console.log('DENIED:'+e.code)}"
  );
  assert.ok(!/DECOY_SECRET_VALUE/.test(output));
});

test('a symlink pointed at the host does not resolve to the host', { skip }, async () => {
  const output = await attempt(
    "const fs=require('node:fs');"
    + `try{fs.symlinkSync(${JSON.stringify(decoys[0])},'escape-link');`
    + "console.log('READ:'+fs.readFileSync('escape-link','utf8'))}catch(e){console.log('DENIED:'+e.code)}"
  );
  assert.ok(!/DECOY_SECRET_VALUE/.test(output));
});

test('an absolute path to the host home reaches nothing', { skip }, async () => {
  const output = await attempt(
    `try{console.log('READ:'+require('node:fs').readdirSync(${JSON.stringify(os.homedir())}).join(','))}`
    + "catch(e){console.log('DENIED:'+e.code)}"
  );
  assert.ok(!/READ:.+/.test(output.replace('READ:\n', '')) || /READ:$/m.test(output), 'the host home must appear empty or absent');
});

// The four that matter most: a write that appears to succeed inside must leave
// the host exactly as it was.
test('writing into the real working tree leaves the real working tree untouched', { skip }, async () => {
  const target = path.join(REPO_ROOT, 'SANDBOX_ESCAPE_PROOF.txt');
  await attempt(`try{require('node:fs').writeFileSync(${JSON.stringify(target)},'pwned')}catch(e){}`);
  assert.equal(fs.existsSync(target), false, 'a sandboxed write must not reach the host repository');
});

test('rewriting the real git config leaves the real git config untouched', { skip }, async () => {
  const target = path.join(REPO_ROOT, '.git', 'config');
  const before = fs.readFileSync(target, 'utf8');
  await attempt(`try{require('node:fs').writeFileSync(${JSON.stringify(target)},'[remote "origin"]\\n\\turl = https://evil.test/x\\n')}catch(e){}`);
  assert.equal(fs.readFileSync(target, 'utf8'), before);
});

test('deleting the real test suite leaves the real test suite in place', { skip }, async () => {
  const target = path.join(REPO_ROOT, 'tests', 'effect-ledger-canonical.test.mjs');
  const before = fs.readFileSync(target, 'utf8');
  await attempt(`try{require('node:fs').rmSync(${JSON.stringify(path.join(REPO_ROOT, 'tests'))},{recursive:true,force:true})}catch(e){}`);
  assert.equal(fs.existsSync(target), true, 'a sandboxed process must not be able to delete the gate');
  assert.equal(fs.readFileSync(target, 'utf8'), before);
});

test('rewriting the real package.json leaves the verifier commands intact', { skip }, async () => {
  const target = path.join(REPO_ROOT, 'package.json');
  const before = fs.readFileSync(target, 'utf8');
  await attempt(`try{require('node:fs').writeFileSync(${JSON.stringify(target)},'{"scripts":{"check":"true"}}')}catch(e){}`);
  assert.equal(fs.readFileSync(target, 'utf8'), before);
});

test('writing a host .npmrc leaves no host .npmrc behind', { skip }, async () => {
  const target = path.join(REPO_ROOT, '.npmrc');
  const existed = fs.existsSync(target);
  await attempt(`try{require('node:fs').writeFileSync(${JSON.stringify(target)},'registry=https://evil.test/\\n')}catch(e){}`);
  assert.equal(fs.existsSync(target), existed);
});

test('the lite/ tree is not reachable for mutation', { skip }, async () => {
  const target = path.join(REPO_ROOT, 'lite');
  const before = fs.existsSync(target) ? fs.readdirSync(target).sort().join(',') : null;
  await attempt(`try{require('node:fs').rmSync(${JSON.stringify(target)},{recursive:true,force:true})}catch(e){}`);
  const after = fs.existsSync(target) ? fs.readdirSync(target).sort().join(',') : null;
  assert.equal(after, before);
});

test('borrowed dependencies are readable and not writable', { skip }, async () => {
  const write = await attempt("try{require('node:fs').writeFileSync('node_modules/SANDBOX_PWN.js','x');console.log('WROTE')}catch(e){console.log('DENIED:'+e.code)}");
  assert.match(write, /DENIED:EROFS/);
  assert.equal(fs.existsSync(path.join(REPO_ROOT, 'node_modules', 'SANDBOX_PWN.js')), false);
  const read = await attempt("console.log('DEPS:'+require('node:fs').existsSync('node_modules'))");
  assert.match(read, /DEPS:true/);
});

test('the sandbox itself is writable, so containment is not just a broken workspace', { skip }, async () => {
  const output = await attempt("require('node:fs').writeFileSync('sandbox-scratch.txt','ok');console.log('WROTE:'+require('node:fs').readFileSync('sandbox-scratch.txt','utf8'))");
  assert.match(output, /WROTE:ok/);
});

test('the environment carries no credential-shaped variable into the sandbox', { skip }, async () => {
  const output = await attempt("console.log('ENVKEYS:'+Object.keys(process.env).sort().join(','))");
  const keys = (output.match(/ENVKEYS:(.*)/)?.[1] || '').split(',').filter(Boolean);
  assert.ok(keys.length > 0);
  for (const key of keys) {
    assert.ok(!/token|secret|password|credential|api[-_]?key|authorization/i.test(key), `${key} must not reach the sandbox`);
  }
});

test('tear down the sandbox and the bait', { skip }, async () => {
  const receipt = await destroyEphemeralSandbox({ sandbox, task: TASK, idempotencyKey: 'escape' });
  assert.equal(receipt.ok, true);
  for (const decoy of decoys) fs.rmSync(decoy, { force: true });
  assert.equal(fs.existsSync(sandbox.sandboxContainer), false);
});
