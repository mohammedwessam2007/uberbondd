import test from 'node:test';
import assert from 'node:assert/strict';

import { dispatchPostalCanary } from '../src/postal-live-send.mjs';
import {
  createOutreachApproval,
  createOutreachRouteEvidence,
  outreachMessageDigest,
  providerRoutePolicy
} from '../src/outreach-governance.mjs';
import { buildOutboundConsequenceContext, enforceOutboundConsequence } from '../src/omnia-v9/integrations/outbound-consequence-gate.mjs';
import { createAuthoritativeOutreachConsequenceGate } from '../src/omnia-v9/integrations/outreach-consequence-admission.mjs';

const NOW = new Date('2026-09-19T09:00:00.000Z');
const SECRET = 's'.repeat(64);

function cfg() {
  return {
    outbound: {
      provider: 'postal',
      useEffectAdapter: true,
      launchPhase: 'canary',
      messageIdDomain: 'uberbond.agency',
      approvalSecret: SECRET,
      routeEvidenceMaxAgeDays: 7
    },
    providers: {
      postal: {
        configured: true,
        apiKey: 'postal-test-key',
        baseUrl: 'https://mta.uberbond.cloud'
      }
    }
  };
}

function account(overrides = {}) {
  return { slot: 'A', connected: true, email: 'mohamed@uberbond.agency', ...overrides };
}

function reservation() {
  return { id: 'res-postal-1', idempotencyKey: 'initial:pros-postal', inbox: 'A' };
}

function payload() {
  return {
    from: 'mohamed@uberbond.agency',
    to: 'owner@example.test',
    subject: 'Requested information',
    body: 'Here is the information you requested.',
    listUnsubscribe: 'https://uberbond.agency/unsubscribe/token'
  };
}

test('owned Postal canary bridge submits exactly once and binds a deterministic Message-ID', async () => {
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    assert.equal(body.to[0], 'owner@example.test');
    assert.equal(body.from, 'mohamed@uberbond.agency');
    assert.match(body.headers['Message-ID'], /^<v9-[a-f0-9]{64}@uberbond\.agency>$/);
    return {
      status: 200,
      json: async () => ({
        status: 'success',
        data: {
          message_id: 'postal-message-1',
          messages: { 'owner@example.test': { id: 77 } }
        }
      })
    };
  };
  const result = await dispatchPostalCanary({
    cfg: cfg(), account: account(), reservation: reservation(), effectPayload: payload(),
    fetchImpl, now: () => NOW
  });
  assert.equal(result.ok, true);
  assert.equal(result.classification, 'ACCEPTED');
  assert.equal(result.providerReferenceId, '77');
  assert.equal(calls, 1);
});

test('Postal follow-up/thread path refuses before any provider call', async () => {
  let calls = 0;
  const result = await dispatchPostalCanary({
    cfg: cfg(), account: account(), reservation: reservation(),
    effectPayload: { ...payload(), threadId: 'thread-1', replyToId: '<x@example.test>' },
    followup: 1,
    fetchImpl: async () => { calls += 1; throw new Error('must not be called'); },
    now: () => NOW
  });
  assert.equal(result.classification, 'REJECTED');
  assert.ok(result.reasonCodes.includes('postal-canary-followups-not-enabled'));
  assert.equal(calls, 0);
});

test('Postal transport failure stays UNCERTAIN and performs no internal retry', async () => {
  let calls = 0;
  const result = await dispatchPostalCanary({
    cfg: cfg(), account: account(), reservation: reservation(), effectPayload: payload(),
    fetchImpl: async () => { calls += 1; throw new Error('connection reset after request'); },
    now: () => NOW
  });
  assert.equal(result.classification, 'UNCERTAIN');
  assert.equal(calls, 1);
});

test('Postal does not widen the first-canary contact policy', () => {
  assert.equal(providerRoutePolicy('postal', 'EXPLICIT_CONSENT').ok, true);
  assert.equal(providerRoutePolicy('postal', 'REQUESTED_INFORMATION').ok, true);
  assert.equal(providerRoutePolicy('postal', 'PUBLIC_BUSINESS_CONTACT').ok, false);
  assert.equal(providerRoutePolicy('postal', 'CONSPICUOUS_PUBLICATION').ok, false);
});

test('authoritative Postal consequence gate binds current approval, sender and transport payload', async () => {
  const campaign = { id: 'camp-postal', approved: true, autoSend: true };
  const acct = account();
  const prospect = {
    id: 'pros-postal',
    campaignId: campaign.id,
    inbox: 'A',
    contact: { email: 'owner@example.test' }
  };
  const route = createOutreachRouteEvidence({
    routeType: 'EXPLICIT_CONSENT',
    recipientEmail: prospect.contact.email,
    sourceUrl: 'https://example.test/consent',
    sourceExcerpt: 'Please send the requested information by email.',
    sourceObservedAt: NOW.toISOString(),
    sourceExpiresAt: new Date(NOW.getTime() + 86400000).toISOString(),
    jurisdiction: 'EG',
    permissionScope: 'SERVICE_INFORMATION',
    relevantToRecipientRole: true,
    noUnsolicitedStatementPresent: true,
    provider: 'postal'
  }, NOW);
  prospect.outreachRoute = route;

  const effectPayload = payload();
  const context = buildOutboundConsequenceContext({
    reservation: reservation(),
    prospect,
    campaign,
    account: acct,
    effectPayload,
    provider: 'postal',
    checkedAt: NOW.toISOString()
  });
  const messageDigest = outreachMessageDigest({
    recipientEmail: prospect.contact.email,
    subject: effectPayload.subject,
    body: effectPayload.body,
    provider: 'postal',
    inbox: 'A',
    followup: 0,
    listUnsubscribe: effectPayload.listUnsubscribe
  });
  prospect.outreachApproval = createOutreachApproval({
    approvalId: 'approval-postal',
    prospectId: prospect.id,
    campaignId: campaign.id,
    recipientEmail: prospect.contact.email,
    provider: 'postal',
    inbox: 'A',
    followup: 0,
    routeDigest: route.routeDigest,
    messageDigest,
    effectPayloadDigest: context.authorizationPayloadDigest,
    approvedBy: 'founder',
    approvedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 3600000).toISOString()
  }, SECRET);

  const store = {
    async get(collection, id) {
      if (collection === 'prospects' && id === prospect.id) return prospect;
      if (collection === 'campaigns' && id === campaign.id) return campaign;
      return null;
    },
    async findOne(collection, query) {
      if (collection === 'accounts' && query.slot === 'A') return acct;
      return null;
    }
  };
  const hook = createAuthoritativeOutreachConsequenceGate({ store, cfg: cfg() });
  const admission = await enforceOutboundConsequence({ hook, context });
  assert.equal(admission.allowed, true);

  const wrongSenderContext = buildOutboundConsequenceContext({
    reservation: reservation(),
    prospect,
    campaign,
    account: { ...acct, email: 'other@uberbond.agency' },
    effectPayload: { ...effectPayload, from: 'other@uberbond.agency' },
    provider: 'postal',
    checkedAt: NOW.toISOString()
  });
  const refused = await enforceOutboundConsequence({ hook, context: wrongSenderContext });
  assert.equal(refused.allowed, false);
  assert.equal(refused.reason, 'outreach-consequence-sender-mismatch');
});
