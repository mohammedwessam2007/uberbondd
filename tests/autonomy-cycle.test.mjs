import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { STAGES, runAutonomyCycle, redactText } from '../src/autonomy-cycle.mjs';
import { createTestGmailInboundReader } from '../src/gmail-inbound.mjs';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-autonomy-cycle-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function baseCfg(overrides = {}) {
  return {
    encryptionKey: 'key',
    inbound: {
      provider: 'test', enabled: true, gmailReadEnabled: true,
      limits: {
        maxPagesPerCycle: 5, maxMessagesPerPage: 25, maxMessageBytes: 2 * 1024 * 1024,
        maxMimeDepth: 10, maxMimePartCount: 200, maxDecodedBodyBytes: 262144,
        maxStageRuntimeMs: 5000, maxCycleRuntimeMs: 30000, maxStageRetries: 3,
        maxOwnerExceptionsPerCycle: 25, maxSummaryBytes: 8192, leaseTtlMs: 60000,
        ...overrides.limits
      },
      ...overrides.inboundOverrides
    }
  };
}

const account = { id: 'acct-1', tokens: {} };

function b64(text) { return Buffer.from(text).toString('base64url'); }
function textMessage(id, headers, bodyText, threadId = 'thread-1') {
  return {
    id, threadId,
    payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })), mimeType: 'text/plain', body: { data: b64(bodyText) } }
  };
}

test('exact stage ordering is fixed and does not include outbound or follow-up processing', () => {
  assert.deepEqual(STAGES, ['poll-inbound', 'classify-and-suppress', 'write-digest']);
  const asText = JSON.stringify(STAGES);
  assert.ok(!asText.includes('outbound'));
  assert.ok(!asText.includes('followup'));
});

test('inbound disabled by default produces a safe skipped stage, not a crash or send', async () => {
  const store = await tempStore();
  const cfg = baseCfg({ inboundOverrides: { enabled: false, gmailReadEnabled: false } });
  const result = await runAutonomyCycle({ store, cfg, runKey: 'run-1', leaseOwner: 'worker-1' });
  assert.equal(result.ok, true);
  assert.equal(result.run.stages['poll-inbound'].status, 'skipped');
  assert.equal(result.digest.counts.messagesFetched, 0);
});

test('enabled but no mailbox reader configured is a safe blocked stage, retryable, not a crash', async () => {
  const store = await tempStore();
  const cfg = baseCfg();
  const result = await runAutonomyCycle({ store, cfg, runKey: 'run-1', leaseOwner: 'worker-1' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stage-not-complete');
  assert.equal(result.stage, 'poll-inbound');
  assert.equal(result.run.stages['poll-inbound'].status, 'blocked');
});

test('end-to-end: a bounce suppresses the recipient and cancels its follow-up', async () => {
  const store = await tempStore();
  await store.add('campaigns', { id: 'c1', approved: true, autoSend: false, createdAt: new Date().toISOString() });
  await store.add('prospects', { id: 'p1', domain: 'example.com', campaignId: 'c1', status: 'sent', threadId: 'thread-1', contact: { email: 'owner@example.com' }, nextFollowupAt: new Date(Date.now() + 86400000).toISOString(), createdAt: new Date().toISOString() });
  const reader = createTestGmailInboundReader({
    messagesByPage: [{ messages: [{ id: 'm1' }] }],
    messages: { m1: textMessage('m1', { from: 'Mail Delivery System <mailer-daemon@example.com>', subject: 'Undelivered Mail Returned to Sender' }, 'bounced') }
  });
  const cfg = baseCfg();
  const result = await runAutonomyCycle({ store, cfg, runKey: 'run-1', leaseOwner: 'worker-1', mailboxReader: reader, accounts: [account] });
  assert.equal(result.ok, true);
  assert.equal(result.digest.counts.bounce, 1);
  const prospect = await store.get('prospects', 'p1');
  assert.equal(prospect.status, 'bounce');
  assert.equal(prospect.nextFollowupAt, null);
  const suppressions = await store.list('suppressions');
  assert.ok(suppressions.some(item => item.value === 'owner@example.com'));
});

test('complaint and unsubscribe also stop future outreach', async () => {
  for (const [subject, expectCategory] of [['This is a formal abuse report', 'complaint'], ['Please unsubscribe me from this list', 'unsubscribe']]) {
    const store = await tempStore();
    await store.add('campaigns', { id: 'c1', approved: true, autoSend: false, createdAt: new Date().toISOString() });
    await store.add('prospects', { id: 'p1', domain: 'example.com', campaignId: 'c1', status: 'sent', threadId: 'thread-1', contact: { email: 'owner@example.com' }, nextFollowupAt: new Date().toISOString(), createdAt: new Date().toISOString() });
    const reader = createTestGmailInboundReader({
      messagesByPage: [{ messages: [{ id: 'm1' }] }],
      messages: { m1: textMessage('m1', { from: 'owner@example.com', subject }, subject) }
    });
    const result = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'run-1', leaseOwner: 'worker-1', mailboxReader: reader, accounts: [account] });
    assert.equal(result.ok, true);
    assert.equal(result.digest.counts[expectCategory], 1, `expected ${expectCategory}`);
    const prospect = await store.get('prospects', 'p1');
    assert.equal(prospect.nextFollowupAt, null);
  }
});

test('a positive/ambiguous reply creates exactly one owner exception and zero sends', async () => {
  const store = await tempStore();
  const reader = createTestGmailInboundReader({
    messagesByPage: [{ messages: [{ id: 'm1' }] }],
    messages: { m1: textMessage('m1', { from: 'lead@example.com', subject: 'Re: your audit', 'in-reply-to': '<x@y>' }, 'tell me more please') }
  });
  const result = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'run-1', leaseOwner: 'worker-1', mailboxReader: reader, accounts: [account] });
  assert.equal(result.ok, true);
  assert.equal(result.digest.ownerExceptions, 1);
  const notifications = await store.list('notifications');
  assert.equal(notifications.filter(n => n.type === 'autonomy_owner_exception').length, 1);
  assert.equal((await store.list('outboundReservations')).length, 0);
  assert.equal((await store.list('messages')).length, 0);
});

test('duplicate reply polling across two separate cycles creates no duplicate notification', async () => {
  const store = await tempStore();
  const message = textMessage('m1', { from: 'lead@example.com', subject: 'Re: hello', 'in-reply-to': '<x@y>' }, 'hi again');
  const fixture = { messagesByPage: [{ messages: [{ id: 'm1' }] }], messages: { m1: message } };

  const first = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'run-1', leaseOwner: 'worker-1', mailboxReader: createTestGmailInboundReader(fixture), accounts: [account] });
  assert.equal(first.ok, true);
  assert.equal(first.digest.ownerExceptions, 1);

  const second = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'run-2', leaseOwner: 'worker-1', mailboxReader: createTestGmailInboundReader(fixture), accounts: [account] });
  assert.equal(second.ok, true);
  assert.equal(second.digest.counts.duplicate, 1);
  assert.equal(second.digest.ownerExceptions, 0);
  const notifications = await store.list('notifications');
  assert.equal(notifications.filter(n => n.type === 'autonomy_owner_exception').length, 1);
});

test('CON: same run key is idempotent -- a second call after completion does not re-run or duplicate effects', async () => {
  const store = await tempStore();
  const first = await runAutonomyCycle({ store, cfg: baseCfg({ inboundOverrides: { enabled: false, gmailReadEnabled: false } }), runKey: 'same-key', leaseOwner: 'worker-1' });
  assert.equal(first.ok, true);
  const second = await runAutonomyCycle({ store, cfg: baseCfg({ inboundOverrides: { enabled: false, gmailReadEnabled: false } }), runKey: 'same-key', leaseOwner: 'worker-2' });
  assert.equal(second.ok, false);
  assert.match(second.reason, /^duplicate-run-key-/);
  const runs = await store.list('autonomyCycleRuns');
  assert.equal(runs.length, 1);
});

test('CON: concurrent cycle starts collapse to exactly one active run', async () => {
  const store = await tempStore();
  const cfg = baseCfg({ inboundOverrides: { enabled: false, gmailReadEnabled: false } });
  const [a, b] = await Promise.all([
    runAutonomyCycle({ store, cfg, runKey: 'run-a', leaseOwner: 'worker-a' }),
    runAutonomyCycle({ store, cfg, runKey: 'run-b', leaseOwner: 'worker-b' })
  ]);
  const outcomes = [a, b];
  const succeeded = outcomes.filter(o => o.ok);
  const rejected = outcomes.filter(o => !o.ok);
  assert.equal(succeeded.length, 1, 'exactly one cycle should have completed');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason, 'cycle-already-active');
});

test('CRS: a crashed cycle resumes without repeating an already-completed stage', async () => {
  const store = await tempStore();
  // 1000ms is the store layer's enforced minimum lease TTL (a deliberate floor against
  // pathologically short leases), so the test waits past that floor rather than assuming its
  // own smaller number takes effect.
  const cfg = baseCfg({ inboundOverrides: { enabled: false, gmailReadEnabled: false }, limits: { leaseTtlMs: 1000 } });
  // Simulate a crash: create a run, mark poll-inbound done, then let its lease expire.
  const created = await store.createAutonomyCycleRun('crashed-run', 'dead-worker', 1000);
  const afterPoll = await store.patchAutonomyCycleRun(created.run.id, 0, {
    stagesPatch: { 'poll-inbound': { status: 'done', result: { skipped: true, reason: 'inbound-disabled', messagesFetched: 0 }, attempts: 0, completedAt: new Date().toISOString() } }
  });
  assert.equal(afterPoll.ok, true);
  await new Promise(resolve => setTimeout(resolve, 1300));

  const resumed = await runAutonomyCycle({ store, cfg, runKey: 'irrelevant-new-key', leaseOwner: 'new-worker' });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.run.runKey, 'crashed-run', 'should have resumed the crashed run, not started a new one');
  assert.equal(resumed.run.leaseOwner, 'new-worker');
  assert.equal(resumed.run.stages['classify-and-suppress'].status, 'done');
  assert.equal(resumed.run.stages['write-digest'].status, 'done');
});

test('CRS/F-05: a stage that keeps failing is retried up to the limit, then the run terminates as failed (not silently skipped)', async () => {
  const store = await tempStore();
  const cfg = baseCfg({ inboundOverrides: { enabled: true, gmailReadEnabled: true }, limits: { maxStageRetries: 2 } });
  const throwingReader = { listMessages: async () => { throw new Error('simulated transient failure'); }, getMessage: async () => ({ data: {} }) };
  // Each call is one attempt; a scheduler is expected to call this repeatedly (same run key,
  // same lease owner) to drive retries forward -- this loop simulates that scheduler.
  let result;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    result = await runAutonomyCycle({ store, cfg, runKey: 'run-1', leaseOwner: 'worker-1', mailboxReader: throwingReader, accounts: [account] });
    if (result.reason === 'stage-retries-exhausted') break;
    assert.equal(result.reason, 'stage-not-complete', `unexpected reason on attempt ${attempt}`);
  }
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stage-retries-exhausted');
  assert.equal(result.run.status, 'failed');
  assert.ok(result.run.finalizedAt);
});

test('digest and per-stage results are count-only and contain no email addresses or URLs', async () => {
  const store = await tempStore();
  const reader = createTestGmailInboundReader({
    messagesByPage: [{ messages: [{ id: 'm1' }] }],
    messages: { m1: textMessage('m1', { from: 'someone@example.com', subject: 'check out http://example.com/secret?token=abc123' }, 'visit http://example.com/x and email me at someone@example.com') }
  });
  const result = await runAutonomyCycle({ store, cfg: baseCfg(), runKey: 'run-1', leaseOwner: 'worker-1', mailboxReader: reader, accounts: [account] });
  assert.equal(result.ok, true);
  const serializedDigest = JSON.stringify(result.digest);
  assert.ok(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serializedDigest), 'digest must contain no email address');
  assert.ok(!/https?:\/\//i.test(serializedDigest), 'digest must contain no URL');
  const stored = await store.list('replies');
  assert.equal(stored[0].body, '', 'stored reply body must be empty, never the raw message text');
  const serializedFrom = JSON.stringify(stored[0].from);
  assert.ok(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serializedFrom), 'stored from header must be redacted');
});

test('redactText strips emails, URLs, and token/secret assignments', () => {
  const input = 'contact me@example.com or visit https://example.com/x?token=abc123 token=zzz secret: yyy';
  const out = redactText(input);
  assert.ok(!out.includes('me@example.com'));
  assert.ok(!out.includes('https://example.com'));
  assert.ok(!/token=abc123/.test(out));
});

test('bounded pagination never fetches more than maxPagesPerCycle * maxMessagesPerPage messages', async () => {
  const store = await tempStore();
  const manyPages = Array.from({ length: 20 }, (_, i) => ({ messages: [{ id: `m${i}` }], nextPageToken: `tok-${i + 1}` }));
  const reader = createTestGmailInboundReader({ messagesByPage: manyPages, messages: {} });
  const cfg = baseCfg({ limits: { maxPagesPerCycle: 3, maxMessagesPerPage: 1 } });
  const result = await runAutonomyCycle({ store, cfg, runKey: 'run-1', leaseOwner: 'worker-1', mailboxReader: reader, accounts: [account] });
  assert.equal(result.ok, true);
  assert.ok(result.digest.counts.messagesFetched <= 3, `expected bounded fetch, got ${result.digest.counts.messagesFetched}`);
});
