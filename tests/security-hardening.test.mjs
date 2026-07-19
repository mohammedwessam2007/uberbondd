import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  adminRequestAuthorized,
  assertPublicIpAddress,
  chromiumHostResolverRules,
  parsePublicUrl,
  PRIVATE_REFERRER_POLICY,
  redactSensitiveText,
  safeErrorDetails
} from '../src/security.mjs';
import { csvEscape } from '../src/utils.mjs';
import { PostgresStore, Store } from '../src/store.mjs';
import { DurableQueue } from '../src/queue.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { validateStartupConfig } from '../src/config.mjs';

async function tempStore(prefix = 'uberbond-security-') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function tempPostgresStore() {
  const db = new PGlite();
  const migrations = (await fs.readdir(new URL('../migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort();
  for (const migration of migrations) await db.exec(await fs.readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  const client = { query: (...args) => db.query(...args), release() {} };
  const pool = { query: (...args) => db.query(...args), connect: async () => client };
  return { db, store: new PostgresStore({ pool }) };
}

const queueConfig = {
  version: 'security-test',
  queue: {
    concurrency: 1, maxAttempts: 2, retryBaseMs: 1000, retryMaxMs: 1000,
    lockTimeoutMs: 1000, jobHeartbeatMs: 1000, workerHeartbeatMs: 1000,
    workerStaleMs: 5000, maxRuntimeMs: 5000, pollMs: 10
  }
};

test('admin authentication is Bearer-only and never accepts a URL credential', () => {
  const token = 'owner-admin-token-that-is-long-enough';
  assert.equal(adminRequestAuthorized({ headers: {}, url: `/api/prospects?token=${token}` }, token), false);
  assert.equal(adminRequestAuthorized({ headers: { authorization: `Bearer ${token}` } }, token), true);
  assert.equal(adminRequestAuthorized({ headers: { authorization: `bearer ${token}` } }, token), false);
  assert.equal(adminRequestAuthorized({ headers: { authorization: `Bearer ${token} trailing` } }, token), false);
  assert.equal(adminRequestAuthorized({ headers: {} }, ''), true);
  assert.equal(PRIVATE_REFERRER_POLICY, 'no-referrer');
});

test('operational redaction removes PII, credentials, database URLs, and capability tokens', () => {
  const message = 'owner@example.com postgres://user:password@db.example/app Bearer abc.def.ghi https://app.example/report.html?token=report-secret&code=oauth-code /api/public/report/private-token';
  const redacted = redactSensitiveText(message);
  for (const secret of ['owner@example.com', 'user:password', 'abc.def.ghi', 'report-secret', 'oauth-code', 'private-token']) {
    assert.equal(redacted.includes(secret), false, `leaked ${secret}`);
  }
  const details = safeErrorDetails(new Error(message));
  assert.equal(JSON.stringify(details).includes('owner@example.com'), false);
  assert.equal('stack' in details, false);
});

test('public address and Chromium DNS pinning helpers fail closed', () => {
  assert.throws(() => assertPublicIpAddress('169.254.169.254'), /private or reserved/);
  assert.throws(() => assertPublicIpAddress('not-an-address'), /unavailable/);
  assert.equal(assertPublicIpAddress('8.8.8.8'), '8.8.8.8');
  const rules = chromiumHostResolverRules([
    { hostname: 'example.com', address: '93.184.216.34' },
    { hostname: 'metadata.example', address: '169.254.169.254' }
  ]);
  assert.match(rules, /MAP example\.com 93\.184\.216\.34/);
  assert.doesNotMatch(rules, /169\.254\.169\.254/);
  assert.throws(() => parsePublicUrl('javascript:alert(1)'), /Invalid website URL|HTTP and HTTPS/);
  assert.throws(() => parsePublicUrl('http://127.0.0.1/private'), /Private and reserved/);
  assert.throws(() => parsePublicUrl('https://user:password@example.com'), /credentials/);
});

test('CSV exports neutralize formula injection without changing normal cells', () => {
  assert.equal(csvEscape('Clinic name'), 'Clinic name');
  assert.equal(csvEscape('=HYPERLINK("https://evil.example")'), '"\'=HYPERLINK(""https://evil.example"")"');
  assert.equal(csvEscape('+cmd'), "'+cmd");
  assert.equal(csvEscape('-10'), "'-10");
  assert.equal(csvEscape('@SUM(A1:A2)'), "'@SUM(A1:A2)");
  assert.equal(csvEscape('\t=cmd'), "'\t=cmd");
});

test('queue leases fence stale workers from completing or failing reclaimed jobs', async () => {
  const store = await tempStore('uberbond-fence-');
  const queue = new DurableQueue(store, queueConfig, { error() {} });
  const queued = await queue.enqueue('security.work', {}, { maxAttempts: 3 });
  const [oldLease] = await store.claimJobs('old-worker', 1, 1000);
  await store.patch('jobs', queued.id, {
    lockedAt: new Date(Date.now() - 10000).toISOString(),
    heartbeatAt: new Date(Date.now() - 10000).toISOString()
  });
  assert.equal((await store.recoverStaleJobs(1000)).recovered, 1);
  const [newLease] = await store.claimJobs('new-worker', 1, 1000);
  assert.equal(await store.completeJob(queued.id, { unsafe: true }, { workerId: 'old-worker', lockedAt: oldLease.lockedAt }), null);
  assert.equal(await store.failJob(queued.id, new Error('unsafe stale failure'), { workerId: 'old-worker', lockedAt: oldLease.lockedAt }), null);
  assert.equal((await store.get('jobs', queued.id)).lockedBy, 'new-worker');
  const completed = await store.completeJob(queued.id, { safe: true }, { workerId: 'new-worker', lockedAt: newLease.lockedAt });
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.result, { safe: true });
});

test('queue failures persist and emit only redacted operational details', async () => {
  const store = await tempStore('uberbond-redaction-');
  const emitted = [];
  const queue = new DurableQueue(store, queueConfig, { error: (...values) => emitted.push(values) });
  const job = await queue.enqueue('security.fail', {}, { maxAttempts: 1 });
  await queue.runOnce({
    'security.fail': async () => {
      throw new Error('owner@example.com token=top-secret postgres://user:pass@db.example/app');
    }
  });
  await store.log('nested-redaction', { oauthToken: 'oauth-secret-value', nested: { email: 'second@example.com' } });
  const serialized = JSON.stringify({ job: await store.get('jobs', job.id), audit: await store.list('auditLog'), emitted });
  for (const secret of ['owner@example.com', 'second@example.com', 'top-secret', 'oauth-secret-value', 'user:pass']) assert.equal(serialized.includes(secret), false);
  assert.match((await store.get('jobs', job.id)).lastError, /redacted/);
});

async function seedDispatch(store, suffix = 'one') {
  const campaign = {
    id: `campaign-${suffix}`, approved: true, enabled: true, autoSend: true,
    dryRun: true, liveSendApproved: false
  };
  const prospect = {
    id: `prospect-${suffix}`, campaignId: campaign.id, company: 'Clinic',
    website: `https://${suffix}.example`, domain: `${suffix}.example`, status: 'ready', inbox: 'A',
    draft: 'Approved evidence-backed body', subject: 'Approved subject',
    contact: { email: `info@${suffix}.example` }
  };
  await store.add('campaigns', campaign);
  await store.add('prospects', prospect);
  const reserved = await store.reserveOutboundSend({
    idempotencyKey: `initial:${prospect.id}`, prospectId: prospect.id, campaignId: campaign.id,
    inbox: 'A', recipientEmail: prospect.contact.email, dailyCap: 10, hourlyCap: 10,
    minGapSeconds: 0, now: '2026-07-18T10:00:00.000Z'
  });
  assert.equal(reserved.ok, true);
  return { campaign, prospect, reservation: reserved.reservation };
}

const dryRunGate = {
  authorization: 'auto', simulation: true, systemProvider: 'test',
  systemEnabled: false, systemDryRun: true, systemLiveSendApproved: false,
  draftBody: 'Approved evidence-backed body', draftSubject: 'Approved subject'
};

test('the final dispatch fence rechecks suppression, replies, and the global kill switch', async () => {
  const suppressionStore = await tempStore('uberbond-dispatch-suppression-');
  const suppressed = await seedDispatch(suppressionStore, 'suppressed');
  await suppressionStore.suppressOutbound({ values: [suppressed.prospect.contact.email], reason: 'unsubscribe' });
  const suppressionResult = await suppressionStore.beginOutboundDispatch(suppressed.reservation.id, dryRunGate);
  assert.equal(suppressionResult.ok, false);
  assert.equal(suppressionResult.reason, 'suppressed');
  assert.equal((await suppressionStore.get('outboundReservations', suppressed.reservation.id)).status, 'cancelled');

  const replyStore = await tempStore('uberbond-dispatch-reply-');
  const replied = await seedDispatch(replyStore, 'replied');
  await replyStore.recordReplyAndStop({
    id: 'reply-one', prospectId: replied.prospect.id, inbox: 'A', gmailId: 'gmail-reply-one', processingStatus: 'processing'
  }, { status: 'replied', repliedAt: '2026-07-18T10:00:01.000Z' });
  const replyResult = await replyStore.beginOutboundDispatch(replied.reservation.id, dryRunGate);
  assert.equal(replyResult.ok, false);
  assert.equal(replyResult.reason, 'reply-received');
  assert.equal((await replyStore.get('prospects', replied.prospect.id)).nextFollowupAt, null);

  const pausedStore = await tempStore('uberbond-dispatch-pause-');
  const paused = await seedDispatch(pausedStore, 'paused');
  await pausedStore.setOutboundPaused(true, 'owner kill switch');
  const pauseResult = await pausedStore.beginOutboundDispatch(paused.reservation.id, dryRunGate);
  assert.equal(pauseResult.ok, false);
  assert.equal(pauseResult.reason, 'global-outbound-paused');
});

test('a valid dry-run reservation transitions once through the final dispatch fence', async () => {
  const store = await tempStore('uberbond-dispatch-success-');
  const seeded = await seedDispatch(store, 'safe');
  const first = await store.beginOutboundDispatch(seeded.reservation.id, dryRunGate);
  assert.equal(first.ok, true);
  assert.equal(first.reservation.status, 'dispatching');
  const second = await store.beginOutboundDispatch(seeded.reservation.id, dryRunGate);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'reservation-dispatching');
});

test('the final dispatch fence rejects draft edits and cross-campaign reassignment', async () => {
  const draftStore = await tempStore('uberbond-dispatch-draft-');
  const edited = await seedDispatch(draftStore, 'draft-edit');
  await draftStore.patch('prospects', edited.prospect.id, { draft: 'Edited after reservation' });
  assert.equal((await draftStore.beginOutboundDispatch(edited.reservation.id, dryRunGate)).reason, 'draft-invalidated');

  const campaignStore = await tempStore('uberbond-dispatch-campaign-');
  const moved = await seedDispatch(campaignStore, 'campaign-move');
  await campaignStore.add('campaigns', { id: 'other-campaign', approved: true, enabled: true, autoSend: true, dryRun: true });
  await campaignStore.patch('prospects', moved.prospect.id, { campaignId: 'other-campaign' });
  assert.equal((await campaignStore.beginOutboundDispatch(moved.reservation.id, dryRunGate)).reason, 'reservation-campaign-mismatch');
});

test('send finalization records delivery without overwriting an in-flight unsubscribe', async () => {
  const store = await tempStore('uberbond-dispatch-finalize-');
  const seeded = await seedDispatch(store, 'finalize');
  assert.equal((await store.beginOutboundDispatch(seeded.reservation.id, dryRunGate)).ok, true);
  await store.suppressOutbound({
    prospectId: seeded.prospect.id,
    values: [seeded.prospect.contact.email, seeded.prospect.domain],
    reason: 'one-click-unsubscribe', status: 'unsubscribed',
    prospectPatch: { unsubscribedAt: '2026-07-18T10:00:01.000Z' }
  });
  const finalized = await store.finalizeOutboundDispatch(seeded.reservation.id, 'sent', { sentAt: '2026-07-18T10:00:02.000Z' }, {
    status: 'sent', sentAt: '2026-07-18T10:00:02.000Z', nextFollowupAt: '2026-07-23T10:00:00.000Z'
  });
  assert.equal(finalized.stopReason, 'suppressed');
  assert.equal(finalized.reservation.status, 'sent');
  assert.equal(finalized.prospect.status, 'unsubscribed');
  assert.equal(finalized.prospect.nextFollowupAt, null);
  assert.equal(finalized.prospect.sentAt, '2026-07-18T10:00:02.000Z');
});

test('PostgreSQL enforces the same queue lease and final dispatch fences', async () => {
    const { db, store } = await tempPostgresStore();
  try {
    await assert.rejects(store.list('prospects', { filters: { 'id) OR TRUE--': 'x' } }), /Unsupported filter/);
    await store.add('jobs', {
      id: 'pg-job', type: 'security.work', queue: 'security.work', status: 'queued', priority: 0, attempts: 0,
      maxAttempts: 3, runAt: '2026-07-18T09:00:00.000Z', scheduledAt: '2026-07-18T09:00:00.000Z', createdAt: '2026-07-18T09:00:00.000Z'
    });
    const [oldLease] = await store.claimJobs('pg-old-worker', 1, 1000);
    await store.pool.query("UPDATE jobs SET locked_at=now()-interval '10 seconds',heartbeat_at=now()-interval '10 seconds',data=data||jsonb_build_object('lockedAt',(now()-interval '10 seconds')::text,'heartbeatAt',(now()-interval '10 seconds')::text) WHERE id=$1", ['pg-job']);
    assert.equal((await store.recoverStaleJobs(1000)).recovered, 1);
    const [newLease] = await store.claimJobs('pg-new-worker', 1, 1000);
    assert.equal(await store.completeJob('pg-job', { unsafe: true }, { workerId: 'pg-old-worker', lockedAt: oldLease.lockedAt }), null);
    assert.equal((await store.get('jobs', 'pg-job')).lockedBy, 'pg-new-worker');
    assert.equal((await store.completeJob('pg-job', { safe: true }, { workerId: 'pg-new-worker', lockedAt: newLease.lockedAt })).status, 'completed');

    const seeded = await seedDispatch(store, 'postgres');
    await store.suppressOutbound({ values: [seeded.prospect.contact.email], reason: 'unsubscribe' });
    const blocked = await store.beginOutboundDispatch(seeded.reservation.id, dryRunGate);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'suppressed');
    assert.equal((await store.get('outboundReservations', seeded.reservation.id)).status, 'cancelled');

    const inFlight = await seedDispatch(store, 'postgres-finalize');
    assert.equal((await store.beginOutboundDispatch(inFlight.reservation.id, dryRunGate)).ok, true);
    await store.suppressOutbound({ prospectId: inFlight.prospect.id, values: [inFlight.prospect.contact.email], reason: 'unsubscribe', status: 'unsubscribed' });
    const finalized = await store.finalizeOutboundDispatch(inFlight.reservation.id, 'sent', { sentAt: '2026-07-18T10:00:02.000Z' }, { status: 'sent', nextFollowupAt: '2026-07-23T10:00:00.000Z' });
    assert.equal(finalized.stopReason, 'suppressed');
    assert.equal(finalized.prospect.status, 'unsubscribed');
    assert.equal(finalized.prospect.nextFollowupAt, null);
  } finally { await db.close(); }
});

test('public report capabilities are never stored in plaintext and hostile website schemes are rejected', async () => {
  const store = await tempStore('uberbond-report-token-');
  const engine = new RevenueEngine(store, {
    baseUrl: 'https://audit.example', encryptionKey: '',
    revenue: { publicIntake: true, publicRateLimitPerHour: 5 },
    sender: { name: 'UberBond' }, google: {}
  }, { running: true, paused: false });
  const created = await engine.createLead({ company: 'Safe Clinic', website: 'safe.example', email: 'owner@safe.example' }, 'test-ip');
  const lead = await store.get('leads', created.leadId);
  assert.match(created.statusUrl, /report\.html#token=/);
  assert.equal(created.statusUrl.includes('?token='), false);
  assert.equal(lead.accessTokenSecret, null);
  assert.notEqual(lead.accessTokenHash, created.accessToken);
  assert.equal(JSON.stringify(lead).includes(created.accessToken), false);
  await assert.rejects(engine.createLead({ company: 'Bad', website: 'javascript:alert(1)', email: 'owner@bad.example' }, 'test-ip'), /Invalid website URL|HTTP and HTTPS/);
  await assert.rejects(engine.createLead({ company: 'Bad', website: 'http://127.0.0.1/private', email: 'owner@bad.example' }, 'test-ip'), /Private and reserved/);
});

test('private report transport keeps capability values out of request URLs', async () => {
  const [serverSource, reportSource, revenueSource] = await Promise.all([
    fs.readFile(new URL('../server.mjs', import.meta.url), 'utf8'),
    fs.readFile(new URL('../public/report.js', import.meta.url), 'utf8'),
    fs.readFile(new URL('../src/revenue.mjs', import.meta.url), 'utf8')
  ]);
  assert.equal(serverSource.includes("pathname.startsWith('/api/public/report/')"), false);
  assert.equal(reportSource.includes('/api/public/report/${'), false);
  assert.match(reportSource, /location\.hash/);
  assert.match(reportSource, /method:'POST'/);
  assert.match(revenueSource, /report\.html#token=/);
});

test('production automatic report delivery requires encrypted capability storage', () => {
  const base = {
    nodeEnv: 'production', processRole: 'web', storeBackend: 'postgres', databaseUrl: 'postgres://example',
    adminToken: 'x'.repeat(32), baseUrl: 'https://app.example', google: { clientId: '', clientSecret: '' },
    encryptionKey: '', outbound: { provider: 'test' }, revenue: { autoEmailReports: true }
  };
  assert.throws(() => validateStartupConfig(base), /Automatic report delivery/);
  assert.equal(validateStartupConfig({ ...base, encryptionKey: 'a'.repeat(64) }), true);
});
