import test from 'node:test';
import assert from 'node:assert/strict';
import { powerhouseRecord as record, POWERHOUSE_SLOTS as SLOTS, POWERHOUSE_ARTIFACT_REF as ARTIFACT } from './fixtures/outreach/powerhouse.fixture.mjs';
import { freshPolicyRegistry } from './fixtures/outreach/global-green-lane.fixture.mjs';
import { runProspectPreflight, PREFLIGHT_STATES as P } from '../src/prospect-preflight.mjs';

const now = new Date('2026-10-02T21:00:00.000Z');
const policyRegistry = freshPolicyRegistry(now);
const account = (slot, email) => ({ id: `acct-${slot}`, slot, email, provider: 'smtp-relay', connected: true, tokens: { enc: 'x' }, plannedDailyCap: 2, smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'ref' } });
const identity = { legalBusinessSenderName: 'Example Operating LLC', authorizedPublicPostalAddress: '100 Example Street, Suite 4, Springfield, ST 00000', footerUseAuthorized: true };
const signed = { unsubscribeUrl: 'https://uberbond.example/unsubscribe?t=sig', oneClickUnsubscribeUrl: 'https://uberbond.example/unsubscribe/one-click?t=sig' };

function store() {
  const data = {
    suppressions: [], prospects: [], outboundReservations: [], outboundEvents: [], replies: [], messages: [], providerEvents: [],
    accounts: [account('smtp-1', 'a1@send.example'), account('smtp-2', 'a2@send.example')], senderHealth: []
  };
  return { async list(name) { return structuredClone(data[name] || []); } };
}

test('prepareEffect signs unsubscribe URLs even while sender-side legal authority remains unresolved', async () => {
  let factoryCalls = 0;
  const result = await runProspectPreflight({
    store: store(), record: record(), slots: SLOTS, artifactRef: ARTIFACT, artifactExists: ref => ref === ARTIFACT,
    now, policyRegistry, identity, senderSide: {}, unsubscribe: {},
    campaign: { campaignId: 'camp_1', effectExpiresAt: '2026-10-02T21:30:00.000Z' },
    prepareEffect: true,
    unsubscribeFactory: email => { factoryCalls += 1; assert.equal(email, 'hello@mypowerhouse.group'); return signed; }
  });
  assert.equal(factoryCalls, 1);
  assert.equal(result.state, P.BLOCKED_LEGAL_AUTHORITY);
  assert.ok(result.blockerCodes.includes('sender-side-legal-authority-hold-unresolved'));
  assert.equal(result.blockerCodes.includes('signed-unsubscribe-urls-not-created'), false);
  assert.equal(result.sendAuthority, false);
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.equal(result.externalEffects, 0);
});
