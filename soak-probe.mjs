// Section 56: drive thousands of events through the durable spine and look for
// lost work, duplicate work, state resurrection, and unbounded growth.
import { compileScheduledAutonomyRun } from '/home/user/uberbondd/src/agent-autonomy-scheduled-run.mjs';
import { saveAutonomyRunSnapshot, loadLatestAutonomyRun, listLatestAutonomyRuns } from '/home/user/uberbondd/src/agent-autonomy-store.mjs';
import { advanceAutonomyRun } from '/home/user/uberbondd/src/agent-autonomy-pump.mjs';
import { beginAgentMeshCycleReceipt, finishAgentMeshCycleReceipt, listTerminalAgentMeshCycleReceipts } from '/home/user/uberbondd/src/agent-mesh-cycle-receipts.mjs';
import { ZERO_EFFECTS } from '/home/user/uberbondd/src/cloud-agent-relay.mjs';

function store() {
  const rows = new Map(); const order = [];
  return {
    rows, order,
    async get(k, id) { return structuredClone(rows.get(id) || null); },
    async add(k, item) { if (rows.has(item.id)) throw new Error('dup'); rows.set(item.id, structuredClone(item)); order.push(item.id); return structuredClone(item); },
    async log(type, detail) { const id = `a${order.length + 1}`; const row = { id, type, detail: structuredClone(detail), createdAt: detail.createdAt || new Date().toISOString() }; rows.set(id, row); order.push(id); return structuredClone(row); },
    async list(k, o = {}) { if (k === 'jobs') return []; let out = order.map(i => rows.get(i)).filter(Boolean); if (o.filters?.type) out = out.filter(r => r.type === o.filters.type); return structuredClone(out.slice(0, o.limit || out.length)); }
  };
}

const s = store();
const stats = { occurrences: 0, cycleReceipts: 0, duplicateStarts: 0, runsCreated: 0, transitions: {}, errors: [] };
const t0 = Date.now();
const heapStart = process.memoryUsage().heapUsed;

// --- 3000 scheduler occurrences, 20% of them redelivered ---
const OCCURRENCES = 3000;
for (let i = 0; i < OCCURRENCES; i += 1) {
  const key = `mission/soak#${String(i).padStart(6, '0')}`;
  const startedAt = new Date(Date.UTC(2026, 7, 1) + i * 60_000);
  const deliveries = i % 5 === 0 ? 3 : 1;
  for (let d = 0; d < deliveries; d += 1) {
    const begun = await beginAgentMeshCycleReceipt({ store: s, occurrenceKey: key, startedAt, sourceCommit: 'soak123', policyVersions: ['p1'] });
    if (begun.duplicate) { stats.duplicateStarts += 1; continue; }
    await finishAgentMeshCycleReceipt({ store: s, cycleId: begun.cycleId, finishedAt: new Date(startedAt.getTime() + 30_000), sourceCommit: 'soak123', policyVersions: ['p1'], status: 'ADVANCED' });
  }
  stats.occurrences += 1;
}
const terminal = await listTerminalAgentMeshCycleReceipts({ store: s, limit: 10000 });
stats.cycleReceipts = terminal.length;

// --- 400 autonomy runs driven to completion, restart-reloaded at every step ---
const RUNS = 400;
function res(action, outcome) {
  return {
    outcome, changedArtifacts: [], testsActuallyRun: [{ command: 'fixture', status: 'PASS' }],
    truthTable: [{ claim: outcome, status: 'VERIFIED_BY_FIXTURE' }],
    externalEffectLedger: { ...ZERO_EFFECTS }, decision: action === 'DONE' ? 'DONE' : 'CONTINUE',
    coordination: action === 'DONE' ? { action: 'DONE', summary: outcome, objective: outcome }
      : { action, objective: `${outcome}-next`, evidenceRefs: ['evidence:s'], acceptanceTests: ['a'], requiredOutputs: ['outcome'], constraints: [], tokenBudget: 50_000 },
    evidenceRefs: ['evidence:s']
  };
}
const SEQ = [res('ENGINEERING_REQUIRED', 'built'), res('REVIEW_REQUIRED', 'reviewed'), res('DONE', 'done')];
const runIds = [];
for (let i = 0; i < RUNS; i += 1) {
  const compiled = compileScheduledAutonomyRun({
    occurrenceKey: `run/soak#${i}`,
    session: { objective: `soak mission ${i}`, maxRounds: 10, maxTasks: 10 },
    initialIntent: { originAgent: 'uberbond', targetAgent: 'chatgpt', objective: `o${i}`, acceptanceTests: ['a'], evidenceRefs: ['evidence:s'], constraints: ['no-customer-contact'] }
  });
  if (!compiled.ok) { stats.errors.push(`compile ${i}: ${compiled.reasonCodes}`); continue; }
  runIds.push(compiled.run.runId);
  await saveAutonomyRunSnapshot(s, compiled.run, { reason: 'created' });
  stats.runsCreated += 1;
}
const compileRelayTask = intent => ({ ok: true, ...intent });
for (const runId of runIds) {
  for (let step = 0; step < 12; step += 1) {
    const loaded = await loadLatestAutonomyRun(s, runId);
    if (!loaded.ok || loaded.run.phase === 'TERMINAL') break;
    const pending = loaded.run.phase === 'AWAITING_RESULT';
    const result = pending ? SEQ[Math.min(loaded.run.session.roundsCompleted, SEQ.length - 1)] : null;
    const adapterFactory = async () => ({
      createTask: async task => ({ ok: true, issueNumber: 1, taskId: task.taskId }),
      readTask: async () => ({ ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result })
    });
    const out = await advanceAutonomyRun({ run: loaded.run, adapterFactory, compileRelayTask });
    stats.transitions[out.transition] = (stats.transitions[out.transition] || 0) + 1;
    await saveAutonomyRunSnapshot(s, out.run, { reason: 'soak' });
    if (out.transition === 'TERMINAL' || out.transition === 'FAILED') break;
  }
}

// --- invariants ---
const completed = [];
const notCompleted = [];
for (const runId of runIds) {
  const loaded = await loadLatestAutonomyRun(s, runId);
  (loaded.run?.status === 'COMPLETED' ? completed : notCompleted).push(runId);
}
const active = await listLatestAutonomyRuns(s, { statuses: ['ACTIVE', 'PENDING'], limit: 200 });
const heapEnd = process.memoryUsage().heapUsed;

console.log(JSON.stringify({
  elapsedMs: Date.now() - t0,
  occurrences: stats.occurrences,
  redeliveriesRefusedAsDuplicate: stats.duplicateStarts,
  distinctTerminalCycleReceipts: stats.cycleReceipts,
  cycleReceiptsEqualOccurrences: stats.cycleReceipts === stats.occurrences,
  runsCreated: stats.runsCreated,
  distinctRunIds: new Set(runIds).size,
  runsCompleted: completed.length,
  runsNotCompleted: notCompleted.length,
  stillActiveAfterCompletion: active.count,
  transitions: stats.transitions,
  durableRows: s.order.length,
  heapGrowthMB: Number(((heapEnd - heapStart) / 1048576).toFixed(1)),
  errors: stats.errors.slice(0, 5)
}, null, 2));
