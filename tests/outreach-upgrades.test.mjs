import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCampaignControlPlan,
  buildDeliverabilityPreflight,
  buildPortableCampaignExport,
  buildProviderIntegrationSpec
} from '../src/outreach-upgrades.mjs';

const now = '2026-08-12T10:00:00.000Z';
const campaign = {
  id: 'campaign_upgrade',
  name: 'Website QA diagnostic',
  offer: 'a fixed USD 250 website QA diagnostic',
  sequence: {
    settings: {
      maxNewLeadsPerDay: 1,
      prioritizeNewLeads: true,
      limitEmailsPerCompanyPerDay: 1,
      providerMatching: 'same_esp',
      sendWindow: { minGapMinutes: 9, randomGapMinutes: 5 }
    },
    steps: [{
      id: 'step-1', kind: 'initial', delayValue: 0, delayUnit: 'days', condition: 'always',
      variants: [{ id: 'A', subject: 'A useful observation about {{company}}', body: 'Hi {{company}} team, {{issueTitle}} {{issueExcerpt}}' }]
    }]
  }
};

const prospect = (id, company, email, issue = {}) => ({
  id, campaignId: campaign.id, company, website: `https://${company.toLowerCase()}.example`,
  contact: { email, source: 'owner-selected-record' }, score: { total: 80 },
  sequenceState: { status: 'ready_for_review', currentStepIndex: 0 }, issue
});

test('campaign control plan applies evidence, company, daily lead and sender gates without effects', () => {
  const result = buildCampaignControlPlan({
    campaign,
    prospects: [
      prospect('p1', 'Acme', 'owner@acme.test', { evidenceUrl: 'https://acme.test/issue', title: 'Form error' }),
      prospect('p2', 'Acme', 'second@acme.test', { evidenceUrl: 'https://acme.test/issue-2' }),
      prospect('p3', 'Beta', 'owner@beta.test'),
      { ...prospect('p4', 'Gamma', 'owner@gmail.com', { evidenceUrl: 'https://gamma.test/issue' }), status: 'suppressed' }
    ],
    messages: [{ prospectId: 'p1', sentAt: now, businessDomain: 'acme.example' }],
    outboundEvents: [],
    accounts: [{ slot: 'A', email: 'sender@gmail.com', provider: 'gmail', connected: true, dailyCap: 20 }],
    senderHealth: [{ inbox: 'A', paused: false }],
    suppressions: [{ value: 'owner@gmail.com', reason: 'owner' }],
    now
  });

  assert.equal(result.summary.assigned, 4);
  assert.equal(result.summary.eligible, 0);
  assert.equal(result.summary.blocked, 4);
  assert.equal(result.summary.newLeadLimitUsed, 1);
  assert.ok(result.queue.find(row => row.prospectId === 'p2').reasons.includes('company-daily-limit'));
  assert.ok(result.queue.find(row => row.prospectId === 'p3').reasons.includes('evidence-missing'));
  assert.ok(result.queue.find(row => row.prospectId === 'p4').reasons.includes('suppressed'));
  assert.match(result.policy, /no sender reservation/);
});

test('deliverability preflight separates local checks from provider placement', () => {
  const result = buildDeliverabilityPreflight({
    campaign,
    accounts: [{ slot: 'A', email: 'sender@gmail.com', connected: true, authentication: { spf: true, dkim: true, dmarc: false } }],
    senderHealth: [{ inbox: 'A', paused: false }],
    now
  });
  assert.equal(result.summary.senders, 1);
  assert.equal(result.summary.providerPlacementTests, 0);
  assert.equal(result.senders[0].providerPlacement.status, 'not-run');
  assert.ok(result.senders[0].checks.some(check => check.id === 'evidence-binding' && check.status === 'pass'));
  assert.ok(result.senders[0].checks.some(check => check.id === 'authentication' && check.status === 'warn'));
  assert.match(result.policy, /no provider placement guarantee/);
});

test('provider integration spec documents signed ingestion and effect boundaries', () => {
  const result = buildProviderIntegrationSpec({ baseUrl: 'https://app.example', provider: 'instantly', webhookSecretConfigured: false });
  assert.equal(result.webhook.endpoint, 'https://app.example/webhooks/outreach/instantly');
  assert.equal(result.webhook.signature.required, true);
  assert.equal(result.webhook.signature.configured, false);
  assert.ok(result.webhook.acceptedEvents.includes('reply_received'));
  assert.equal(result.sendBoundary.externalEffects, 'not created by this contract');
});

test('portable export preserves provider mapping and marks unsafe leads do-not-send', () => {
  const result = buildPortableCampaignExport({
    campaign,
    prospects: [
      prospect('p1', 'Acme', 'owner@acme.test', { evidenceUrl: 'https://acme.test/issue' }),
      prospect('p2', 'Beta', 'owner@beta.test', { evidenceUrl: 'https://beta.test/issue' }),
      prospect('p3', 'Gamma', 'owner@gamma.test')
    ],
    suppressions: [{ value: 'owner@beta.test', reason: 'bounce' }],
    now
  });
  assert.equal(result.exportVersion, 'uberbond.portable-campaign.v2');
  assert.equal(result.instantlyMapping.maxNewLeads, 1);
  assert.equal(result.instantlyMapping.randomAdditionalTimeMinutes, 5);
  assert.equal(result.importSafety.eligibleLeadCount, 1);
  assert.equal(result.importSafety.blockedLeadCount, 2);
  assert.equal(result.externalEffects, 0);
});
