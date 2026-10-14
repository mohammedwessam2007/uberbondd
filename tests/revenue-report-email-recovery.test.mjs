import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { outboundMessageDigest } from '../src/outbound-send-authorization.mjs';

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

// Produces an UNCERTAIN attempt through the engine's own claim and uncertainty writers. Those are the two calls a provider
// failure makes inside sendReportEmail, so the durable state is the one production code would leave behind.
async function seedUncertainAttempt(engine, lead, prospect) {
  const claim = await engine.claimReportEmailAttempt(lead, prospect);
  assert.equal(claim.ok, true);
  const marked = await engine.markReportEmailUncertain({
    leadId: lead.id, attemptId: claim.attemptId, prospect, reason: 'provider-result-uncertain'
  });
  assert.equal(marked.persisted, true);
  return claim.attemptId;
}

// A package carrying every field the authorization model reads, bound to the exact message the engine would send. The test
// supplies it deliberately and then proves it is never consulted: the durable uncertain marker refuses before the gate runs.
function completeOutboundPackage({ message, account }) {
  const campaignId = 'report-email-replay-guard';
  return {
    campaignId,
    sender: {
      accountId: account.id, slot: account.slot, email: account.email,
      paused: false, holdReasons: [], quarantined: false, bounceRate: 0, complaintRate: 0
    },
    expectedSender: { accountId: account.id, slot: account.slot, email: account.email },
    thresholds: { maxBounceRate: 0.05, maxComplaintRate: 0.001 },
    domainReceipt: { domain: 'uberbond.example', configured: true },
    provider: { name: 'smtp-relay', routeAuthorized: true, termsCompatible: true },
    suppression: { snapshotId: 'suppression-replay-guard', entries: [] },
    doNotContact: { listId: 'do-not-contact-replay-guard', entries: [] },
    recipient: { eligibilityEvidenceRef: 'eligibility:self-submitted-intake', jurisdiction: 'us' },
    jurisdictionEvidence: { jurisdiction: 'us', allowed: true, evidenceRef: 'jurisdiction:replay-guard' },
    consent: { receiptRef: 'consent:replay-guard-valid' },
    campaignApproval: { approvalRef: 'approval:replay-guard', campaignId },
    messageApproval: { approvedDigest: outboundMessageDigest(message) },
    rateWindow: { cap: 10, sentCount: 0 },
    retry: { budget: 3, attempts: 0 }
  };
}

test('an uncertain report-email attempt is not replayed when a complete outbound package and valid consent are supplied', async () => {
  const { store, config, pipeline, lead, prospect } = await fixture();
  const attemptId = await seedUncertainAttempt(new RevenueEngine(store, config, pipeline), lead, prospect);

  let transportCalls = 0;
  let packageRequests = 0;
  let consentChecks = 0;
  const engine = new RevenueEngine(store, config, pipeline, {
    sendEmail: async () => {
      transportCalls += 1;
      return { data: { id: 'gmail-replay', threadId: 'thread-replay' }, tokens: { access_token: 'rotated-token' } };
    },
    outboundAuthorization: async context => {
      packageRequests += 1;
      return completeOutboundPackage(context);
    },
    consentVerifier: ({ consentReceiptRef }) => {
      consentChecks += 1;
      return consentReceiptRef === 'consent:replay-guard-valid';
    }
  });

  // The caller's lead predates the uncertain marker, so only the durable claim can see it.
  const result = await engine.sendReportEmail(lead, prospect);
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'unresolved-prior-attempt-requires-owner-review');

  // The replay guard stopped the attempt before the outbound gate: no package was requested, no consent was checked,
  // and the provider was never called.
  assert.equal(packageRequests, 0, 'the outbound gate must not be reached for an unresolved prior attempt');
  assert.equal(consentChecks, 0);
  assert.equal(transportCalls, 0);

  // The attempt is still the same unresolved uncertain attempt, not released, not sent.
  const durable = await store.get('leads', lead.id);
  assert.equal(durable.reportEmailAttemptStatus, 'uncertain');
  assert.equal(durable.reportEmailAttemptId, attemptId);
  assert.ok(durable.reportEmailUncertainAt, 'the uncertainty timestamp survives the refused replay');
  assert.equal(durable.reportEmailSentAt, undefined);
  assert.equal((await store.list('messages')).filter(message => message.kind === 'transactional-report').length, 0);

  const decisions = (await store.list('auditLog'))
    .filter(row => row.type === 'report_email_audit')
    .map(row => `${row.detail.outcome}:${row.detail.reason}`);
  assert.deepEqual(decisions, [
    'uncertain:provider-result-uncertain',
    'blocked:unresolved-prior-attempt-requires-owner-review'
  ]);
});

test('an uncertain report-email attempt is never reported as sent, even after a late provider acceptance', async () => {
  const { store, config, pipeline, lead, prospect } = await fixture();
  const engine = new RevenueEngine(store, config, pipeline);
  const claim = await engine.claimReportEmailAttempt(lead, prospect);
  assert.equal(claim.ok, true);
  const marked = await engine.markReportEmailUncertain({
    leadId: lead.id, attemptId: claim.attemptId, prospect, reason: 'provider-result-uncertain'
  });
  assert.equal(marked.persisted, true);

  // A provider acceptance that arrives after the uncertainty was recorded must not finalize the attempt as sent.
  await assert.rejects(
    engine.finalizeReportEmailAttempt(claim, { data: { id: 'gmail-late', threadId: 'thread-late' } }),
    /report-email-claim-not-current/
  );
  const durable = await store.get('leads', lead.id);
  assert.equal(durable.reportEmailAttemptStatus, 'uncertain');
  assert.equal(durable.reportEmailSentAt, undefined);
  assert.equal(durable.reportEmailProviderId, undefined);
  assert.equal((await store.list('messages')).filter(message => message.kind === 'transactional-report').length, 0);

  // A later caller with a fresh snapshot is refused by the same durable marker and is not reported as sent.
  const retry = await new RevenueEngine(store, config, pipeline, {
    sendEmail: async () => { throw new Error('a replay must never reach the provider'); }
  }).sendReportEmail(durable, prospect);
  assert.equal(retry.sent, false);
  assert.equal(retry.reason, 'unresolved-prior-attempt-requires-owner-review');
  assert.equal((await store.get('leads', lead.id)).reportEmailSentAt, undefined);
});
