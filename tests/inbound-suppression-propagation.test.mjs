import test, { after } from 'node:test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import {
  propagateSuppression, recordInboundHealthEvent, buildOperatorEscalation, recordOperatorEscalation
} from '../src/inbound-suppression-propagation.mjs';

const dirs = [];
after(async () => {
  await Promise.all(dirs.map(dir => fs.rm(dir, { recursive: true, force: true })));
});

async function freshStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-inbound-suppression-'));
  dirs.push(dir);
  const store = new Store(dir);
  await store.init();
  return store;
}

test('a suppression is keyed by recipient address, lower-cased, and is written once across replays', async () => {
  const store = await freshStore();
  const first = await propagateSuppression(store, { email: 'Buyer@Clinic.Invalid', reason: 'optout', sourceId: 'mid:<a@x>' });
  const second = await propagateSuppression(store, { email: 'buyer@clinic.invalid', reason: 'optout', sourceId: 'mid:<a@x>' });
  assert.equal(first.status, 'SUPPRESSED');
  assert.equal(second.status, 'ALREADY_SUPPRESSED');
  const rows = await store.list('suppressions');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].value, 'buyer@clinic.invalid');
  assert.equal(rows[0].scope, 'all-slots');
  assert.equal(JSON.stringify(rows[0]).includes('mid:<a@x>'), false, 'the source is stored as a digest only');
});

test('a suppression with no recipient is refused and writes nothing', async () => {
  const store = await freshStore();
  assert.deepEqual(await propagateSuppression(store, { email: '   ' }), { ok: false, status: 'RECIPIENT_MISSING' });
  assert.equal((await store.list('suppressions')).length, 0);
});

test('a replayed hard bounce is recorded once and never double-counts the sender', async () => {
  const store = await freshStore();
  const thresholds = { hardBouncePauseThreshold: 2 };
  const input = { eventType: 'hard_bounce', inbox: 'slot-a', prospectId: 'p1', recipientEmail: 'b@x.invalid', externalId: 'mid:<dsn@x>', thresholds };
  assert.equal((await recordInboundHealthEvent(store, input)).status, 'RECORDED');
  assert.equal((await recordInboundHealthEvent(store, input)).status, 'ALREADY_RECORDED');
  const health = await store.findOne('senderHealth', { inbox: 'slot-a' });
  assert.equal(health.hardBouncesToday, 1);
  assert.equal(health.paused, false, 'one bounce stays below the threshold of two');
  assert.equal((await store.list('outboundEvents')).length, 1);
});

test('a complaint holds the sending slot even below the configured complaint threshold', async () => {
  const store = await freshStore();
  const result = await recordInboundHealthEvent(store, {
    eventType: 'complaint', inbox: 'slot-c', prospectId: 'p2', externalId: 'mid:<fbl@x>', thresholds: { complaintPauseThreshold: 9 }
  });
  assert.equal(result.held, true);
  const health = await store.findOne('senderHealth', { inbox: 'slot-c' });
  assert.equal(health.paused, true);
  assert.equal(health.pauseReason, 'inbound-complaint-hold');
  assert.equal(health.complaintsToday, 1);
});

test('an interrupted run that recorded the complaint but not its hold has the hold re-asserted on replay', async () => {
  const store = await freshStore();
  const externalId = 'mid:<interrupted@x>';
  // The event was written by an earlier run that stopped before the hold. The configured threshold was not reached.
  await store.recordOutboundEvent({
    id: `inbound-health:complaint:${crypto.createHash('sha256').update(externalId).digest('hex')}`,
    inbox: 'slot-r', eventType: 'complaint', detail: {}
  }, { complaintPauseThreshold: 9 });
  assert.equal((await store.findOne('senderHealth', { inbox: 'slot-r' })).paused, false);
  const replay = await recordInboundHealthEvent(store, {
    eventType: 'complaint', inbox: 'slot-r', externalId, thresholds: { complaintPauseThreshold: 9 }
  });
  assert.equal(replay.status, 'ALREADY_RECORDED');
  assert.equal(replay.held, true);
  const health = await store.findOne('senderHealth', { inbox: 'slot-r' });
  assert.equal(health.paused, true);
  assert.equal(health.complaintsToday, 1, 'the replay never adds a second complaint');
});

test('an event type outside hard_bounce and complaint is refused', async () => {
  const store = await freshStore();
  assert.deepEqual(await recordInboundHealthEvent(store, { eventType: 'sent', inbox: 'slot-x' }), { ok: false, status: 'EVENT_TYPE_REFUSED' });
  assert.equal((await store.list('outboundEvents')).length, 0);
});

test('an operator escalation carries fixed codes and digests only, never the body, subject or raw message id', () => {
  const externalId = 'mid:<secret-looking-id@clinic.invalid>';
  const escalation = buildOperatorEscalation({
    kind: 'human_response', externalId, replyId: 'reply_1', prospectId: 'p1', slot: 'slot-a',
    correlation: 'thread', label: 'neutral', reasonCode: 'NOT_A_REAL_CODE', at: '2026-10-13T00:00:00.000Z'
  });
  assert.equal(escalation.type, 'inbound_operator_escalation');
  assert.equal(escalation.detail.reasonCode, 'UNSPECIFIED');
  assert.equal(escalation.detail.actionRequired, 'OWNER_MANUAL_REVIEW');
  assert.equal(JSON.stringify(escalation).includes('secret-looking-id'), false);
  assert.equal(buildOperatorEscalation({ kind: 'human_response', externalId }).id, buildOperatorEscalation({ kind: 'human_response', externalId }).id);
  assert.notEqual(buildOperatorEscalation({ kind: 'complaint', externalId }).id, buildOperatorEscalation({ kind: 'unsubscribe', externalId }).id);
});

test('an unknown escalation kind is refused rather than recorded', () => {
  assert.throws(() => buildOperatorEscalation({ kind: 'auto_reply', externalId: 'x' }), /operator-escalation-kind-refused/);
});

test('recording the same escalation twice keeps one audit entry', async () => {
  const store = await freshStore();
  const escalation = buildOperatorEscalation({ kind: 'unsubscribe', externalId: 'mid:<u@x>', reasonCode: 'UNSUBSCRIBE_INTENT' });
  assert.equal((await recordOperatorEscalation(store, escalation)).status, 'RECORDED');
  assert.equal((await recordOperatorEscalation(store, escalation)).status, 'ALREADY_RECORDED');
  const rows = (await store.list('auditLog')).filter(row => row.type === 'inbound_operator_escalation');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].detail.kind, 'unsubscribe');
});
