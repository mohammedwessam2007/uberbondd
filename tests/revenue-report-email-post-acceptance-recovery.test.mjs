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
  return { store, config, pipeline, lead: await store.get('leads', lead.id), prospect: await store.get('prospects', prospect.id) };
}

test('provider success followed by local persistence failure must never permit an automatic duplicate report email', async () => {
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
      throw new Error('simulated crash after provider acceptance before local commit');
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
    'a durable pre-send/in-flight fence must survive provider success even when later local persistence fails'
  );

  const restartedProcess = new RevenueEngine(store, config, pipeline, { sendEmail: provider });
  const retry = await restartedProcess.sendReportEmail(durableLeadAfterCrash, prospect);
  assert.equal(retry.sent, false, 'restart must fail closed while the first provider outcome is unresolved locally');
  assert.equal(providerAccepts, 1, 'restart must not blindly repeat an email the provider already accepted');
});
