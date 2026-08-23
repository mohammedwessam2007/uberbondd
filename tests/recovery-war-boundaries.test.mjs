// Wave 18, the boundaries with no prior crash coverage.
//
// The outbound and external-effect paths were already fought over:
// omnia-v9-external-effect-crash-recovery injects at five checkpoints,
// reservation-recovery covers the send reservation, canary-crash-recovery the
// null-sink, cognitive-loop-crash-restart the agent loop. What had never been
// killed and restarted was fulfillment, escalation, and the mission-seed leg of
// the scheduler.
//
// Every case classifies as one of: IDEMPOTENT_REPLAY, RESUME, FAIL_CLOSED,
// UNCERTAIN, SAFE_RETRY, QUARANTINE. None may classify as
// BLIND_REPEAT_IRREVERSIBLE_EFFECT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFulfillmentPlan, applyFulfillmentEvent } from '../src/service-fulfillment.mjs';
import {
  evaluateOperatorHealth, persistOperatorEscalations, readEscalationDeliveryState,
  resolveVanishedEscalations, ESCALATION_AUDIT_TYPE
} from '../src/operator-escalation.mjs';
import {
  dispatchOperatorPage, compileOperatorTransport, durableAuditTransport,
  TRANSPORT_KINDS, TRANSPORT_OUTCOMES, DELIVERY_PROOF, PAGE_AUDIT_TYPE
} from '../src/operator-escalation-transport.mjs';

const T0 = new Date('2026-08-23T00:00:00.000Z');
const at = days => new Date(T0.getTime() + days * 86400000).toISOString();

function fakeStore(seed = []) {
  const auditLog = [...seed];
  let n = auditLog.length;
  return {
    auditLog,
    async log(type, detail) {
      const row = { id: `e${++n}`, type, detail: structuredClone(detail), createdAt: detail.createdAt || new Date().toISOString() };
      auditLog.push(row);
      return row;
    },
    async list(key, options = {}) {
      let rows = [...auditLog];
      if (options.filters?.type) rows = rows.filter(row => row.type === options.filters.type);
      if (options.offset) rows = rows.slice(options.offset);
      if (Number.isInteger(options.limit)) rows = rows.slice(0, Math.max(0, options.limit));
      return rows;
    }
  };
}

// ---------------------------------------------------------------- fulfillment

function plan() {
  const result = compileFulfillmentPlan({
    serviceSkuId: 'sku1', customerRef: 'cust1',
    requirements: ['do the thing'], acceptanceCriteria: ['thing is done'],
    supportWindowDays: 30, renewalIntervalDays: 90, date: T0
  });
  assert.equal(result.ok, true);
  return result;
}

function step(state, event) {
  return applyFulfillmentEvent({ state, event, date: event.at });
}

const DELIVERY_SEQUENCE = [
  { eventId: 'e1', type: 'WORK_STARTED', at: at(0) },
  { eventId: 'e2', type: 'WORK_COMPLETE', at: at(1) },
  { eventId: 'e3', type: 'QA_RESULT', at: at(1), qaPassed: true, evidenceRef: 'qa:pass-1' },
  { eventId: 'e4', type: 'DELIVERY_RECORDED', at: at(1), artifactRefs: ['artifact:a'] },
  { eventId: 'e5', type: 'ACCEPTANCE_REQUESTED', at: at(1) },
  { eventId: 'e6', type: 'CUSTOMER_ACCEPTED', at: at(1), evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:ack-1' }
];

test('a crash at every fulfillment boundary replays idempotently on restart', () => {
  for (let crashAfter = 0; crashAfter < DELIVERY_SEQUENCE.length; crashAfter += 1) {
    let state = plan();
    for (let index = 0; index <= crashAfter; index += 1) {
      state = step(state, DELIVERY_SEQUENCE[index]).state;
    }
    // ...crash. Restart replays from the durable event log, including the event
    // that may or may not have been committed.
    const restarted = structuredClone(state);
    const replay = step(restarted, DELIVERY_SEQUENCE[crashAfter]);
    assert.equal(replay.ok, true, `replay at ${crashAfter}: ${JSON.stringify(replay.reasonCodes)}`);
    assert.equal(replay.result, 'DUPLICATE_IGNORED',
      `boundary ${crashAfter} (${DELIVERY_SEQUENCE[crashAfter].type}) re-applied instead of replaying`);
    assert.equal(replay.state.status, state.status, 'replay must not advance the machine');
  }
});

test('a crash before acceptance never leaves acceptance inferred', () => {
  let state = plan();
  for (const event of DELIVERY_SEQUENCE.slice(0, 5)) state = step(state, event).state;
  // Delivered, acceptance requested, then the process died.
  assert.equal(state.status, 'ACCEPTANCE_PENDING');
  assert.equal(state.economicTruth.acceptedDelivery, false,
    'delivered work, a QA pass and a delivery receipt are not a customer saying yes');
  assert.equal(state.acceptedAt, null);
});

test('a crash between acceptance and support end cannot skip the support window', () => {
  let state = plan();
  for (const event of DELIVERY_SEQUENCE) state = step(state, event).state;
  const restarted = structuredClone(state);
  const early = applyFulfillmentEvent({
    state: restarted, event: { eventId: 'end', type: 'SUPPORT_ENDED', at: at(2) }, date: at(2)
  });
  assert.equal(early.ok, false);
  assert.ok(early.reasonCodes.includes('support-window-not-ended'),
    'a restart is not elapsed time');
});

test('replaying an event id with different content after a crash is a collision, not a merge', () => {
  let state = plan();
  state = step(state, DELIVERY_SEQUENCE[0]).state;
  const contradictory = applyFulfillmentEvent({
    state, event: { eventId: 'e1', type: 'CANCELLED', at: at(0), reason: 'changed my mind' }, date: at(0)
  });
  assert.equal(contradictory.ok, false);
  assert.ok(contradictory.reasonCodes.includes('event-id-identity-collision'));
  assert.notEqual(contradictory.state.status, 'CANCELLED');
});

// ----------------------------------------------------------------- escalation

const SILENT = Object.freeze({
  scheduler: { enabled: true, lastTerminalAt: '2026-08-01T00:00:00.000Z', expectedIntervalMinutes: 60 },
  queue: { abandonedCycles: 0, openDeadLetters: 0, stalledRuns: 0 }
});

async function escalationTick(store, snapshot, transports) {
  const delivery = await readEscalationDeliveryState(store);
  const report = evaluateOperatorHealth({
    snapshot: { ...snapshot, paging: delivery.ok ? delivery.paging : undefined },
    activeFingerprints: delivery.ok ? delivery.activeFingerprints : [],
    activeEpisodes: delivery.ok ? delivery.activeEpisodes : null
  });
  await resolveVanishedEscalations(store, report, delivery);
  const persisted = await persistOperatorEscalations(store, report);
  const pages = [];
  for (const item of report.escalations) {
    if (item.status !== 'NEW_ESCALATION') continue;
    pages.push(await dispatchOperatorPage(store, { escalation: item, transports: transports || [durableAuditTransport(store)] }));
  }
  return { report, persisted, pages };
}

test('a crash after the escalation row but before the page retries the page, not the escalation', async () => {
  const store = fakeStore();
  const delivery = await readEscalationDeliveryState(store);
  const report = evaluateOperatorHealth({ snapshot: SILENT, activeFingerprints: [], activeEpisodes: null });
  await persistOperatorEscalations(store, report);
  // ...crash before dispatch. No page rows exist.
  assert.equal(store.auditLog.filter(row => row.type === PAGE_AUDIT_TYPE).length, 0);

  const restarted = fakeStore(structuredClone(store.auditLog));
  const after = await escalationTick(restarted, SILENT);

  const silentRows = rows => rows.filter(row =>
    row.type === ESCALATION_AUDIT_TYPE && row.detail.type === 'SCHEDULER_SILENT').length;
  assert.equal(silentRows(restarted.auditLog), silentRows(store.auditLog),
    'the escalation that was already written must not be written twice');
  assert.equal(after.report.escalations.find(item => item.type === 'SCHEDULER_SILENT').status,
    'SUPPRESSED_DUPLICATE');

  // OWNER_UNREACHABLE does appear on the restart, and correctly: the crash
  // meant nothing was ever dispatched, so there is now an escalation nobody
  // received. A different incident, not a duplicate of the first.
  assert.ok(after.report.escalations.some(item => item.type === 'OWNER_UNREACHABLE'),
    'a crash before dispatch leaves the owner uninformed, and that is its own condition');
});

test('a transport that may have delivered before crashing is UNKNOWN, never DELIVERED or FAILED', async () => {
  const store = fakeStore();
  const receipt = await dispatchOperatorPage(store, {
    escalation: { escalationId: 'op_1', fingerprint: 'fp1', severity: 'CRITICAL', type: 'SCHEDULER_SILENT' },
    transports: [compileOperatorTransport({
      id: 'push', kind: TRANSPORT_KINDS.HUMAN_DEVICE, ownerAuthorizationRef: 'owner-grant:test',
      deliver: async () => { throw new Error('connection reset after write'); }
    })]
  });
  assert.equal(receipt.attempts[0].outcome, TRANSPORT_OUTCOMES.DELIVERY_UNKNOWN);
  assert.equal(receipt.deliveryProof, DELIVERY_PROOF.DELIVERY_INDETERMINATE);
  assert.equal(receipt.ownerReached, false);
  // And the uncertainty is durable, so a restart does not resolve it by forgetting.
  const persisted = store.auditLog.find(row => row.type === PAGE_AUDIT_TYPE);
  assert.equal(persisted.detail.attempts[0].outcome, TRANSPORT_OUTCOMES.DELIVERY_UNKNOWN);
  assert.equal(persisted.detail.ownerReached, false);
});

test('repeated pages after repeated crashes do not spam: the episode stays one episode', async () => {
  let store = fakeStore();
  for (let restart = 0; restart < 20; restart += 1) {
    await escalationTick(store, SILENT);
    store = fakeStore(structuredClone(store.auditLog)); // process restart
  }
  const escalations = store.auditLog.filter(row =>
    row.type === ESCALATION_AUDIT_TYPE && row.detail.type === 'SCHEDULER_SILENT');
  assert.equal(escalations.length, 1,
    'twenty restarts during one outage is one outage');
});

test('an unreadable ledger during recovery fails closed rather than re-paging everything', async () => {
  const store = fakeStore();
  await escalationTick(store, SILENT);
  for (let index = 0; index < 600; index += 1) await store.log(ESCALATION_AUDIT_TYPE, { fingerprint: `filler${index}` });
  const stuck = {
    async log(...args) { return store.log(...args); },
    async list(key, options = {}) { return store.list(key, { ...options, offset: 0 }); }
  };
  const delivery = await readEscalationDeliveryState(stuck);
  assert.equal(delivery.ok, false);
  const resolved = await resolveVanishedEscalations(stuck, { ok: true, observedFingerprints: [] }, delivery);
  assert.deepEqual(resolved, [],
    'a ledger we cannot read is not evidence that every condition resolved');
});
