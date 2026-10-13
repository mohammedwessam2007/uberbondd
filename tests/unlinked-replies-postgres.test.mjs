import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createStore, ConflictError } from '../src/store.mjs';

// Runs only against a disposable database supplied by scripts/with-real-postgres.mjs. It proves that the additive
// migration applies and that the unlinkedReplies collection round-trips. It never touches production.
const URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';
const skip = URL ? false : 'OMNIA_V9_TEST_DATABASE_URL not set -- unlinkedReplies Postgres proof not run';

test('Postgres: unlinkedReplies is mapped, round-trips, and refuses a duplicate id', { skip }, async () => {
  const store = createStore({ storeBackend: 'postgres', databaseUrl: URL, databaseSsl: false });
  await store.init();
  try {
    const id = `unlinked:fixture-${crypto.randomBytes(4).toString('hex')}`;
    const record = {
      id, externalId: `imap:fixture-slot:v1:${id}`, accountSlot: 'winnr-imap:fixture@uberbond.test',
      from: 'Stranger <stranger@elsewhere.test>', fromEmail: 'stranger@elsewhere.test',
      subject: 'fixture', body: 'fixture body', inReplyTo: null, references: [], receivedAt: new Date().toISOString()
    };
    await store.add('unlinkedReplies', record);
    const found = await store.get('unlinkedReplies', id);
    assert.equal(found?.externalId, record.externalId);
    assert.equal(found?.accountSlot, record.accountSlot);
    await assert.rejects(() => store.add('unlinkedReplies', record), error => error instanceof ConflictError);
  } finally {
    await store.close?.();
  }
});
