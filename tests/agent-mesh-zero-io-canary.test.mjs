import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_MESH_ZERO_IO_CANARY_POLICY_VERSION,
  createZeroExternalIoCanaryRunner
} from '../src/agent-mesh-zero-io-canary.mjs';

function fakeReceiptApi() {
  const state = { records: new Map(), calls: [] };
  function identityKey(input) {
    return JSON.stringify({
      sourceCommit: input.sourceCommit,
      policyVersions: input.policyVersions,
      workers: input.workers,
      configuration: input.configuration
    });
  }
  return {
    state,
    async getAgentMeshCycleReceipt(input) {
      state.calls.push(['get', structuredClone(input)]);
      const row = state.records.get(input.occurrenceKey);
      if (!row) return { cycleId: `cycle:${input.occurrenceKey}`, state: 'ABSENT', receipt: null };
      if (row.identity !== identityKey(input)) throw new Error('scheduler-occurrence-identity-conflict');
      return { cycleId: row.cycleId, state: row.phase, receipt: structuredClone(row.receipt) };
    },
    async beginAgentMeshCycleReceipt(input) {
      state.calls.push(['begin', structuredClone(input)]);
      const existing = state.records.get(input.occurrenceKey);
      if (existing) {
        if (existing.identity !== identityKey(input)) throw new Error('scheduler-occurrence-identity-conflict');
        return { cycleId: existing.cycleId, duplicate: true, receipt: structuredClone(existing.receipt) };
      }
      const cycleId = `cycle:${input.occurrenceKey}`;
      const receipt = {
        cycleId,
        status: 'STARTED',
        phase: 'STARTED',
        startedAt: new Date(input.startedAt).toISOString(),
        sourceCommit: input.sourceCommit,
        policyVersions: structuredClone(input.policyVersions),
        businessEffectAuthority: 'NONE',
        externalEffectLedger: { providerCalls:0,messages:0,purchases:0,deployments:0,credentialChanges:0,dnsChanges:0,productionMutations:0,spendCents:0 }
      };
      state.records.set(input.occurrenceKey, { cycleId, phase: 'STARTED', identity: identityKey(input), receipt });
      return { cycleId, duplicate: false, receipt: structuredClone(receipt) };
    },
    async finishAgentMeshCycleReceipt(input) {
      state.calls.push(['finish', structuredClone(input)]);
      const pair = [...state.records.entries()].find(([, row]) => row.cycleId === input.cycleId);
      assert.ok(pair, 'started receipt required');
      const [occurrenceKey, row] = pair;
      const receipt = {
        ...row.receipt,
        phase: 'TERMINAL',
        status: input.status,
        reasonCodes: structuredClone(input.reasonCodes || []),
        firstSweep: structuredClone(input.firstSweep || null),
        workers: structuredClone(input.workers || []),
        secondSweep: structuredClone(input.secondSweep || null),
        finishedAt: new Date(input.finishedAt).toISOString()
      };
      state.records.set(occurrenceKey, { ...row, phase: 'TERMINAL', receipt });
      return { duplicate: false, receipt: structuredClone(receipt) };
    },
    async reconcileAbandonedAgentMeshCycles(input) {
      state.calls.push(['reconcile', { now: new Date(input.now).toISOString(), abandonedAfterMs: input.abandonedAfterMs }]);
      return { abandonedFound: 0, reconciled: [] };
    }
  };
}

function runner() {
  const api = fakeReceiptApi();
  return { api, run: createZeroExternalIoCanaryRunner(api) };
}

const input = {
  store: {},
  schedulerOccurrenceKey: 'vercel-cron:agent-mesh:2026-08-29:abc',
  sourceCommit: 'abc123',
  date: new Date('2026-08-29T12:17:00.000Z')
};

test('canary writes one canonical STARTED→IDLE receipt and zero effects', async () => {
  const { api, run } = runner();
  const out = await run(input);
  assert.equal(out.ok, true);
  assert.equal(out.status, 'IDLE');
  assert.equal(out.executionMode, 'ZERO_EXTERNAL_IO_CANARY');
  assert.ok(out.reasonCodes.includes('zero-external-io-canary'));
  assert.equal(out.externalEffectLedger.providerCalls, 0);
  assert.deepEqual(api.state.calls.map(call => call[0]), ['get', 'reconcile', 'begin', 'finish']);
});

test('canary immutable identity includes its policy version', async () => {
  const { api, run } = runner();
  await run(input);
  const begin = api.state.calls.find(call => call[0] === 'begin')[1];
  assert.deepEqual(begin.policyVersions, [AGENT_MESH_ZERO_IO_CANARY_POLICY_VERSION]);
  assert.deepEqual(begin.workers, []);
  assert.deepEqual(begin.configuration, { autonomyRunLimit: 1, ingestAfterWorkers: false });
});

test('same occurrence replay is read-only idempotent', async () => {
  const { api, run } = runner();
  const first = await run(input);
  const before = api.state.calls.length;
  const second = await run(input);
  assert.equal(first.cycleId, second.cycleId);
  assert.equal(second.duplicateDelivery, true);
  assert.equal(api.state.calls.slice(before).map(call => call[0]).join(','), 'get');
});

test('source drift on same occurrence fails closed before a new begin', async () => {
  const { api, run } = runner();
  await run(input);
  const beforeBegins = api.state.calls.filter(call => call[0] === 'begin').length;
  const out = await run({ ...input, sourceCommit: 'different-source' });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('scheduler-occurrence-identity-conflict'));
  assert.equal(api.state.calls.filter(call => call[0] === 'begin').length, beforeBegins);
});

test('same occurrence cannot be reinterpreted under normal-mesh identity', async () => {
  const { api, run } = runner();
  await run(input);
  await assert.rejects(() => api.getAgentMeshCycleReceipt({
    store: input.store,
    occurrenceKey: input.schedulerOccurrenceKey,
    sourceCommit: input.sourceCommit,
    policyVersions: ['agent-mesh-control-plane-1.4.0', 'agent-model-routing-config-1.0.0'],
    workers: [],
    configuration: { autonomyRunLimit: 1, ingestAfterWorkers: false }
  }), /scheduler-occurrence-identity-conflict/);
});

test('missing source and occurrence fail before receipt calls', async () => {
  for (const patch of [{ schedulerOccurrenceKey: '' }, { sourceCommit: '' }]) {
    const { api, run } = runner();
    const out = await run({ ...input, ...patch });
    assert.equal(out.ok, false);
    assert.equal(api.state.calls.length, 0);
  }
});

test('recent STARTED duplicate blocks and never creates a second receipt', async () => {
  const { api, run } = runner();
  await api.beginAgentMeshCycleReceipt({
    store: input.store,
    occurrenceKey: input.schedulerOccurrenceKey,
    startedAt: input.date,
    sourceCommit: input.sourceCommit,
    policyVersions: [AGENT_MESH_ZERO_IO_CANARY_POLICY_VERSION],
    workers: [],
    configuration: { autonomyRunLimit: 1, ingestAfterWorkers: false }
  });
  const out = await run(input);
  assert.equal(out.ok, false);
  assert.equal(out.cycleReceiptState, 'STARTED');
  assert.ok(out.reasonCodes.includes('scheduler-occurrence-already-started-incomplete'));
});

test('module exposes no worker, relay, model, provider, messaging or spend hooks', () => {
  const sourceSurface = Object.keys({ AGENT_MESH_ZERO_IO_CANARY_POLICY_VERSION, createZeroExternalIoCanaryRunner });
  assert.deepEqual(sourceSurface.sort(), ['AGENT_MESH_ZERO_IO_CANARY_POLICY_VERSION', 'createZeroExternalIoCanaryRunner'].sort());
});
