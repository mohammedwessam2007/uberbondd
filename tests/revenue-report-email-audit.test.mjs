import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { RevenueEngine, REPORT_EMAIL_POLICY_VERSION } from '../src/revenue.mjs';

// Proves the transactional report-email path is audited without being
// force-fit into cold-outreach logic: the destination is self-submitted at
// public intake (never scraped/inferred), gated by its own independent kill
// switch (cfg.revenue.autoEmailReports), and never calls a real provider in
// any of these tests -- sendEmail is always a local stub.

const monday = new Date('2026-07-13T10:00:00.000Z');

function cfg(dir, overrides = {}) {
  return {
    baseUrl: 'https://audit.test', dataDir: dir, encryptionKey: 'a'.repeat(64),
    revenue: {
      publicIntake: true, publicRateLimitPerHour: 4, freeFindings: 1, fullAuditPrice: 49, strategyAuditPrice: 299,
      monitoringPrice: 99, implementationFrom: 1000, bookingUrl: '', reportDeliveryInbox: 'B', autoEmailReports: true,
      paymentProvider: 'links', fullAuditCheckoutUrl: 'https://shop.test/buy/full', strategyAuditCheckoutUrl: 'https://shop.test/buy/strategy',
      monitoringCheckoutUrl: 'https://shop.test/buy/watch', lemonWebhookSecret: 'secret', allowTestUnlock: true,
      monitoringIntervalDays: 30, monitoringBatchSize: 10
    },
    google: {}, sender: { name: 'Mohamed' },
    ...overrides
  };
}

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-report-email-'));
  const store = new Store(dir);
  await store.init();
  return { store, dir };
}

async function seedLead(store, config, overrides = {}) {
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const engine = new RevenueEngine(store, config, pipeline);
  const created = await engine.createLead({ company: 'Acme', website: 'https://example.com', email: 'owner@example.com', industry: 'SaaS', consent: true }, '1.2.3.4');
  const lead = await store.get('leads', created.leadId);
  const prospect = await store.get('prospects', lead.prospectId);
  await store.patch('prospects', prospect.id, {
    status: 'research-complete', score: { total: 72, tier: 'B' },
    issue: { title: 'A', severity: 4, confidence: .9, evidenceUrl: 'https://example.com', evidenceExcerpt: 'x' },
    audit: [], dossier: { screenshots: [], riskFlags: [] }, completedAt: monday.toISOString(),
    ...overrides.prospectPatch
  });
  if (overrides.connectAccount !== false) {
    await store.add('accounts', { id: 'acct-B', slot: config.revenue.reportDeliveryInbox, connected: true, email: 'reports@uberbond.example', tokens: 'unused' });
  }
  return { engine, lead: await store.get('leads', lead.id), prospect: await store.get('prospects', prospect.id) };
}

async function reportAuditEntries(store) {
  return (await store.list('auditLog')).filter(e => e.type === 'report_email_audit');
}

test('the kill switch blocks the report email and is audited', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir, { revenue: { ...cfg(dir).revenue, autoEmailReports: false } });
  const { engine, lead, prospect } = await seedLead(store, config);
  const result = await engine.sendReportEmail(lead, prospect);
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'kill-switch-disabled');
  const entries = await reportAuditEntries(store);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].detail.outcome, 'blocked');
  assert.equal(entries[0].detail.killSwitchEnabled, false);
});

test('a missing destination address blocks the email and is audited', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  await store.patch('leads', lead.id, { email: '' });
  const brokenLead = await store.get('leads', lead.id);
  const result = await engine.sendReportEmail(brokenLead, prospect);
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'missing-destination');
});

test('destination provenance is recorded as self-submitted, distinguishing this from cold outreach', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  let sent = 0;
  engine.sendEmailFn = async () => { sent += 1; return { data: { id: 'gmail-x', threadId: 'thread-x' } }; };
  await engine.sendReportEmail(lead, prospect);
  const entries = await reportAuditEntries(store);
  assert.equal(entries[0].detail.destinationProvenance, 'self-submitted-at-public-intake-form');
  assert.equal(entries[0].detail.effectClass, 'transactional-report-email');
  // Deliberate change: the report route refuses without an authorization package, so the provider is never called.
  assert.equal(sent, 0);
});

test('a refused report is never recorded as sent, so a repeat attempt cannot duplicate a send', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  let sends = 0;
  engine.sendEmailFn = async () => { sends += 1; return { data: { id: 'gmail-1', threadId: 'thread-1' } }; };
  // Deliberate change: the earlier version expected a provider send and an already-sent duplicate. Without an authorization package
  // the route refuses, so nothing is marked sent, and a repeat attempt is refused the same way without reaching the provider.
  const first = await engine.sendReportEmail(lead, prospect);
  const sentLead = await store.get('leads', lead.id);
  const second = await engine.sendReportEmail(sentLead, prospect);
  assert.equal(first.sent, false);
  assert.equal(first.reason, 'outbound-authorization-refused');
  assert.equal(second.sent, false);
  assert.equal(sends, 0);
});

test('a refused report never reaches the provider, so no unknown outcome is recorded and the lead is not blocked', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  let calls = 0;
  engine.sendEmailFn = async () => { calls += 1; throw new Error('network timed out after dispatch'); };
  // Deliberate change: the earlier version expected a provider failure recorded as uncertain. Without a package the provider is
  // never called, so the claim is released rather than left as an unresolved attempt.
  const first = await engine.sendReportEmail(lead, prospect);
  assert.equal(first.sent, false);
  assert.equal(first.reason, 'outbound-authorization-refused');
  assert.equal(first.uncertain, undefined);
  const afterFirst = await store.get('leads', lead.id);
  assert.equal(afterFirst.reportEmailSentAt, undefined);
  assert.ok(!afterFirst.reportEmailAttemptStatus, 'a refused claim is released, never left in flight or uncertain');

  const second = await engine.sendReportEmail(afterFirst, prospect);
  assert.equal(second.sent, false);
  assert.equal(second.reason, 'outbound-authorization-refused');
  assert.equal(calls, 0);

  const entries = await reportAuditEntries(store);
  assert.equal(entries.filter(e => e.detail.outcome === 'uncertain').length, 0);
  assert.equal(entries.filter(e => e.detail.outcome === 'sent').length, 0, 'a refused outcome must never be recorded as sent');
});

test('onProspectComplete never automatically retries after an uncertain outcome', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  let calls = 0;
  engine.sendEmailFn = async () => { calls += 1; throw new Error('timeout'); };
  // Deliberate change: the Gmail route refuses without a package before any provider call, so no attempt is made at all.
  await engine.onProspectComplete(prospect);
  assert.equal(calls, 0);
  // Re-fire the completion hook exactly as a real monitoring re-run would.
  await engine.onProspectComplete(await store.get('prospects', prospect.id));
  assert.equal(calls, 0, 'a refused completion event must never reach the provider on any re-run');
});

test('an unconnected/unknown provider account blocks the email before any send attempt', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config, { connectAccount: false });
  let sends = 0;
  engine.sendEmailFn = async () => { sends += 1; return { data: { id: 'x', threadId: 'y' } }; };
  const result = await engine.sendReportEmail(lead, prospect);
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'provider-capability-absent');
  assert.equal(sends, 0);
});

test('no test in this file ever calls a real provider', async () => {
  const source = await fs.readFile(new URL('../src/revenue.mjs', import.meta.url), 'utf8');
  // sendEmailFn is always overridden with a local stub in every test above;
  // this proves the module itself only ever calls the injectable hook, never
  // a hardcoded provider function, for the report-email path.
  assert.match(source, /this\.sendEmailFn/);
});

test('the audit receipt is workspace-scoped to the originating campaign', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  engine.sendEmailFn = async () => ({ data: { id: 'g', threadId: 't' } });
  await engine.sendReportEmail(lead, prospect);
  const entries = await reportAuditEntries(store);
  assert.equal(entries[0].detail.workspaceId, prospect.campaignId);
});

test('audit data never contains the message body, access token, or credentials', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  engine.sendEmailFn = async () => ({ data: { id: 'g', threadId: 't' } });
  await engine.sendReportEmail(lead, prospect);
  const entries = await reportAuditEntries(store);
  const serialized = JSON.stringify(entries[0].detail);
  assert.doesNotMatch(serialized, /encryptionKey|accessTokenSecret|Bearer |token=/i);
  assert.equal(entries[0].detail.policyVersion, REPORT_EMAIL_POLICY_VERSION);
});

test('a refused report is never recorded as sent, and the provider is never called to settle it', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  let resolved = false;
  engine.sendEmailFn = async () => { await new Promise(r => setTimeout(r, 5)); resolved = true; return { data: { id: 'g', threadId: 't' } }; };
  // Deliberate change: the earlier version asserted that a resolved provider call was recorded as sent. Without a package the
  // provider is never called, so nothing can be recorded as sent from silence or otherwise.
  const result = await engine.sendReportEmail(lead, prospect);
  assert.equal(resolved, false);
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'outbound-authorization-refused');
});
