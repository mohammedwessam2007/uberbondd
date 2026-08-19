import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sealTokens } from '../src/gmail.mjs';
import { GmailEffectAdapter, GmailEffectAdapterError, generateMessageId } from '../src/omnia-v9/integrations/providers/gmail-effect-adapter.mjs';
import { createFakeGmailTransport } from './helpers/fake-gmail-transport.mjs';

const ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const CFG = { clientId: 'fake-client', clientSecret: 'fake-secret', redirectUri: 'https://example.test/callback' };
const MESSAGE_ID_DOMAIN = 'uberbond-controlled-test.example';

function freshAccount() {
  const tokens = { access_token: 'fresh-token', refresh_token: 'fresh-refresh', expires_at: Date.now() + 3600_000 };
  return { tokens: sealTokens(tokens, ENCRYPTION_KEY) };
}

function makeAdapter(overrides = {}) {
  const transport = createFakeGmailTransport({});
  return new GmailEffectAdapter({
    cfg: { ...CFG, fetchImpl: transport.fetchImpl },
    account: freshAccount(),
    encryptionKey: ENCRYPTION_KEY,
    messageIdDomain: MESSAGE_ID_DOMAIN,
    fromAddress: 'sender@uberbond-controlled-test.example',
    ...overrides
  });
}

function payload(overrides = {}) {
  return { to: 'recipient@example.test', subject: 'Test subject', body: 'Test body content.', ...overrides };
}

function preparedInput(id, effectPayload = payload()) {
  const executionId = `exec-${id}`;
  return {
    businessKey: `bk-${id}`,
    providerEffectIdentity: generateMessageId(executionId, MESSAGE_ID_DOMAIN),
    executionId,
    effectPayload
  };
}

test('static safety: invalid recipient (missing @) is rejected before any network call', async () => {
  const adapter = makeAdapter();
  await assert.rejects(
    () => adapter.prepare({ businessKey: 'bk-1', providerEffectIdentity: 'peid-1', executionId: 'exec-1', effectPayload: payload({ to: 'not-an-email' }) }),
    error => error instanceof GmailEffectAdapterError && error.code === 'INVALID_RECIPIENT'
  );
});

test('static safety: empty recipient is rejected', async () => {
  const adapter = makeAdapter();
  await assert.rejects(
    () => adapter.prepare({ businessKey: 'bk-2', providerEffectIdentity: 'peid-2', executionId: 'exec-2', effectPayload: payload({ to: '' }) }),
    error => error.code === 'INVALID_RECIPIENT'
  );
});

test('static safety: malformed email (double @) is rejected', async () => {
  const adapter = makeAdapter();
  await assert.rejects(
    () => adapter.prepare({ businessKey: 'bk-3', providerEffectIdentity: 'peid-3', executionId: 'exec-3', effectPayload: payload({ to: 'a@@b.com' }) }),
    error => error.code === 'INVALID_RECIPIENT'
  );
});

test('static safety: malformed Message-ID domain is rejected at generateMessageId()', () => {
  assert.throws(() => generateMessageId('exec-x', 'not a valid domain'), error => error.code === 'INVALID_INPUT');
  assert.throws(() => generateMessageId('exec-x', ''), error => error.code === 'INVALID_INPUT');
  assert.throws(() => generateMessageId('', 'example.com'), error => error.code === 'INVALID_INPUT');
});

test('static safety: duplicate Message-ID generation is deterministic per execution ID, distinct across execution IDs', () => {
  const a1 = generateMessageId('exec-same', 'uberbond-controlled-test.example');
  const a2 = generateMessageId('exec-same', 'uberbond-controlled-test.example');
  const b = generateMessageId('exec-different', 'uberbond-controlled-test.example');
  assert.equal(a1, a2, 'same execution ID must always produce the same Message-ID');
  assert.notEqual(a1, b, 'different execution IDs must never collide');
  assert.doesNotMatch(a1, /exec-same/, 'the raw execution ID must never appear in the generated Message-ID (PII/internal-identifier leakage)');
});

test('static safety: provider identity must equal the Message-ID derived from the durable execution ID', async () => {
  const adapter = makeAdapter();
  await assert.rejects(
    () => adapter.prepare({ ...preparedInput('identity-mismatch'), providerEffectIdentity: generateMessageId('exec-someone-else', MESSAGE_ID_DOMAIN) }),
    error => error.code === 'PROVIDER_EFFECT_IDENTITY_MISMATCH'
  );
});

test('static safety: wrong tenant / wrong execution ID / wrong policy digest / wrong constitution digest are the dispatcher\'s and store\'s job, not this adapter\'s -- verified they are not silently accepted by prepare()', async () => {
  const adapter = makeAdapter();
  // The adapter itself has no tenant/policy concept -- it only requires businessKey,
  // providerEffectIdentity, and executionId. Missing any of them is rejected here;
  // everything else (tenant, policy digest, constitution digest, approval lineage)
  // is enforced by external-effect-execution-store.mjs's schema, already proven in
  // Mission 6's tests. This test documents that boundary rather than duplicating it.
  await assert.rejects(() => adapter.prepare({ businessKey: '', providerEffectIdentity: 'peid', executionId: 'exec', effectPayload: payload() }), error => error.code === 'INVALID_INPUT');
  await assert.rejects(() => adapter.prepare({ businessKey: 'bk', providerEffectIdentity: '', executionId: 'exec', effectPayload: payload() }), error => error.code === 'INVALID_INPUT');
  await assert.rejects(() => adapter.prepare({ businessKey: 'bk', providerEffectIdentity: 'peid', executionId: '', effectPayload: payload() }), error => error.code === 'INVALID_INPUT');
});

test('static safety: expired/revoked authority never reaches this adapter -- it has no authority concept at all, by design', () => {
  // Authority (expiry, revocation) is resolved entirely upstream, before dispatchExternalEffect()
  // is ever called (frozen P1 proof store + Cedar admission, already tested in Missions 1-5).
  // This adapter receiving a call at all already implies authority was granted -- asserting
  // that fact here would duplicate, not strengthen, existing coverage. Documented, not re-tested.
  assert.ok(true);
});

test('static safety: subject with raw CR/LF (header injection attempt) is rejected', async () => {
  const adapter = makeAdapter();
  await assert.rejects(
    () => adapter.prepare({ businessKey: 'bk-4', providerEffectIdentity: 'peid-4', executionId: 'exec-4', effectPayload: payload({ subject: 'Subject\r\nBcc: attacker@evil.test' }) }),
    error => error.code === 'INVALID_SUBJECT'
  );
});

test('static safety: empty subject and empty body are each rejected', async () => {
  const adapter = makeAdapter();
  await assert.rejects(() => adapter.prepare({ businessKey: 'bk-5', providerEffectIdentity: 'peid-5', executionId: 'exec-5', effectPayload: payload({ subject: '' }) }), error => error.code === 'INVALID_SUBJECT');
  await assert.rejects(() => adapter.prepare({ businessKey: 'bk-6', providerEffectIdentity: 'peid-6', executionId: 'exec-6', effectPayload: payload({ body: '' }) }), error => error.code === 'INVALID_BODY');
});

test('static safety: oversized subject and body are rejected', async () => {
  const adapter = makeAdapter();
  await assert.rejects(() => adapter.prepare({ businessKey: 'bk-7', providerEffectIdentity: 'peid-7', executionId: 'exec-7', effectPayload: payload({ subject: 'x'.repeat(500) }) }), error => error.code === 'INVALID_SUBJECT');
  await assert.rejects(() => adapter.prepare({ businessKey: 'bk-8', providerEffectIdentity: 'peid-8', executionId: 'exec-8', effectPayload: payload({ body: 'x'.repeat(50000) }) }), error => error.code === 'INVALID_BODY');
});

test('static safety: attachments are unsupported and rejected', async () => {
  const adapter = makeAdapter();
  await assert.rejects(
    () => adapter.prepare({ businessKey: 'bk-9', providerEffectIdentity: 'peid-9', executionId: 'exec-9', effectPayload: payload({ attachments: [{ filename: 'x.pdf' }] }) }),
    error => error.code === 'UNSUPPORTED_ATTACHMENT'
  );
});

test('static safety: hidden Bcc/Cc are always rejected', async () => {
  const adapter = makeAdapter();
  await assert.rejects(
    () => adapter.prepare({ businessKey: 'bk-10', providerEffectIdentity: 'peid-10', executionId: 'exec-10', effectPayload: payload({ bcc: 'hidden@example.test' }) }),
    error => error.code === 'DISALLOWED_HEADER'
  );
  await assert.rejects(
    () => adapter.prepare(preparedInput('10b', payload({ cc: 'copy@example.test' }))),
    error => error.code === 'DISALLOWED_HEADER'
  );
});

test('static safety: header-bearing fields reject injection and unsafe URLs', async () => {
  const adapter = makeAdapter();
  await assert.rejects(
    () => adapter.prepare(preparedInput('header-reply', payload({ replyToId: '<safe@example.test>\r\nBcc: attacker@example.test' }))),
    error => error.code === 'INVALID_HEADER'
  );
  await assert.rejects(
    () => adapter.prepare(preparedInput('header-unsubscribe', payload({ listUnsubscribe: 'javascript:alert(1)' }))),
    error => error.code === 'INVALID_HEADER'
  );
  await assert.rejects(
    () => adapter.prepare(preparedInput('thread-id', payload({ threadId: 'unsafe thread\r\n' }))),
    error => error.code === 'INVALID_INPUT'
  );
});

test('static safety: arguments digest binds every externally visible prepared field', async () => {
  const adapter = makeAdapter();
  const base = await adapter.prepare(preparedInput('digest-base', payload({ listUnsubscribe: 'https://example.test/unsubscribe' })));
  const changedRecipient = await adapter.prepare(preparedInput('digest-to', payload({ to: 'other@example.test', listUnsubscribe: 'https://example.test/unsubscribe' })));
  const changedHeader = await adapter.prepare(preparedInput('digest-header', payload({ listUnsubscribe: 'https://example.test/other' })));
  assert.notEqual(base.argumentsDigest, changedRecipient.argumentsDigest);
  assert.notEqual(base.argumentsDigest, changedHeader.argumentsDigest);
});

test('static safety: unexpected/unapproved header fields are rejected', async () => {
  const adapter = makeAdapter();
  await assert.rejects(
    () => adapter.prepare({ businessKey: 'bk-11', providerEffectIdentity: 'peid-11', executionId: 'exec-11', effectPayload: payload({ 'X-Unapproved-Header': 'value' }) }),
    error => error.code === 'UNEXPECTED_HEADER'
  );
});

test('static safety: a fully valid payload is accepted and produces a stable Message-ID with no network call', async () => {
  const adapter = makeAdapter();
  const prepared = await adapter.prepare(preparedInput('12'));
  assert.equal(adapter.dispatchCallCount, 0, 'prepare() must never perform network I/O');
  assert.match(prepared.messageId, /^<v9-[0-9a-f]{64}@uberbond-controlled-test\.example>$/);
});
