import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  compileAgentCodeChangeSet,
  validateAgentCodeChangeSet,
  contentSha256
} from '../src/agent-code-change-contract.mjs';
import {
  preflightAgentCodeChangeSet,
  applyAgentCodeChangeSet
} from '../src/agent-code-change-applier.mjs';

function baseChange(overrides = {}) {
  return {
    operation: 'CREATE',
    path: 'src/new-module.mjs',
    content: 'export const value = 1;\n',
    rationale: 'Add the bounded local module.',
    ...overrides
  };
}

function compile(changes = [baseChange()], overrides = {}) {
  return compileAgentCodeChangeSet({
    taskId: 'task_code_1',
    baseRevision: 'deadbeef',
    changes,
    verification: ['npm run check'],
    summary: 'Bounded code change for sandbox verification.',
    ...overrides
  });
}

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-agent-code-'));
}

test('code change set is deterministic, content-hashed and sandbox-only', () => {
  const a = compile();
  const b = compile();
  assert.equal(a.ok, true);
  assert.deepEqual(a, b);
  assert.equal(a.status, 'READY_FOR_SANDBOX_APPLY');
  assert.equal(a.businessEffectAuthority, 'NONE');
  assert.equal(a.changes[0].afterSha256, contentSha256(a.changes[0].content));
  assert.equal(validateAgentCodeChangeSet(a).status, 'VALID');
});

test('protected paths and traversal are rejected', () => {
  for (const filePath of [
    '.env', '.env.production', 'credentials/key.txt', 'lite/lib/db.mjs',
    '.git/config', '.github/workflows/deploy.yml', '../escape.mjs', '/tmp/escape.mjs'
  ]) {
    const out = compile([baseChange({ path: filePath })]);
    assert.equal(out.ok, false, `expected ${filePath} to be rejected`);
  }
});

test('duplicate paths, missing before hashes and direct credential material are rejected', () => {
  assert.equal(compile([baseChange(), baseChange()]).ok, false);
  const update = compile([baseChange({ operation: 'UPDATE', beforeSha256: null })]);
  assert.equal(update.ok, false);
  const secret = compile([baseChange({ content: '-----BEGIN PRIVATE KEY-----\nnot-real-but-forbidden\n' })]);
  assert.equal(secret.ok, false);
  assert.ok(secret.reasonCodes.some(code => code.includes('credential-material-rejected')));
});

test('non-local consequence class cannot become a code-write capability', () => {
  const out = compile(undefined, { consequenceClass: 'OWNER_AUTHORIZED_EXTERNAL' });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('local-preparation-only'));
});

test('sandbox applier creates, updates and deletes only with matching before hashes', async () => {
  const root = await tempRoot();
  try {
    const createSet = compile();
    const created = await applyAgentCodeChangeSet({ sandboxRoot: root, changeSet: createSet, date: new Date('2026-08-20T03:00:00Z') });
    assert.equal(created.ok, true);
    assert.equal(created.status, 'SANDBOX_APPLIED_VERIFICATION_REQUIRED');
    const file = path.join(root, 'src/new-module.mjs');
    assert.equal(await fs.readFile(file, 'utf8'), 'export const value = 1;\n');

    const before = contentSha256('export const value = 1;\n');
    const updateSet = compile([baseChange({
      operation: 'UPDATE',
      beforeSha256: before,
      content: 'export const value = 2;\n',
      rationale: 'Update local fixture.'
    })]);
    const updated = await applyAgentCodeChangeSet({ sandboxRoot: root, changeSet: updateSet });
    assert.equal(updated.ok, true);
    assert.equal(await fs.readFile(file, 'utf8'), 'export const value = 2;\n');

    const deleteSet = compile([baseChange({
      operation: 'DELETE',
      beforeSha256: contentSha256('export const value = 2;\n'),
      content: null,
      rationale: 'Remove local fixture.'
    })]);
    const deleted = await applyAgentCodeChangeSet({ sandboxRoot: root, changeSet: deleteSet });
    assert.equal(deleted.ok, true);
    await assert.rejects(fs.readFile(file, 'utf8'), error => error?.code === 'ENOENT');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('stale before hash fails preflight without modifying the sandbox', async () => {
  const root = await tempRoot();
  try {
    const file = path.join(root, 'src/module.mjs');
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, 'newer state\n');
    const stale = compile([baseChange({
      operation: 'UPDATE',
      path: 'src/module.mjs',
      beforeSha256: contentSha256('older state\n'),
      content: 'agent overwrite\n'
    })]);
    const out = await preflightAgentCodeChangeSet({ sandboxRoot: root, changeSet: stale });
    assert.equal(out.ok, false);
    assert.equal(out.status, 'PREFLIGHT_FAILED');
    assert.ok(out.reasonCodes.includes('before-hash-mismatch:src/module.mjs'));
    assert.equal(await fs.readFile(file, 'utf8'), 'newer state\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('symlink ancestors and symlink targets are rejected', async () => {
  const root = await tempRoot();
  const outside = await tempRoot();
  try {
    await fs.symlink(outside, path.join(root, 'escape-dir'));
    const throughAncestor = compile([baseChange({ path: 'escape-dir/pwned.mjs' })]);
    const a = await preflightAgentCodeChangeSet({ sandboxRoot: root, changeSet: throughAncestor });
    assert.equal(a.ok, false);
    assert.ok(a.reasonCodes.includes('symlink-path-rejected:escape-dir/pwned.mjs'));

    await fs.writeFile(path.join(outside, 'target.mjs'), 'outside\n');
    await fs.symlink(path.join(outside, 'target.mjs'), path.join(root, 'link.mjs'));
    const directLink = compile([baseChange({
      operation: 'UPDATE',
      path: 'link.mjs',
      beforeSha256: contentSha256('outside\n'),
      content: 'nope\n'
    })]);
    const b = await preflightAgentCodeChangeSet({ sandboxRoot: root, changeSet: directLink });
    assert.equal(b.ok, false);
    assert.ok(b.reasonCodes.includes('symlink-path-rejected:link.mjs') || b.reasonCodes.includes('symlink-target-rejected:link.mjs'));
    assert.equal(await fs.readFile(path.join(outside, 'target.mjs'), 'utf8'), 'outside\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test('CREATE refuses to overwrite an existing file', async () => {
  const root = await tempRoot();
  try {
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/new-module.mjs'), 'owner state\n');
    const out = await applyAgentCodeChangeSet({ sandboxRoot: root, changeSet: compile() });
    assert.equal(out.ok, false);
    assert.equal(out.status, 'PREFLIGHT_FAILED');
    assert.equal(await fs.readFile(path.join(root, 'src/new-module.mjs'), 'utf8'), 'owner state\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
