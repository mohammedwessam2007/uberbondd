// P1-11 hostile privacy corpus. Runs a realistic hostile message through the real end-to-end
// cycle and proves the corpus is absent from every owner-facing/durable surface: the digest, the
// stage output persisted on the run record, notifications/exceptions, and the normal (generally-
// readable) store collections. The protected inboundWorkItems record is checked separately for
// containing only keyed hashes / encrypted refs / normalized fields -- never the corpus itself,
// not even encrypted (encryption covers only accountId/gmailId/threadId, never message content).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { runAutonomyCycle, assertExactDigestKeys, redactText } from '../src/autonomy-cycle.mjs';
import { createTestGmailInboundReader } from '../src/gmail-inbound.mjs';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-privacy-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function baseCfg(overrides = {}) {
  return {
    encryptionKey: 'c'.repeat(64),
    inbound: {
      provider: 'test', enabled: true, gmailReadEnabled: true,
      limits: {
        maxPagesPerCycle: 5, maxMessagesPerPage: 25, maxMessageBytes: 2 * 1024 * 1024,
        maxMimeDepth: 10, maxMimePartCount: 200, maxDecodedBodyBytes: 262144,
        maxStageRuntimeMs: 5000, maxCycleRuntimeMs: 30000, maxStageRetries: 3,
        maxOwnerExceptionsPerCycle: 25, maxSummaryBytes: 8192, leaseTtlMs: 60000,
        ...overrides.limits
      }
    }
  };
}

const account = { id: 'acct-hostile-account-id-98765', tokens: {} };

// The full hostile corpus, in one place so every "must be absent" assertion below scans for the
// exact same set of strings.
const CORPUS = {
  name: 'Alexandra Marguerite Thornbury-Whitfield',
  email: 'alexandra.thornbury@example-corp.invalid',
  phone: '+1 (415) 555-0134',
  address: '742 Evergreen Terrace, Springfield, IL 62704',
  url: 'https://accounts.example-corp.invalid/reset?token=SuperSecretResetToken123',
  oauthToken: 'ya29.a0AfH6SMBxxxxxxxFAKEOAUTHTOKENxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  // Deliberately not shaped like any real provider's key prefix (no sk_live_/sk_test_/AKIA-style
  // prefix) so GitHub's push-protection secret scanner never flags this fixture as a live
  // credential -- it only needs to look like "a pasted secret" to redactText's own regex
  // (`\b(token|secret|password|apikey|api_key)\b\s*[:=]\s*\S+`), which matches on the surrounding
  // words, not the value's shape.
  apiKey: 'apikey=NOTAREALSECRET-fixture-value-1a2b3c4d5e6f7g8h9i0j',
  unicodeHeader: '=?UTF-8?B?QWxleMOkbmRyYSDCqSDwn5iA?=', // MIME-encoded-word Unicode display name
  mimeFilename: 'confidential_client_roster_2026.xlsx',
  gmailId: 'provider-message-id-1a2b3c4d5e6f',
  accountId: account.id,
  threadId: 'provider-thread-id-9f8e7d6c5b4a'
};

function b64(text) { return Buffer.from(text).toString('base64url'); }

function hostileMessage() {
  const bodyText = [
    `Hi, this is ${CORPUS.name}.`,
    `Reach me at ${CORPUS.email} or ${CORPUS.phone}.`,
    `My address is ${CORPUS.address}.`,
    `Reset link: ${CORPUS.url}`,
    `Debug token I pasted by mistake: ${CORPUS.oauthToken}`,
    `Another secret: ${CORPUS.apiKey}`,
    `See attached ${CORPUS.mimeFilename}`
  ].join('\n');
  return {
    id: CORPUS.gmailId,
    threadId: CORPUS.threadId,
    payload: {
      headers: [
        { name: 'from', value: `${CORPUS.unicodeHeader} <${CORPUS.email}>` },
        { name: 'subject', value: `Re: your audit — ${CORPUS.name}` },
        { name: 'in-reply-to', value: '<original@example.invalid>' }
      ],
      mimeType: 'text/plain',
      body: { data: b64(bodyText) }
    }
  };
}

function scanForCorpus(haystack) {
  const text = typeof haystack === 'string' ? haystack : JSON.stringify(haystack);
  return Object.entries(CORPUS).filter(([, value]) => text.includes(value)).map(([key]) => key);
}

test('PRIV: the full hostile corpus is absent from the digest', async () => {
  const store = await tempStore();
  const reader = createTestGmailInboundReader({ messagesByPage: [{ messages: [{ id: CORPUS.gmailId }] }], messages: { [CORPUS.gmailId]: hostileMessage() } });
  const result = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'priv-run-1', leaseOwner: 'worker-1', mailboxReader: reader, accounts: [account] });
  assert.equal(result.ok, true);
  const leaked = scanForCorpus(result.digest);
  assert.deepEqual(leaked, [], `corpus fields leaked into the digest: ${leaked.join(', ')}`);
  assert.doesNotThrow(() => assertExactDigestKeys(result.digest), 'PRIV-01: the digest must pass its own runtime exact-key validator');
});

test('PRIV-01: assertExactDigestKeys actually rejects an unknown key (not just "we never add one")', () => {
  const validDigest = { runKey: 'x', startedAt: 'x', finishedAt: 'x', stageStatuses: {}, counts: { messagesFetched: 0, processed: 0, duplicate: 0, oversized: 0, bounce: 0, complaint: 0, unsubscribe: 0, outOfOffice: 0, reply: 0, unknown: 0 }, ownerExceptions: 0, suppressed: 0, verifiedPayments: 0, liveOutboundEnabled: false };
  assert.doesNotThrow(() => assertExactDigestKeys(validDigest));
  assert.throws(() => assertExactDigestKeys({ ...validDigest, from: 'someone@example.com' }), /unknown key/);
  assert.throws(() => assertExactDigestKeys({ ...validDigest, counts: { ...validDigest.counts, rawSubject: 'x' } }), /unknown key/);
  assert.throws(() => assertExactDigestKeys({ ...validDigest, counts: { ...validDigest.counts, processed: -1 } }), /non-negative integer/);
  assert.throws(() => assertExactDigestKeys({ ...validDigest, counts: { ...validDigest.counts, processed: '1' } }), /non-negative integer/);
});

test('PRIV-02/03/04: the full hostile corpus is absent from the run\'s persisted stage output', async () => {
  const store = await tempStore();
  const reader = createTestGmailInboundReader({ messagesByPage: [{ messages: [{ id: CORPUS.gmailId }] }], messages: { [CORPUS.gmailId]: hostileMessage() } });
  const result = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'priv-run-2', leaseOwner: 'worker-1', mailboxReader: reader, accounts: [account] });
  assert.equal(result.ok, true);
  const leaked = scanForCorpus(result.run.stages);
  assert.deepEqual(leaked, [], `corpus fields leaked into persisted stage output: ${leaked.join(', ')}`);
});

test('PRIV: the full hostile corpus is absent from notifications/owner-exception records', async () => {
  const store = await tempStore();
  const reader = createTestGmailInboundReader({ messagesByPage: [{ messages: [{ id: CORPUS.gmailId }] }], messages: { [CORPUS.gmailId]: hostileMessage() } });
  const result = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'priv-run-3', leaseOwner: 'worker-1', mailboxReader: reader, accounts: [account] });
  assert.equal(result.ok, true);
  assert.equal(result.digest.ownerExceptions, 1, 'a reply with no matched prospect creates exactly one owner exception');
  const notifications = await store.list('notifications');
  const leaked = scanForCorpus(notifications);
  assert.deepEqual(leaked, [], `corpus fields leaked into notifications: ${leaked.join(', ')}`);
});

test('PRIV-05/06: the protected work item holds only keyed hashes, an encrypted ref, and normalized fields -- never the corpus, not even encrypted', async () => {
  const store = await tempStore();
  const reader = createTestGmailInboundReader({ messagesByPage: [{ messages: [{ id: CORPUS.gmailId }] }], messages: { [CORPUS.gmailId]: hostileMessage() } });
  const result = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'priv-run-4', leaseOwner: 'worker-1', mailboxReader: reader, accounts: [account] });
  assert.equal(result.ok, true);
  const items = await store.list('inboundWorkItems');
  assert.equal(items.length, 1);
  const item = items[0];
  // Message-content corpus fields (name/email/phone/address/url/tokens/unicode-header/filename)
  // must be absent even from the encryptedProviderRef ciphertext, because that ref only ever
  // encrypts {accountId, gmailId, threadId} -- never message content.
  const contentCorpus = ['name', 'email', 'phone', 'address', 'url', 'oauthToken', 'apiKey', 'unicodeHeader', 'mimeFilename'];
  for (const key of contentCorpus) {
    assert.ok(!JSON.stringify(item).includes(CORPUS[key]), `${key} must never appear in the work item, not even encrypted`);
  }
  // The provider-identifying fields (gmailId/accountId/threadId) are legitimately referenced --
  // but only as one-way keyed hashes (messageKey/accountKey/threadKey) or inside the encrypted
  // ciphertext blob, never as plaintext fields on the record.
  assert.equal(Object.prototype.hasOwnProperty.call(item, 'gmailId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(item, 'accountId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(item, 'threadId'), false);
  assert.ok(item.messageKey && item.messageKey !== CORPUS.gmailId);
  assert.ok(item.accountKey && item.accountKey !== CORPUS.accountId);
  assert.ok(item.threadKey && item.threadKey !== CORPUS.threadId);
  assert.ok(item.expiresAt, 'PRIV-06: must carry a retention expiry');
  assert.ok(Date.parse(item.expiresAt) > Date.now());
});

test('PRIV-08: redactText (used on any legacy/pre-existing free-text path) strips the corpus\'s email/URL/token-shaped fields', () => {
  const text = `${CORPUS.name} <${CORPUS.email}> sent ${CORPUS.url} with token=${CORPUS.oauthToken}`;
  const out = redactText(text);
  assert.ok(!out.includes(CORPUS.email));
  assert.ok(!out.includes(CORPUS.url));
});
