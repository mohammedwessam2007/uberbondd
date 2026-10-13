import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createStore } from '../src/store.mjs';
import { propagateSuppression, recordInboundHealthEvent, buildOperatorEscalation, recordOperatorEscalation } from '../src/inbound-suppression-propagation.mjs';

// Runs only against a disposable database supplied by scripts/with-real-postgres.mjs. It proves that the replay paths
// hold on the real unique constraints: a duplicate suppression value, a duplicate health-event id and a duplicate audit id.
const URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';
const skip = URL ? false : 'OMNIA_V9_TEST_DATABASE_URL not set -- inbound suppression Postgres proof not run';

test('Postgres: suppression, health replay and escalation replay each hold exactly one row', { skip }, async () => {
  const store = createStore({ storeBackend: 'postgres', databaseUrl: URL, databaseSsl: false });
  await store.init();
  try {
    const token = crypto.randomBytes(4).toString('hex');
    const email = `buyer-${token}@clinic.example.invalid`;
    const externalId = `mid:<pg-${token}@clinic.example.invalid>`;
    const inbox = `slot-pg-${token}`;

    assert.equal((await propagateSuppression(store, { email, reason: 'optout', sourceId: externalId })).status, 'SUPPRESSED');
    assert.equal((await propagateSuppression(store, { email, reason: 'optout', sourceId: externalId })).status, 'ALREADY_SUPPRESSED');
    const suppressions = (await store.list('suppressions')).filter(row => row.value === email);
    assert.equal(suppressions.length, 1);

    const bounce = { eventType: 'hard_bounce', inbox, prospectId: null, recipientEmail: email, externalId, thresholds: { hardBouncePauseThreshold: 9 } };
    assert.equal((await recordInboundHealthEvent(store, bounce)).status, 'RECORDED');
    assert.equal((await recordInboundHealthEvent(store, bounce)).status, 'ALREADY_RECORDED');
    const health = (await store.list('senderHealth')).find(row => row.inbox === inbox);
    assert.equal(health.hardBouncesToday, 1, 'a replayed bounce is never counted twice');

    const escalation = buildOperatorEscalation({ kind: 'unsubscribe', externalId, slot: inbox, reasonCode: 'UNSUBSCRIBE_INTENT' });
    assert.equal((await recordOperatorEscalation(store, escalation)).status, 'RECORDED');
    assert.equal((await recordOperatorEscalation(store, escalation)).status, 'ALREADY_RECORDED');
    const audited = (await store.list('auditLog')).filter(row => row.id === escalation.id);
    assert.equal(audited.length, 1);
    assert.equal(JSON.stringify(audited[0]).includes(email), false, 'the escalation never carries the recipient address');
  } finally {
    await store.close?.();
  }
});
