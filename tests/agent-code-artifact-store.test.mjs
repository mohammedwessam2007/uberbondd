import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAgentCodeChangeSet
} from '../src/agent-code-change-contract.mjs';
import {
  saveAgentCodeChangeArtifact,
  loadAgentCodeChangeArtifact,
  listAgentCodeChangeArtifacts
} from '../src/agent-code-artifact-store.mjs';

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
      return rows.filter(row => !filters?.type || row.type === filters.type).slice(-limit).reverse();
    }
  };
}

function changeSet(overrides = {}) {
  return compileAgentCodeChangeSet({
    taskId: 'task_artifact_1',
    baseRevision: 'a'.repeat(40),
    changes: [{
      operation: 'CREATE',
      path: 'src/artifact.mjs',
      content: 'export const artifact = true;\n',
      rationale: 'Add bounded artifact fixture.'
    }],
    verification: ['npm run check'],
    summary: 'Artifact fixture.',
    ...overrides
  });
}

test('change set is stored with typed immutable artifact reference and digest', async () => {
  const store = storeFixture();
  const set = changeSet();
  const saved = await saveAgentCodeChangeArtifact(store, set, { date: new Date('2026-08-20T04:00:00Z') });
  assert.equal(saved.ok, true);
  assert.equal(saved.status, 'STORED');
  assert.equal(saved.artifactRef, `artifact:agent-code-change:${set.changeSetId}`);
  assert.match(saved.artifactSha256, /^[a-f0-9]{64}$/);
  assert.equal(saved.businessEffectAuthority, 'NONE');
});

test('saving the exact artifact twice is idempotent instead of duplicating rows', async () => {
  const store = storeFixture();
  const set = changeSet();
  const first = await saveAgentCodeChangeArtifact(store, set);
  const second = await saveAgentCodeChangeArtifact(store, set);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.status, 'ALREADY_STORED');
  assert.equal(store.rows.length, 1);
});

test('stored artifact loads with canonical validation and digest verification', async () => {
  const store = storeFixture();
  const set = changeSet();
  const saved = await saveAgentCodeChangeArtifact(store, set);
  const loaded = await loadAgentCodeChangeArtifact(store, saved.artifactRef);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.status, 'LOADED');
  assert.deepEqual(loaded.changeSet, set);
  assert.equal(loaded.artifactSha256, saved.artifactSha256);
});

test('tampered persisted content is detected instead of silently served to a reviewer', async () => {
  const store = storeFixture();
  const set = changeSet();
  const saved = await saveAgentCodeChangeArtifact(store, set);
  store.rows[0].detail.changeSet.changes[0].content = 'tampered\n';
  const loaded = await loadAgentCodeChangeArtifact(store, saved.artifactRef);
  assert.equal(loaded.ok, false);
  assert.ok(['CORRUPT'].includes(loaded.status));
});

test('credential-shaped material is rejected even if a caller attempts to construct a persisted artifact', async () => {
  const store = storeFixture();
  const set = changeSet({
    changes: [{
      operation: 'CREATE',
      path: 'src/not-secret.mjs',
      content: 'const x = "Bearer abcdefghijklmnopqrstuvwxyz123456";\n',
      rationale: 'Forbidden material fixture.'
    }]
  });
  assert.equal(set.ok, false);
  const saved = await saveAgentCodeChangeArtifact(store, set);
  assert.equal(saved.ok, false);
  assert.equal(store.rows.length, 0);
});

test('artifact listing returns metadata only and can filter by task', async () => {
  const store = storeFixture();
  const first = changeSet();
  const second = compileAgentCodeChangeSet({
    taskId: 'task_artifact_2',
    baseRevision: 'b'.repeat(40),
    changes: [{ operation: 'CREATE', path: 'src/second.mjs', content: 'export default 2;\n', rationale: 'second' }],
    verification: ['npm run check'],
    summary: 'Second artifact.'
  });
  await saveAgentCodeChangeArtifact(store, first, { date: new Date('2026-08-20T04:00:00Z') });
  await saveAgentCodeChangeArtifact(store, second, { date: new Date('2026-08-20T04:01:00Z') });
  const all = await listAgentCodeChangeArtifacts(store);
  assert.equal(all.count, 2);
  assert.equal(all.items[0].changeSet, undefined);
  const filtered = await listAgentCodeChangeArtifacts(store, { taskId: 'task_artifact_1' });
  assert.equal(filtered.count, 1);
  assert.equal(filtered.items[0].taskId, 'task_artifact_1');
});
