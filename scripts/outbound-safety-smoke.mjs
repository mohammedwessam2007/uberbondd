import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PostgresStore } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-outbound-smoke-'));
await fs.chmod(root, 0o777);
const databaseDir = path.join(root, 'db');
await fs.mkdir(databaseDir, { recursive: true });
await fs.chmod(databaseDir, 0o777);
const port = 28000 + Math.floor(Math.random() * 1000);
const postgres = new EmbeddedPostgres({
  databaseDir, user: 'postgres', password: 'password', port, persistent: false,
  createPostgresUser: true, onLog: () => {}, onError: message => process.stderr.write(`[embedded-postgres] ${String(message)}\n`)
});

let store;
let second;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('uberbond_outbound');
  const databaseUrl = `postgresql://postgres:password@127.0.0.1:${port}/uberbond_outbound`;
  store = new PostgresStore({ databaseUrl, ssl: false });
  second = new PostgresStore({ databaseUrl, ssl: false });
  await Promise.all([store.init(), second.init()]);

  const fixed = new Date('2026-07-13T10:00:00.000Z');
  const campaign = { id: 'camp', name: 'UK clinics', approved: true, autoSend: true, allowedCountries: ['GB'], minScore: 60, dailyCaps: { A: 1 }, maxFollowups: 0, createdAt: fixed.toISOString() };
  const prospect = {
    id: 'pros', campaignId: 'camp', company: 'Clinic', website: 'https://clinic.example', domain: 'clinic.example', country: 'United Kingdom',
    inbox: 'A', status: 'ready', draft: 'Evidence-backed message', subject: 'Website observation',
    unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=x', oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=x',
    contact: { email: 'info@clinic.example', source: 'website', verified: 'unverified' }, score: { total: 80 },
    issue: { title: 'Booking path issue', confidence: .9, safeForOutreach: true, evidenceUrl: 'https://clinic.example/book', evidenceExcerpt: 'Book button returned an error.' },
    createdAt: fixed.toISOString()
  };
  await store.add('campaigns', campaign);
  await store.add('prospects', prospect);
  await store.add('accounts', { id: 'account-a', slot: 'A', connected: true, email: 'outreach@uberbond.example', tokens: 'unused', createdAt: fixed.toISOString() });

  const reservationBase = { inbox: 'B', recipientEmail: 'hello@one.example', dailyCap: 1, hourlyCap: 1, minGapSeconds: 0, now: fixed.toISOString() };
  const [a, b] = await Promise.all([
    store.reserveOutboundSend({ ...reservationBase, idempotencyKey: 'initial:a', prospectId: null }),
    second.reserveOutboundSend({ ...reservationBase, idempotencyKey: 'initial:b', prospectId: null })
  ]);
  assert.equal([a, b].filter(item => item.ok).length, 1, 'concurrent cap must allow exactly one reservation');

  const cfg = {
    outbound: { enabled: true, dryRun: false, allowedCountries: ['GB'], hourlyCaps: { A: 1 }, minGapSeconds: 0, businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75, hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3 },
    sender: { name: 'Mohamed', company: 'UberBond', address: 'Business address' }, caps: { A: 1 }, google: {}, encryptionKey: ''
  };
  let sends = 0;
  const pipeline = new Pipeline(store, cfg, {
    clock: () => fixed,
    sendEmail: async (_google, _account, _key, message) => {
      sends += 1;
      assert.equal(message.listUnsubscribe, prospect.oneClickUnsubscribeUrl);
      return { data: { id: 'gmail-1', threadId: 'thread-1' } };
    },
    getMessage: async () => ({ data: { payload: { headers: [{ name: 'Message-ID', value: '<m1@example>' }] } } })
  });
  const first = await pipeline.maybeSend(prospect, campaign);
  const secondAttempt = await pipeline.maybeSend(prospect, campaign);
  assert.equal(first.sent, true);
  assert.equal(secondAttempt.duplicate, true);
  assert.equal(sends, 1);

  const health = await store.recordOutboundEvent({ inbox: 'A', eventType: 'complaint', prospectId: 'pros', recipientEmail: 'info@clinic.example' }, { hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3 });
  assert.equal(health.paused, true);
  const blocked = await store.reserveOutboundSend({ inbox: 'A', recipientEmail: 'next@clinic.example', idempotencyKey: 'initial:next', dailyCap: 10, hourlyCap: 10, minGapSeconds: 0, now: fixed.toISOString() });
  assert.equal(blocked.reason, 'sender-paused');

  console.log(JSON.stringify({
    ok: true,
    concurrentCapAllowed: [a, b].filter(item => item.ok).length,
    providerCalls: sends,
    idempotentDuplicateBlocked: secondAttempt.duplicate === true,
    complaintPausedSender: health.paused,
    senderPauseBlockedReservation: blocked.reason
  }, null, 2));
} finally {
  await second?.close().catch(() => {});
  await store?.close().catch(() => {});
  await postgres.stop().catch(() => {});
}

process.exit(0);
