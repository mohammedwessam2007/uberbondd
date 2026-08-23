// The two independent hostile sweeps, kept as tests.
//
// Section 78 asks for two clean sweeps with no new P0/P1. Both came back clean.
// A sweep that ran once and was deleted proves nothing tomorrow, so the cases
// they probed live here -- particularly the ones that are easy to reintroduce:
// prototype-inherited ledger keys, a terminal decision in unexpected casing,
// an over-broad suppression match, and a durable readiness path accepting an
// asserted proof in place of receipts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalZeroEffectLedger, ZERO_EFFECTS } from '../src/cloud-agent-relay.mjs';
import { evaluateWorkerResultTruth } from '../src/agent-worker-result-truth.mjs';
import { canonicalContactRoute, evaluateContactRoute } from '../src/prospect-evidence-reconciliation.mjs';
import { decideProspectDisposition } from '../src/prospect-qualification.mjs';
import { containsSecretValue } from '../src/secret-patterns.mjs';
import { evaluateFounderAbsenceReadinessFromDurableHistory } from '../src/founder-absence-readiness.mjs';
import {
  beginAgentMeshCycleReceipt,
  finishAgentMeshCycleReceipt,
  reconcileAbandonedAgentMeshCycles
} from '../src/agent-mesh-cycle-receipts.mjs';

const NOW = new Date('2026-08-23T00:00:00.000Z');

function memoryStore() {
  const rows = new Map();
  const order = [];
  return {
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

function liveCapabilities() {
  const caps = {};
  for (const name of ['durableState', 'scheduler', 'agentRelay', 'agentWorkers', 'boundedBudgets',
    'staleRecovery', 'truthReceipts', 'killSwitch', 'paymentObservation', 'deliveryObservation',
    'ownerEscalationQueue']) {
    caps[name] = { status: 'VERIFIED_LIVE', evidenceRefs: [`receipt:${name}`], externallyVerified: true };
  }
  return caps;
}

test('a ledger whose keys are inherited is not a ledger', () => {
  const inherited = Object.create({ ...ZERO_EFFECTS });
  assert.ok(canonicalZeroEffectLedger(inherited).length > 0);
  assert.ok(canonicalZeroEffectLedger({ ...ZERO_EFFECTS, messages: new Number(0) }).length > 0);
});

test('a terminal decision in unexpected casing still faces the terminal rules', () => {
  const thin = {
    outcome: 'x', changedArtifacts: [], testsActuallyRun: [], truthTable: [],
    externalEffectLedger: { ...ZERO_EFFECTS }, decision: 'done'
  };
  const truth = evaluateWorkerResultTruth({ result: thin });
  assert.equal(truth.ok, false);
  assert.equal(truth.terminal, true);
  assert.ok(truth.reasonCodes.includes('terminal-result-truth-table-required'));
});

test('a junk truth-table row is not evidence', () => {
  const base = {
    outcome: 'x', changedArtifacts: [], testsActuallyRun: [],
    externalEffectLedger: { ...ZERO_EFFECTS }, decision: 'DONE'
  };
  assert.equal(evaluateWorkerResultTruth({ result: { ...base, truthTable: [null] } }).ok, false);
  assert.equal(evaluateWorkerResultTruth({ result: { ...base, truthTable: [{ claim: '  ', status: 'v' }] } }).ok, false);
  assert.equal(evaluateWorkerResultTruth({ result: { ...base, truthTable: { claim: 'x' } } }).ok, false);
});

test('suppression canonicalisation does not over-block or crash on odd addresses', () => {
  assert.equal(typeof canonicalContactRoute('@example.com'), 'string');
  assert.equal(canonicalContactRoute('a@b@example.com'), 'a@b@example.com');
  // A suppression entry that is only a tag must not suppress an unrelated
  // mailbox on the same domain.
  const unrelated = evaluateContactRoute({
    route: 'other@example.com',
    verifications: [{ route: 'other@example.com', state: 'VALID', checkedAt: '2026-08-21T00:00:00Z' }],
    suppressions: [{ value: '+tag@example.com' }],
    now: NOW
  });
  assert.equal(unrelated.status, 'VERIFIED_ROUTE');
});

test('an out-of-range model score is clamped and still cannot qualify a prospect', () => {
  const decision = decideProspectDisposition({
    bundle: { prospectId: 'p', routes: [], summary: { conflicts: [] } },
    observations: {},
    assessment: { dimensions: { icpFit: 99_999 }, confidence: 5 },
    date: NOW
  });
  assert.notEqual(decision.disposition, 'ELIGIBLE_FOR_EXPERIMENT');
  assert.equal(decision.outboundAuthority, 'NONE');
  assert.ok(decision.advisory.confidence <= 1);
  assert.ok(decision.dimensions.icpFit.value <= 0.5);
});

test('the secret scanner catches real credentials without flagging ordinary ids', () => {
  for (const benign of ['e2e-task-1787174626471', 'sk-1', 'task_ghp_x', 'https://example.com/path', 'postgres://localhost/db']) {
    assert.equal(containsSecretValue(benign), false, `false positive on ${benign}`);
  }
  for (const real of ['ghs_abcdefghijklmnopqrstuvwxyz123456', 'xoxb-1234567890-abcdefghij', 'postgres://user:pass@host/db']) {
    assert.equal(containsSecretValue(real), true, `missed ${real.slice(0, 16)}`);
  }
});

test('the durable readiness path will not accept an asserted proof over receipts', async () => {
  const store = memoryStore();
  const end = new Date(NOW.getTime() - 60_000);
  const readiness = await evaluateFounderAbsenceReadinessFromDurableHistory({
    store,
    capabilities: liveCapabilities(),
    targetDays: 7,
    now: NOW,
    currentSourceCommit: 'c',
    currentPolicyVersions: [],
    // A perfect proof, handed in by the caller, against an empty receipt store.
    observationProof: {
      observedFrom: new Date(end.getTime() - 7 * 24 * 3600 * 1000).toISOString(),
      observedThrough: end.toISOString(), freshnessAt: end.toISOString(),
      successfulTicks: 1_000_000_000, failedTicks: 0, recoveredTicks: 0,
      unauthorizedEffects: 0, openDeadLetters: 0, abandonedCycles: 0,
      sourceCommit: 'c', policyVersions: []
    }
  });
  assert.notEqual(readiness.status, 'KILIMANJARO_READY');
  assert.equal(readiness.durableHistory.qualifyingTerminalReceiptCount, 0);
});

test('a future-dated receipt cannot manufacture an observation window', async () => {
  const store = memoryStore();
  const future = new Date(NOW.getTime() + 30 * 24 * 3600 * 1000);
  const begun = await beginAgentMeshCycleReceipt({
    store, occurrenceKey: 'future', startedAt: future, sourceCommit: 'c', policyVersions: ['p']
  });
  await finishAgentMeshCycleReceipt({
    store, cycleId: begun.cycleId, finishedAt: new Date(future.getTime() + 1000),
    sourceCommit: 'c', policyVersions: ['p'], status: 'ADVANCED'
  });
  const readiness = await evaluateFounderAbsenceReadinessFromDurableHistory({
    store, capabilities: liveCapabilities(), targetDays: 7, now: NOW,
    currentSourceCommit: 'c', currentPolicyVersions: ['p']
  });
  assert.notEqual(readiness.status, 'KILIMANJARO_READY');
});

test('reconciliation does not terminalize a cycle that is still running', async () => {
  const store = memoryStore();
  await beginAgentMeshCycleReceipt({
    store, occurrenceKey: 'running', startedAt: new Date(NOW.getTime() - 60_000),
    sourceCommit: 'c', policyVersions: ['p']
  });
  const reconciliation = await reconcileAbandonedAgentMeshCycles({ store, now: NOW, abandonedAfterMs: 3600_000 });
  assert.equal(reconciliation.abandonedFound, 0);
});

test('a flawless prospect still carries no authority and no effects', () => {
  const perfect = Object.fromEntries(
    ['icpFit', 'buyerRoleFit', 'painEvidence', 'signalStrength', 'offerFit', 'timing', 'buyerAuthority', 'companyEconomics']
      .map(name => [name, { value: 1, evidenceClass: 'DIRECT_PUBLIC' }]));
  const decision = decideProspectDisposition({
    bundle: { prospectId: 'p', routes: [{ status: 'VERIFIED_ROUTE', usableForHandoff: true }], summary: { conflicts: [] } },
    observations: perfect,
    date: NOW
  });
  assert.equal(decision.disposition, 'ELIGIBLE_FOR_EXPERIMENT');
  assert.equal(decision.outboundAuthority, 'NONE');
  assert.equal(decision.businessEffectAuthority, 'NONE');
  for (const value of Object.values(decision.externalEffectLedger)) assert.equal(value, 0);
});
