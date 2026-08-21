import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableClaudeEngineeringExecutor } from '../src/durable-claude-engineering-executor.mjs';

function storeFixture() {
  const rows = [];
  let id = 0;
  return {
    rows,
    async log(type, detail) {
      const row = { id: `audit_${++id}`, type, detail, createdAt: detail.createdAt };
      rows.push(row);
      return row;
    },
    async list(_resource, { filters, limit } = {}) {
      return rows.filter(row => !filters?.type || row.type === filters.type).slice(-(limit || rows.length)).reverse();
    }
  };
}

test('missing durable store fails before any engineering work can start', async () => {
  let sandboxCreates = 0;
  const executor = createDurableClaudeEngineeringExecutor({
    store: null,
    createSandbox: async () => { sandboxCreates += 1; return {}; }
  });
  const out = await executor({ task: { taskId: 't', objective: 'x' } });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('durable-store-log-and-list-required'));
  assert.equal(sandboxCreates, 0);
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('wrapper exposes no business authority merely by binding the artifact store', async () => {
  const store = storeFixture();
  const executor = createDurableClaudeEngineeringExecutor({
    store,
    createSandbox: null,
    destroySandbox: null,
    enterVerificationMode: null,
    claudeExecutorFactory: null
  });
  const out = await executor({
    task: {
      taskId: 't2',
      objective: 'local task',
      consequenceClass: 'EXTERNAL_EFFECT'
    }
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('engineering-executor-local-preparation-only'));
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(store.rows.length, 0);
});
