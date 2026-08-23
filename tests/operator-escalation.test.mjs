import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OPERATOR_ESCALATION_EXTERNAL_EFFECTS,
  evaluateOperatorHealth,
  persistOperatorEscalations
} from '../src/operator-escalation.mjs';
import { DELIVERY_PROOF } from '../src/operator-escalation-transport.mjs';

const NOW = new Date('2026-08-23T02:00:00.000Z');

function healthySnapshot() {
  return {
    scheduler: {
      enabled: true,
      expectedIntervalMinutes: 60,
      lastTerminalAt: '2026-08-23T01:30:00.000Z',
      evidenceRefs: ['receipt:cycle-1']
    },
    queue: {
      openDeadLetters: 0,
      abandonedCycles: 0,
      stalledRuns: 0,
      strandedRuns: 0,
      exhaustedRuns: 0,
      evidenceRefs: []
    },
    truth: {
      unknownEffectKeys: 0,
      nonZeroUnauthorizedEffects: 0,
      secretScanFailures: 0,
      evidenceRefs: []
    },
    commercial: {
      reviewRequiredPayments: 0,
      uncertainSends: 0,
      complaintEvents: 0,
      evidenceRefs: []
    }
  };
}

test('healthy runtime produces no founder page', () => {
  const result = evaluateOperatorHealth({ snapshot: healthySnapshot(), date: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.health, 'HEALTHY');
  assert.equal(result.newEscalationCount, 0);
  assert.equal(result.paging.decision, 'NO_NEW_PAGE_REQUIRED');
  assert.deepEqual(result.ownerActionQueue, []);
});

test('disabled scheduler does not create a false outage', () => {
  const snapshot = healthySnapshot();
  snapshot.scheduler.enabled = false;
  snapshot.scheduler.lastTerminalAt = null;
  const result = evaluateOperatorHealth({ snapshot, date: NOW });
  assert.equal(result.health, 'HEALTHY');
});

test('enabled scheduler with no terminal receipt pages critically', () => {
  const snapshot = healthySnapshot();
  snapshot.scheduler.lastTerminalAt = null;
  const result = evaluateOperatorHealth({ snapshot, date: NOW });
  assert.equal(result.health, 'CRITICAL');
  assert.equal(result.escalations[0].type, 'SCHEDULER_NO_TERMINAL_RECEIPT');
  assert.equal(result.escalations[0].severity, 'CRITICAL');
  assert.equal(result.paging.decision, 'PAGE_OWNER_REQUIRED');
});

test('three missed scheduler intervals becomes a critical silent-scheduler incident', () => {
  const snapshot = healthySnapshot();
  snapshot.scheduler.lastTerminalAt = '2026-08-22T22:00:00.000Z';
  const result = evaluateOperatorHealth({ snapshot, date: NOW });
  assert.equal(result.escalations[0].type, 'SCHEDULER_SILENT');
  assert.equal(result.escalations[0].detail.ageMinutes, 240);
  assert.equal(result.escalations[0].detail.overdueThresholdMinutes, 180);
});

test('future-dated scheduler receipt fails loudly instead of manufacturing health', () => {
  const snapshot = healthySnapshot();
  snapshot.scheduler.lastTerminalAt = '2026-08-24T00:00:00.000Z';
  const result = evaluateOperatorHealth({ snapshot, date: NOW });
  assert.equal(result.health, 'CRITICAL');
  assert.equal(result.escalations[0].type, 'SCHEDULER_FUTURE_RECEIPT');
});

test('dead letters and abandoned cycles are independently visible', () => {
  const snapshot = healthySnapshot();
  snapshot.queue.openDeadLetters = 2;
  snapshot.queue.abandonedCycles = 1;
  const result = evaluateOperatorHealth({ snapshot, date: NOW });
  const types = result.escalations.map(item => item.type);
  assert.ok(types.includes('OPEN_DEAD_LETTERS'));
  assert.ok(types.includes('ABANDONED_MESH_CYCLES'));
  assert.equal(result.health, 'CRITICAL');
});

test('exhausted autonomy work is critical while stalled-only work is warning', () => {
  const stalled = healthySnapshot();
  stalled.queue.stalledRuns = 3;
  let result = evaluateOperatorHealth({ snapshot: stalled, date: NOW });
  assert.equal(result.health, 'DEGRADED');
  assert.equal(result.escalations[0].severity, 'WARNING');

  const exhausted = healthySnapshot();
  exhausted.queue.exhaustedRuns = 1;
  result = evaluateOperatorHealth({ snapshot: exhausted, date: NOW });
  assert.equal(result.health, 'CRITICAL');
  assert.equal(result.escalations[0].severity, 'CRITICAL');
});

test('effect-ledger uncertainty is a critical truth incident', () => {
  const snapshot = healthySnapshot();
  snapshot.truth.unknownEffectKeys = 1;
  snapshot.truth.nonZeroUnauthorizedEffects = 1;
  const result = evaluateOperatorHealth({ snapshot, date: NOW });
  assert.equal(result.health, 'CRITICAL');
  assert.equal(result.escalations[0].type, 'EFFECT_LEDGER_INTEGRITY_FAILURE');
  assert.ok(result.escalations[0].reasonCodes.includes('unknown-effect-keys'));
  assert.ok(result.escalations[0].reasonCodes.includes('unauthorized-non-zero-effects'));
});

test('payment review and uncertain sends page as warnings without becoming revenue truth', () => {
  const snapshot = healthySnapshot();
  snapshot.commercial.reviewRequiredPayments = 2;
  snapshot.commercial.uncertainSends = 1;
  const result = evaluateOperatorHealth({ snapshot, date: NOW });
  assert.equal(result.health, 'DEGRADED');
  assert.ok(result.escalations.some(item => item.type === 'PAYMENT_REVIEW_REQUIRED'));
  assert.ok(result.escalations.some(item => item.type === 'UNCERTAIN_SEND_STATE'));
  assert.equal('revenue' in result, false);
});

test('repeat incident is deduplicated by stable fingerprint', () => {
  const snapshot = healthySnapshot();
  snapshot.queue.openDeadLetters = 1;
  const first = evaluateOperatorHealth({ snapshot, date: NOW });
  const fingerprint = first.escalations[0].fingerprint;
  const second = evaluateOperatorHealth({
    snapshot,
    activeFingerprints: [fingerprint],
    date: new Date('2026-08-23T03:00:00.000Z')
  });
  assert.equal(second.escalations[0].fingerprint, fingerprint);
  assert.equal(second.escalations[0].status, 'SUPPRESSED_DUPLICATE');
  assert.equal(second.newEscalationCount, 0);
  assert.equal(second.paging.decision, 'NO_NEW_PAGE_REQUIRED');
});

test('founder queue is hard capped at three highest-severity new escalations', () => {
  const snapshot = healthySnapshot();
  snapshot.queue.openDeadLetters = 1;
  snapshot.queue.abandonedCycles = 1;
  snapshot.queue.exhaustedRuns = 1;
  snapshot.truth.secretScanFailures = 1;
  snapshot.commercial.complaintEvents = 1;
  const result = evaluateOperatorHealth({ snapshot, date: NOW, maxEscalations: 99 });
  assert.equal(result.ownerActionQueue.length, 3);
  assert.equal(result.escalations.length, 3);
  assert.ok(result.escalations.every(item => item.severity === 'CRITICAL'));
});

test('every escalation is local truth with zero external effects and no transport claim', () => {
  const snapshot = healthySnapshot();
  snapshot.queue.openDeadLetters = 1;
  const result = evaluateOperatorHealth({ snapshot, date: NOW });
  const escalation = result.escalations[0];
  assert.equal(escalation.businessEffectAuthority, 'NONE');
  assert.equal(escalation.transportStatus, 'NOT_DISPATCHED');
  assert.deepEqual(escalation.externalEffectLedger, OPERATOR_ESCALATION_EXTERNAL_EFFECTS);
  assert.equal(result.paging.transport, 'UNCONFIGURED');
  // Was the literal 'NOT_AVAILABLE'. The claim is unchanged -- nothing here may
  // assert a page was delivered -- but the report now says which of the several
  // ways it was not: no transport exists at all, as opposed to one existing and
  // failing, or existing and returning an unknowable result.
  assert.equal(result.paging.deliveryProof, DELIVERY_PROOF.NO_TRANSPORT_CONFIGURED);
  assert.notEqual(result.paging.deliveryProof, DELIVERY_PROOF.HUMAN_DELIVERY_PROVEN);
  assert.equal(result.paging.undeliveredEscalations, 0);
});

test('invalid health snapshot and time fail closed', () => {
  assert.equal(evaluateOperatorHealth({ snapshot: null, date: NOW }).ok, false);
  assert.equal(evaluateOperatorHealth({ snapshot: {}, date: 'not-a-date' }).ok, false);
});

test('persistence writes only new incidents and never dispatches transport', async () => {
  const snapshot = healthySnapshot();
  snapshot.queue.openDeadLetters = 1;
  const report = evaluateOperatorHealth({ snapshot, date: NOW });
  const writes = [];
  const store = {
    async log(type, detail) {
      writes.push({ type, detail });
      return { id: `audit-${writes.length}`, type, detail };
    }
  };
  const persisted = await persistOperatorEscalations(store, report);
  assert.equal(persisted.length, 1);
  assert.equal(writes[0].type, 'operator_escalation');
  assert.equal(writes[0].detail.transportStatus, 'NOT_DISPATCHED');
  assert.deepEqual(writes[0].detail.externalEffectLedger, OPERATOR_ESCALATION_EXTERNAL_EFFECTS);

  const duplicateReport = evaluateOperatorHealth({
    snapshot,
    activeFingerprints: [report.escalations[0].fingerprint],
    date: NOW
  });
  const duplicateWrites = [];
  await persistOperatorEscalations({
    async log(type, detail) {
      duplicateWrites.push({ type, detail });
    }
  }, duplicateReport);
  assert.equal(duplicateWrites.length, 0);
});
