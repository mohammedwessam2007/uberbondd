import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLD_ROUTE_POLICY_ID, createColdRouteAuthorization, verifyColdRouteAuthorization,
  evaluateColdRoutePolicyV1, addressDigest, COLD_ROUTE_MAX_MESSAGES_CEILING
} from '../src/outreach-cold-route-policy.mjs';

const secret = 'fixture-approval-secret-'.repeat(2);
const now = new Date('2026-10-05T12:00:00.000Z');
const postal = 'Fixture Sender LLC, 100 Example Way, Austin, TX 78701, US';
const sender = { name: 'Fixture Sender', company: 'Fixture Sender LLC', address: postal };
const stop = 'https://uberbond.example/unsubscribe?token=fixture';
const body = `Hi there,\n\nI looked at your public case study page and noticed one lead-path gap. Want me to send it?\n\nThis is a commercial message from Fixture Sender LLC.\n\nStop future messages: ${stop}\n\nFixture Sender\nFixture Sender LLC\n${postal}`;

const auth = (patch = {}, at = now) => createColdRouteAuthorization({
  authorizedBy: 'fixture-owner', maxMessagesTotal: 1, senderJurisdiction: 'US',
  providerTermsEvidenceRef: 'docs/WINNR_SUPPORT_RECONCILIATION_2026-10-02.md',
  postalAddressDigest: addressDigest(postal), postalAddressPublicationAuthorized: true, ...patch
}, secret, at);

const route = (patch = {}) => ({
  schemaVersion: 'uberbond.outreach-route.v1', routeType: 'PUBLIC_BUSINESS_CONTACT',
  recipientEmail: 'hello@agency.example', sourceUrl: 'https://agency.example/contact',
  sourceObservedAt: '2026-10-04T12:00:00.000Z', jurisdiction: 'US', permissionScope: 'COMMERCIAL_OUTREACH',
  relevantToRecipientRole: true, noUnsolicitedStatementPresent: false, provider: 'smtp-relay',
  coldPolicy: {
    policyId: COLD_ROUTE_POLICY_ID, contactSource: 'PUBLISHED_BUSINESS_CONTACT', collectionMethod: 'MANUAL',
    recipientType: 'CORPORATE', noSolicitationNoticeChecked: true, noHarvestNoticeChecked: true,
    addressGuessed: false, roleRationale: 'Agency owner publishes this address for client inquiries and serves home-service clients.'
  },
  ...patch
});

const run = (patch = {}) => evaluateColdRoutePolicyV1({
  route: route(patch.route), recipientEmail: patch.recipientEmail ?? 'hello@agency.example', provider: patch.provider ?? 'smtp-relay',
  now, authorization: 'authorization' in patch ? patch.authorization : auth(), secret, sender: patch.sender ?? sender,
  prospect: patch.prospect ?? { unsubscribeUrl: stop, oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=fixture' },
  subject: patch.subject ?? 'lead handoff', body: patch.body ?? body, suppression: patch.suppression ?? {}
});
const refused = (result, fragment) => { assert.equal(result.ok, false); assert.match(result.reason, new RegExp(fragment)); };

test('every condition satisfied: the narrow route allows one exact recipient', () => {
  const result = run();
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.policyId, COLD_ROUTE_POLICY_ID);
  assert.match(result.eligibilityEvidenceId, /^ubelig_[a-f0-9]{64}$/);
});

test('no founder authorization, tampered authorization, forged signature and expiry all fail closed', () => {
  refused(run({ authorization: null }), 'not-authorized-by-founder');
  const a = auth();
  refused(run({ authorization: { ...a, maxMessagesTotal: 5 } }), 'digest-mismatch');
  refused(run({ authorization: { ...a, signature: 'a'.repeat(64) } }), 'signature-invalid');
  const forged = createColdRouteAuthorization({ authorizedBy: 'x', senderJurisdiction: 'US', providerTermsEvidenceRef: 'r', postalAddressDigest: addressDigest(postal), postalAddressPublicationAuthorized: true }, 'a-different-secret-'.repeat(3), now);
  refused(run({ authorization: forged }), 'signature-invalid');
  refused(run({ authorization: auth({}, new Date('2026-09-20T00:00:00Z')) }), 'expired');
  refused(run({ authorization: auth({}, new Date('2026-10-20T00:00:00Z')) }), 'issued-in-future');
});

test('authorization cap and lifetime are clamped by code, and require explicit provider-terms and publication consent', () => {
  assert.equal(auth({ maxMessagesTotal: 500 }).maxMessagesTotal, COLD_ROUTE_MAX_MESSAGES_CEILING);
  assert.ok(Date.parse(auth({ expiresInDays: 90 }).expiresAt) - now.getTime() <= 7 * 86400000);
  refused(run({ authorization: auth({ providerTermsEvidenceRef: '' }) }), 'provider-terms-evidence-missing');
  refused(run({ authorization: auth({ postalAddressPublicationAuthorized: false }) }), 'postal-publication-not-authorized');
});

test('wrong provider and wrong route type are refused', () => {
  refused(run({ provider: 'gmail-api' }), 'requires-smtp-relay');
  refused(run({ provider: 'postal' }), 'requires-smtp-relay');
  refused(run({ route: { routeType: 'CONSPICUOUS_PUBLICATION' } }), 'route-type-invalid');
  refused(run({ route: { permissionScope: 'JOB_APPLICATION' } }), 'permission-scope-invalid');
});

test('wrong recipient jurisdiction and sender jurisdictions held by the eligibility compiler are refused', () => {
  for (const j of ['GB', 'CA', 'DE', 'EG', 'SA']) refused(run({ route: { jurisdiction: j } }), 'recipient-jurisdiction-not-authorized');
  for (const j of ['EG', 'SA', 'AE', 'FR', '']) refused(run({ authorization: auth({ senderJurisdiction: j }) }), 'sender-jurisdiction-.*held-for-legal-review');
});

test('personal or consumer recipients, system addresses and guessed contacts are refused', () => {
  refused(run({ recipientEmail: 'owner@gmail.com' }), 'personal-mailbox');
  refused(run({ recipientEmail: 'noreply@agency.example' }), 'system-address');
  refused(run({ recipientEmail: 'not-an-email' }), 'address-invalid');
  const r = patch => ({ route: { coldPolicy: { ...route().coldPolicy, ...patch } } });
  refused(run(r({ recipientType: 'INDIVIDUAL_CONSUMER' })), 'must-be-corporate');
  refused(run(r({ recipientType: 'SOLE_TRADER_OR_PARTNERSHIP' })), 'must-be-corporate');
  refused(run(r({ addressGuessed: true })), 'guessing-forbidden');
  refused(run(r({ addressGuessed: undefined })), 'guessing-forbidden');
  refused(run(r({ contactSource: 'GUESSED_PATTERN' })), 'published-business-contact');
  refused(run(r({ collectionMethod: 'AUTOMATED_CRAWLER' })), 'manual');
  refused(run(r({ noSolicitationNoticeChecked: false })), 'no-solicitation-notice-check-missing');
  refused(run(r({ noHarvestNoticeChecked: false })), 'no-harvest-notice-check-missing');
});

test('missing public provenance, role irrelevance and unverified-absent solicitation statement are refused', () => {
  refused(run({ route: { relevantToRecipientRole: false } }), 'role-relevance-unproven');
  refused(run({ route: { noUnsolicitedStatementPresent: true } }), 'no-solicitation-statement-not-verified-absent');
  refused(run({ route: { coldPolicy: { ...route().coldPolicy, roleRationale: 'short' } } }), 'role-rationale-required');
  refused(run({ route: { coldPolicy: undefined } }), 'policy-evidence-missing');
  refused(run({ route: { coldPolicy: { ...route().coldPolicy, surprise: true } } }), 'unknown-field');
  refused(run({ route: { sourceUrl: '' } }), 'eligibility-hold');
});

test('stale or future contact evidence is refused by the recomputed eligibility decision', () => {
  refused(run({ route: { sourceObservedAt: '2025-01-01T00:00:00.000Z' } }), 'eligibility-hold:contact-provenance-stale');
  refused(run({ route: { sourceObservedAt: '2026-12-01T00:00:00.000Z' } }), 'eligibility-hold:contact-provenance-observed-in-future');
});

test('suppression, prior opt-out, complaint and hard bounce dominate', () => {
  for (const key of ['suppressed', 'unsubscribed', 'complained', 'hardBounced']) refused(run({ suppression: { [key]: true } }), 'eligibility-failed:suppression-dominates');
});

test('message must carry postal identity, advertisement disclosure, stop link and a non-deceptive subject', () => {
  refused(run({ sender: { ...sender, address: '' } }), 'postal-address-changed|postal-identity-missing');
  refused(run({ body: body.replace(postal, 'elsewhere') }), 'postal-address-missing-from-body');
  refused(run({ body: body.replace('This is a commercial message from Fixture Sender LLC.', '') }), 'advertisement-disclosure-missing');
  refused(run({ body: body.replace(stop, 'https://other.example/x') }), 'unsubscribe-link-missing-from-body');
  refused(run({ prospect: { unsubscribeUrl: stop } }), 'one-click-unsubscribe-missing');
  refused(run({ prospect: { unsubscribeUrl: 'http://uberbond.example/u', oneClickUnsubscribeUrl: 'https://x.example/u' } }), 'unsubscribe-link-missing-from-body');
  refused(run({ subject: 'Re: your inquiry' }), 'simulates-existing-thread');
  refused(run({ subject: 'FWD: hello' }), 'simulates-existing-thread');
  refused(run({ subject: 'LAST CHANCE FOR YOU' }), 'all-caps');
  refused(run({ subject: '' }), 'subject-missing');
});

test('authorization is bound to the exact published postal address; changing it invalidates the authorization', () => {
  const changed = { ...sender, address: '200 Other Street, Dallas, TX 75001, US' };
  refused(run({ sender: changed, body: body.replace(postal, changed.address) }), 'postal-address-changed-since-authorization');
  const check = verifyColdRouteAuthorization({ authorization: auth(), secret, postalAddress: postal, now });
  assert.equal(check.ok, true);
});

test('policy is a pure function: evaluating it never mutates its inputs', () => {
  const r = route(); const a = auth();
  const before = JSON.stringify({ r, a });
  evaluateColdRoutePolicyV1({ route: r, recipientEmail: 'hello@agency.example', provider: 'smtp-relay', now, authorization: a, secret, sender, prospect: { unsubscribeUrl: stop, oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=fixture' }, subject: 'lead handoff', body });
  assert.equal(JSON.stringify({ r, a }), before);
});
