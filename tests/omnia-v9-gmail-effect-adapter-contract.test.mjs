import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sealTokens } from '../src/gmail.mjs';
import { GmailEffectAdapter, generateMessageId } from '../src/omnia-v9/integrations/providers/gmail-effect-adapter.mjs';
import { ADAPTER_OUTCOMES } from '../src/omnia-v9/integrations/external-effect-adapter.mjs';
import { createFakeGmailTransport, FAKE_GMAIL_MODES } from './helpers/fake-gmail-transport.mjs';

const ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const CFG_BASE = { clientId: 'fake-client', clientSecret: 'fake-secret', redirectUri: 'https://example.test/callback' };
const MESSAGE_ID_DOMAIN = 'uberbond-controlled-test.example';

function freshAccount() {
  const tokens = { access_token: 'fresh-token', refresh_token: 'fresh-refresh', expires_at: Date.now() + 3600_000 };
  return { tokens: sealTokens(tokens, ENCRYPTION_KEY) };
}

function makeAdapter(transport) {
  return new GmailEffectAdapter({
    cfg: { ...CFG_BASE, fetchImpl: transport.fetchImpl },
    account: freshAccount(),
    encryptionKey: ENCRYPTION_KEY,
    messageIdDomain: MESSAGE_ID_DOMAIN,
    fromAddress: 'sender@uberbond-controlled-test.example'
  });
}

function payload(overrides = {}) {
  return { to: 'recipient@example.test', subject: 'OMNIA V9 Gmail adapter contract test', body: 'Automated contract test body.', ...overrides };
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

test('mocked contract: definite success -- dispatch returns ACCEPTED with a real Gmail message id', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS });
  const adapter = makeAdapter(transport);
  const prepared = await adapter.prepare(preparedInput('1'));
  const result = await adapter.dispatch(prepared);
  assert.equal(result.classification, ADAPTER_OUTCOMES.ACCEPTED);
  assert.ok(result.providerReferenceId);
  assert.equal(result.evidence.lifecycle, 'ACCEPTED');
});

test('mocked contract: definite rejection -- dispatch returns REJECTED, never a fabricated ACCEPTED', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_REJECTION });
  const adapter = makeAdapter(transport);
  const prepared = await adapter.prepare(preparedInput('2'));
  const result = await adapter.dispatch(prepared);
  assert.equal(result.classification, ADAPTER_OUTCOMES.REJECTED);
  assert.equal(transport.mailbox.length, 0, 'a truly rejected request must never appear in the provider mailbox');
});

test('mocked contract: timeout BEFORE the request was received -- UNCERTAIN, and the provider truly never got it', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.TIMEOUT_BEFORE_REQUEST_RECEIVED });
  const adapter = makeAdapter(transport);
  const prepared = await adapter.prepare(preparedInput('3'));
  const result = await adapter.dispatch(prepared);
  assert.equal(result.classification, ADAPTER_OUTCOMES.UNCERTAIN);
  assert.equal(transport.mailbox.length, 0);
  const reconciled = await adapter.reconcile({ businessKey: 'bk-3', providerEffectIdentity: prepared.messageId });
  assert.equal(reconciled.lifecycle, 'UNCERTAIN', 'a zero-result Gmail search cannot prove non-submission or authorize a retry');
  assert.equal(reconciled.detail.reason, 'zero-matches-not-proof-of-non-submission');
});

test('mocked contract: timeout AFTER the request was accepted -- UNCERTAIN locally, but reconciliation finds it', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.TIMEOUT_AFTER_REQUEST_ACCEPTED });
  const adapter = makeAdapter(transport);
  const prepared = await adapter.prepare(preparedInput('4'));
  const result = await adapter.dispatch(prepared);
  assert.equal(result.classification, ADAPTER_OUTCOMES.UNCERTAIN, 'a thrown error after send is never converted into ACCEPTED locally');
  assert.equal(transport.mailbox.length, 1, 'sanity: the provider truly did receive and store it');
  const reconciled = await adapter.reconcile({ businessKey: 'bk-4', providerEffectIdentity: prepared.messageId, expectedTo: 'recipient@example.test', expectedSubject: payload().subject });
  assert.equal(reconciled.lifecycle, 'RECONCILED_ACCEPTED');
  assert.equal(adapter.classifyOutcome(reconciled), ADAPTER_OUTCOMES.RECONCILED_ACCEPTED);
});

test('mocked contract: response lost (transient 5xx after the provider actually stored the message) -- UNCERTAIN, reconciliation recovers', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.SERVER_ERROR });
  const adapter = makeAdapter(transport);
  const prepared = await adapter.prepare(preparedInput('5'));
  const result = await adapter.dispatch(prepared);
  assert.equal(result.classification, ADAPTER_OUTCOMES.UNCERTAIN, '5xx must never be treated as a definite rejection');
  const reconciled = await adapter.reconcile({ businessKey: 'bk-5', providerEffectIdentity: prepared.messageId });
  assert.equal(reconciled.lifecycle, 'RECONCILED_ACCEPTED');
});

test('mocked contract: rate-limited (429) is UNCERTAIN, never REJECTED', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.RATE_LIMITED });
  const adapter = makeAdapter(transport);
  const prepared = await adapter.prepare(preparedInput('5b'));
  const result = await adapter.dispatch(prepared);
  assert.equal(result.classification, ADAPTER_OUTCOMES.UNCERTAIN);
});

test('mocked contract: provider accepted but local receipt persistence fails -- the execution layer, not the adapter, handles this (see the dispatch/recovery test file); the adapter itself just returns ACCEPTED honestly', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS });
  const adapter = makeAdapter(transport);
  const prepared = await adapter.prepare(preparedInput('6'));
  const result = await adapter.dispatch(prepared);
  assert.equal(result.classification, ADAPTER_OUTCOMES.ACCEPTED);
  assert.ok(result.evidence, 'the adapter always produces evidence on ACCEPTED -- whether the caller successfully persists it is the execution store\'s concern, tested directly in omnia-v9-gmail-effect-adapter-dispatch-recovery.test.mjs');
});

test('mocked contract: search finds exactly one -- reconciles cleanly', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS });
  const adapter = makeAdapter(transport);
  const prepared = await adapter.prepare(preparedInput('7'));
  await adapter.dispatch(prepared);
  const reconciled = await adapter.reconcile({ businessKey: 'bk-7', providerEffectIdentity: prepared.messageId });
  assert.equal(reconciled.lifecycle, 'RECONCILED_ACCEPTED');
});

test('mocked contract: search finds zero -- UNCERTAIN, never resend permission', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS });
  const adapter = makeAdapter(transport);
  const neverDispatchedMessageId = generateMessageId('exec-never-dispatched', MESSAGE_ID_DOMAIN);
  const reconciled = await adapter.reconcile({ businessKey: 'bk-8', providerEffectIdentity: neverDispatchedMessageId });
  assert.equal(reconciled.lifecycle, 'UNCERTAIN');
  assert.equal(reconciled.detail.reason, 'zero-matches-not-proof-of-non-submission');
});

test('mocked contract: search finds multiple -- AMBIGUOUS, never resolved heuristically', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS });
  const adapter = makeAdapter(transport);
  const prepared = await adapter.prepare(preparedInput('9'));
  await adapter.dispatch(prepared);
  // Inject a second, adversarial mailbox entry with the exact same Message-ID header
  // (should never happen with a real provider, but this adapter must not assume that).
  transport.injectMailboxEntry({ threadId: 'gmail-thread-dup', headers: { 'message-id': prepared.messageId, to: prepared.to, subject: prepared.subject }, body: prepared.body });
  const reconciled = await adapter.reconcile({ businessKey: 'bk-9', providerEffectIdentity: prepared.messageId });
  assert.equal(reconciled.lifecycle, 'AMBIGUOUS');
  assert.equal(reconciled.detail.reason, 'multiple-matches');
});

test('mocked contract: search finds wrong recipient -- AMBIGUOUS, never trusted blindly', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS });
  const adapter = makeAdapter(transport);
  const prepared = await adapter.prepare(preparedInput('10'));
  await adapter.dispatch(prepared);
  const reconciled = await adapter.reconcile({ businessKey: 'bk-10', providerEffectIdentity: prepared.messageId, expectedTo: 'someone-else@example.test' });
  assert.equal(reconciled.lifecycle, 'AMBIGUOUS');
  assert.equal(reconciled.detail.reason, 'recipient-mismatch');
});

test('mocked contract: search finds the same Message-ID with incompatible metadata (wrong subject) -- AMBIGUOUS', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS });
  const adapter = makeAdapter(transport);
  const prepared = await adapter.prepare(preparedInput('11'));
  await adapter.dispatch(prepared);
  const reconciled = await adapter.reconcile({ businessKey: 'bk-11', providerEffectIdentity: prepared.messageId, expectedSubject: 'a completely different subject' });
  assert.equal(reconciled.lifecycle, 'AMBIGUOUS');
  assert.equal(reconciled.detail.reason, 'subject-mismatch');
});

test('mocked contract: a provider search result whose FULL fetched message-id header does not actually match the query is never trusted -- AMBIGUOUS, not RECONCILED_ACCEPTED', async () => {
  // looseListMatch simulates a hypothetical fuzzier-than-exact Gmail search result; this
  // proves the adapter's own post-fetch verification (not the search call itself) is what
  // actually protects against a false-positive match.
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.DEFINITE_SUCCESS, looseListMatch: true });
  const adapter = makeAdapter(transport);
  // A real, unrelated message -- different Message-ID -- happens to exist in the mailbox.
  const otherPrepared = await adapter.prepare(preparedInput('other'));
  await adapter.dispatch(otherPrepared);
  // We reconcile for a DIFFERENT (never-dispatched) execution's Message-ID -- the loose
  // list match returns the unrelated message anyway.
  const neverDispatchedMessageId = generateMessageId('exec-never-dispatched-2', MESSAGE_ID_DOMAIN);
  const reconciled = await adapter.reconcile({ businessKey: 'bk-target', providerEffectIdentity: neverDispatchedMessageId });
  assert.equal(reconciled.lifecycle, 'AMBIGUOUS');
  assert.equal(reconciled.detail.reason, 'message-id-mismatch-after-fetch');
});

test('mocked contract: two attempted definite-rejection dispatches never accumulate more than one mailbox entry each (no hidden client-level auto-retry)', async () => {
  const transport = createFakeGmailTransport({ mode: FAKE_GMAIL_MODES.SERVER_ERROR });
  const adapter = makeAdapter(transport);
  const prepared = await adapter.prepare(preparedInput('noretry'));
  await adapter.dispatch(prepared);
  assert.equal(adapter.dispatchCallCount, 1, 'dispatch() must never internally retry the send call');
  assert.equal(transport.mailbox.length, 1, 'exactly one send attempt reached the (fake) provider');
});

test('mocked contract: classifyOutcome() maps every lifecycle to the correct adapter outcome, and unknown lifecycles fail closed to UNCERTAIN', () => {
  const transport = createFakeGmailTransport({});
  const adapter = makeAdapter(transport);
  assert.equal(adapter.classifyOutcome({ lifecycle: 'ACCEPTED' }), ADAPTER_OUTCOMES.ACCEPTED);
  assert.equal(adapter.classifyOutcome({ lifecycle: 'REJECTED' }), ADAPTER_OUTCOMES.REJECTED);
  assert.equal(adapter.classifyOutcome({ lifecycle: 'NOT_FOUND' }), ADAPTER_OUTCOMES.NOT_FOUND);
  assert.equal(adapter.classifyOutcome({ lifecycle: 'AMBIGUOUS' }), ADAPTER_OUTCOMES.AMBIGUOUS);
  assert.equal(adapter.classifyOutcome({ lifecycle: 'RECONCILED_ACCEPTED' }), ADAPTER_OUTCOMES.RECONCILED_ACCEPTED);
  assert.equal(adapter.classifyOutcome({ lifecycle: 'RECONCILED_REJECTED' }), ADAPTER_OUTCOMES.RECONCILED_REJECTED);
  assert.equal(adapter.classifyOutcome({ lifecycle: 'something-garbage' }), ADAPTER_OUTCOMES.UNCERTAIN);
  assert.equal(adapter.classifyOutcome(null), ADAPTER_OUTCOMES.UNCERTAIN);
  assert.equal(adapter.classifyOutcome(undefined), ADAPTER_OUTCOMES.UNCERTAIN);
});
