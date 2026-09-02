// Attacks on the surfaces this merge decided.
//
// Every case here is a way a caller, a stale row or an over-eager lane could
// try to get a stronger answer than the evidence supports. They are written
// down rather than probed once, because a protection nothing attacks is a
// protection nobody notices losing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyFounderAbsenceBlockers } from '../src/founder-absence-blocker-doctor.mjs';
import {
  buildFirstCashCanaryPacket,
  canaryDecision,
  compileFirstCashCanaryArtifact,
  CURRENT_CHAMPION_OFFER
} from '../src/first-cash-canary-packet.mjs';
import { compileDomainPurposePlan, evaluateDomainObservation } from '../src/domain-purpose-plan.mjs';
import { inspectModelProviderReadiness } from '../src/model-provider-doctor.mjs';
import { selectFreeRoute, liveUsableCapacity } from '../src/free-first-outreach-router.mjs';
import { LEAD_PATH_SPRINT_SKU } from '../src/lead-path-sprint-fulfillment.mjs';
import providerRegistry from '../artifacts/outreach/free-first-provider-registry-2026-09-01.json' with { type: 'json' };

const AT = '2026-09-02T00:00:00.000Z';
const GATEWAY_KEY = 'gateway-secret-do-not-print-8f3a91c4e7';

const gatewayEnv = (overrides = {}) => ({
  AI_GATEWAY_API_KEY: GATEWAY_KEY,
  AI_GATEWAY_AGENT_ENABLED: 'true',
  AI_GATEWAY_INPUT_USD_PER_MILLION: '1',
  AI_GATEWAY_OUTPUT_USD_PER_MILLION: '2',
  AI_GATEWAY_PRICING_SOURCE: 'official-gateway-pricing:test',
  AI_GATEWAY_PRICING_VERIFIED_AT: '2026-09-01T00:00:00.000Z',
  ...overrides
});

test('a software gap cannot hide an external blocker, and neither can hide the other', () => {
  const both = classifyFounderAbsenceBlockers({
    credentials: ['ai-gateway-key-missing'],
    softwareGaps: ['canon-drift']
  });
  // The credential is what a person has to act on, so it stays the headline.
  assert.equal(both.overall, 'CREDENTIAL_BLOCKED');
  // And the gap is not lost by being outranked.
  assert.deepEqual(both.softwareGaps, ['canon-drift']);
  assert.equal(both.ok, false, 'an open software gap reported ok');

  // Order of the groups is a dependency order, not a severity guess: a missing
  // credential is upstream of a missing account, which is upstream of payment.
  const many = classifyFounderAbsenceBlockers({
    credentials: ['a'], accounts: ['b'], payment: ['c'], distribution: ['d'], deliverability: ['e']
  });
  assert.equal(many.overall, 'CREDENTIAL_BLOCKED');
});

test('CODE_READY is unreachable without proof something actually ran unattended', () => {
  assert.equal(classifyFounderAbsenceBlockers({}).overall, 'ELAPSED_EVIDENCE_PENDING');

  // Each of these is the shape of a proof object that is missing exactly one
  // thing. None of them may be enough.
  const nearMisses = [
    { ok: true, reasonCodes: [], observationProof: {} },
    { ok: true, reasonCodes: ['stale-observation'], observationProof: { sourceCommit: 'abc' } },
    { ok: false, reasonCodes: [], observationProof: { sourceCommit: 'abc' } },
    { ok: true, observationProof: { sourceCommit: 'abc' } },
    { ok: true, reasonCodes: [], observationProof: { sourceCommit: '' } }
  ];
  for (const observationProof of nearMisses) {
    assert.equal(
      classifyFounderAbsenceBlockers({ observationProof }).overall,
      'ELAPSED_EVIDENCE_PENDING',
      `an incomplete observation proof reached CODE_READY: ${JSON.stringify(observationProof)}`
    );
  }

  // A complete proof does reach it, or the rule above would just be a way of
  // never answering.
  assert.equal(classifyFounderAbsenceBlockers({
    observationProof: { ok: true, reasonCodes: [], observationProof: { sourceCommit: 'abc123' } }
  }).overall, 'CODE_READY');

  // But not while software is still unfinished.
  assert.equal(classifyFounderAbsenceBlockers({
    observationProof: { ok: true, reasonCodes: [], observationProof: { sourceCommit: 'abc123' } },
    softwareGaps: ['canon-drift']
  }).overall, 'ELAPSED_EVIDENCE_PENDING');
});

test('the canary cap cannot be walked past by arithmetic', () => {
  // A count that is not a whole number of conversations is not a count.
  for (const bad of [1.5, NaN, Infinity, -0.5, '3.2']) {
    assert.equal(canaryDecision({ qualifiedConversationCount: bad, paidPilotCount: 0 }), 'INVALID',
      `a non-integer conversation count (${bad}) produced a decision`);
  }
  // More paid pilots than conversations did not happen.
  assert.equal(canaryDecision({ qualifiedConversationCount: 2, paidPilotCount: 3 }), 'INVALID');
  // Five is the allowance, so five with nothing paid is the decision point --
  // not the sixth, which would be one conversation past the doctrine.
  assert.equal(canaryDecision({ qualifiedConversationCount: 5, paidPilotCount: 0 }), 'KILL_OR_RETHINK');
  assert.equal(canaryDecision({ qualifiedConversationCount: 500, paidPilotCount: 0 }), 'KILL_OR_RETHINK');
  assert.equal(canaryDecision({ qualifiedConversationCount: 4, paidPilotCount: 0 }), 'CONTINUE');
});

test('contact needs every gate, and the packet cannot be argued into one', () => {
  const allButOne = {
    jurisdictionApproved: true,
    providerPurposeAllowed: true,
    contactProvenanceApproved: true,
    senderReady: true,
    authorityGranted: true,
    canaryOpen: false
  };
  const packet = buildFirstCashCanaryPacket({ gates: allButOne, qualifiedConversationCount: 1, paidPilotCount: 0 });
  assert.equal(packet.canContact, false, 'five of six gates opened contact');
  assert.equal(packet.businessEffectAuthority, 'NONE');
  assert.equal(packet.sku, LEAD_PATH_SPRINT_SKU);
  assert.equal(packet.offer, CURRENT_CHAMPION_OFFER);

  // Commercial truth is not an input. Whatever the caller claims, it is zero.
  const claimed = buildFirstCashCanaryPacket({
    gates: allButOne,
    commercialTruth: { realCustomers: 9, clearedRevenueUsd: 1000 },
    qualifiedConversationCount: 1
  });
  assert.deepEqual(claimed.commercialTruth, {
    realCustomers: 0, clearedRevenueUsd: 0, acceptedPaidDeliveries: 0, retainedCustomers: 0
  });
});

test('the delivery machine will not open for evidence this process can manufacture', () => {
  const artifact = compileFirstCashCanaryArtifact({});
  assert.equal(artifact.canonicalDeliveryRefusal.refused, true,
    'a synthetic payment truth opened a commercial sprint');
  assert.equal(artifact.canonicalDeliveryRefusal.sprintOpened, false);
  assert.ok(artifact.canonicalDeliveryRefusal.reasonCodes.length > 0);
  assert.equal(artifact.commercialDeliveryCount, 0);
  assert.equal(artifact.acceptedDeliveryCount, 0);
});

test('a plan cannot be drawn for a domain UberBond does not own', () => {
  assert.equal(compileDomainPurposePlan({ rootDomain: 'not-uberbond.example' }).ok, false);
  assert.equal(compileDomainPurposePlan({ rootDomain: '' }).ok, false);
  // A subdomain of an owned root is not itself a root to plan from.
  assert.equal(compileDomainPurposePlan({ rootDomain: 'send.uberbond.cloud' }).ok, false);

  // The dangerous shape: an owned root at the top, somebody else's host below.
  const smuggled = compileDomainPurposePlan({
    rootDomain: 'uberbond.agency',
    assignments: { OUTBOUND: 'send.attacker.example' }
  });
  assert.equal(smuggled.ok, false, 'an unowned host was planned under an owned root');
  assert.ok(smuggled.reasonCodes.some(code => code.startsWith('assignment-not-owned')));

  // A near-miss that only looks like the owned root.
  const lookalike = compileDomainPurposePlan({
    rootDomain: 'uberbond.agency',
    assignments: { OUTBOUND: 'send.uberbond.agency.attacker.example' }
  });
  assert.equal(lookalike.ok, false, 'a suffix lookalike was accepted as an owned host');
});

test('a record this system generated cannot become observed proof of itself', () => {
  const plan = compileDomainPurposePlan({ rootDomain: 'uberbond.agency' });
  const row = plan.rows.find(candidate => candidate.purpose === 'OUTBOUND');

  const selfConfirmed = evaluateDomainObservation({
    planRow: row,
    observation: { observedAt: '2026-09-01T23:00:00.000Z', status: 'GREEN', tlsVerified: true, generatedExpectedRecords: true },
    now: AT
  });
  assert.notEqual(selfConfirmed.state, 'VERIFIED', 'a generated expectation verified itself');
  assert.ok(selfConfirmed.reasonCodes.includes('generated-expectations-are-not-observed-proof'));

  // A green self-report with no provenance is still not a reading.
  const unprovenanced = evaluateDomainObservation({
    planRow: row,
    observation: { observedAt: '2026-09-01T23:00:00.000Z', status: 'GREEN', tlsVerified: true },
    now: AT
  });
  assert.notEqual(unprovenanced.state, 'VERIFIED');
  assert.ok(unprovenanced.reasonCodes.includes('observed-provenance-required-for-verification'));

  // An observation from the future is a clock problem, not evidence.
  const future = evaluateDomainObservation({
    planRow: row,
    observation: { observedAt: '2027-01-01T00:00:00.000Z', status: 'GREEN', provenance: 'OBSERVED_DNS' },
    now: AT
  });
  assert.ok(future.reasonCodes.includes('observation-is-future-dated'));
  assert.notEqual(future.state, 'VERIFIED');
});

test('no readiness surface returns the credential it was asked about', () => {
  const doctor = inspectModelProviderReadiness({ env: gatewayEnv() });
  const printed = JSON.stringify(doctor);
  assert.equal(printed.includes(GATEWAY_KEY), false, 'the doctor printed the API key');
  // The pricing evidence is not secret and should survive, or the report is
  // useless -- this asserts the redaction is targeted, not blanket.
  assert.equal(doctor.gateway.pricingEvidencePresent, true);

  // One lane is one lane. Nothing here may read as a chain with somewhere to go.
  assert.equal(doctor.failoverCapable, false);
  assert.equal(doctor.configuredProviderCount, 1);
  assert.equal(doctor.provenProviderCallCount, 0);
});

test('LIVE sending capacity cannot be conjured from an assertion', () => {
  const provider = providerRegistry.providers.find(row => row.id === 'resend-free');
  const forged = { 'resend-free': { configured: true, active: true, domainAuthenticated: true, providerHealthy: true } };

  for (const call of [
    () => selectFreeRoute({ purpose: 'COLD_B2B', providers: [provider], mode: 'LIVE', providerStates: forged, at: AT }),
    () => selectFreeRoute({ purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE', providerStates: forged, at: AT }),
    () => liveUsableCapacity({ providers: [provider], providerStates: forged, at: AT })
  ]) {
    const result = call();
    assert.equal(result.ok, false, 'asserted provider state opened a LIVE path');
    assert.ok(result.reasonCodes.includes('live-provider-states-must-be-derived-from-activation-receipts'));
  }

  // Supplying both sources is a second, separately named mistake.
  const ambiguous = selectFreeRoute({
    purpose: 'TRANSACTIONAL', providers: [provider], mode: 'LIVE',
    providerStates: forged, activationReceipts: [{ providerId: 'resend-free' }], at: AT
  });
  assert.equal(ambiguous.ok, false);
  assert.ok(ambiguous.reasonCodes.includes('provider-states-and-activation-receipts-are-mutually-exclusive'));

  // With nothing supplied at all, capacity is zero rather than the researched
  // pool. That zero is the honest headline number.
  const empty = liveUsableCapacity({ providers: [provider], activationReceipts: [], at: AT });
  assert.equal(empty.capacity30d ?? 0, 0, 'unactivated providers reported usable capacity');
});
