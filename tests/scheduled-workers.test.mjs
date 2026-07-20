import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.mjs';
import { DurableQueue } from '../src/queue.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';
import {
  SCHEDULED_WORKER_MODES,
  runScheduledWorker,
  safeWorkerLogger,
  scheduledWorkerPlan,
  scheduledWorkerPreflight
} from '../src/scheduled-workers.mjs';

const queueConfig = {
  queue: {
    concurrency: 1, maxAttempts: 3, retryBaseMs: 1000, retryMaxMs: 5000,
    lockTimeoutMs: 1000, jobHeartbeatMs: 1000, maxRuntimeMs: 5000
  }
};

async function queueFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-scheduled-worker-'));
  const store = new Store(directory);
  await store.init();
  return { store, queue: new DurableQueue(store, queueConfig, { error() {} }) };
}

function runScheduledEntrypoint({ cwd, env }) {
  const script = fileURLToPath(new URL('../scripts/run-acquisition-worker.mjs', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test('scheduled worker plans are bounded and never include an outbound-send mode', () => {
  assert.deepEqual(SCHEDULED_WORKER_MODES, [
    'discovery', 'crawl-audit', 'draft-generation', 'reply-sync',
    'followup-scheduler', 'payment-reconciliation', 'stale-recovery'
  ]);
  assert(!SCHEDULED_WORKER_MODES.includes('outbound'));
  assert.equal(scheduledWorkerPlan('crawl-audit', { batchSize: 999 }).limit, 10);
  assert.equal(scheduledWorkerPlan('draft-generation', { batchSize: 0 }).limit, 1);
  assert.equal(scheduledWorkerPlan('stale-recovery').jobType, 'stale.recover');
  assert.throws(() => scheduledWorkerPlan('send-email'), /Unsupported scheduled worker mode/);
});

test('scheduled worker preflight fails closed while treating missing owner authentication as a blocker', () => {
  const base = {
    storeBackend: 'postgres', databaseUrl: 'postgres://configured', baseUrl: 'https://private.example',
    unsubscribeSecret: 'x'.repeat(32), encryptionKey: 'a'.repeat(64),
    outbound: { provider: 'test', enabled: false, dryRun: true, liveSendApproved: false },
    google: { clientId: '', clientSecret: '', allowNetwork: false }
  };
  assert.equal(scheduledWorkerPreflight(base, 'discovery').ok, true);
  assert.equal(scheduledWorkerPreflight({ ...base, databaseUrl: '' }, 'discovery').blockedReason, 'database-authentication-required');
  assert.equal(scheduledWorkerPreflight({ ...base, unsubscribeSecret: '' }, 'draft-generation').blockedReason, 'draft-safety-configuration-required');
  assert.equal(scheduledWorkerPreflight(base, 'reply-sync').blockedReason, 'gmail-authentication-required');
  const gmail = { ...base, outbound: { ...base.outbound, provider: 'gmail' }, google: { clientId: 'id', clientSecret: 'secret', allowNetwork: true } };
  assert.equal(scheduledWorkerPreflight(gmail, 'reply-sync').ok, true);
  assert.throws(() => scheduledWorkerPreflight({ ...base, outbound: { ...base.outbound, enabled: true } }, 'discovery'), /remain disabled/);
  assert.throws(() => scheduledWorkerPreflight({ ...base, storeBackend: 'json' }, 'discovery'), /STORE_BACKEND=postgres/);
});

test('scheduled entrypoint exits inactive without initialization until workers are explicitly activated', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-schedule-gate-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const result = await runScheduledEntrypoint({
    cwd: directory,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      GITHUB_EVENT_NAME: 'schedule',
      ACQUISITION_WORKERS_ACTIVE: 'false',
      WORKER_MODE: 'discovery'
    }
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.signal, null);
  const summary = JSON.parse(await fs.readFile(path.join(directory, 'worker-summary.json'), 'utf8'));
  assert.deepEqual(summary, {
    mode: 'discovery',
    status: 'inactive',
    blockedReason: 'workers-not-activated',
    liveOutboundEnabled: false
  });
  assert.deepEqual(JSON.parse(result.stdout.trim()), summary);
});

test('one-shot scheduled workers use type-scoped durable claims and idempotent run keys', async () => {
  const { store, queue } = await queueFixture();
  const unrelated = await queue.enqueue('discovery.run', { scheduled: true });
  let reconciliations = 0;
  const handlers = {
    'payment.reconcile': async () => { throw new Error('wrong handler'); },
    'payments.reconcile': async payload => { reconciliations += 1; return { considered: payload.limit }; }
  };
  const first = await runScheduledWorker({
    mode: 'payment-reconciliation', batchSize: 4, runKey: 'run-101', queue, handlers, store
  });
  assert.equal(first.claimed, 1);
  assert.equal(first.jobStatus, 'completed');
  assert.equal(first.liveOutboundEnabled, false);
  assert.equal(reconciliations, 1);
  assert.equal((await store.get('jobs', unrelated.id)).status, 'queued');

  const second = await runScheduledWorker({
    mode: 'payment-reconciliation', batchSize: 4, runKey: 'run-101', queue, handlers, store
  });
  assert.equal(second.claimed, 0);
  assert.equal(second.jobStatus, 'completed');
  assert.equal(reconciliations, 1);
});

test('scheduled logs and summaries omit error messages, URLs, and email addresses', () => {
  const output = [];
  const logger = safeWorkerLogger({
    log: value => output.push(value), warn: value => output.push(value), error: value => output.push(value)
  });
  logger.error('queue job failed', new Error('owner@example.com https://secret.example/?token=abc'));
  assert.equal(output.length, 1);
  assert.doesNotMatch(output[0], /owner@|https:|token=|secret\.example/);
  assert.match(output[0], /"code":"Error"/);
});

test('scheduled handlers expose bounded draft, reply, follow-up, payment, and recovery jobs', async () => {
  const calls = [];
  const handlers = createJobHandlers({
    store: {
      recoverStaleJobs: async () => ({ recovered: 2, deadLettered: 0 }),
      recoverStaleOutboundReservations: async () => ({ recovered: 1, attempted: 1 }),
      deleteExpiredArtifacts: async () => 3
    },
    pipeline: {
      runBatch: async () => ({}),
      processDraftQueue: async limit => { calls.push(['drafts', limit]); return { processed: 1 }; },
      pollReplies: async options => { calls.push(['replies', options.messageLimit]); return 2; },
      processOutboundQueue: async () => ({}),
      processFollowups: async limit => { calls.push(['followups', limit]); return 1; },
      recoverStaleProspects: async () => 4
    },
    revenue: {
      reconcilePendingPayments: async limit => { calls.push(['payments', limit]); return { recovered: 1 }; },
      processMonitoring: async () => 0
    },
    discoveryRunner: { run: async () => ({}) }
  });
  await handlers['drafts.process']({ limit: 6 });
  await handlers['replies.poll']({ messageLimit: 7 });
  await handlers['followups.process']({ limit: 8 });
  await handlers['payments.reconcile']({ limit: 9 });
  assert.deepEqual(await handlers['stale.recover']({ includeArtifacts: true }), {
    jobs: { recovered: 2, deadLettered: 0 }, prospects: 4, reservations: { recovered: 1, attempted: 1 }, artifacts: 3
  });
  assert.deepEqual(calls, [['drafts', 6], ['replies', 7], ['followups', 8], ['payments', 9]]);
});

test('draft worker composes from stored evidence without crawling or sending', async () => {
  const { store } = await queueFixture();
  const issue = {
    code: 'no-cta', title: 'No obvious booking action was detected',
    evidenceUrl: 'https://clinic.example/appointments',
    evidenceExcerpt: 'Appointments are available by telephone during opening hours.',
    implication: 'A ready visitor may not know the next step.', service: 'Conversion design',
    confidence: 0.94, severity: 3, safeForOutreach: true
  };
  const contact = {
    email: 'office@clinic.example', firstName: 'Sara', position: 'Practice Manager',
    published: true, verified: 'unverified',
    evidence: [{
      email: 'office@clinic.example', sourceUrl: 'https://clinic.example/contact',
      sourceType: 'visible_text', evidenceExcerpt: 'Contact office@clinic.example', published: true
    }]
  };
  await store.add('campaigns', {
    id: 'campaign-draft', approved: true, enabled: true, autoSend: false, dryRun: true,
    minimumProspectScore: 50, dailyDraftCap: 10,
    offer: 'Evidence-backed implementation sprint',
    callToAction: 'Would a concise implementation outline be useful?',
    subjectVariants: ['{{businessName}} booking path'], messageVariants: ['evidence-first'],
    prohibitedClaims: ['guaranteed revenue']
  });
  await store.add('prospects', {
    id: 'prospect-draft', campaignId: 'campaign-draft', company: 'Atlas Dental',
    website: 'https://clinic.example', domain: 'clinic.example', niche: 'dentist', country: 'AE',
    status: 'research-complete', score: { total: 88, tier: 'A', breakdown: {}, explanation: [] },
    issue, audit: [issue], contact, contacts: { selected: contact, all: [contact] }, inbox: 'A',
    crawl: { domain: 'clinic.example', pages: [], errors: [], summary: { pagesVisited: 1 }, completedAt: '2026-07-18T01:00:00.000Z' },
    crawlQuality: { credible: true, status: 'complete' },
    draftApproval: { status: 'blocked', reason: 'queued-for-draft-worker' },
    createdAt: '2026-07-18T00:00:00.000Z'
  });
  const pipeline = new Pipeline(store, {
    baseUrl: 'https://private.example', unsubscribeSecret: 'u'.repeat(40), hunterKey: '',
    ai: { provider: 'rules' }, sender: { name: 'Mohamed', company: 'UberBond', address: 'Cairo, Egypt' },
    crawl: { concurrency: 1 }, outbound: { provider: 'test', enabled: false, dryRun: true }
  }, { clock: () => new Date('2026-07-18T02:00:00.000Z') });
  const result = await pipeline.processDraftQueue(5);
  const prospect = await store.get('prospects', 'prospect-draft');
  assert.deepEqual(result, { considered: 1, processed: 1, ready: 1, blocked: 0 });
  assert.equal(prospect.status, 'ready');
  assert.equal(prospect.draftApproval.status, 'pending');
  assert.equal(prospect.outreach.selected.quality.passed, true);
  assert.match(prospect.draft, /software-assisted review/i);
  assert.equal((await store.list('messages')).length, 0);
});

test('payment reconciliation resumes only verified processing records', async () => {
  const applied = [];
  const engine = Object.create(RevenueEngine.prototype);
  engine.store = {
    list: async key => key === 'orders' ? [
      {
        id: 'recover-me', offerId: 'offer-1', provider: 'test', providerEventId: 'test:event-1',
        providerReference: 'event-1', eventName: 'simulated_verified_payment', paymentState: 'paid',
        verificationSource: 'test-simulation', verified: true, processingStatus: 'processing', testMode: true,
        occurredAt: '2026-07-18T00:00:00.000Z'
      },
      { id: 'ignore-unverified', verified: false, processingStatus: 'processing' },
      { id: 'ignore-complete', verified: true, processingStatus: 'completed' }
    ] : [],
    log: async () => {}
  };
  engine.applyOfferPayment = async (offerId, payment) => applied.push({ offerId, payment });
  const result = await engine.reconcilePendingPayments(10);
  assert.deepEqual(result, { considered: 1, recovered: 1, failed: 0 });
  assert.equal(applied.length, 1);
  assert.equal(applied[0].offerId, 'offer-1');
  assert.equal(applied[0].payment.source, 'test-simulation');
});

test('Actions policy uses isolated jobs, safe secrets, bounded timeouts, and no send worker', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/acquisition-workers.yml', import.meta.url), 'utf8');
  for (const mode of SCHEDULED_WORKER_MODES) assert.match(workflow, new RegExp(`WORKER_MODE: ${mode}`));
  for (const group of ['discovery', 'crawl-audit', 'draft-generation', 'reply-sync', 'followup-scheduler', 'payment-reconciliation', 'stale-recovery', 'deterministic-tests']) {
    assert.match(workflow, new RegExp(`group: acquisition-${group}`));
  }
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /DATABASE_URL: \$\{\{ secrets\.ACQUISITION_DATABASE_URL \}\}/);
  assert.match(workflow, /OUTBOUND_ENABLED: 'false'/);
  assert.match(workflow, /OUTBOUND_DRY_RUN: 'true'/);
  assert.match(workflow, /OUTBOUND_LIVE_SEND_APPROVED: 'false'/);
  assert.match(workflow, /ACQUISITION_WORKERS_ACTIVE: \$\{\{ vars\.ACQUISITION_WORKERS_ACTIVE \}\}/);
  assert.match(workflow, /GITHUB_EVENT_NAME: \$\{\{ github\.event_name \}\}/);
  assert.match(workflow, /- cron: '19,49 \* \* \* \*'/);
  assert.match(workflow, /reply-sync:\n    if: \$\{\{ .*github\.event\.schedule == '19,49 \* \* \* \*'.* \}\}/s);
  assert.equal((workflow.match(/vars\.ACQUISITION_WORKERS_ACTIVE == 'true'/g) || []).length, 8);
  assert.doesNotMatch(workflow, /WORKER_MODE: outbound|outbound\.process|LITE_DATABASE_URL/);
  assert.doesNotMatch(workflow, /LEMONSQUEEZY_WEBHOOK_SECRET|OUTBOUND_LIVE_SEND_APPROVED: \$\{\{/);
  assert.match(workflow, /path: worker-summary\.json/);
  assert.match(workflow, /npm audit --audit-level=low/);
});
