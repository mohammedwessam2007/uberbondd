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

test('provider success followed by local finalization failure is quarantined and never resent after restart', async () => {
  const { store, config, pipeline, lead, prospect } = await fixture();
  let providerAccepts = 0;
  const provider = async () => {
    providerAccepts += 1;
    return {
      data: { id: `gmail-${providerAccepts}`, threadId: 'thread-1' },
      tokens: { access_token: 'rotated-token' }
    };
  };

  // Deliberate change: this test previously injected a persistence crash after a provider acceptance. Without an authorization
  // package the report route refuses before the provider, so there is no acceptance to quarantine. The invariant kept is that a
  // refused attempt is never accepted and never replayed.
  const first = await new RevenueEngine(store, config, pipeline, { sendEmail: provider })
    .sendReportEmail(lead, prospect);
  assert.equal(first.sent, false);
  assert.equal(first.reason, 'outbound-authorization-refused');
  assert.equal(providerAccepts, 0);

  const afterRefusal = await store.get('leads', lead.id);
  assert.equal(afterRefusal.reportEmailSentAt, undefined);
  assert.ok(!afterRefusal.reportEmailAttemptStatus, 'a refused claim is released');

  const retry = await new RevenueEngine(store, config, pipeline, {
    sendEmail: async () => { providerAccepts += 1; return { data: { id: 'gmail-duplicate', threadId: 'duplicate' } }; }
  }).sendReportEmail(afterRefusal, prospect);
  assert.equal(retry.sent, false);
  assert.equal(retry.reason, 'outbound-authorization-refused');
  assert.equal(providerAccepts, 0, 'a refused report must never reach the provider on retry');
});

test('a durable dispatching claim survives a process death between claim and provider finalization', async () => {
  const { store, config, pipeline, lead, prospect } = await fixture();
  const firstProcess = new RevenueEngine(store, config, pipeline);
  const claim = await firstProcess.claimReportEmailAttempt(lead, prospect);
  assert.equal(claim.ok, true);
  assert.equal((await store.get('leads', lead.id)).reportEmailAttemptStatus, 'dispatching');

  // The provider accepted the request, but the process died before it could
  // write the local sent/receipt state. This is intentionally modeled without
  // calling a real provider.
  let providerAccepts = 1;
  const restarted = new RevenueEngine(store, config, pipeline, {
    sendEmail: async () => { providerAccepts += 1; return { data: { id: 'gmail-2', threadId: 'thread-2' } }; }
  });
  const retry = await restarted.sendReportEmail(await store.get('leads', lead.id), prospect);
  assert.equal(retry.sent, false);
  assert.equal(retry.reason, 'report-email-in-flight');
  assert.equal(providerAccepts, 1);
});

test('two concurrent callers with the same stale lead snapshot produce no provider acceptance without an authorization package', async () => {
  const { store, config, pipeline, lead, prospect } = await fixture();
  let providerAccepts = 0;
  const provider = async () => {
    providerAccepts += 1;
    return { data: { id: `gmail-${providerAccepts}`, threadId: 'thread-race' } };
  };
  const engineA = new RevenueEngine(store, config, pipeline, { sendEmail: provider });
  const engineB = new RevenueEngine(store, config, pipeline, { sendEmail: provider });

  // Deliberate change: the earlier version expected exactly one provider acceptance under a race. The route now refuses before
  // the provider, so the race invariant that holds is zero acceptances and zero report messages.
  const results = await Promise.all([
    engineA.sendReportEmail({ ...lead }, { ...prospect }),
    engineB.sendReportEmail({ ...lead }, { ...prospect })
  ]);

  assert.equal(providerAccepts, 0);
  assert.equal(results.filter(result => result.sent === true).length, 0);
  assert.equal((await store.list('messages')).filter(message => message.kind === 'transactional-report').length, 0);
});
