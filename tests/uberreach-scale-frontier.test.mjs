import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberReachScaleFrontier } from '../src/uberreach-scale-frontier.mjs';

const PROFILE = {
  maxMailboxesPerDomain: 100,
  maxColdDailyPerMailbox: 5
};

const root = domain => ({
  domain,
  ownershipVerified: true,
  providerTermsAccepted: true,
  dnsAuthorityObserved: true
});

test('scales the planning envelope horizontally without relaxing quality', () => {
  const result = compileUberReachScaleFrontier({
    targetColdDaily: 10000,
    profile: PROFILE,
    roots: [root('one.example'), root('two.example')],
    qualifiedLeadInventory: 12000,
    observedEgressColdDailyCap: 10000,
    observedRecipientColdDailyCap: 10000,
    observedHealthyMailboxColdDailyCap: 10000,
    campaignDailyCeiling: 10000
  });
  assert.equal(result.ok, true);
  assert.equal(result.theoreticalColdPerDomain, 500);
  assert.equal(result.theoreticalPlanningEnvelope, 1000);
  assert.equal(result.rootsRequiredForTarget, 20);
  assert.equal(result.additionalVerifiedRootsNeeded, 18);
  assert.equal(result.evidenceBoundOperationalMax, 10000);
  assert.equal(result.qualityFloorRelaxed, false);
  assert.equal(result.externalEffectAuthority, 'NONE');
});

test('unverified roots add zero planning capacity', () => {
  const result = compileUberReachScaleFrontier({
    targetColdDaily: 5000,
    profile: PROFILE,
    roots: [root('good.example'), { domain: 'unverified.example' }]
  });
  assert.equal(result.verifiedRootCount, 1);
  assert.equal(result.theoreticalPlanningEnvelope, 500);
  assert.equal(result.additionalVerifiedRootsNeeded, 9);
  assert.equal(result.rejectedRoots.length, 1);
});

test('unknown operational evidence keeps live max at zero', () => {
  const result = compileUberReachScaleFrontier({
    targetColdDaily: 1000,
    profile: PROFILE,
    roots: [root('one.example'), root('two.example')],
    qualifiedLeadInventory: 1000,
    observedEgressColdDailyCap: 0,
    observedRecipientColdDailyCap: 1000,
    observedHealthyMailboxColdDailyCap: 1000,
    campaignDailyCeiling: 1000
  });
  assert.equal(result.theoreticalPlanningEnvelope, 1000);
  assert.equal(result.evidenceBoundOperationalMax, 0);
  assert.equal(result.status, 'TOPOLOGY_PLANNED_OPERATIONAL_EVIDENCE_PENDING');
});

test('lead inventory remains a hard quality-preserving bottleneck', () => {
  const result = compileUberReachScaleFrontier({
    targetColdDaily: 10000,
    profile: PROFILE,
    roots: Array.from({ length: 20 }, (_, index) => root(`r${index}.example`)),
    qualifiedLeadInventory: 2700,
    observedEgressColdDailyCap: 10000,
    observedRecipientColdDailyCap: 10000,
    observedHealthyMailboxColdDailyCap: 10000,
    campaignDailyCeiling: 10000
  });
  assert.equal(result.theoreticalPlanningEnvelope, 10000);
  assert.equal(result.evidenceBoundOperationalMax, 2700);
  assert.equal(result.qualityFloorRelaxed, false);
});
