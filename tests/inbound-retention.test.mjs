import test from 'node:test';
import assert from 'node:assert/strict';
import { planInboundRetention, INBOUND_RETENTION_LIMITS } from '../src/inbound-retention.mjs';

const NOW = Date.parse('2026-10-13T00:00:00.000Z');
const daysAgo = days => new Date(NOW - days * 86400000).toISOString();

const records = [
  { id: 'unlinked:old-1', receivedAt: daysAgo(120) },
  { id: 'unlinked:old-2', receivedAt: daysAgo(91) },
  { id: 'unlinked:recent', receivedAt: daysAgo(10) },
  { id: 'unlinked:held', receivedAt: daysAgo(400), legalHold: true },
  { id: 'unlinked:open', receivedAt: daysAgo(400), escalationStatus: 'open' },
  { id: 'unlinked:undated', receivedAt: 'not a date' },
  { receivedAt: daysAgo(400) }
];

test('the plan purges only records outside the window and reports why the rest are kept', () => {
  const plan = planInboundRetention({ records, windowDays: 90, nowMs: NOW, holdIds: ['unlinked:old-2'] });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.purgeIds, ['unlinked:old-1']);
  assert.equal(plan.purgeCount, 1);
  assert.equal(plan.retainedByReason.hold, 2, 'a legal-hold flag and an explicit hold id both retain');
  assert.equal(plan.retainedByReason['open-escalation'], 1);
  assert.equal(plan.retainedByReason.undated, 1);
  assert.equal(plan.retainedByReason['missing-id'], 1);
  assert.equal(plan.retainedByReason['within-window'], 1);
  assert.equal(plan.retainedCount, 6);
});

test('the plan never deletes, and never mutates the records it was given', () => {
  const copy = structuredClone(records);
  const plan = planInboundRetention({ records, windowDays: 90, nowMs: NOW });
  assert.deepEqual(records, copy);
  assert.equal(plan.deletesPerformed, 0);
  assert.equal(plan.providerCalls, 0);
});

test('the digest receipt is stable for the same plan and changes when the purge set changes', () => {
  const a = planInboundRetention({ records, windowDays: 90, nowMs: NOW });
  const b = planInboundRetention({ records: [...records].reverse(), windowDays: 90, nowMs: NOW });
  const c = planInboundRetention({ records, windowDays: 30, nowMs: NOW });
  assert.equal(a.receipt.digest, b.receipt.digest, 'record order does not change the digest');
  assert.notEqual(a.receipt.digest, c.receipt.digest);
  assert.match(a.receipt.digest, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(a.receipt).includes('unlinked:old-1'), false, 'the receipt holds counts and digests, not ids');
});

test('an invalid window, an invalid clock, a non-array, or an oversized set is refused and purges nothing', () => {
  for (const windowDays of [0, 3651, 1.5, '30x', null]) {
    const refused = planInboundRetention({ records, windowDays, nowMs: NOW });
    assert.equal(refused.ok, false, `windowDays=${String(windowDays)} must fail closed`);
    assert.deepEqual(refused.reasonCodes, ['window-days-invalid']);
    assert.deepEqual(refused.purgeIds, []);
  }
  assert.equal(planInboundRetention({ records, windowDays: 90, nowMs: Number.NaN }).reasonCodes[0], 'now-invalid');
  assert.equal(planInboundRetention({ records: 'nope', windowDays: 90, nowMs: NOW }).reasonCodes[0], 'records-not-array');
  const oversized = new Array(INBOUND_RETENTION_LIMITS.maxRecords + 1).fill({ id: 'x', receivedAt: daysAgo(999) });
  const refused = planInboundRetention({ records: oversized, windowDays: 90, nowMs: NOW });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.purgeIds, []);
});
