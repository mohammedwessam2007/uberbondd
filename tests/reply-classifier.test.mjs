import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCanonReply, cancelsFollowups, applyReplyClassification, CANONICAL_REPLY_CLASSES } from '../src/reply-classifier.mjs';
import { JsonStore } from '../src/store.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canon-reply-classifier-'));
  const store = new JsonStore(dir);
  await store.init();
  return store;
}

test('P1-009 acceptance: every canonical class produces the expected cancellation outcome', async () => {
  const cases = [
    ['positive', true], ['negative', true], ['neutral', true], ['wrong_recipient', true],
    ['optout', true], ['complaint', true], ['bounce', true], ['automatic', false]
  ];
  for (const [label, shouldCancel] of cases) {
    assert.equal(cancelsFollowups(label), shouldCancel, label);
  }
});

test('a delivery-failure body classifies as bounce via classifyDeliverySignal, never reaching the AI path', async () => {
  const result = await classifyCanonReply({ from: 'mailer-daemon@x.com', subject: '', body: 'Delivery Status Notification: address not found' });
  assert.equal(result.label, 'bounce');
});

test('a wrong-recipient phrase classifies as wrong_recipient ahead of the optout/positive rules', async () => {
  const result = await classifyCanonReply({ body: "You've got the wrong department, please remove me from this specific list" });
  assert.equal(result.label, 'wrong_recipient');
});

test('an explicit rejection classifies as optout via the deterministic rules path (no network call)', async () => {
  const result = await classifyCanonReply({ body: 'Please stop emailing me, not interested' }, { cfg: { provider: 'rules' } });
  assert.equal(result.label, 'optout');
});

test('applyReplyClassification cancels follow-ups for a positive reply and reschedules for automatic', async () => {
  const store = await makeStore();
  const prospect = await store.add('prospects', { id: 'p1', domain: 'acme.com', status: 'sent', nextFollowupAt: '2026-08-05T00:00:00.000Z' });
  await applyReplyClassification(store, prospect, { label: 'positive', confidence: 0.9 }, { at: new Date('2026-08-01T00:00:00.000Z') });
  const updated = await store.get('prospects', 'p1');
  assert.equal(updated.nextFollowupAt, null);
  assert.equal(updated.status, 'replied');

  const prospect2 = await store.add('prospects', { id: 'p2', domain: 'beta.com', status: 'sent', nextFollowupAt: '2026-08-05T00:00:00.000Z' });
  await applyReplyClassification(store, prospect2, { label: 'automatic', confidence: 0.9 }, { at: new Date('2026-08-01T00:00:00.000Z') });
  const updated2 = await store.get('prospects', 'p2');
  assert.notEqual(updated2.nextFollowupAt, null);
  assert.equal(updated2.status, 'sent');
});

test('CANONICAL_REPLY_CLASSES names every class the mission/audit requires', () => {
  for (const label of ['bounce', 'complaint', 'automatic', 'optout', 'wrong_recipient', 'positive', 'negative', 'neutral']) {
    assert.ok(CANONICAL_REPLY_CLASSES.includes(label), label);
  }
});
