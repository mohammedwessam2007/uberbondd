import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';

function cfg(dir) {
  return {
    baseUrl: 'https://audit.test', dataDir: dir, encryptionKey: 'a'.repeat(64),
    revenue: {
      publicIntake: true, publicRateLimitPerHour: 4, freeFindings: 1,
      fullAuditPrice: 49, strategyAuditPrice: 299, monitoringPrice: 99,
      implementationFrom: 1000, bookingUrl: '', reportDeliveryInbox: 'B',
      autoEmailReports: true, paymentProvider: 'links',
      fullAuditCheckoutUrl: 'https://shop.test/buy/full',
      strategyAuditCheckoutUrl: 'https://shop.test/buy/strategy',
      monitoringCheckoutUrl: 'https://shop.test/buy/watch',
      lemonWebhookSecret: 'secret', allowTestUnlock: true,
      monitoringIntervalDays: 30, monitoringBatchSize: 10
    },
    google: {}, sender: { name: 'Mohamed' }
  };
}

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-report-recovery-'));
  const store = new Store(dir);
  await store.init();
  const config = cfg(dir);
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const engine = new RevenueEngine(store, config, pipeline);
  const created = await engine.createLead({
    company: 'Acme', website: 'https://example.com', email: 'owner@example.com',
    industry: 'SaaS', consent: true
  }, '1.2.3.4');
  const lead = await store.get('leads', created.leadId);
  const prospect = await store.get('prospects', lead.prospectId);
  await store.patch('prospects', prospect.id, {
    status: 'research-complete', score: { total: 72, tier: 'B' }, audit: [],
    dossier: { screenshots: [], riskFlags: [] }
  });
  await store.add('accounts', {
    id: 'acct-B', slot: config.revenue.reportDeliveryInbox, connected: true,
    email: 'reports@uberbond.example', tokens: 'old'
  });
  return {
    store, config, pipeline,
    lead: await store.get('leads', lead.id),
    prospect: await store.get('prospects', prospect.id)
  };
}

test('provider success followed by account persistence failure must not permit automatic duplicate report email after restart', async () => {
  const { store, config, pipeline, lead, prospect } = await fixture();
  let providerAccepts = 0;
  const provider = async () => {
    providerAccepts += 1;
    return {
      data: { id: `gmail-${providerAccepts}`, threadId: 'thread-1' },
      tokens: { access_token: 'rotated-token' }
    };
  };

  const firstProcess = new RevenueEngine(store, config, pipeline, { sendEmail: provider });
  const realUpsert = store.upsert.bind(store);
  let injectFailure = true;
  store.upsert = async (...args) => {
    if (injectFailure && args[0] === 'accounts') {
      injectFailure = false;
      throw new Error('simulated crash after provider acceptance before account commit');
    }
    return realUpsert(...args);
  };

  await assert.rejects(
    firstProcess.sendReportEmail(lead, prospect),
    /simulated crash after provider acceptance/
  );
  assert.equal(providerAccepts, 1, 'the provider accepted exactly one irreversible email before the crash');

  store.upsert = realUpsert;
  const durableLeadAfterCrash = await store.get('leads', lead.id);
  assert.ok(
    ['uncertain', 'dispatching'].includes(durableLeadAfterCrash.reportEmailAttemptStatus),
    'a durable pre-provider or in-flight fence must survive a later account persistence failure'
  );

  const restartedProcess = new RevenueEngine(store, config, pipeline, { sendEmail: provider });
  const retry = await restartedProcess.sendReportEmail(durableLeadAfterCrash, prospect);
  assert.equal(retry.sent, false, 'restart must fail closed while the first attempt is unresolved');
  assert.equal(providerAccepts, 1, 'restart must not blindly repeat an email already accepted by the provider');
});

test('provider success followed by sent-marker persistence failure must not permit automatic duplicate after restart', async () => {
  const { store, config, pipeline, lead, prospect } = await fixture();
  let providerAccepts = 0;
  const provider = async () => {
    providerAccepts += 1;
    return { data: { id: `gmail-${providerAccepts}`, threadId: 'thread-lead-patch' } };
  };

  const firstProcess = new RevenueEngine(store, config, pipeline, { sendEmail: provider });
  const realPatch = store.patch.bind(store);
  let injectFailure = true;
  store.patch = async (collection, recordId, patch) => {
    if (
      injectFailure &&
      collection === 'leads' &&
      recordId === lead.id &&
      patch?.reportEmailAttemptStatus === 'sent'
    ) {
      injectFailure = false;
      throw new Error('simulated crash after provider acceptance before sent marker');
    }
    return realPatch(collection, recordId, patch);
  };

  await assert.rejects(
    firstProcess.sendReportEmail(lead, prospect),
    /simulated crash after provider acceptance before sent marker/
  );
  assert.equal(providerAccepts, 1, 'the provider accepted exactly once before the sent-marker crash');

  store.patch = realPatch;
  const durableLeadAfterCrash = await store.get('leads', lead.id);
  assert.ok(
    ['uncertain', 'dispatching'].includes(durableLeadAfterCrash.reportEmailAttemptStatus),
    'provider success with a failed sent-marker commit must remain durably unresolved'
  );

  const restartedProcess = new RevenueEngine(store, config, pipeline, { sendEmail: provider });
  const retry = await restartedProcess.sendReportEmail(durableLeadAfterCrash, prospect);
  assert.equal(retry.sent, false, 'restart must not infer that no provider effect happened');
  assert.equal(providerAccepts, 1, 'restart must not resend after the provider already accepted the email');
});

test('two concurrent report-email callers with the same stale lead snapshot must produce at most one provider acceptance', async () => {
  const { store, config, pipeline, lead, prospect } = await fixture();
  let providerAccepts = 0;
  let releaseProvider;
  const providerBarrier = new Promise(resolve => { releaseProvider = resolve; });
  const provider = async () => {
    providerAccepts += 1;
    await providerBarrier;
    return { data: { id: `gmail-${providerAccepts}`, threadId: 'thread-race' } };
  };
  const engineA = new RevenueEngine(store, config, pipeline, { sendEmail: provider });
  const engineB = new RevenueEngine(store, config, pipeline, { sendEmail: provider });

  const attemptA = engineA.sendReportEmail({ ...lead }, prospect);
  const attemptB = engineB.sendReportEmail({ ...lead }, prospect);
  await new Promise(resolve => setTimeout(resolve, 10));
  releaseProvider();
  await Promise.allSettled([attemptA, attemptB]);

  assert.equal(providerAccepts, 1, 'durable pre-provider admission must serialize duplicate concurrent sends');
});