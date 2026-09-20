import test from 'node:test';
import assert from 'node:assert/strict';

import { OWNED_ROOT_DOMAINS } from '../src/domain-purpose-plan.mjs';
import {
  OUTREACH_DOMAIN_FLEET_EVIDENCE,
  OUTREACH_FLEET_DOMAINS,
  isOutreachFleetDomain,
  outreachFleetPlan
} from '../src/outreach-domain-fleet.mjs';

test('live GoDaddy evidence records 30 physical domains without changing the two canonical roots', () => {
  assert.deepEqual([...OWNED_ROOT_DOMAINS], ['uberbond.agency', 'uberbond.cloud']);
  assert.equal(OUTREACH_FLEET_DOMAINS.length, 28);
  assert.equal(new Set(OUTREACH_FLEET_DOMAINS).size, 28);
  assert.equal(OUTREACH_FLEET_DOMAINS.some(domain => OWNED_ROOT_DOMAINS.includes(domain)), false);
  assert.equal(OUTREACH_DOMAIN_FLEET_EVIDENCE.portfolioCountLabel, '1-30 of 30 domains');
});

test('only the exact observed fleet names match the fleet registry', () => {
  assert.equal(isOutreachFleetDomain('uberbond.site'), true);
  assert.equal(isOutreachFleetDomain('UBERBOND.WORKS.WEBSITE.'), false);
  assert.equal(isOutreachFleetDomain('not-observed.example'), false);
  assert.equal(isOutreachFleetDomain('uberbond.agency'), false);
});

test('fleet ownership evidence does not grant activation authority', () => {
  const plan = outreachFleetPlan();
  assert.equal(plan.summary.totalPhysicalDomainsObserved, 30);
  assert.equal(plan.summary.outreachFleetDomains, 28);
  assert.equal(plan.summary.campaignEligibleDomains, 0);
  assert.ok(plan.domains.every(domain => domain.campaignEligibility.startsWith('BLOCKED_')));
  assert.ok(plan.domains.every(domain => domain.promotionState === 'UNCONFIGURED'));
});
