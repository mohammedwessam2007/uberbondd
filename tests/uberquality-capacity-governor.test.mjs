import test from 'node:test';
import assert from 'node:assert/strict';
import { compileQualityPreservingOutreachCapacity } from '../src/uberquality-capacity-governor.mjs';

function warm(count = 200, cap = 5) {
  return {
    decisions: Array.from({ length: count }, (_, i) => ({
      mailboxId: `m-${i}`,
      state: 'HOLD',
      recommendedColdDailyCap: cap
    }))
  };
}

function leads(count = 1000, patch = {}) {
  return Array.from({ length: count }, (_, i) => ({
    email: `person${i}@company${i}.example`,
    accountId: `company-${i}`,
    qualityScore: 0.95,
    safeForOutreach: true,
    verificationStatus: 'VERIFIED',
    suppressed: false,
    unsubscribed: false,
    cooldownActive: false,
    ...patch
  }));
}

const domains = [
  { domain: 'uberbond.agency', status: 'GREEN', observedColdDailyCap: 500 },
  { domain: 'uberbond.cloud', status: 'GREEN', observedColdDailyCap: 500 }
];
const recipientBudgets = [{ provider: 'aggregate-observed-recipient-budget', status: 'READY', observedColdDailyCap: 1000 }];
const egress = { totalReadyColdDailyCap: 1000 };

test('all observed dimensions at 1000 yields a quality-preserving max of 1000/day', () => {
  const result = compileQualityPreservingOutreachCapacity({
    warmFleet: warm(), domains, egress, recipientBudgets, leads: leads(),
    policy: { campaignDailyCeiling: 1000, minLeadScore: 0.82 }
  });
  assert.equal(result.qualityPreservingDailyMax, 1000);
  assert.equal(result.qualityFloorRelaxed, false);
  assert.equal(result.qualifiedLeadCount, 1000);
});

test('adding low-quality inventory never increases quality-preserving capacity', () => {
  const good = leads(700);
  const bad = leads(500, { qualityScore: 0.1 }).map((lead, i) => ({ ...lead, email: `bad${i}@bad${i}.example`, accountId: `bad-${i}` }));
  const result = compileQualityPreservingOutreachCapacity({
    warmFleet: warm(), domains, egress, recipientBudgets, leads: [...good, ...bad],
    policy: { campaignDailyCeiling: 1000, minLeadScore: 0.82 }
  });
  assert.equal(result.qualityPreservingDailyMax, 700);
  assert.ok(result.bottlenecks.includes('highQualityLeadInventory'));
  assert.equal(result.qualityFloorRelaxed, false);
});

test('unknown egress means zero rather than invented delivery capacity', () => {
  const result = compileQualityPreservingOutreachCapacity({
    warmFleet: warm(), domains, egress: {}, recipientBudgets, leads: leads(),
    policy: { campaignDailyCeiling: 1000 }
  });
  assert.equal(result.qualityPreservingDailyMax, 0);
  assert.ok(result.bottlenecks.includes('egressCapacity'));
});

test('suppressed and unsubscribed contacts never count as quality inventory', () => {
  const blocked = leads(100, { suppressed: true });
  const result = compileQualityPreservingOutreachCapacity({
    warmFleet: warm(), domains, egress, recipientBudgets, leads: [...leads(900), ...blocked.map((lead, i) => ({ ...lead, email: `suppressed${i}@x${i}.example`, accountId: `s-${i}` }))],
    policy: { campaignDailyCeiling: 1000 }
  });
  assert.equal(result.qualifiedLeadCount, 900);
  assert.equal(result.qualityPreservingDailyMax, 900);
});

test('domain, recipient and mailbox health can each become the hard ceiling', () => {
  const domainLimited = compileQualityPreservingOutreachCapacity({
    warmFleet: warm(),
    domains: [{ domain: 'uberbond.agency', status: 'GREEN', observedColdDailyCap: 300 }, { domain: 'uberbond.cloud', status: 'GREEN', observedColdDailyCap: 300 }],
    egress, recipientBudgets, leads: leads(), policy: { campaignDailyCeiling: 1000 }
  });
  assert.equal(domainLimited.qualityPreservingDailyMax, 600);

  const recipientLimited = compileQualityPreservingOutreachCapacity({
    warmFleet: warm(), domains, egress,
    recipientBudgets: [{ provider: 'observed', status: 'READY', observedColdDailyCap: 550 }],
    leads: leads(), policy: { campaignDailyCeiling: 1000 }
  });
  assert.equal(recipientLimited.qualityPreservingDailyMax, 550);

  const mailboxLimited = compileQualityPreservingOutreachCapacity({
    warmFleet: warm(100, 5), domains, egress, recipientBudgets, leads: leads(),
    policy: { campaignDailyCeiling: 1000 }
  });
  assert.equal(mailboxLimited.qualityPreservingDailyMax, 500);
});

test('default one-contact-per-account density preserves account quality', () => {
  const sameAccount = Array.from({ length: 10 }, (_, i) => ({
    email: `person${i}@one-company.example`, accountId: 'one-company', qualityScore: 0.99,
    safeForOutreach: true, verificationStatus: 'VERIFIED'
  }));
  const result = compileQualityPreservingOutreachCapacity({
    warmFleet: warm(), domains, egress, recipientBudgets, leads: sameAccount,
    policy: { campaignDailyCeiling: 1000 }
  });
  assert.equal(result.qualifiedLeadCount, 1);
  assert.equal(result.qualityPreservingDailyMax, 1);
});
