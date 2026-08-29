import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAutonomySession, compileTaskIntent } from '../src/agent-autonomy-loop.mjs';
import { createAutonomyRun } from '../src/agent-autonomy-pump.mjs';
import { saveAutonomyRunSnapshot } from '../src/agent-autonomy-store.mjs';
import { compileRelayTaskFromIntent } from '../src/agent-autonomy-relay-adapter.mjs';
import { runAgentMeshCycle } from '../src/agent-mesh-control-plane.mjs';
import { createRelayAdapterFactory, describeRelayReadiness } from '../src/agent-relay-adapter-factory.mjs';
import { createModelExecutorFactory, describeProviderReadiness } from '../src/agent-model-executor-factory.mjs';
import { ZERO_EFFECTS } from '../src/cloud-agent-relay.mjs';
import { resolveWorkers } from '../scripts/agent-mesh-tick.mjs';

const ENDPOINT = 'https://relay.example.com/api/agent-relay';
const TOKEN = 'placeholder-bearer-value-not-a-credential';

function memoryStore() {
  const rows = [];
  return {
    rows,
    async log(type, detail = {}) {
      const row = { id: `row_${rows.length + 1}`, type, detail, createdAt: new Date().toISOString() };
      rows.push(row);
      return row;
    },
    async list(collection, { filters = {}, limit = 2000 } = {}) {
      if (collection !== 'auditLog') return [];
      return rows
        .filter(row => (filters.type ? row.type === filters.type : true))
        .slice(0, limit);
    }
  };
}

async function seedActiveRun(store) {
  const session = compileAutonomySession({
    objective: 'prove the mesh entry point reaches the relay transport',
    allowedAgents: ['chatgpt', 'claude-code'],
    startAgent: 'chatgpt'
  });
  assert.equal(session.ok, true);
  const intent = compileTaskIntent({
    session,
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    objective: 'summarise the mesh wiring change',
    acceptanceTests: ['npm run check:syntax'],
    evidenceRefs: ['test:agent-mesh-entry-point']
  });
  assert.equal(intent.ok, true);
  const run = createAutonomyRun({ session, initialIntent: intent });
  const saved = await saveAutonomyRunSnapshot(store, run, { reason: 'seed' });
  assert.equal(saved.ok, true, JSON.stringify(saved.reasonCodes || []));
  return { session, intent, run };
}

test('the relay adapter factory produces the shape the autonomy pump requires', () => {
  const factory = createRelayAdapterFactory({
    env: { UBERBOND_RELAY_ENDPOINT: ENDPOINT, UBERBOND_RELAY_TOKEN: TOKEN },
    fetchImpl: async () => { throw new Error('not called'); }
  });
  const adapter = factory({ originAgent: 'chatgpt', targetAgent: 'claude-code' });
  assert.equal(typeof adapter.createTask, 'function');
  assert.equal(typeof adapter.readTask, 'function');
  assert.equal(typeof adapter.waitForResult, 'function');
});

test('the relay adapter factory memoizes per origin/target pair', () => {
  const factory = createRelayAdapterFactory({
    env: { UBERBOND_RELAY_ENDPOINT: ENDPOINT, UBERBOND_RELAY_TOKEN: TOKEN },
    fetchImpl: async () => { throw new Error('not called'); }
  });
  const a = factory({ originAgent: 'chatgpt', targetAgent: 'claude-code' });
  const b = factory({ originAgent: 'chatgpt', targetAgent: 'claude-code' });
  const c = factory({ originAgent: 'uberbond', targetAgent: 'claude-code' });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('an unconfigured relay throws attributably and never names the credential', () => {
  const noEndpoint = createRelayAdapterFactory({ env: { UBERBOND_RELAY_TOKEN: TOKEN } });
  assert.throws(() => noEndpoint({}), /UBERBOND_RELAY_ENDPOINT is absent/);

  const noToken = createRelayAdapterFactory({ env: { UBERBOND_RELAY_ENDPOINT: ENDPOINT } });
  let message = '';
  try { noToken({}); } catch (error) { message = String(error.message); }
  assert.match(message, /UBERBOND_RELAY_TOKEN is absent/);
  assert.equal(message.includes(TOKEN), false);
});

test('readiness descriptions report presence without ever reporting a value', () => {
  const relay = describeRelayReadiness({ env: { UBERBOND_RELAY_ENDPOINT: ENDPOINT, UBERBOND_RELAY_TOKEN: TOKEN } });
  assert.equal(relay.ready, true);
  assert.equal(relay.credentialPresent, true);
  assert.equal(JSON.stringify(relay).includes(TOKEN), false);
  assert.equal(JSON.stringify(relay).includes(ENDPOINT), false);

  const empty = describeRelayReadiness({ env: {} });
  assert.deepEqual(empty.blockers, ['relay-endpoint-absent', 'relay-credential-absent']);

  const providers = describeProviderReadiness({ env: {} });
  assert.deepEqual(providers.map(item => item.provider), ['openai', 'anthropic', 'claude-code-sandbox']);
  assert.equal(providers.every(item => item.ready === false), true);
});

test('a provider is only ready with a credential, pricing evidence, and an explicit enable', () => {
  const env = {
    OPENAI_API_KEY: 'placeholder-openai-key-value',
    OPENAI_INPUT_USD_PER_MILLION: '1.25',
    OPENAI_OUTPUT_USD_PER_MILLION: '10',
    OPENAI_PRICING_SOURCE: 'https://openai.com/api/pricing',
    OPENAI_PRICING_VERIFIED_AT: '2026-08-22',
    OPENAI_AGENT_ENABLED: 'true'
  };
  const [openai] = describeProviderReadiness({ env });
  assert.equal(openai.ready, true);

  const { OPENAI_PRICING_SOURCE, ...noSource } = env;
  assert.equal(describeProviderReadiness({ env: noSource })[0].ready, false);
  assert.equal(describeProviderReadiness({ env: noSource })[0].blockers.includes('pricing-evidence-absent'), true);
});

test('resolveWorkers refuses a worker by name rather than dropping it silently', () => {
  const factory = createModelExecutorFactory({ env: {} });
  const { resolved, blockers } = resolveWorkers(
    [{ workerId: 'w1', provider: 'openai' }, { workerId: 'w2', provider: 'pigeon' }],
    factory
  );
  assert.deepEqual(resolved, []);
  assert.equal(blockers.length, 2);
  assert.match(blockers[0], /^w1: /);
  assert.match(blockers[1], /^w2: .*unsupported provider/);
});

test('resolveWorkers attaches a callable executor when the provider is configured', () => {
  const factory = createModelExecutorFactory({
    env: {
      ANTHROPIC_API_KEY: 'placeholder-anthropic-key-value',
      ANTHROPIC_INPUT_USD_PER_MILLION: '3',
      ANTHROPIC_OUTPUT_USD_PER_MILLION: '15',
      ANTHROPIC_PRICING_SOURCE: 'https://anthropic.com/pricing',
      ANTHROPIC_PRICING_VERIFIED_AT: '2026-08-22'
    }
  });
  const { resolved, blockers } = resolveWorkers([{ workerId: 'w1', provider: 'anthropic' }], factory);
  assert.deepEqual(blockers, []);
  assert.equal(typeof resolved[0].modelExecutor, 'function');
});

test('the mesh cycle drives a seeded run through the real relay adapter', async () => {
  const store = memoryStore();
  const { intent } = await seedActiveRun(store);

  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), operation: body?.operation || null });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({
        ok: true,
        status: 'QUEUED',
        taskId: body?.input?.taskId,
        task: body?.input,
        issueNumber: 4242,
        externalEffectLedger: { ...ZERO_EFFECTS }
      })
    };
  };

  const cycle = await runAgentMeshCycle({
    enabled: true,
    store,
    adapterFactory: createRelayAdapterFactory({
      env: { UBERBOND_RELAY_ENDPOINT: ENDPOINT, UBERBOND_RELAY_TOKEN: TOKEN },
      fetchImpl
    }),
    compileRelayTask: compileRelayTaskFromIntent,
    workers: [],
    autonomyRunLimit: 3,
    ingestAfterWorkers: false,
    schedulerOccurrenceKey: 'entry-point-real-relay-occurrence-1'
  });

  assert.notEqual(cycle.status, 'BLOCKED', JSON.stringify(cycle.reasonCodes || []));
  assert.equal(cycle.ok, true);
  assert.equal(cycle.firstSweep.runsTicked, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, 'create');
  assert.equal(calls[0].url, ENDPOINT);
  assert.equal(cycle.businessEffectAuthority, 'NONE');

  const snapshots = await store.list('auditLog', { filters: { type: 'agent_autonomy_run_snapshot' } });
  const latest = snapshots.at(-1).detail.run;
  // The mesh cycle now rebinds the task to a deterministic AI employee role,
  // which mints a new `employee_task_*` id. The originating id must still be
  // recoverable from the snapshot, or a run cannot be traced back to the intent
  // that produced it.
  assert.match(latest.relayRef?.taskId, /^employee_task_/);
  assert.match(latest.relayRef?.relayTaskId, /^agent_task_/);
  assert.equal(latest.relayRef?.intentTaskId, intent.taskId);
  assert.equal(latest.relayRef?.issueNumber, 4242);
});

test('the mesh cycle still fails closed when a dependency is missing', async () => {
  const cycle = await runAgentMeshCycle({ enabled: true, store: memoryStore(), workers: [] });
  assert.equal(cycle.ok, false);
  assert.equal(cycle.status, 'BLOCKED');
  assert.deepEqual(cycle.reasonCodes, ['adapter-factory-required', 'relay-task-compiler-required']);
});

test('importing the tick entry point does not start a cycle', async () => {
  assert.equal(typeof resolveWorkers, 'function');
});

test('exactly one implementation of the spend transaction is reachable', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const roots = ['src', 'scripts', 'api'];
  const importers = [];
  for (const root of roots) {
    let names = [];
    try { names = await readdir(new URL(`../${root}/`, import.meta.url)); } catch { continue; }
    for (const name of names) {
      if (!name.endsWith('.mjs') || name === 'agent-provider-execution.mjs') continue;
      const source = await readFile(new URL(`../${root}/${name}`, import.meta.url), 'utf8');
      if (/from\s+'[^']*agent-provider-execution\.mjs'/.test(source)) importers.push(`${root}/${name}`);
    }
  }
  assert.deepEqual(importers, [],
    `agent-provider-execution is superseded; extend agent-worker-runtime instead. Wired from: ${importers.join(', ')}`);
});

test('a crash between dispatch and snapshot recovers instead of dispatching twice', async () => {
  const { createGithubRelayTask, TASK_LABEL } = await import('../src/github-relay.mjs');
  const { advanceAutonomyRun } = await import('../src/agent-autonomy-pump.mjs');

  const issues = new Map();
  let nextIssue = 1;
  const client = {
    async createIssue({ title, body, labels = [] }) {
      const number = nextIssue += 1;
      const issue = { number, title, body, state: 'open', labels: labels.map(name => ({ name })), html_url: `https://x/${number}` };
      issues.set(number, issue);
      return issue;
    },
    async listIssues({ labels = [] }) {
      return [...issues.values()].filter(issue =>
        issue.state === 'open' && labels.every(want => issue.labels.some(label => label.name === want)));
    }
  };
  const adapterFactory = () => ({
    createTask: (task, date) => createGithubRelayTask({ client, owner: 'o', repo: 'r', input: task, date })
  });

  const store = memoryStore();
  const { run } = await seedActiveRun(store);

  const first = await advanceAutonomyRun({ run, adapterFactory, compileRelayTask: compileRelayTaskFromIntent });
  assert.equal(first.transition, 'DISPATCHED');
  assert.equal(issues.size, 1);

  const afterCrash = await advanceAutonomyRun({ run, adapterFactory, compileRelayTask: compileRelayTaskFromIntent });

  assert.equal(afterCrash.ok, true);
  assert.equal(afterCrash.transition, 'DISPATCHED');
  assert.equal(issues.size, 1, 'the crashed dispatch must be recovered, not repeated');
  assert.equal(afterCrash.run.relayRef.issueNumber, first.run.relayRef.issueNumber);
  assert.equal(afterCrash.run.relayRef.taskId, first.run.relayRef.taskId);
  assert.equal([...issues.values()][0].labels.some(label => label.name === TASK_LABEL), true);
});
