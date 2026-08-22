import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginAgentMeshCycleReceipt,
  countTerminalAgentMeshCycles,
  deriveAgentMeshCycleId,
  getAgentMeshCycleReceipt
} from '../src/agent-mesh-cycle-receipts.mjs';

function store() {
  const rows = new Map();
  return {
    rows,
    async get(collection, id) {
      return structuredClone(rows.get(`${collection}:${id}`) || null);
    },
    async add(collection, row) {
      const key = `${collection}:${row.id}`;
      if (rows.has(key)) throw new Error(`duplicate:${row.id}`);
      rows.set(key, structuredClone(row));
      return structuredClone(row);
    }
  };
}

const prefix = 'x'.repeat(300);
const overlongA = `${prefix}A`;
const overlongB = `${prefix}B`;

test('distinct overlong occurrence keys are rejected instead of truncating to one cycle id', () => {
  assert.throws(() => deriveAgentMeshCycleId(overlongA), /scheduler-occurrence-key-too-long/);
  assert.throws(() => deriveAgentMeshCycleId(overlongB), /scheduler-occurrence-key-too-long/);
});

test('receipt begin and lookup fail closed on overlong occurrence identity', async () => {
  const durable = store();
  await assert.rejects(
    beginAgentMeshCycleReceipt({ store: durable, occurrenceKey: overlongA }),
    /scheduler-occurrence-key-too-long/
  );
  await assert.rejects(
    getAgentMeshCycleReceipt({ store: durable, occurrenceKey: overlongB }),
    /scheduler-occurrence-key-too-long/
  );
  assert.equal(durable.rows.size, 0);
});

test('history counting does not silently pre-truncate overlong occurrence keys', async () => {
  const durable = store();
  await assert.rejects(
    countTerminalAgentMeshCycles({ store: durable, occurrenceKeys: [overlongA, overlongB] }),
    /scheduler-occurrence-key-too-long/
  );
  assert.equal(durable.rows.size, 0);
});

test('maximum-length occurrence keys remain valid and distinct', () => {
  const a = `${'a'.repeat(299)}1`;
  const b = `${'a'.repeat(299)}2`;
  const first = deriveAgentMeshCycleId(a);
  const second = deriveAgentMeshCycleId(b);
  assert.match(first, /^meshcycle_[a-f0-9]{32}$/);
  assert.match(second, /^meshcycle_[a-f0-9]{32}$/);
  assert.notEqual(first, second);
});
