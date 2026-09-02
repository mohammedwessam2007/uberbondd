import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  POSTAL_PROVENANCE,
  POSTAL_QUARANTINE_REASONS,
  deriveCurrentPostalState,
  isReconcilableRow,
  normalizePostalWebhookEvent,
  verifyPostalWebhookSignature
} from '../src/omnia-v9/integrations/providers/postal-webhook-evidence.mjs';
import {
  createMemoryPostalWebhookLedger,
  createPostalReconciliationLookup
} from '../src/omnia-v9/integrations/providers/postal-webhook-ledger.mjs';
import { containsSecretValue } from '../src/secret-patterns.mjs';

// Postal signs the exact request bytes with its DKIM key, so the tests sign
// with a real key pair rather than stubbing verification. A stubbed signature
// check proves the code path runs; it does not prove the check works.
// The module takes the public key as PEM text (or bare base64 SPKI), the way
// it would arrive from an environment variable -- not as a KeyObject.
const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKey = pair.privateKey;
const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

const TAG = `v9_${'a'.repeat(48)}`;
const RECEIVED_AT = new Date('2026-09-02T00:00:00.000Z');
const RECIPIENT_TOKEN = 'postal-recipient-token-do-not-store';

function body(overrides = {}) {
  const { message = {}, ...rest } = overrides;
  return JSON.stringify({
    event: 'MessageSent',
    timestamp: 1788307200,
    uuid: 'e7b1c0de-0000-4000-8000-000000000001',
    payload: {
      message: {
        id: 37171,
        token: RECIPIENT_TOKEN,
        message_id: '<v9-abc@uberbond.agency>',
        to: 'buyer@example.com',
        from: 'outreach@uberbond.agency',
        subject: 'Evidence sprint',
        tag: TAG,
        ...message
      },
      status: 'Sent'
    },
    ...rest
  });
}

const sign = raw => crypto.sign('sha256', Buffer.from(raw, 'utf8'), privateKey).toString('base64');

const normalize = (raw, signature = sign(raw), key = publicKey) => normalizePostalWebhookEvent({
  rawBody: Buffer.from(raw, 'utf8'), signature, publicKey: key, receivedAt: RECEIVED_AT
});

test('a genuine Postal signature authenticates and a forged one does not', () => {
  const raw = body();
  assert.equal(verifyPostalWebhookSignature({ rawBody: raw, signature: sign(raw), publicKey }).authenticated, true);

  const wrongKey = crypto.sign('sha256', Buffer.from(raw, 'utf8'), otherKey.privateKey).toString('base64');
  assert.equal(verifyPostalWebhookSignature({ rawBody: raw, signature: wrongKey, publicKey }).authenticated, false);

  // The signature is over exact bytes. Re-serializing the JSON changes them,
  // which is why the route verifies before it parses.
  const tampered = raw.replace('buyer@example.com', 'attacker@example.com');
  assert.equal(verifyPostalWebhookSignature({ rawBody: tampered, signature: sign(raw), publicKey }).authenticated, false);

  assert.equal(verifyPostalWebhookSignature({ rawBody: raw, signature: sign(raw), publicKey: '' }).reason,
    'postal-webhook-public-key-not-configured');
});

test('an authenticated event normalizes with provenance and a valid execution tag', () => {
  const record = normalize(body());
  assert.equal(record.authenticated, true);
  assert.equal(record.quarantineReason, null);
  assert.equal(record.provenance, POSTAL_PROVENANCE.AUTHENTICATED);
  assert.equal(record.lifecycle, 'SENT');
  assert.equal(record.tag, TAG);
  assert.equal(record.executionTagValid, true);
  assert.equal(record.to, 'buyer@example.com');
  assert.equal(isReconcilableRow(record), true);
});

test('the recipient token and the raw body never survive normalization', () => {
  const record = normalize(body());
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes(RECIPIENT_TOKEN), false, 'the per-recipient token was kept');
  assert.equal(serialized.includes('Evidence sprint'), false, 'the raw subject was kept instead of its digest');
  assert.match(record.rawBodySha256, /^[0-9a-f]{64}$/);
  assert.equal(serialized.includes('"payload"'), false, 'the raw body survived into the record');
  assert.equal(containsSecretValue(serialized), false);
});

test('an unauthenticated or unknown event is quarantined rather than dropped or trusted', () => {
  const raw = body();
  const unsigned = normalize(raw, '');
  assert.equal(unsigned.authenticated, false);
  assert.equal(unsigned.quarantineReason, POSTAL_QUARANTINE_REASONS.UNAUTHENTICATED);
  assert.equal(unsigned.provenance, POSTAL_PROVENANCE.QUARANTINED);
  assert.equal(isReconcilableRow(unsigned), false);
  // Still a record: knowing someone posted an unsigned event is worth more
  // than a silent refusal.
  assert.match(unsigned.rawBodySha256, /^[0-9a-f]{64}$/);

  const unknownEvent = normalize(body({ event: 'SomethingPostalNeverSends' }));
  assert.equal(unknownEvent.quarantineReason, POSTAL_QUARANTINE_REASONS.UNKNOWN_EVENT_TYPE);
  assert.equal(isReconcilableRow(unknownEvent), false);

  const malformed = normalizePostalWebhookEvent({
    rawBody: Buffer.from('not json at all', 'utf8'),
    signature: crypto.sign('sha256', Buffer.from('not json at all', 'utf8'), privateKey).toString('base64'),
    publicKey,
    receivedAt: RECEIVED_AT
  });
  assert.equal(malformed.quarantineReason, POSTAL_QUARANTINE_REASONS.MALFORMED);
});

test('an occurrence key makes a redelivery recognisable as the same event', async () => {
  const ledger = createMemoryPostalWebhookLedger();
  const record = normalize(body());
  assert.equal((await ledger.append(record)).status, 'PERSISTED');
  assert.equal((await ledger.append(record)).status, 'DUPLICATE');
  assert.equal((await ledger.findByTag(TAG)).length, 1);
});

test('a later event wins and an out-of-order older one does not roll state backward', () => {
  const sent = normalize(body({ uuid: 'e7b1c0de-0000-4000-8000-000000000001' }));
  const delivered = normalize(body({
    event: 'MessageDelivered', uuid: 'e7b1c0de-0000-4000-8000-000000000002', timestamp: 1788310800
  }));
  const stale = normalize(body({
    event: 'MessageDelayed', uuid: 'e7b1c0de-0000-4000-8000-000000000003', timestamp: 1788303600
  }));

  const forward = deriveCurrentPostalState([sent, delivered]);
  const outOfOrder = deriveCurrentPostalState([sent, delivered, stale]);
  assert.equal(outOfOrder.lifecycle, forward.lifecycle,
    'an older event arriving late changed the current state');
});

test('two Postal message ids under one execution tag are a contradiction, not a choice', () => {
  const first = normalize(body({ uuid: 'e7b1c0de-0000-4000-8000-000000000004' }));
  const second = normalize(body({
    uuid: 'e7b1c0de-0000-4000-8000-000000000005', message: { id: 99999 }
  }));
  assert.equal(deriveCurrentPostalState([first, second]).contradictory, true);
});

test('the reconciliation lookup excludes quarantined rows and collapses a replay to one row', async () => {
  const ledger = createMemoryPostalWebhookLedger();
  const lookup = createPostalReconciliationLookup(ledger);

  await ledger.append(normalize(body()));
  await ledger.append(normalize(body({ uuid: 'e7b1c0de-0000-4000-8000-000000000009' })));
  await ledger.append(normalize(body({ uuid: 'e7b1c0de-0000-4000-8000-00000000000a' }), ''));

  const rows = await lookup({ tag: TAG, messageId: '<v9-abc@uberbond.agency>' });
  assert.equal(rows.length, 1, 'a replayed event surfaced as a second message');
  assert.equal(rows[0].provenance, POSTAL_PROVENANCE.AUTHENTICATED);
  assert.equal(JSON.stringify(rows).includes(RECIPIENT_TOKEN), false);
});

test('two genuinely different messages still surface as two rows, so the adapter can call it ambiguous', async () => {
  const ledger = createMemoryPostalWebhookLedger();
  const lookup = createPostalReconciliationLookup(ledger);
  await ledger.append(normalize(body()));
  await ledger.append(normalize(body({ uuid: 'e7b1c0de-0000-4000-8000-00000000000b', message: { id: 88888 } })));

  const rows = await lookup({ tag: TAG, messageId: '<v9-abc@uberbond.agency>' });
  assert.ok(rows.length > 1, 'two distinct Postal messages were collapsed into one confident answer');
});
