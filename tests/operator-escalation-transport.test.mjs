// Deciding to page someone and actually reaching them are different problems.
//
// The kernel solved the first and reported the second as the literal
// `transport: 'UNCONFIGURED'`, with no transport concept behind it: nothing
// could be configured, nothing attempted, and a delivery that failed was
// indistinguishable from one never tried.
//
// Two defects found by probing the real modules the way scripts/agent-mesh-tick
// calls them:
//
//   1. evaluateOperatorHealth has always accepted `activeFingerprints` to
//      suppress what it already raised. Nothing ever passed it. Ten ticks
//      against one unchanging condition wrote thirty durable rows for three
//      real problems -- at an hourly cadence, seventy-two duplicate pages a day
//      about one fact. An alerting channel that repeats itself is one an
//      operator stops reading.
//
//   2. Nothing escalated the inability to escalate. A monitoring system that
//      detects a critical condition and cannot tell anyone has two problems,
//      and the second is worse.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateOperatorHealth,
  persistOperatorEscalations,
  readEscalationDeliveryState
} from '../src/operator-escalation.mjs';
import {
  dispatchOperatorPage,
  durableAuditTransport,
  compileOperatorTransport,
  TRANSPORT_OUTCOMES,
  TRANSPORT_KINDS,
  DELIVERY_PROOF
} from '../src/operator-escalation-transport.mjs';

function fakeStore() {
  const auditLog = [];
  let n = 0;
  return {
    auditLog,
    async log(type, detail) {
      const row = { id: `e${++n}`, type, detail: structuredClone(detail), createdAt: new Date().toISOString() };
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

const STANDING_TROUBLE = Object.freeze({
  scheduler: { enabled: true, lastTerminalAt: '2026-08-01T00:00:00.000Z', expectedIntervalMinutes: 60 },
  queue: { abandonedCycles: 4, openDeadLetters: 3, stalledRuns: 2 }
});

async function tick(store, snapshot = STANDING_TROUBLE) {
  const delivery = await readEscalationDeliveryState(store);
  const report = evaluateOperatorHealth({
    snapshot: { ...snapshot, paging: delivery.ok ? delivery.paging : undefined },
    activeFingerprints: delivery.ok ? delivery.activeFingerprints : []
  });
  await persistOperatorEscalations(store, report);
  for (const item of report.escalations) {
    if (item.status !== 'NEW_ESCALATION') continue;
    await dispatchOperatorPage(store, { escalation: item, transports: [durableAuditTransport(store)] });
  }
  return report;
}

test('an unchanging condition is escalated once, not once per cycle', async () => {
  const store = fakeStore();
  for (let cycle = 0; cycle < 10; cycle += 1) await tick(store);

  const rows = store.auditLog.filter(row => row.type === 'operator_escalation');
  const fingerprints = new Set(rows.map(row => row.detail.fingerprint));
  assert.equal(rows.length, fingerprints.size,
    `${rows.length} durable escalation rows for ${fingerprints.size} real conditions: the suppression is not being fed`);
});

test('being unable to reach the owner is itself escalated', async () => {
  const store = fakeStore();
  for (let cycle = 0; cycle < 3; cycle += 1) await tick(store);

  const rows = store.auditLog.filter(row => row.type === 'operator_escalation');
  const unreachable = rows.find(row => row.detail.type === 'OWNER_UNREACHABLE');
  assert.ok(unreachable, 'nothing escalated the fact that no escalation reached anyone');
  assert.equal(unreachable.detail.severity, 'CRITICAL');
  assert.ok(unreachable.detail.reasonCodes.includes('no-human-reachable-transport-configured'));
});

test('OWNER_UNREACHABLE keeps one identity while its measurement moves', async () => {
  const store = fakeStore();
  for (let cycle = 0; cycle < 8; cycle += 1) await tick(store);

  const unreachable = store.auditLog
    .filter(row => row.type === 'operator_escalation' && row.detail.type === 'OWNER_UNREACHABLE');
  assert.equal(unreachable.length, 1,
    'the incident about being unable to send escalations must not re-fire as the backlog it reports grows');
  assert.ok(unreachable[0].detail.detail.undeliveredEscalations >= 1,
    'the measurement is still recorded, in detail, where it does not affect identity');
});

test('the durable-audit transport delivers, and does not claim to reach a person', async () => {
  const store = fakeStore();
  const receipt = await dispatchOperatorPage(store, {
    escalation: { escalationId: 'operator_x', fingerprint: 'fp1', severity: 'CRITICAL', type: 'SCHEDULER_SILENT', recommendedAction: 'look' },
    transports: [durableAuditTransport(store)]
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.attempts.length, 1);
  assert.equal(receipt.attempts[0].outcome, TRANSPORT_OUTCOMES.DELIVERED);
  assert.equal(receipt.attempts[0].reachesHuman, false);
  assert.equal(receipt.deliveryProof, DELIVERY_PROOF.DURABLE_RECORD_ONLY);
  assert.equal(receipt.ownerReached, false,
    'writing to our own audit log is not telling anybody');
});

test('a human-device transport without owner authorization is refused, not registered', () => {
  const refused = compileOperatorTransport({ id: 'sms', kind: TRANSPORT_KINDS.HUMAN_DEVICE, deliver: async () => ({ delivered: true }) });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.reasonCodes, ['human-device-transport-requires-owner-authorization']);

  const authorized = compileOperatorTransport({
    id: 'sms', kind: TRANSPORT_KINDS.HUMAN_DEVICE,
    ownerAuthorizationRef: 'owner-grant:2026-08-23', deliver: async () => ({ delivered: true })
  });
  assert.equal(authorized.ok, true);
  assert.equal(authorized.transport.reachesHuman, true);
});

test('a transport that throws is unknown, never failed', async () => {
  const store = fakeStore();
  const receipt = await dispatchOperatorPage(store, {
    escalation: { escalationId: 'operator_y', fingerprint: 'fp2', severity: 'CRITICAL', type: 'X' },
    transports: [compileOperatorTransport({
      id: 'flaky', kind: TRANSPORT_KINDS.HUMAN_DEVICE, ownerAuthorizationRef: 'owner-grant:test',
      deliver: async () => { throw new Error('socket closed after send'); }
    })]
  });
  const attempt = receipt.attempts[0];
  assert.equal(attempt.outcome, TRANSPORT_OUTCOMES.DELIVERY_UNKNOWN,
    'a throw after the bytes left is not proof the page was not delivered');
  assert.equal(receipt.deliveryProof, DELIVERY_PROOF.DELIVERY_INDETERMINATE);
  assert.equal(receipt.ownerReached, false, 'indeterminate is not reached');
});

test('an indeterminate human transport outranks a successful durable record', async () => {
  const store = fakeStore();
  const receipt = await dispatchOperatorPage(store, {
    escalation: { escalationId: 'operator_z', fingerprint: 'fp3', severity: 'CRITICAL', type: 'X' },
    transports: [
      durableAuditTransport(store),
      compileOperatorTransport({
        id: 'push', kind: TRANSPORT_KINDS.HUMAN_DEVICE, ownerAuthorizationRef: 'owner-grant:test',
        deliver: async () => ({ indeterminate: true })
      })
    ]
  });
  assert.equal(receipt.deliveryProof, DELIVERY_PROOF.DELIVERY_INDETERMINATE,
    'reporting DURABLE_RECORD_ONLY would assert the page was not delivered, which is not known');
});

test('every transport is attempted, so a broken one stays visible behind a working one', async () => {
  const store = fakeStore();
  let secondCalled = false;
  const receipt = await dispatchOperatorPage(store, {
    escalation: { escalationId: 'operator_w', fingerprint: 'fp4', severity: 'CRITICAL', type: 'X' },
    transports: [
      compileOperatorTransport({ id: 'ok', kind: TRANSPORT_KINDS.HUMAN_DEVICE, ownerAuthorizationRef: 'g', deliver: async () => ({ delivered: true, deliveryRef: 'ref-1' }) }),
      compileOperatorTransport({ id: 'broken', kind: TRANSPORT_KINDS.OPERATOR_SINK, deliver: async () => { secondCalled = true; return { delivered: false, reasonCodes: ['disk-full'] }; } })
    ]
  });
  assert.equal(secondCalled, true, 'stopping at the first success discards evidence the others are broken');
  assert.equal(receipt.deliveryProof, DELIVERY_PROOF.HUMAN_DELIVERY_PROVEN);
  assert.equal(receipt.ownerReached, true);
  assert.equal(receipt.attempts[1].outcome, TRANSPORT_OUTCOMES.DELIVERY_FAILED);
});

test('a proven human delivery clears the undelivered backlog it was raised for', async () => {
  const store = fakeStore();
  const report = await tick(store);
  const first = report.escalations[0];
  await dispatchOperatorPage(store, {
    escalation: first,
    transports: [compileOperatorTransport({
      id: 'push', kind: TRANSPORT_KINDS.HUMAN_DEVICE, ownerAuthorizationRef: 'owner-grant:test',
      deliver: async () => ({ delivered: true, deliveryRef: 'push:1' })
    })]
  });

  const delivery = await readEscalationDeliveryState(store);
  assert.equal(delivery.ok, true);
  assert.equal(delivery.paging.deliveryProof, DELIVERY_PROOF.HUMAN_DELIVERY_PROVEN);
  assert.ok(!delivery.paging.evidenceRefs.some(ref => ref.includes(first.fingerprint.slice(0, 24))),
    'an escalation that reached a person must leave the undelivered list');
});

test('delivery state refuses rather than guesses when the history cannot be read', async () => {
  const store = fakeStore();
  for (let index = 0; index < 600; index += 1) await store.log('operator_escalation', { fingerprint: `fp${index}` });
  const stuck = {
    async log(...args) { return store.log(...args); },
    async list(key, options = {}) { return store.list(key, { ...options, offset: 0 }); }
  };
  const delivery = await readEscalationDeliveryState(stuck);
  assert.equal(delivery.ok, false);
  assert.ok(delivery.reasonCodes.includes('audit-scan-pagination-stalled'));
  assert.deepEqual(delivery.activeFingerprints, [],
    'a partial fingerprint list would silently re-raise everything it could not see');
});
