import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectAgentGitSandboxChanges } from '../src/agent-git-sandbox-collector.mjs';
import { contentSha256 } from '../src/agent-code-change-contract.mjs';

const BASE = 'a'.repeat(40);

async function root() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-git-collector-'));
}

function fakeGit({ sandboxRoot, status, baseFiles = {}, resolvedBase = BASE }) {
  const calls = [];
  const run = async ({ cwd, args }) => {
    calls.push({ cwd, args });
    assert.equal(cwd, sandboxRoot);
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: `${sandboxRoot}\n`, stderr: '' };
    if (args[0] === 'rev-parse' && args[1] === '--verify') return { stdout: `${resolvedBase}\n`, stderr: '' };
    if (args[0] === 'status') return { stdout: status, stderr: '' };
    if (args[0] === 'show') {
      const spec = args[1];
      const separator = spec.indexOf(':');
      const filePath = spec.slice(separator + 1);
      if (!(filePath in baseFiles)) throw new Error(`missing base file ${filePath}`);
      return { stdout: baseFiles[filePath], stderr: '' };
    }
    throw new Error(`unexpected git args ${JSON.stringify(args)}`);
  };
  return { run, calls };
}

test('collector turns actual sandbox create/update/delete state into canonical hashed change set', async () => {
  const sandboxRoot = await root();
  try {
    await fs.mkdir(path.join(sandboxRoot, 'src'), { recursive: true });
    await fs.writeFile(path.join(sandboxRoot, 'src/new.mjs'), 'new file\n');
    await fs.writeFile(path.join(sandboxRoot, 'src/update.mjs'), 'updated file\n');
    const baseFiles = {
      'src/update.mjs': 'old file\n',
      'src/delete.mjs': 'delete me\n'
    };
    const status = `?? src/new.mjs\0 M src/update.mjs\0 D src/delete.mjs\0`;
    const git = fakeGit({ sandboxRoot, status, baseFiles });
    const out = await collectAgentGitSandboxChanges({
      sandboxRoot,
      taskId: 'task_collect_1',
      baseRevision: 'main',
      runGit: git.run,
      verification: ['npm run check']
    });
    assert.equal(out.ok, true);
    assert.equal(out.status, 'CHANGE_SET_COLLECTED');
    assert.equal(out.changeSet.changes.length, 3);
    const byPath = Object.fromEntries(out.changeSet.changes.map(change => [change.path, change]));
    assert.equal(byPath['src/new.mjs'].operation, 'CREATE');
    assert.equal(byPath['src/update.mjs'].operation, 'UPDATE');
    assert.equal(byPath['src/update.mjs'].beforeSha256, contentSha256('old file\n'));
    assert.equal(byPath['src/delete.mjs'].operation, 'DELETE');
    assert.equal(byPath['src/delete.mjs'].beforeSha256, contentSha256('delete me\n'));
    assert.equal(out.changeSet.baseRevision, BASE);
  } finally {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  }
});

test('clean sandbox produces NO_CHANGES without inventing work', async () => {
  const sandboxRoot = await root();
  try {
    const git = fakeGit({ sandboxRoot, status: '' });
    const out = await collectAgentGitSandboxChanges({ sandboxRoot, taskId: 'task_clean', baseRevision: 'main', runGit: git.run });
    assert.equal(out.ok, true);
    assert.equal(out.status, 'NO_CHANGES');
    assert.equal(out.businessEffectAuthority, 'NONE');
  } finally {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  }
});

test('rename/copy status is rejected instead of guessed', async () => {
  const sandboxRoot = await root();
  try {
    const git = fakeGit({ sandboxRoot, status: `R  src/new.mjs\0src/old.mjs\0` });
    const out = await collectAgentGitSandboxChanges({ sandboxRoot, taskId: 'task_rename', baseRevision: 'main', runGit: git.run });
    assert.equal(out.ok, false);
    assert.ok(out.reasonCodes.includes('git-rename-copy-not-supported'));
  } finally {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  }
});

test('merge conflict status is rejected', async () => {
  const sandboxRoot = await root();
  try {
    const git = fakeGit({ sandboxRoot, status: `UU src/conflict.mjs\0` });
    const out = await collectAgentGitSandboxChanges({ sandboxRoot, taskId: 'task_conflict', baseRevision: 'main', runGit: git.run });
    assert.equal(out.ok, false);
    assert.ok(out.reasonCodes.includes('git-conflict-rejected:src/conflict.mjs'));
  } finally {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  }
});

test('protected file changes are rejected by the downstream canonical contract', async () => {
  const sandboxRoot = await root();
  try {
    await fs.writeFile(path.join(sandboxRoot, '.env'), 'SAFE_TEST_VALUE=1\n');
    const git = fakeGit({ sandboxRoot, status: `?? .env\0` });
    const out = await collectAgentGitSandboxChanges({ sandboxRoot, taskId: 'task_env', baseRevision: 'main', runGit: git.run });
    assert.equal(out.ok, false);
    assert.equal(out.status, 'CHANGE_SET_REJECTED');
    assert.ok(out.reasonCodes.some(code => code.includes('protected-path')));
  } finally {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  }
});

test('unsafe revision strings are rejected before git execution', async () => {
  const sandboxRoot = await root();
  try {
    let calls = 0;
    const out = await collectAgentGitSandboxChanges({
      sandboxRoot,
      taskId: 'task_bad_rev',
      baseRevision: '--upload-pack=/tmp/pwn',
      runGit: async () => { calls += 1; return { stdout: '' }; }
    });
    assert.equal(out.ok, false);
    assert.ok(out.reasonCodes.includes('safe-base-revision-required'));
    assert.equal(calls, 0);
  } finally {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
  }
});

test('sandbox root must be the exact Git top-level', async () => {
  const sandboxRoot = await root();
  const parent = await root();
  try {
    const runGit = async ({ args }) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return { stdout: `${parent}\n` };
      if (args[0] === 'rev-parse' && args[1] === '--verify') return { stdout: `${BASE}\n` };
      if (args[0] === 'status') return { stdout: '' };
      throw new Error('unexpected');
    };
    const out = await collectAgentGitSandboxChanges({ sandboxRoot, taskId: 'task_wrong_root', baseRevision: 'main', runGit });
    assert.equal(out.ok, false);
    assert.ok(out.reasonCodes.includes('sandbox-root-must-equal-git-toplevel'));
  } finally {
    await fs.rm(sandboxRoot, { recursive: true, force: true });
    await fs.rm(parent, { recursive: true, force: true });
  }
});
