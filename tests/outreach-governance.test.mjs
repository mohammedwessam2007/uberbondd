import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../src/omnia-v9/canonical.mjs';
import {
  buildOutboundConsequenceContext,
  digestOutboundEffectPayload,
  enforceOutboundConsequence
} from '../src/omnia-v9/integrations/outbound-consequence-gate.mjs';
import { createAuthoritativeOutreachConsequenceGate } from '../src/omnia-v9/integrations/outreach-consequence-admission.mjs';
import {
  createOutreachApproval,
  createOutreachRouteEvidence,
  evaluateOutreachGovernance,
  outreachMessageDigest,
  providerRoutePolicy,
  verifyOutreachApproval,
  verifyOutreachRouteEvidence
} from '../src/outreach-governance.mjs';

const NOW = new Date('2026-08-10T14:00:00.000Z');
const SECRET = 'owner-outreach-approval-secret-'.repeat(3);
const campaign = { id: 'campaign-1', approved: true, autoSend: true };
const baseCfg = {
  outbound: {
    launchPhase: 'canary', provider: 'gmail-api', approvalSecret: SECRET,
    routeEvidenceMaxAgeDays: 7
  }
};
const baseProspect = {
  id: 'prospect-1', campaignId: campaign.id, inbox: 'A',
  website: 'https://agency.example', country: 'Canada',
  contact: { email: 'careers@agency.example', source: 'website' },
  subject: 'Freelance Web Developer', body: '', draft: 'Exact approved body',
  oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=fixture'
};

function route(overrides = {}) {
  return createOutreachRouteEvidence({
    routeType: 'SOLICITED_APPLICATION',
    recipientEmail: baseProspect.contact.email,
    sourceUrl: 'https://agency.example/careers',
    sourceExcerpt: 'Email your application for the ongoing contractor opportunity.',
    sourceObservedAt: NOW.toISOString(),
    sourceExpiresAt: new Date(NOW.getTime() + 7 * 86400000).toISOString(),
    jurisdiction: 'CA',
    permissionScope: 'CONTRACTOR_APPLICATION',
    relevantToRecipientRole: true,
    noUnsolicitedStatementPresent: false,
    provider: 'gmail-api',
    evidenceNote: 'Official careers invitation',
    ...overrides
  }, NOW);
}

function approvedProspect({ effectPayloadDigest = sha256('placeholder-effect'), routeRecord = route(), body = baseProspect.draft } = {}) {
  const messageDigest = outreachMessageDigest({
    recipientEmail: baseProspect.contact.email,
    subject: baseProspect.subject,
    body,
    provider: 'gmail-api',
    inbox: 'A',
    followup: 0,
    listUnsubscribe: baseProspect.oneClickUnsubscribeUrl
  });
  const approval = createOutreachApproval({
    approvalId: 'approval-1', prospectId: baseProspect.id, campaignId: campaign.id,
    recipientEmail: baseProspect.contact.email, provider: 'gmail-api', inbox: 'A', followup: 0,
    routeDigest: routeRecord.routeDigest, messageDigest, effectPayloadDigest,
    approvedBy: 'mohamed', approvedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 3600000).toISOString()
  }, SECRET);
  return { ...baseProspect, draft: body, outreachRoute: routeRecord, outreachApproval: approval };
}

test('Gmail API policy refuses generic public or conspicuously published cold-email routes', () => {
  assert.equal(providerRoutePolicy('gmail-api', 'PUBLIC_BUSINESS_CONTACT').ok, false);
  assert.equal(providerRoutePolicy('gmail-api', 'CONSPICUOUS_PUBLICATION').reason, 'gmail-api-prohibits-unsolicited-commercial-mail');
  assert.equal(providerRoutePolicy('gmail-api', 'SOLICITED_APPLICATION').ok, true);
});

test('route evidence refuses an empty source excerpt and the empty-string digest', () => {
  assert.throws(
    () => route({ sourceExcerpt: '', sourceExcerptDigest: '' }),
    error => error?.code === 'OUTREACH_SOURCE_EVIDENCE_EMPTY'
  );
  const routeRecord = route();
  const tampered = {
    ...routeRecord,
    sourceExcerptDigest: sha256('')
  };
  const base = { ...tampered };
  delete base.routeDigest;
  tampered.routeDigest = sha256(base);
  assert.equal(verifyOutreachRouteEvidence({
    route: tampered,
    recipientEmail: baseProspect.contact.email,
    provider: 'gmail-api',
    now: NOW
  }).reason, 'outreach-route-source-digest-invalid');
});

test('a current solicited route plus an exact short-lived approval passes governance', () => {
  const prospect = approvedProspect();
  const result = evaluateOutreachGovernance({
    prospect, campaign, cfg: baseCfg, subject: prospect.subject, body: prospect.draft, date: NOW
  });
  assert.equal(result.ok, true);
  assert.equal(result.routeType, 'SOLICITED_APPLICATION');
  assert.equal(result.approvalId, 'approval-1');
});

test('message mutation, prior-contact ambiguity, and missing follow-up thread proof all fail closed', () => {
  const prospect = approvedProspect();
  assert.equal(evaluateOutreachGovernance({
    prospect, campaign, cfg: baseCfg, subject: prospect.subject, body: `${prospect.draft} changed`, date: NOW
  }).reason, 'outreach-approval-messageDigest-mismatch');
  assert.equal(evaluateOutreachGovernance({
    prospect: { ...prospect, previouslyContactedAt: '2026-07-27T23:00:49Z' },
    campaign, cfg: baseCfg, subject: prospect.subject, body: prospect.draft, date: NOW
  }).reason, 'outreach-prior-contact-requires-followup-reconciliation');
  assert.equal(evaluateOutreachGovernance({
    prospect, campaign, cfg: baseCfg, subject: prospect.subject, body: prospect.draft, followup: 1, date: NOW
  }).reason, 'outreach-followup-thread-proof-missing');
});

test('route and approval digests reject tampering, expiry, and weak secret configuration', () => {
  const routeRecord = route();
  assert.equal(verifyOutreachRouteEvidence({
    route: { ...routeRecord, permissionScope: 'COMMERCIAL_OUTREACH' },
    recipientEmail: baseProspect.contact.email, provider: 'gmail-api', now: NOW
  }).reason, 'outreach-route-digest-mismatch');
  const prospect = approvedProspect({ routeRecord });
  const expected = {
    approval: prospect.outreachApproval, secret: SECRET, prospectId: prospect.id,
    campaignId: campaign.id, recipientEmail: prospect.contact.email, provider: 'gmail-api',
    inbox: 'A', followup: 0, routeDigest: routeRecord.routeDigest,
    messageDigest: prospect.outreachApproval.messageDigest, now: NOW
  };
  assert.equal(verifyOutreachApproval({ ...expected, secret: 'weak' }).reason, 'outreach-approval-secret-invalid');
  assert.equal(verifyOutreachApproval({ ...expected, now: new Date('2026-08-11T14:00:00Z') }).reason, 'outreach-approval-expired');
  const longLived = createOutreachApproval({
    ...prospect.outreachApproval,
    approvedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 25 * 3600000).toISOString()
  }, SECRET);
  assert.equal(verifyOutreachApproval({ ...expected, approval: longLived }).reason, 'outreach-approval-ttl-too-long');
});

test('the authoritative consequence gate binds the exact final payload and denies any mutation', async () => {
  const effectPayload = {
    from: 'Mohamed Wessam <uberbond@example.test>',
    to: baseProspect.contact.email,
    subject: baseProspect.subject,
    body: baseProspect.draft,
    listUnsubscribe: baseProspect.oneClickUnsubscribeUrl
  };
  const prospect = approvedProspect({ effectPayloadDigest: digestOutboundEffectPayload(effectPayload) });
  const records = new Map([
    [`prospects:${prospect.id}`, prospect],
    [`campaigns:${campaign.id}`, campaign]
  ]);
  const store = { get: async (collection, id) => records.get(`${collection}:${id}`) || null };
  const hook = createAuthoritativeOutreachConsequenceGate({ store, cfg: baseCfg });
  const context = buildOutboundConsequenceContext({
    reservation: { id: 'reservation-1', idempotencyKey: 'initial:prospect-1' },
    prospect,
    campaign,
    account: { email: 'uberbond@example.test' },
    effectPayload,
    idempotencyKey: 'initial:prospect-1',
    checkedAt: NOW.toISOString()
  });
  const allowed = await enforceOutboundConsequence({ hook, context });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.authorizationDigest, prospect.outreachApproval.approvalDigest);

  const mutated = buildOutboundConsequenceContext({
    reservation: { id: 'reservation-1', idempotencyKey: 'initial:prospect-1' },
    prospect,
    campaign,
    account: { email: 'uberbond@example.test' },
    effectPayload: { ...effectPayload, body: `${effectPayload.body}\nInjected after approval` },
    idempotencyKey: 'initial:prospect-1',
    checkedAt: NOW.toISOString()
  });
  const denied = await enforceOutboundConsequence({ hook, context: mutated });
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'outreach-approval-effectPayloadDigest-mismatch');
});
