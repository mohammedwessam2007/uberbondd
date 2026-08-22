import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createIsolatedClaudeEngineeringExecutor } from '../src/durable-claude-engineering-executor.mjs';
import { detectSandboxIsolation, SANDBOX_PROVISIONER_EXTERNAL_BLOCK } from '../src/agent-sandbox-provisioner.mjs';

// The path PR #88 documented as blocked, exercised end to end: a real
// ephemeral clone, a fake Claude that edits a file in it, the repository's own
// verifier run inside network-disabled namespaces, and a durable artifact.
//
// The fake provider is deliberate. What is under test is the isolation and the
// receipt chain, and a real model call would make the result non-deterministic
// while proving nothing extra about either.

const REPO_ROOT = process.cwd();
const capability = await detectSandboxIsolation();
const skip = capability.ok ? false : `os isolation unavailable: ${capability.reasonCodes.join(',')}`;

function storeFixture() {
  const rows = [];
  let id = 0;
  return {
    rows,
    async log(type, detail) {
      const row = { id: `audit_${++id}`, type, detail, createdAt: detail.createdAt || new Date().toISOString() };
      rows.push(row);
      return row;
    },
    async list(_resource, { filters, limit } = {}) {
      return rows.filter(row => !filters?.type || row.type === filters.type).slice(-(limit || rows.length)).reverse();
    }
  };
}

const TASK = {
  taskId: 'mesh_task_isolated_engineering',
  objective: 'Add a marker file and prove it verifies inside the sandbox',
  consequenceClass: 'LOCAL_PREPARATION',
  acceptanceTests: ['node --check src/effect-ledger.mjs']
};

/** A Claude stand-in that writes one file inside whatever root it is handed. */
function fakeClaudeFactory({ writes = [], onRoot = () => {} } = {}) {
  return async ({ sandboxRoot }) => {
    onRoot(sandboxRoot);
    return async () => {
      for (const [relative, contents] of writes) {
        fs.writeFileSync(path.join(sandboxRoot, relative), contents);
      }
      return {
        ok: true,
        outcome: 'COMPLETED',
        usage: { inputTokens: 10, outputTokens: 10, costCents: 0 },
        result: { outcome: 'complete' }
      };
    };
  };
}

test('a host that cannot isolate yields a refusal, never an executor', async () => {
  const original = process.env.PATH;
  const { resetSandboxIsolationCache, detectSandboxIsolation: detect } = await import('../src/agent-sandbox-provisioner.mjs');
  resetSandboxIsolationCache();
  process.env.PATH = '/definitely-not-a-real-bin-dir';
  try {
    const executor = await createIsolatedClaudeEngineeringExecutor({ store: storeFixture(), repoRoot: REPO_ROOT });
    assert.equal(executor.sandboxStatus, SANDBOX_PROVISIONER_EXTERNAL_BLOCK);
    const result = await executor({ task: TASK });
    assert.equal(result.ok, false);
    assert.equal(result.externalBlocker, SANDBOX_PROVISIONER_EXTERNAL_BLOCK);
    assert.equal(result.businessEffectAuthority, 'NONE');
    assert.ok(result.reasonCodes.includes('os-isolation-unavailable'));
  } finally {
    process.env.PATH = original;
    resetSandboxIsolationCache();
    await detect();
  }
});

test('the executor hands Claude an ephemeral root, never the real repository', { skip }, async () => {
  const roots = [];
  const executor = await createIsolatedClaudeEngineeringExecutor({
    store: storeFixture(),
    repoRoot: REPO_ROOT,
    claudeExecutorFactory: fakeClaudeFactory({ onRoot: root => roots.push(root) })
  });
  await executor({ task: TASK, model: 'fake', maxTokens: 100, costCeilingCents: 0, idempotencyKey: 'iso-1' });
  assert.equal(roots.length, 1);
  assert.notEqual(path.resolve(roots[0]), path.resolve(REPO_ROOT));
  assert.ok(!path.resolve(roots[0]).startsWith(`${path.resolve(REPO_ROOT)}${path.sep}`));
  assert.match(roots[0], /uberbond-sandbox-/);
});

test('an edit Claude makes lands in the sandbox and never in the real tree', { skip }, async () => {
  const marker = 'SANDBOX_ONLY_MARKER.txt';
  let observedRoot = null;
  const executor = await createIsolatedClaudeEngineeringExecutor({
    store: storeFixture(),
    repoRoot: REPO_ROOT,
    claudeExecutorFactory: fakeClaudeFactory({
      writes: [[marker, 'written by the sandboxed worker\n']],
      onRoot: root => { observedRoot = root; }
    })
  });
  await executor({ task: TASK, model: 'fake', maxTokens: 100, costCeilingCents: 0, idempotencyKey: 'iso-2' });
  assert.ok(observedRoot);
  assert.equal(fs.existsSync(path.join(REPO_ROOT, marker)), false, 'the real tree must be untouched');
  // And the sandbox is gone afterwards, marker included.
  assert.equal(fs.existsSync(observedRoot), false, 'the sandbox must not survive the run');
});

test('a real edit verifies inside the namespaces and produces a cleanup receipt', { skip }, async () => {
  const store = storeFixture();
  const executor = await createIsolatedClaudeEngineeringExecutor({
    store,
    repoRoot: REPO_ROOT,
    claudeExecutorFactory: fakeClaudeFactory({ writes: [['SANDBOX_EDIT.txt', 'x\n']] })
  });
  const result = await executor({ task: TASK, model: 'fake', maxTokens: 100, costCeilingCents: 0, idempotencyKey: 'iso-3' });
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes || []));
  assert.equal(result.outcome, 'COMPLETED');
  assert.equal(result.businessEffectAuthority, 'NONE');

  const evidence = result.result.engineeringEvidence;
  // An unreported sandbox is a leaked one, so teardown is part of the receipt
  // chain rather than a side effect nobody records.
  assert.match(String(evidence.cleanupRef || ''), /^receipt:sandbox-destroy-/);
  assert.ok(evidence.verificationReceiptId, 'verification must have actually run');
  const teardown = result.result.truthTable.find(item => /teardown/i.test(item.claim));
  assert.equal(teardown.status, 'VERIFIED');

  // The commands the verifier reports as run are the ones that ran, inside the
  // network-disabled namespaces.
  assert.ok(result.result.testsActuallyRun.length > 0);
  for (const item of result.result.testsActuallyRun) assert.equal(item.status, 'PASS');
  for (const value of Object.values(result.result.externalEffectLedger)) assert.equal(value, 0);
});

test('a task that is not local preparation is refused before a sandbox exists', { skip }, async () => {
  let created = 0;
  const executor = await createIsolatedClaudeEngineeringExecutor({
    store: storeFixture(),
    repoRoot: REPO_ROOT,
    claudeExecutorFactory: fakeClaudeFactory({}),
    createSandbox: async () => { created += 1; return { ok: false }; }
  });
  const result = await executor({ task: { ...TASK, consequenceClass: 'EXTERNAL_EFFECT' } });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('engineering-executor-local-preparation-only'));
  assert.equal(created, 0);
});
