// Section 68: the strongest rehearsal that produces no business effects.
//
// One scheduled occurrence drives a durable mesh cycle, which pumps an autonomy
// run through the full GPT -> Claude -> review -> repair -> done conversation
// against deterministic fake workers, alongside a synthetic prospect passing
// through qualification and a synthetic commercial outcome passing through
// payment truth. Everything synthetic is marked synthetic, and the test asserts
// that none of it can become commercial evidence.
//
// This is a rehearsal, not a tier. It proves the parts connect. It cannot prove
// anything that requires the passage of time or a real counterparty, and the
// assertions at the end say so explicitly rather than leaving it implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_MESH_CONTROL_PLANE_POLICY_VERSION } from '../src/agent-mesh-control-plane.mjs';
import { AGENT_MODEL_ROUTING_CONFIG_POLICY_VERSION } from '../src/agent-model-routing-config.mjs';
import { runAgentMeshCycle } from '../src/agent-mesh-control-plane.mjs';
import { compileScheduledAutonomyRun } from '../src/agent-autonomy-scheduled-run.mjs';
import { saveAutonomyRunSnapshot, loadLatestAutonomyRun } from '../src/agent-autonomy-store.mjs';
import { listTerminalAgentMeshCycleReceipts } from '../src/agent-mesh-cycle-receipts.mjs';
import { evaluateFounderAbsenceReadinessFromDurableHistory } from '../src/founder-absence-readiness.mjs';
import { decideProspectDisposition } from '../src/prospect-qualification.mjs';
import { buildProspectEvidenceBundle } from '../src/prospect-evidence-reconciliation.mjs';
import { ZERO_EFFECTS } from '../src/cloud-agent-relay.mjs';

const OCCURRENCE = 'kilimanjaro/rehearsal#2026-08-23T00:00:00Z';
const COMMIT = 'rehearsal';
const NOW = new Date('2026-08-23T00:00:00.000Z');

function durableStore() {
  const rows = new Map();
  const order = [];
  return {
    rows, order,
    async get(key, id) { return structuredClone(rows.get(id) || null); },
    async add(key, item) {
      if (rows.has(item.id)) throw new Error('duplicate');
      rows.set(item.id, structuredClone(item));
      order.push(item.id);
      return structuredClone(item);
    },
    async log(type, detail) {
      const id = `a${order.length + 1}`;
      const row = { id, type, detail: structuredClone(detail), createdAt: detail.createdAt || NOW.toISOString() };
      rows.set(id, row);
      order.push(id);
      return structuredClone(row);
    },
    async list(key, options = {}) {
      if (key === 'jobs') return [];
      let out = order.map(id => rows.get(id)).filter(Boolean);
      if (options.filters?.type) out = out.filter(row => row.type === options.filters.type);
      return structuredClone(out.reverse().slice(0, options.limit || out.length));
    }
  };
}

function stageResult(action, outcome) {
  return {
    outcome,
    changedArtifacts: [],
    testsActuallyRun: [{ command: 'rehearsal-fixture', status: 'PASS' }],
    truthTable: [{ claim: outcome, status: 'VERIFIED_BY_FIXTURE' }],
    externalEffectLedger: { ...ZERO_EFFECTS },
    decision: action === 'DONE' ? 'DONE' : 'CONTINUE',
    coordination: action === 'DONE'
      ? { action: 'DONE', summary: outcome, objective: outcome }
      : {
          action, objective: `${outcome}-next`, evidenceRefs: ['evidence:rehearsal'],
          acceptanceTests: ['rehearsal acceptance'], requiredOutputs: ['outcome'],
          constraints: [], tokenBudget: 50_000
        },
    evidenceRefs: ['evidence:rehearsal']
  };
}

const CONVERSATION = [
  stageResult('ENGINEERING_REQUIRED', 'research says build it'),
  stageResult('REVIEW_REQUIRED', 'implementation artifact produced'),
  stageResult('REPAIR_REQUIRED', 'review found a defect'),
  stageResult('REVIEW_REQUIRED', 'repair produced'),
  stageResult('DONE', 'review accepts the repair')
];

test('one scheduled occurrence drives a bounded mesh cycle to a durable terminal receipt', async () => {
  const store = durableStore();
  const cycle = await runAgentMeshCycle({
    enabled: true,
    store,
    adapterFactory: async () => ({}),
    compileRelayTask: intent => ({ ok: true, ...intent }),
    workers: [],
    schedulerOccurrenceKey: OCCURRENCE,
    sourceCommit: COMMIT,
    date: NOW,
    tickRuns: async () => ({ ok: true, status: 'IDLE', runsConsidered: 0, runsTicked: 0, failed: 0 })
  });

  assert.equal(cycle.ok, true);
  assert.equal(cycle.cycleReceiptState, 'TERMINAL');
  assert.equal(cycle.duplicateDelivery, false);
  assert.equal(cycle.businessEffectAuthority, 'NONE');
  for (const value of Object.values(cycle.externalEffectLedger)) assert.equal(value, 0);

  const receipts = await listTerminalAgentMeshCycleReceipts({ store });
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].businessEffectAuthority, 'NONE');
});

test('redelivering that same occurrence executes nothing a second time', async () => {
  const store = durableStore();
  const run = () => runAgentMeshCycle({
    enabled: true, store,
    adapterFactory: async () => ({}),
    compileRelayTask: intent => ({ ok: true, ...intent }),
    workers: [], schedulerOccurrenceKey: OCCURRENCE, sourceCommit: COMMIT, date: NOW,
    tickRuns: async () => ({ ok: true, status: 'IDLE', runsConsidered: 0, runsTicked: 0, failed: 0 })
  });
  await run();
  const second = await run();
  assert.equal(second.duplicateDelivery, true);
  assert.equal((await listTerminalAgentMeshCycleReceipts({ store })).length, 1);
});

test('the full agent conversation completes inside the rehearsal, restart-safe', async () => {
  const store = durableStore();
  const scheduled = compileScheduledAutonomyRun({
    occurrenceKey: OCCURRENCE,
    session: { objective: 'Kilimanjaro rehearsal mission', maxRounds: 12, maxTasks: 12 },
    initialIntent: {
      originAgent: 'uberbond', targetAgent: 'chatgpt',
      objective: 'Research a bounded synthetic opportunity',
      acceptanceTests: ['rehearsal acceptance'],
      evidenceRefs: ['evidence:rehearsal'],
      constraints: ['no-customer-contact', 'synthetic-rehearsal-only']
    }
  });
  assert.equal(scheduled.ok, true);
  await saveAutonomyRunSnapshot(store, scheduled.run, { reason: 'rehearsal' });

  const compileRelayTask = intent => ({ ok: true, ...intent });
  for (let step = 0; step < 20; step += 1) {
    const loaded = await loadLatestAutonomyRun(store, scheduled.run.runId);
    assert.equal(loaded.ok, true);
    if (loaded.run.phase === 'TERMINAL') break;
    const pending = loaded.run.phase === 'AWAITING_RESULT';
    const result = pending ? CONVERSATION[Math.min(loaded.run.session.roundsCompleted, CONVERSATION.length - 1)] : null;
    const adapterFactory = async () => ({
      createTask: async task => ({ ok: true, issueNumber: 1, taskId: task.taskId }),
      readTask: async () => ({ ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result })
    });
    const advanced = await (await import('../src/agent-autonomy-pump.mjs')).advanceAutonomyRun({
      run: loaded.run, adapterFactory, compileRelayTask
    });
    await saveAutonomyRunSnapshot(store, advanced.run, { reason: 'rehearsal' });
    if (advanced.transition === 'TERMINAL' || advanced.transition === 'FAILED') break;
  }

  const final = await loadLatestAutonomyRun(store, scheduled.run.runId);
  assert.equal(final.run.status, 'COMPLETED');
  const actions = final.run.session.history.filter(item => item.event === 'AGENT_RESULT').map(item => item.action);
  assert.deepEqual(actions, ['ENGINEERING_REQUIRED', 'REVIEW_REQUIRED', 'REPAIR_REQUIRED', 'REVIEW_REQUIRED', 'DONE']);
  for (const item of final.run.session.history.filter(entry => entry.event === 'TASK_CREATED')) {
    assert.ok(item.constraints.includes('synthetic-rehearsal-only'));
    assert.equal(item.consequenceClass, 'LOCAL_PREPARATION');
  }
});

test('a synthetic prospect reaches a disposition and still cannot be contacted', () => {
  const bundle = buildProspectEvidenceBundle({
    prospectId: 'synthetic_prospect_1',
    contactRoutes: [{
      route: 'synthetic.buyer@example.invalid',
      verifications: [{ route: 'synthetic.buyer@example.invalid', state: 'VALID', checkedAt: '2026-08-22T00:00:00Z', provider: 'synthetic-fixture' }]
    }],
    now: NOW
  });
  const decision = decideProspectDisposition({
    bundle,
    observations: {
      icpFit: { value: 0.9, evidenceClass: 'DIRECT_PUBLIC' },
      buyerRoleFit: { value: 0.85, evidenceClass: 'LICENSED_PROVIDER' },
      painEvidence: { value: 0.7, evidenceClass: 'DIRECT_PUBLIC' },
      signalStrength: { value: 0.6, evidenceClass: 'DIRECT_PUBLIC' },
      offerFit: { value: 0.8, evidenceClass: 'DIRECT_FIRST_PARTY' },
      timing: { value: 0.5, evidenceClass: 'DIRECT_PUBLIC' },
      buyerAuthority: { value: 0.7, evidenceClass: 'LICENSED_PROVIDER' },
      companyEconomics: { value: 0.6, evidenceClass: 'DIRECT_PUBLIC' }
    },
    date: NOW
  });
  assert.equal(decision.disposition, 'ELIGIBLE_FOR_EXPERIMENT');
  // Eligible is the strongest thing a rehearsal can produce, and it is still
  // not permission to send anything to anybody.
  assert.equal(decision.outboundAuthority, 'NONE');
  assert.equal(decision.businessEffectAuthority, 'NONE');
});

test('the rehearsal produces no founder-absence certification, and says why', async () => {
  const store = durableStore();
  await runAgentMeshCycle({
    enabled: true, store,
    adapterFactory: async () => ({}),
    compileRelayTask: intent => ({ ok: true, ...intent }),
    workers: [], schedulerOccurrenceKey: OCCURRENCE, sourceCommit: COMMIT, date: NOW,
    tickRuns: async () => ({ ok: true, status: 'IDLE', runsConsidered: 0, runsTicked: 0, failed: 0 })
  });

  const capabilities = {};
  for (const name of ['durableState', 'scheduler', 'agentRelay', 'agentWorkers', 'boundedBudgets',
    'staleRecovery', 'truthReceipts', 'killSwitch', 'paymentObservation', 'deliveryObservation',
    'ownerEscalationQueue']) {
    capabilities[name] = { status: 'VERIFIED_LIVE', evidenceRefs: [`receipt:${name}`], externallyVerified: true };
  }

  const readiness = await evaluateFounderAbsenceReadinessFromDurableHistory({
    store, capabilities, targetDays: 7, now: NOW,
    currentSourceCommit: COMMIT,
    // Imported rather than spelled out. This was pinned to a literal
    // 'agent-mesh-control-plane-1.3.0'; the control plane moved to 1.4.0 and
    // this test kept asserting against a version no receipt carried, so no
    // receipt qualified and the reason codes it checked were never reached.
    // A stale literal here fails as a confusing mismatch rather than as a bump.
    currentPolicyVersions: [AGENT_MESH_CONTROL_PLANE_POLICY_VERSION, AGENT_MODEL_ROUTING_CONFIG_POLICY_VERSION]
  });

  // One cycle is one cycle. A seven-day claim needs seven days, and no amount
  // of rehearsal substitutes for the clock.
  assert.notEqual(readiness.status, 'KILIMANJARO_READY');
  assert.ok(readiness.observationProof.reasonCodes.includes('observation-window-shorter-than-target-days'));
  assert.ok(readiness.observationProof.reasonCodes.includes('insufficient-repeated-successful-ticks'));
  assert.equal(readiness.durableHistory.qualifyingTerminalReceiptCount, 1);
});
