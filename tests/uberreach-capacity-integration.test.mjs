import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberReachReadiness } from '../src/uberreach-control-plane.mjs';

const NOW = new Date('2026-09-14T21:00:00.000Z');

function mailbox(i) {
  return {
    mailboxId: `mbx-${i}`,
    address: `mohamed.${String(i + 1).padStart(3, '0')}@${i < 100 ? 'uberbond.agency' : 'uberbond.cloud'}`,
    authenticationStatus: 'AUTHENTICATED',
    warmupStatus: 'WARMUP_COMPLETE',
    paused: false,
    currentDailyCap: 5
  };
}

function observations() {
  return {
    warmupDays: 21,
    observedDeliveries: 100,
    complaintRate: 0,
    hardBounceRate: 0.005,
    inboxPlacementRate: 0.95,
    providerDailyCap: 5
  };
}

const contact = {
  email: 'buyer@example.com',
  sourceEvidence: [{
    value: 'buyer@example.com', sourceType: 'public_website', sourceUrl: 'https://example.com/team',
    evidenceClass: 'DIRECT_PUBLIC', confidence: 0.95, exact: true, inferred: false, observedAt: NOW.toISOString()
  }],
  verifications: [{
    route: 'buyer@example.com', state: 'VALID', provider: 'licensed-test-provider',
    evidenceClass: 'LICENSED_PROVIDER', checkedAt: NOW.toISOString(), confidence: 0.95
  }]
};

const qualityLeads = Array.from({ length: 1000 }, (_, i) => ({
  email: `buyer${i}@company${i}.example`, accountId: `company-${i}`, qualityScore: 0.95,
  safeForOutreach: true, verificationStatus: 'VERIFIED'
}));

test('UberReach can expose a 1000/day quality-preserving envelope without granting send authority', () => {
  const mailboxes = Array.from({ length: 200 }, (_, i) => mailbox(i));
  const mailboxObservations = Object.fromEntries(mailboxes.map(row => [row.mailboxId, observations()]));
  const result = compileUberReachReadiness({
    mailboxes,
    mailboxObservations,
    contacts: [contact],
    capacityInputs: {
      domains: [
        { domain: 'uberbond.agency', status: 'GREEN', observedColdDailyCap: 500 },
        { domain: 'uberbond.cloud', status: 'GREEN', observedColdDailyCap: 500 }
      ],
      egress: { totalReadyColdDailyCap: 1000 },
      recipientBudgets: [{ provider: 'aggregate', status: 'READY', observedColdDailyCap: 1000 }],
      leads: qualityLeads,
      policy: { campaignDailyCeiling: 1000, minLeadScore: 0.82 }
    },
    now: NOW
  });
  assert.equal(result.capacity.qualityPreservingDailyMax, 1000);
  assert.equal(result.capacity.qualityFloorRelaxed, false);
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.equal(result.messagesSent, 0);
});
