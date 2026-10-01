import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberWarm2Plan, compileUberWarm2PurchaseBoundary } from '../src/uberwarm2-sovereign-ramp.mjs';

const NOW = new Date('2026-10-01T20:00:00Z');

function mailbox(overrides = {}) {
  return {
    mailboxId: 'm1',
    address: 'sam@uberbond.site',
    authenticationStatus: 'AUTHENTICATED',
    paused: false,
    currentDailyCap: 2,
    ...overrides
  };
}

function seeds() {
  return [
    { email: 'seed1@gmail.com', ownerControlled: true, receiveReady: true },
    { email: 'seed2@outlook.com', ownerControlled: true, receiveReady: true },
    { email: 'ignored@yahoo.com', ownerControlled: false, receiveReady: true }
  ];
}

test('UberWarm2 creates owner-controlled probe plans and performs zero external effects', () => {
  const plan = compileUberWarm2Plan({
    mailboxes: [mailbox()],
    seedInboxes: seeds(),
    mailboxObservations: { m1: { conditioningDays: 1, observedDeliveries: 0 } },
    now: NOW
  });
  assert.equal(plan.placementPlan.probes.length, 2);
  assert.equal(plan.messagesSent, 0);
  assert.equal(plan.syntheticWarmupMessagesCreated, 0);
  assert.equal(plan.autoRepliesPerformed, 0);
  assert.equal(plan.warmFleet.decisions[0].state, 'WARMING');
  assert.equal(plan.warmFleet.decisions[0].recommendedColdDailyCap, 0);
});

test('evidence ramp graduates into bounded RAMP only after multi-provider placement evidence', () => {
  const base = compileUberWarm2Plan({
    mailboxes: [mailbox()],
    seedInboxes: seeds(),
    mailboxObservations: {
      m1: {
        conditioningDays: 10,
        observedDeliveries: 30,
        complaintRate: 0,
        hardBounceRate: 0.01,
        providerDailyCap: 20
      }
    },
    now: NOW
  });
  const observations = base.placementPlan.probes.map((probe, index) => ({
    probeId: probe.probeId,
    senderEmail: probe.senderEmail,
    seedEmail: probe.seedEmail,
    seedProvider: probe.seedProvider,
    folder: 'INBOX',
    evidenceRef: `owner-seed:${index}`,
    observedAt: NOW.toISOString()
  }));
  const plan = compileUberWarm2Plan({
    mailboxes: [mailbox()],
    seedInboxes: seeds(),
    placementPlan: base.placementPlan,
    placementObservations: observations,
    mailboxObservations: {
      m1: {
        conditioningDays: 10,
        observedDeliveries: 30,
        complaintRate: 0,
        hardBounceRate: 0.01,
        providerDailyCap: 20
      }
    },
    now: NOW
  });
  assert.equal(plan.warmFleet.decisions[0].state, 'RAMP');
  assert.equal(plan.warmFleet.decisions[0].recommendedColdDailyCap, 7);
  assert.equal(plan.nextActions[0].action, 'INCREASE_ONLY_TO_RECOMMENDED_CAP');
});

test('bad seed placement quarantines the mailbox rather than hiding the signal', () => {
  const base = compileUberWarm2Plan({
    mailboxes: [mailbox()],
    seedInboxes: seeds(),
    mailboxObservations: { m1: { conditioningDays: 10, observedDeliveries: 30, complaintRate: 0, hardBounceRate: 0.01 } },
    now: NOW
  });
  const observations = base.placementPlan.probes.map((probe, index) => ({
    probeId: probe.probeId,
    senderEmail: probe.senderEmail,
    seedEmail: probe.seedEmail,
    seedProvider: probe.seedProvider,
    folder: index === 0 ? 'SPAM' : 'INBOX',
    evidenceRef: `owner-seed:${index}`,
    observedAt: NOW.toISOString()
  }));
  const plan = compileUberWarm2Plan({
    mailboxes: [mailbox()],
    seedInboxes: seeds(),
    placementPlan: base.placementPlan,
    placementObservations: observations,
    mailboxObservations: { m1: { conditioningDays: 10, observedDeliveries: 30, complaintRate: 0, hardBounceRate: 0.01 } },
    now: NOW
  });
  assert.equal(plan.warmFleet.decisions[0].state, 'QUARANTINED');
  assert.equal(plan.warmFleet.decisions[0].recommendedColdDailyCap, 0);
});

test('purchase boundary does not require a provider warmup add-on', () => {
  const result = compileUberWarm2PurchaseBoundary({
    domainsOwned: 30,
    controlPlaneOwned: true,
    transport: {
      authorized: true,
      configured: true,
      outboundSmtp: true,
      inboundReplies: true
    },
    seedCoverage: { ownerControlledRecipientNetworks: 1 }
  });
  assert.equal(result.prePurchaseState, 'SOFTWARE_AND_ASSETS_READY');
  assert.equal(result.providerWarmupAddonRequired, false);
  assert.equal(result.seedNetworkStatus, 'OPTIONAL_FOR_PURCHASE_REQUIRED_BEFORE_SCALE');
});
