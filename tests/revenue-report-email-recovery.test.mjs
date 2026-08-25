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

  const realTransaction = store.transaction.bind(store);
  let transactions = 0;
  store.transaction = async fn => {
    transactions += 1;
    if (transactions !== 2) return realTransaction(fn);
    return realTransaction(async tx => {
      const injected = new Proxy(tx, {
        get(target, property, receiver) {
          if (property === 'upsert') {
            return async (...args) => {
              await target.upsert(...args);
              throw new Error('simulated account persistence crash after provider acceptance');
            };
          }
          return Reflect.get(target, property, receiver);
        }
      });
      return fn(injected);
    });
  };

  const first = await new RevenueEngine(store, config, pipeline, { sendEmail: provider })
    .sendReportEmail(lead, prospect);
  assert.equal(first.sent, false);
  assert.equal(first.uncertain, true);
  assert.equal(first.reason, 'post-provider-persistence-failed');
  assert.equal(providerAccepts, 1);

  const afterCrash = await store.get('leads', lead.id);
  assert.equal(afterCrash.reportEmailSentAt, undefined);
  assert.equal(afterCrash.reportEmailAttemptStatus, 'uncertain');

  const retry = await new RevenueEngine(store, config, pipeline, {
    sendEmail: async () => { providerAccepts += 1; return { data: { id: 'gmail-duplicate', threadId: 'duplicate' } }; }
  }).sendReportEmail(afterCrash, prospect);
  assert.equal(retry.sent, false);
  assert.equal(retry.reason, 'unresolved-prior-attempt-requires-owner-review');
  assert.equal(providerAccepts, 1, 'an accepted provider effect must never be blindly replayed');
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

test('two concurrent callers with the same stale lead snapshot produce at most one provider acceptance', async () => {
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

  const attemptA = engineA.sendReportEmail({ ...lead }, { ...prospect });
  const attemptB = engineB.sendReportEmail({ ...lead }, { ...prospect });
  await new Promise(resolve => setTimeout(resolve, 10));
  releaseProvider();
  const results = await Promise.all([attemptA, attemptB]);

  assert.equal(providerAccepts, 1);
  assert.equal(results.filter(result => result.sent === true).length, 1);
  assert.equal((await store.list('messages')).filter(message => message.kind === 'transactional-report').length, 1);
});
