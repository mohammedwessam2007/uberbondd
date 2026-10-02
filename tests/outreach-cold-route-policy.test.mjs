import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLD_ROUTE_POLICY_ID, COLD_ROUTE_SCHEMA_VERSION, COLD_ROUTE_MAX_MESSAGES_CEILING, SENDER_SIDE_HOLD_CLASSIFICATION,
  createColdRouteAuthorization, verifyColdRouteAuthorization, createColdRouteEvidence, verifyColdRouteEnvelope,
  evaluateColdRoutePolicyV1, addressDigest
} from '../src/outreach-cold-route-policy.mjs';
import {
  createOutreachRouteEvidence, verifyOutreachRouteEvidence, providerRoutePolicy, OUTREACH_ROUTE_TYPES
} from '../src/outreach-governance.mjs';
import { selectFleetMailbox } from '../src/uberfleet.mjs';

const secret = 'fixture-approval-secret-'.repeat(2);
const now = new Date('2026-10-05T12:00:00.000Z');
const postal = 'Fixture Sender LLC, 100 Example Way, Austin, TX 78701, US';
const sender = { name: 'Fixture Sender', company: 'Fixture Sender LLC', address: postal };
const stop = 'https://uberbond.example/unsubscribe?token=fixture';
const oneClick = 'https://uberbond.example/api/public/unsubscribe?token=fixture';
const body = `Hi there,\n\nI looked at your public case study page and noticed one lead-path gap. Want me to send it?\n\nThis is a commercial message from Fixture Sender LLC.\n\nStop future messages: ${stop}\n\nFixture Sender\nFixture Sender LLC\n${postal}`;
const slot = 'winnr:one@sender.example';

const smtpAccount = (id, accountSlot) => ({
  id, slot: accountSlot, provider: 'smtp-relay', email: `${id}@sender.example`, connected: true, tokens: 'encrypted-fixture',
  plannedDailyCap: 2, smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'fixture-route' }
});
const accounts = [smtpAccount('one', slot), smtpAccount('two', 'winnr:two@sender.example'), smtpAccount('three', 'winnr:three@sender.example')];
const allocate = (currentSlot, senderHealth = []) => selectFleetMailbox({ prospectId: 'p1', currentSlot, accounts, senderHealth, provider: 'smtp-relay', date: now });

const auth = (patch = {}, at = now) => createColdRouteAuthorization({
  authorizedBy: 'fixture-owner', maxMessagesTotal: 1,
  operatorLocation: 'US', senderEntityJurisdiction: 'US', controllerJurisdiction: 'US', transportRegion: 'DE',
  providerTermsEvidenceRef: 'docs/WINNR_SUPPORT_RECONCILIATION_2026-10-02.md',
  postalAddressDigest: addressDigest(postal), postalAddressPublicationAuthorized: true, ...patch
}, secret, at);

const coldPolicy = (patch = {}) => ({
  policyId: COLD_ROUTE_POLICY_ID, contactSource: 'PUBLISHED_BUSINESS_CONTACT', collectionMethod: 'MANUAL',
  recipientType: 'CORPORATE', noSolicitationNoticeChecked: true, noHarvestNoticeChecked: true,
  addressGuessed: false, roleRationale: 'Agency owner publishes this address for client inquiries and serves home-service clients.', ...patch
});
const routeInput = (patch = {}) => ({
  recipientEmail: 'hello@agency.example', sourceUrl: 'https://agency.example/contact', sourceExcerpt: 'Email us: hello@agency.example',
  sourceObservedAt: '2026-10-04T12:00:00.000Z', jurisdiction: 'US', relevantToRecipientRole: true,
  noUnsolicitedStatementPresent: false, coldPolicy: coldPolicy(), ...patch
});
const route = (patch = {}) => createColdRouteEvidence(routeInput(patch), now);
const prospect = { inbox: slot, unsubscribeUrl: stop, oneClickUnsubscribeUrl: oneClick };

const run = (patch = {}) => evaluateColdRoutePolicyV1({
  route: 'route' in patch ? patch.route : route(), recipientEmail: patch.recipientEmail ?? 'hello@agency.example',
  provider: patch.provider ?? 'smtp-relay', now,
  authorization: 'authorization' in patch ? patch.authorization : auth(), secret,
  sender: patch.sender ?? sender, prospect: patch.prospect ?? prospect,
  subject: patch.subject ?? 'lead handoff', body: patch.body ?? body, suppression: patch.suppression ?? {},
  senderAllocation: 'senderAllocation' in patch ? patch.senderAllocation : allocate(slot), priorColdSends: patch.priorColdSends ?? 0
});
const refused = (result, fragment) => { assert.equal(result.ok, false, `expected refusal /${fragment}/ but got ${JSON.stringify(result)}`); assert.match(result.reason, new RegExp(fragment)); };

test('every condition satisfied: the narrow route allows one exact recipient', () => {
  const result = run();
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.policyId, COLD_ROUTE_POLICY_ID);
  assert.match(result.eligibilityEvidenceId, /^ubelig_[a-f0-9]{64}$/);
  assert.match(result.routeDigest, /^[a-f0-9]{64}$/);
});

// ---- architecture review items 1-5, 9: compatibility with legacy governance ----
test('legacy v1 closed-record validation rejects the cold envelope (no coldPolicy, different schema version)', () => {
  const cold = route();
  assert.equal(cold.schemaVersion, COLD_ROUTE_SCHEMA_VERSION);
  const legacy = verifyOutreachRouteEvidence({ route: cold, recipientEmail: 'hello@agency.example', provider: 'smtp-relay', now });
  assert.equal(legacy.ok, false);
  assert.match(legacy.reason, /unknown-field:coldPolicy|version-invalid/);
});

test('legacy routes are byte-for-byte unaffected: same digest as before, same behaviour', () => {
  const legacyRoute = createOutreachRouteEvidence({
    routeType: 'REQUESTED_INFORMATION', permissionScope: 'SERVICE_INFORMATION', recipientEmail: 'owner@recipient.example',
    sourceUrl: 'https://recipient.example/request', sourceExcerpt: 'Please send the requested evidence.', sourceObservedAt: '2026-10-04T12:00:00.000Z',
    jurisdiction: 'GB', relevantToRecipientRole: true, provider: 'smtp-relay'
  }, now);
  assert.equal('coldPolicy' in legacyRoute, false);
  assert.equal(legacyRoute.schemaVersion, 'uberbond.outreach-route.v1');
  assert.equal(verifyOutreachRouteEvidence({ route: legacyRoute, recipientEmail: 'owner@recipient.example', provider: 'smtp-relay', now }).ok, true);
  // The cold module cannot be used to approve a solicited legacy route either.
  refused(evaluateColdRoutePolicyV1({ route: legacyRoute, recipientEmail: 'owner@recipient.example', provider: 'smtp-relay', now, authorization: auth(), secret, sender, prospect, subject: 'x', body, senderAllocation: allocate(slot) }), 'envelope-(unknown-field|version-invalid)');
});

test('generic smtp-relay cold refusal remains the default; the route-type set is unchanged', () => {
  assert.equal(providerRoutePolicy('smtp-relay', 'PUBLIC_BUSINESS_CONTACT').ok, false);
  assert.match(providerRoutePolicy('smtp-relay', 'PUBLIC_BUSINESS_CONTACT').reason, /smtp-relay-cold-route-requires-separate-provider-and-legal-evidence/);
  for (const provider of ['gmail-api', 'postal']) assert.equal(providerRoutePolicy(provider, 'PUBLIC_BUSINESS_CONTACT').ok, false);
  assert.equal(providerRoutePolicy('smtp-relay', 'REQUESTED_INFORMATION').ok, true);
  assert.deepEqual([...OUTREACH_ROUTE_TYPES], ['SOLICITED_APPLICATION', 'EXPLICIT_CONSENT', 'REQUESTED_INFORMATION', 'CONSPICUOUS_PUBLICATION', 'PUBLIC_BUSINESS_CONTACT', 'WARM_REFERRAL', 'UNKNOWN']);
});

test('the module is reachable only through the zero-authority preflight, and is never self-authorizing: nothing on a send path imports it', async () => {
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('..', import.meta.url).pathname;
  const importers = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'tests' || name === '.git') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(mjs|js)$/.test(name) && readFileSync(full, 'utf8').includes('outreach-cold-route-policy') && !full.endsWith('src/outreach-cold-route-policy.mjs')) importers.push(full.slice(root.length));
    }
  };
  walk(root);
  // Permitted importers: the read-only preflight (envelope check), and two
  // read-only tools that merely NAME the module (the reachability audit and the
  // drift doctor's existence check). The send path
  // (pipeline, governance, dispatch, fleet, worker, server) must never import it.
  const allowed = new Set(['src/prospect-preflight.mjs', 'scripts/outreach-reachability-audit.mjs', 'src/outreach-drift-doctor.mjs']);
  assert.deepEqual(importers.filter(file => !allowed.has(file)), []);
  // The preflight only uses the evidence builders and the envelope verifier; it
  // must not call the authorization verifier or the policy evaluator.
  const preflight = readFileSync(join(root, 'src/prospect-preflight.mjs'), 'utf8');
  assert.match(preflight, /createColdRouteEvidence/);
  assert.match(preflight, /verifyColdRouteEnvelope/);
  assert.doesNotMatch(preflight, /evaluateColdRoutePolicyV1|verifyColdRouteAuthorization|createColdRouteAuthorization/);
});

// ---- envelope integrity ----
test('envelope: tampering, wrong recipient, expiry, staleness and bad URLs are refused', () => {
  const r = route();
  refused(verifyColdRouteEnvelope({ route: { ...r, jurisdiction: 'GB' }, recipientEmail: 'hello@agency.example', now }), 'digest-mismatch');
  refused(verifyColdRouteEnvelope({ route: r, recipientEmail: 'other@agency.example', now }), 'recipient-mismatch');
  refused(verifyColdRouteEnvelope({ route: r, recipientEmail: 'hello@agency.example', now: new Date('2026-10-20T00:00:00Z') }), 'expired|stale');
  refused(verifyColdRouteEnvelope({ route: createColdRouteEvidence(routeInput({ sourceUrl: 'http://agency.example/contact' }), now), recipientEmail: 'hello@agency.example', now }), 'source-url-invalid');
  refused(verifyColdRouteEnvelope({ route: createColdRouteEvidence(routeInput({ sourceExcerpt: '' }), now), recipientEmail: 'hello@agency.example', now }), 'source-digest-invalid');
  refused(verifyColdRouteEnvelope({ route: { ...r, surprise: 1 }, recipientEmail: 'hello@agency.example', now }), 'unknown-field');
  refused(verifyColdRouteEnvelope({ route: createColdRouteEvidence(routeInput({ sourceObservedAt: '2026-12-01T00:00:00.000Z' }), now), recipientEmail: 'hello@agency.example', now }), 'time-invalid|future');
});

// ---- authorization ----
test('no founder authorization, tampered authorization, forged signature and expiry all fail closed', () => {
  refused(run({ authorization: null }), 'not-authorized-by-founder');
  const a = auth();
  refused(run({ authorization: { ...a, maxMessagesTotal: 5 } }), 'digest-mismatch');
  refused(run({ authorization: { ...a, signature: 'a'.repeat(64) } }), 'signature-invalid');
  const forged = createColdRouteAuthorization({ authorizedBy: 'x', operatorLocation: 'US', senderEntityJurisdiction: 'US', controllerJurisdiction: 'US', providerTermsEvidenceRef: 'r', postalAddressDigest: addressDigest(postal), postalAddressPublicationAuthorized: true }, 'a-different-secret-'.repeat(3), now);
  refused(run({ authorization: forged }), 'signature-invalid');
  refused(run({ authorization: auth({}, new Date('2026-09-20T00:00:00Z')) }), 'expired');
  refused(run({ authorization: auth({}, new Date('2026-10-20T00:00:00Z')) }), 'issued-in-future');
});

test('authorization cap and lifetime are clamped by code and require provider-terms evidence and publication consent', () => {
  assert.equal(auth({ maxMessagesTotal: 500 }).maxMessagesTotal, COLD_ROUTE_MAX_MESSAGES_CEILING);
  assert.ok(Date.parse(auth({ expiresInDays: 90 }).expiresAt) - now.getTime() <= 7 * 86400000);
  refused(run({ authorization: auth({ providerTermsEvidenceRef: '' }) }), 'provider-terms-evidence-missing');
  refused(run({ authorization: auth({ postalAddressPublicationAuthorized: false }) }), 'postal-publication-not-authorized');
});

test('cap: a first-experiment authorization of 1 admits exactly one message', () => {
  assert.equal(run({ priorColdSends: 0 }).ok, true);
  refused(run({ priorColdSends: 1 }), 'message-cap-reached');
  refused(run({ priorColdSends: -1 }), 'prior-send-count-invalid');
  refused(run({ priorColdSends: 0.5 }), 'prior-send-count-invalid');
});

test('authorization is bound to the exact published postal address', () => {
  const changed = { ...sender, address: '200 Other Street, Dallas, TX 75001, US' };
  refused(run({ sender: changed, body: body.replace(postal, changed.address) }), 'postal-address-changed-since-authorization');
  assert.equal(verifyColdRouteAuthorization({ authorization: auth(), secret, postalAddress: postal, now }).ok, true);
});

// ---- sender-side model repair ----
test('sender-side facts are separate and each must clear; mixed facts hold and name the offending field', () => {
  refused(run({ authorization: auth({ operatorLocation: 'EG' }) }), `sender-side-hold:${SENDER_SIDE_HOLD_CLASSIFICATION}:operatorLocation=eg`);
  refused(run({ authorization: auth({ senderEntityJurisdiction: 'EG' }) }), 'senderEntityJurisdiction=eg');
  refused(run({ authorization: auth({ controllerJurisdiction: 'SA' }) }), 'controllerJurisdiction=sa');
  refused(run({ authorization: auth({ controllerJurisdiction: '' }) }), 'controllerJurisdiction=unknown');
  refused(run({ authorization: auth({ operatorLocation: 'AE' }) }), 'operatorLocation=ae');
  refused(run({ authorization: auth({ operatorLocation: 'FR' }) }), 'operatorLocation=fr');
});

test('the Egypt hold is classified as conservative policy, not proven law, and it still holds', () => {
  assert.equal(SENDER_SIDE_HOLD_CLASSIFICATION, 'CONSERVATIVE_POLICY_HOLD_PENDING_AUTHORITATIVE_SCOPE_INTERPRETATION');
  const result = run({ authorization: auth({ operatorLocation: 'EG', senderEntityJurisdiction: 'EG', controllerJurisdiction: 'EG' }) });
  assert.equal(result.ok, false);
  assert.match(result.reason, /CONSERVATIVE_POLICY_HOLD_PENDING_AUTHORITATIVE_SCOPE_INTERPRETATION/);
});

test('transport region is recorded but does not gate: an EU-hosted relay alone does not hold a US-run sender', () => {
  assert.equal(run({ authorization: auth({ transportRegion: 'DE' }) }).ok, true);
  assert.equal(run({ authorization: auth({ transportRegion: 'EG' }) }).ok, true);
});

// ---- exact sender / ordinal 3 ----
test('ordinal 3 stays impossible: a paused ordinal is never allocated and the route refuses it', () => {
  const pausedThree = [{ inbox: 'winnr:three@sender.example', paused: true, pauseReason: 'GMAIL_PLACEMENT_RED' }];
  const allocation = allocate('winnr:three@sender.example', pausedThree);
  assert.equal(allocation.ok, true);
  assert.notEqual(allocation.slot, 'winnr:three@sender.example');
  refused(run({ prospect: { ...prospect, inbox: 'winnr:three@sender.example' }, senderAllocation: allocation }), 'sender-not-the-allocated-healthy-mailbox');
  // Even when only ordinal 3 existed, there is nothing eligible to approve.
  const onlyThree = selectFleetMailbox({ prospectId: 'p1', currentSlot: 'winnr:three@sender.example', accounts: [accounts[2]], senderHealth: pausedThree, provider: 'smtp-relay', date: now });
  assert.equal(onlyThree.ok, false);
  refused(run({ prospect: { ...prospect, inbox: 'winnr:three@sender.example' }, senderAllocation: onlyThree }), 'sender-not-the-allocated-healthy-mailbox');
});

test('sender substitution, missing allocation and disconnected senders are refused', () => {
  refused(run({ senderAllocation: null }), 'sender-not-the-allocated-healthy-mailbox');
  refused(run({ prospect: { ...prospect, inbox: 'winnr:two@sender.example' } }), 'sender-not-the-allocated-healthy-mailbox');
  refused(run({ prospect: { ...prospect, inbox: '' } }), 'sender-not-the-allocated-healthy-mailbox');
  const disconnected = selectFleetMailbox({ prospectId: 'p1', currentSlot: slot, accounts: [{ ...accounts[0], connected: false }], senderHealth: [], provider: 'smtp-relay', date: now });
  refused(run({ senderAllocation: disconnected }), 'sender-not-the-allocated-healthy-mailbox');
});

// ---- provider / route ----
test('wrong provider and wrong route fields are refused', () => {
  refused(run({ provider: 'gmail-api' }), 'requires-smtp-relay');
  refused(run({ provider: 'postal' }), 'requires-smtp-relay');
  refused(run({ route: { ...route(), provider: 'gmail-api' } }), 'requires-smtp-relay');
});

test('wrong recipient jurisdiction is refused', () => {
  for (const j of ['GB', 'CA', 'DE', 'EG', 'SA']) refused(run({ route: route({ jurisdiction: j }) }), 'recipient-jurisdiction-not-authorized');
});

test('personal/consumer recipients, system addresses and guessed or crawled contacts are refused', () => {
  refused(run({ recipientEmail: 'owner@gmail.com', route: route({ recipientEmail: 'owner@gmail.com' }) }), 'personal-mailbox');
  refused(run({ recipientEmail: 'noreply@agency.example', route: route({ recipientEmail: 'noreply@agency.example' }) }), 'system-address');
  const cp = patch => ({ route: route({ coldPolicy: coldPolicy(patch) }) });
  refused(run(cp({ recipientType: 'INDIVIDUAL_CONSUMER' })), 'must-be-corporate');
  refused(run(cp({ recipientType: 'SOLE_TRADER_OR_PARTNERSHIP' })), 'must-be-corporate');
  refused(run(cp({ addressGuessed: true })), 'guessing-forbidden');
  refused(run(cp({ addressGuessed: undefined })), 'guessing-forbidden');
  refused(run(cp({ contactSource: 'GUESSED_PATTERN' })), 'published-business-contact');
  refused(run(cp({ collectionMethod: 'AUTOMATED_CRAWLER' })), 'manual');
  refused(run(cp({ noSolicitationNoticeChecked: false })), 'no-solicitation-notice-check-missing');
  refused(run(cp({ noHarvestNoticeChecked: false })), 'no-harvest-notice-check-missing');
  refused(run(cp({ roleRationale: 'short' })), 'role-rationale-required');
});

test('role irrelevance, an unverified-absent solicitation statement, missing or surprise policy evidence are refused', () => {
  refused(run({ route: route({ relevantToRecipientRole: false }) }), 'role-relevance-unproven');
  refused(run({ route: route({ noUnsolicitedStatementPresent: true }) }), 'no-solicitation-statement-not-verified-absent');
  refused(run({ route: route({ coldPolicy: null }) }), 'policy-evidence-missing');
  refused(run({ route: route({ coldPolicy: { ...coldPolicy(), surprise: true } }) }), 'unknown-field');
});

test('stale contact evidence is refused', () => {
  refused(run({ route: route({ sourceObservedAt: '2026-09-01T00:00:00.000Z', sourceExpiresAt: '2026-12-01T00:00:00.000Z' }) }), 'evidence-stale');
});

test('suppression, prior opt-out, complaint and hard bounce dominate', () => {
  for (const key of ['suppressed', 'unsubscribed', 'complained', 'hardBounced']) refused(run({ suppression: { [key]: true } }), 'eligibility-failed:suppression-dominates');
});

test('message must carry postal identity, advertisement disclosure, stop link and a non-deceptive subject', () => {
  refused(run({ sender: { ...sender, address: '' } }), 'postal-address-changed|postal-identity-missing');
  refused(run({ body: body.replace(postal, 'elsewhere') }), 'postal-address-missing-from-body');
  refused(run({ body: body.replace('This is a commercial message from Fixture Sender LLC.', '') }), 'advertisement-disclosure-missing');
  refused(run({ body: body.replace(stop, 'https://other.example/x') }), 'unsubscribe-link-missing-from-body');
  refused(run({ prospect: { ...prospect, oneClickUnsubscribeUrl: '' } }), 'one-click-unsubscribe-missing');
  refused(run({ prospect: { ...prospect, unsubscribeUrl: 'http://uberbond.example/u' } }), 'unsubscribe-link-missing-from-body');
  refused(run({ subject: 'Re: your inquiry' }), 'simulates-existing-thread');
  refused(run({ subject: 'FWD: hello' }), 'simulates-existing-thread');
  refused(run({ subject: 'LAST CHANCE FOR YOU' }), 'all-caps');
  refused(run({ subject: '' }), 'subject-missing');
});

test('evaluation is pure: it never mutates its inputs', () => {
  const r = route(); const a = auth(); const p = { ...prospect };
  const before = JSON.stringify({ r, a, p });
  evaluateColdRoutePolicyV1({ route: r, recipientEmail: 'hello@agency.example', provider: 'smtp-relay', now, authorization: a, secret, sender, prospect: p, subject: 'lead handoff', body, senderAllocation: allocate(slot) });
  assert.equal(JSON.stringify({ r, a, p }), before);
});
