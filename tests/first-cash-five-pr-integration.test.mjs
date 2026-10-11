// Cross-layer fail-closed smoke tests for the unified October first-cash PR.
// Synthetic data only. No provider requests, DNS, outreach, payment, or spend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNED_ROOT_DOMAINS } from '../src/domain-purpose-plan.mjs';
import { OWNED_OUTREACH_DOMAINS } from '../src/outreach-domain-fleet.mjs';
import { compileSenderFleetExpansionPlan } from '../src/winnr-expansion-planner.mjs';
import { assessEgyptSelfServiceRoute } from '../src/egypt-self-service-commercial-route.mjs';
import { evaluateEgyptSelfServiceRoute } from '../src/egypt-self-service-route-inventory.mjs';
import { classifyPaymentEvent } from '../src/payments.mjs';
import { compileProspectVerification, PROSPECT_STATUSES } from '../src/prospect-verification-intake.mjs';

const at = '2026-10-11T10:00:00.000Z';
function fleet(mailboxes, domainLimit) {
  return compileSenderFleetExpansionPlan({
    now: new Date(at),
    observed: {
      entitlement: { plan: 'STARTUP', mailboxLimit: 50, domainLimit, observedAt: at, source: 'synthetic-test-receipt' },
      mailboxes: [], domains: []
    },
    target: { mailboxes, ownedDomains: OWNED_OUTREACH_DOMAINS, primaryBrandDomains: OWNED_ROOT_DOMAINS,
      reservePoolFraction: 0.2, mailboxesPerDomainMax: 3, truthfulMailboxNames: ['verified-sender'], fastActivation: true }
  });
}

test('first ten provider slots can plan thirty seats, not fifty', () => {
  const first = fleet(30, 10);
  assert.equal(first.topology.requiredDomainSlots, 10);
  assert.equal(first.topology.activeDomains.reduce((sum, d) => sum + d.mailboxes, 0), 30);
  assert.equal(first.topology.domainSlotsReadyForExpansion, true);
  assert.equal(first.capacity.currentEvidenceCapacityPerDay, 0);
  assert.equal(first.externalMutationsPerformed, 0);
  assert.equal(first.sendAuthority, false);
  const oversized = fleet(50, 10);
  assert.equal(oversized.topology.requiredDomainSlots, 17);
  assert.ok(oversized.blockers.some(x => x.startsWith('provider-domain-slots-insufficient')));
  assert.equal(oversized.topology.domainSlotsReadyForExpansion, false);
});

test('twenty observed slots permit planning fifty seats but never authorize messages', () => {
  const p = fleet(50, 20);
  assert.equal(p.topology.activeDomains.length, 17);
  assert.equal(p.topology.reserveDomains.length, 11);
  assert.equal(p.topology.requiredDomainSlots, 17);
  assert.equal(p.topology.domainSlotsReadyForExpansion, true);
  assert.equal(p.capacity.currentEvidenceCapacityPerDay, 0);
  assert.ok(p.steps.filter(x => x.mutates).every(x => x.authorized === false && x.class === 'PLAN'));
  assert.equal(p.sendAuthority, false);
});

test('domain readiness and founder assurance do not override legal and provider scope', () => {
  const route = assessEgyptSelfServiceRoute({ purpose: 'UNSOLICITED_COLD_MARKETING',
    recipientEmail: 'hello@company.example', now: new Date(at) });
  const inventory = evaluateEgyptSelfServiceRoute({ route: 'UNSOLICITED_PERSONAL',
    recipientJurisdiction: 'US', sourceIdentityVerified: true });
  assert.equal(route.sendAuthority, false);
  assert.equal(route.legalClearanceEstablished, false);
  assert.equal(inventory.sendAuthority, false);
  assert.equal(route.messagesSent, 0);
  assert.equal(route.providerCalls, 0);
  assert.equal(fleet(50, 20).sendAuthority, false);
});

test('a purchased subscription cannot turn a zero-dollar webhook into cleared money', () => {
  const result = classifyPaymentEvent({
    event: { eventName: 'order_created', eventId: 'synthetic',
      custom: { lead_id: 'lead', prospect_id: 'pros', product: 'full' },
      amountCents: 0, currency: 'USD', status: 'paid', testMode: false },
    lead: { id: 'lead', prospectId: 'pros' }, cfg: { revenue: { fullAuditPrice: 49 } }
  });
  assert.equal(result.classification, 'REVIEW_REQUIRED');
  assert.equal(result.shouldRecordRevenue, false);
  assert.equal(result.shouldUnlock, false);
});

test('purchased slots never overcome stale lead-path evidence', () => {
  const record = { company: 'Example Agency', website: 'https://agency.example', hqCountry: 'US',
    currentOwnership: { status: 'INDEPENDENT', evidenceUrl: 'https://agency.example/about' },
    evidenceClass: 'PAGE_FETCH_VERIFIED',
    contactHistory: { repoAndHistorySearched: true, runtimeSuppressionSearched: true,
      runtimeProspectAndOutboundSearched: true, hit: false },
    offerRoute: { offerId: 'AGENCY_REVENUE_LEAK_PROOF_PACK', rationale: 'Relevant buyer' },
    recipient: { email: 'hello@agency.example', publishedRole: 'GENERAL_BUSINESS_INQUIRIES',
      sourceUrl: 'https://agency.example/contact', sourcePageExact: true,
      excerpt: 'Contact: hello@agency.example', observedAt: '2026-10-10T14:00:00.000Z' },
    notices: { noSolicitationChecked: true, noSolicitationFound: false, noHarvestChecked: true, noHarvestFound: false },
    offerFit: { servesHomeServiceClients: true, evidenceUrl: 'https://agency.example/case-study' },
    clientEvidence: { clientName: 'Example HVAC', clientSiteUrl: 'https://example-hvac.example/',
      observation: { verifiable: true, text: 'Public example',
        sourceUrl: 'https://example-hvac.example/contact',
        excerpt: 'public example', observedAt: '2026-10-09T09:00:00.000Z' } }
  };
  const intake = compileProspectVerification(record, { now: new Date(at) });
  assert.equal(intake.status, PROSPECT_STATUSES.INCOMPLETE);
  assert.equal(intake.sendAuthority, false);
  assert.equal(fleet(50, 20).sendAuthority, false);
});

// Final dispatch gate and G-SPOT are independent safeguards, not policy substitutes.
test('final launch gate ABSTAINS with recipient legal and suppression failures', async () => {
  const { evaluateOutreachLaunchGate } = await import('../src/outreach-launch-gate.mjs');
  const gate = evaluateOutreachLaunchGate({
    genome: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'synthetic-genome' },
    domainState: { state: 'READY_FOR_LIMITED_OUTREACH', outreachState: 'AUTHORIZED', evidenceFreshness: 'FRESH' },
    mailboxState: { authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_COMPLETE', paused: false, currentDailyCap: 10 },
    egress: { state: 'READY', observedColdDailyCap: 10, evidenceRef: 'synthetic-egress' },
    transport: { state: 'READY', authenticated: true, evidenceRef: 'synthetic-transport' },
    campaignAuthorization: { authorized: true, receiptId: 'synthetic-owner' },
    recipient: { safeForOutreach: true, email: 'hello@company.example', verificationEvidenceRef: 'synthetic-recipient' },
    legal: { status: 'UNKNOWN', evidenceId: 'unverified', policyVersion: 'synthetic-policy' },
    suppression: { suppressed: true },
    recipientProvider: { state: 'READY', observedDailyBudget: 5, evidenceRef: 'synthetic-provider' }
  });
  assert.equal(gate.state, 'ABSTAIN');
  assert.equal(gate.readyForGovernedCanary, false);
  assert.equal(gate.automaticSendAuthority, false);
  assert.equal(gate.externalEffectAuthority, 'NONE');
  assert.ok(gate.hardStopReasonCodes.includes('suppression-dominates'));
  assert.ok(gate.hardStopReasonCodes.includes('recipient-legal-eligibility-not-passed'));
});

test('G-SPOT does not authorize or dispatch an ineligible first-cash prospect', async () => {
  const { createGspot } = await import('../src/gspot.mjs');
  let settings = {};
  const store = {
    async getSettings() { return structuredClone(settings); },
    async setSetting(key, value) { settings[key] = structuredClone(value); },
    async updateSettingAtomically(key, fn) { settings[key] = fn(structuredClone(settings[key])); }
  };
  const engine = createGspot({ store, now: () => Date.parse(at) });
  const original = await engine.plan({
    items: [{ prospectId: 'synthetic-prospect', offerId: 'AGENCY_REVENUE_LEAK_PROOF_PACK' }],
    idempotencyKey: 'synthetic-cross-organ'
  });
  assert.equal(original.run.state, 'PLANNED');
  const next = await engine.advance(original.run.runId, async () => ({
    qualification: { eligible: false, outboundAuthority: 'NONE' }
  }));
  assert.equal(next.items[0].stage, 'BLOCKED');
  const batch = await engine.prepareBatch(original.run.runId, { maxItems: 1, perSenderCap: { 'sender-1': 1 } });
  assert.equal(batch.state, 'NOTHING_TO_AUTHORIZE');
  assert.equal(batch.batch.items.length, 0);
  await assert.rejects(() => engine.authorize(original.run.runId, {
    batchDigest: 'fake', authorizedBy: 'MOHAMED'
  }));
  await assert.rejects(() => engine.dispatch(original.run.runId, async () => {
    throw Error('unexpected external dispatch');
  }));
});
