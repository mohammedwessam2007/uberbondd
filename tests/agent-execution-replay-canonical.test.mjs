import test from 'node:test';
import assert from 'node:assert/strict';
import { saveAgentExecutionRecord } from '../src/agent-compute-store.mjs';

// Terminal idempotency exists so a crash after the work is done converges
// instead of conflicting. The record that comes back on recovery is rebuilt
// from persisted pieces, so its fields arrive in whatever order the rebuilding
// code emits them -- which is not necessarily the order they were first
// written in. Key order is not meaning, and treating it as meaning rejects the
// replay on precisely the path this guard is for.

function memoryStore() {
  const rows = [];
  let sequence = 0;
  return {
    rows,
    async log(type, detail) {
      sequence += 1;
      const row = { id: `row-${sequence}`, type, detail, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, sequence)).toISOString() };
      rows.push(row);
      return row;
    },
    async list(_key, { filters = {}, limit = 3000 } = {}) {
      return rows.filter(row => !filters.type || row.type === filters.type).slice(0, limit);
    }
  };
}

const terminal = () => ({
  executionId: 'exec-1',
  taskId: 'task-1',
  status: 'RESULT_SUBMITTED',
  provider: 'openai',
  model: 'test-model',
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
});

test('an identical terminal record replays idempotently', async () => {
  const store = memoryStore();
  assert.equal((await saveAgentExecutionRecord(store, terminal())).status, 'EXECUTION_SAVED');
  assert.equal((await saveAgentExecutionRecord(store, terminal())).status, 'EXECUTION_ALREADY_SAVED');
});

test('the same terminal record with its keys in a different order still converges', async () => {
  const store = memoryStore();
  await saveAgentExecutionRecord(store, terminal());

  // Same facts, rebuilt in a different order -- top level and nested.
  const rebuilt = {
    taskId: 'task-1',
    status: 'RESULT_SUBMITTED',
    usage: { totalTokens: 15, outputTokens: 5, inputTokens: 10 },
    model: 'test-model',
    executionId: 'exec-1',
    provider: 'openai'
  };
  const result = await saveAgentExecutionRecord(store, rebuilt);
  assert.equal(result.ok, true, `reordered replay must converge, not conflict: ${result.reasonCodes}`);
  assert.equal(result.status, 'EXECUTION_ALREADY_SAVED');
  assert.equal(store.rows.length, 1, 'a converging replay must not append a second terminal record');
});

test('a record that genuinely differs is still a conflict, not quietly accepted', async () => {
  // The other half. Making the comparison order-insensitive must not make it
  // blind: a different provider is a different claim about what happened.
  const store = memoryStore();
  await saveAgentExecutionRecord(store, terminal());

  const different = { ...terminal(), provider: 'anthropic' };
  const result = await saveAgentExecutionRecord(store, different);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['terminal-execution-history-conflict']);

  const differentUsage = { ...terminal(), usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16 } };
  const usageResult = await saveAgentExecutionRecord(store, differentUsage);
  assert.equal(usageResult.ok, false);
  assert.deepEqual(usageResult.reasonCodes, ['terminal-execution-history-conflict']);
});

test('array order still counts, because a reordered list is different data', async () => {
  // Canonicalising object keys must not canonicalise arrays. [a,b] and [b,a]
  // are genuinely different values and collapsing them would hide a real
  // divergence.
  const store = memoryStore();
  const withList = { ...terminal(), evidenceRefs: ['test:a', 'test:b'] };
  await saveAgentExecutionRecord(store, withList);

  const swapped = { ...terminal(), evidenceRefs: ['test:b', 'test:a'] };
  const result = await saveAgentExecutionRecord(store, swapped);
  assert.equal(result.ok, false, 'a reordered array is different data and must still conflict');
  assert.deepEqual(result.reasonCodes, ['terminal-execution-history-conflict']);
});
