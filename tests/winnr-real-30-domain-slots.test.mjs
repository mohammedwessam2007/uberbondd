import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNED_ROOT_DOMAINS } from '../src/domain-purpose-plan.mjs';
import { OUTREACH_FLEET_DOMAINS, OWNED_OUTREACH_DOMAINS } from '../src/outreach-domain-fleet.mjs';
import { compileSenderFleetExpansionPlan } from '../src/winnr-expansion-planner.mjs';

const NOW = new Date('2026-10-11T10:35:00.000Z');
const pilot = [
  { address: 'one@cedarpointdomains.com', smtpVerified: false, imapVerified: true, rampStage: 0 },
  { address: 'two@cedarpointdomains.com', smtpVerified: false, imapVerified: true, rampStage: 0 },
  { address: 'three@cedarpointdomains.com', smtpVerified: false, imapVerified: true, rampStage: 0, quarantined: true, quarantineReason: 'placement-red' }
];
const check = (domainLimit, overrides = {}) => compileSenderFleetExpansionPlan({
  now: NOW,
  observed: {
    entitlement: { plan: 'WINNR_STARTUP_50', mailboxLimit: 50, domainLimit, observedAt: NOW.toISOString(), source: 'test-observed-provider-entitlement' },
    mailboxes: pilot,
    domains: []
  },
  target: {
    mailboxes: 50,
    ownedDomains: OWNED_OUTREACH_DOMAINS,
    primaryBrandDomains: OWNED_ROOT_DOMAINS,
    reservePoolFraction: 0.20,
    mailboxesPerDomainMax: 3,
    truthfulMailboxNames: ['mohamed']
  },
  ...overrides
});

test('historical GoDaddy portfolio is 2 roots plus 28 unique fleet domains, not two owned domains', () => {
  assert.equal(OWNED_ROOT_DOMAINS.length, 2);
  assert.equal(OUTREACH_FLEET_DOMAINS.length, 28);
  assert.equal(OWNED_OUTREACH_DOMAINS.length, 30);
  assert.equal(new Set(OWNED_OUTREACH_DOMAINS).size, 30);
});

test('50 mailbox target across 30 owned, 2 protected, reserves 6, requires 22 provider domain slots', () => {
  const p = check(40);
  assert.equal(p.topology.activeDomains.length, 22);
  assert.equal(p.topology.reserveDomains.length, 6);
  assert.equal(p.topology.requiredDomainSlots, 22);
  assert.equal(p.topology.observedDomainSlots, 40);
  assert.equal(p.topology.activeDomains.reduce((s, d) => s + d.mailboxes, 0), 50);
  assert.ok(p.topology.activeDomains.every(d => d.mailboxes <= 3));
  assert.ok(OWNED_ROOT_DOMAINS.every(root => !p.topology.activeDomains.some(d => d.domain === root)));
  assert.ok(!p.blockers.some(b => b.startsWith('provider-domain-slots-')));
  assert.equal(p.topology.domainSlotsReadyForExpansion, true);
  assert.equal(p.topology.domainSlotIncreaseIsNotAssumed, true);
  assert.equal(p.capacity.currentEvidenceCapacityPerDay, 0);
  assert.equal(p.externalMutationsPerformed, 0);
  assert.equal(p.sendAuthority, false);
});

test('advertised 50 mailbox capacity does NOT waive the plan default 10-domain limit', () => {
  const p = check(10);
  assert.equal(p.topology.requiredDomainSlots, 22);
  assert.equal(p.topology.domainSlotsReadyForExpansion, false);
  assert.ok(p.blockers.includes('provider-domain-slots-insufficient:limit-10-need-22'));
  assert.equal(p.observedState.entitlement.mailboxLimit, 50);
  assert.equal(p.capacity.currentEvidenceCapacityPerDay, 0);
  assert.equal(p.providerCalls, 0);
});

test('only observed provider domain slot increase unlocks the fleet plan; missing never means free slots', () => {
  const none = check(undefined);
  const short = check(20);
  const ready = check(22);
  assert.ok(none.blockers.includes('provider-domain-slots-unobserved'));
  assert.ok(short.blockers.includes('provider-domain-slots-insufficient:limit-20-need-22'));
  assert.equal(ready.topology.domainSlotsReadyForExpansion, true);
  assert.ok(!ready.blockers.some(b => b.startsWith('provider-domain-slots-')));
  assert.equal(none.topology.observedDomainSlots, null);
});

test('provider-leased prewarmed pilot is not treated as an owned fleet domain', () => {
  const p = check(40);
  assert.ok(!OWNED_OUTREACH_DOMAINS.includes('cedarpointdomains.com'));
  assert.equal(p.observedState.mailboxCount, 3);
  assert.equal(p.capacity.greenMailboxes, 0);
  assert.equal(p.capacity.quarantinedMailboxes, 1);
  assert.ok(p.topology.activeDomains.every(d => d.owned === false && d.dnsReady === false));
  assert.equal(p.expansionDecision.expansionRecommended, false);
});

test('no new provider entitlement cannot silently unlock domain or mailbox slots', () => {
  const p = check(undefined, { observed: { entitlement: null, mailboxes: pilot, domains: [] } });
  assert.ok(p.blockers.includes('provider-entitlement-unobserved'));
  assert.equal(p.topology.observedDomainSlots, null);
  assert.equal(p.capacity.currentEvidenceCapacityPerDay, 0);
  assert.equal(p.sendAuthority, false);
});

test('real provider APIs may return an integer domain slot quota as a decimal string', () => {
  const p = check('40');
  assert.equal(p.topology.observedDomainSlots, 40);
  assert.equal(p.topology.domainSlotsReadyForExpansion, true);
  assert.equal(p.topology.providerEntitlementFresh, true);
  assert.ok(!p.blockers.some(b => b.startsWith('provider-domain-slots-')));
});

test('a historical provider entitlement is not evidence of available domain slots today', () => {
  const p = check(40, {
    observed: {
      entitlement: { plan: 'WINNR_STARTUP_50', mailboxLimit: 50, domainLimit: 40, observedAt: '2026-10-02T12:00:00Z', source: 'stale-provider-readback' },
      mailboxes: pilot, domains: []
    }
  });
  assert.ok(p.blockers.includes('provider-entitlement-stale-or-undated'));
  assert.equal(p.topology.providerEntitlementFresh, false);
  assert.equal(p.topology.domainSlotsReadyForExpansion, false);
  assert.equal(p.externalMutationsPerformed, 0);
});

test('a future-dated or undated quota cannot masquerade as a fresh entitlement', () => {
  const future = check(40, { observed: { entitlement: { plan: 'Startup', mailboxLimit: 50, domainLimit: 40, observedAt: '2026-10-12T12:00:00Z' }, mailboxes: pilot, domains: [] } });
  const missing = check(40, { observed: { entitlement: { plan: 'Startup', mailboxLimit: 50, domainLimit: 40 }, mailboxes: pilot, domains: [] } });
  for (const p of [future, missing]) {
    assert.ok(p.blockers.includes('provider-entitlement-stale-or-undated'));
    assert.equal(p.topology.domainSlotsReadyForExpansion, false);
  }
});


test('fast activation uses 17 of 28 fleet domains for 50 mailboxes and needs only 20 observed slots', () => {
  const p = check(20, { target: {
    mailboxes: 50, ownedDomains: OWNED_OUTREACH_DOMAINS,
    primaryBrandDomains: OWNED_ROOT_DOMAINS, reservePoolFraction: 0.20,
    mailboxesPerDomainMax: 3, truthfulMailboxNames: ['mohamed'],
    fastActivation: true
  } });
  assert.equal(p.topology.activeDomains.length, 17);
  assert.equal(p.topology.reserveDomains.length, 11);
  assert.equal(p.topology.requiredDomainSlots, 17);
  assert.equal(p.topology.observedDomainSlots, 20);
  assert.equal(p.topology.minimumActiveDomainCount, 17);
  assert.equal(p.topology.fastActivationRequested, true);
  assert.equal(p.topology.fastActivationPossible, true);
  assert.equal(p.topology.domainSlotsReadyForExpansion, true);
  assert.equal(p.topology.activeDomains.reduce((sum,d)=>sum+d.mailboxes,0),50);
  assert.ok(p.topology.activeDomains.every(d=>d.mailboxes<=3));
  assert.ok(OWNED_ROOT_DOMAINS.every(d=>!p.topology.activeDomains.some(x=>x.domain===d)));
  assert.equal(p.sendAuthority, false);
  assert.equal(p.capacity.currentEvidenceCapacityPerDay, 0);
});

test('fast activation cannot claim all 50 inboxes under initial 10-domain limit', () => {
  const p = check(10, { target: {
    mailboxes: 50, ownedDomains: OWNED_OUTREACH_DOMAINS,
    primaryBrandDomains: OWNED_ROOT_DOMAINS, reservePoolFraction: 0.20,
    mailboxesPerDomainMax: 3, truthfulMailboxNames: ['mohamed'],
    fastActivation: true
  } });
  assert.equal(p.topology.requiredDomainSlots, 17);
  assert.ok(p.blockers.includes('provider-domain-slots-insufficient:limit-10-need-17'));
  assert.equal(p.sendAuthority, false);
});

test('fast activation rejects unsafe topology instead of silently exceeding the per-domain cap', () => {
  const p = check(40, { target: {
    mailboxes: 90, ownedDomains: OWNED_OUTREACH_DOMAINS,
    primaryBrandDomains: OWNED_ROOT_DOMAINS, reservePoolFraction: 0.20,
    mailboxesPerDomainMax: 3, truthfulMailboxNames: ['mohamed'],
    fastActivation: true
  } });
  assert.equal(p.topology.fastActivationPossible, false);
  assert.equal(p.topology.activeDomains.length, 22);
  assert.ok(p.blockers.some(b=>b.startsWith('topology-cannot-meet-target')));
  assert.equal(p.sendAuthority, false);
});
