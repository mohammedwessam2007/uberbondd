import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileSovereignOutreachLaunchCapsule,
  computeOutreachCapsuleDigest,
  evaluateSovereignOutreachButton,
  createPostalGovernedTransportAdapter,
  pressSovereignOutreachBigButton
} from '../src/sovereign-outreach-big-button.mjs';

const now = new Date('2026-09-15T03:00:00.000Z');

function greenRuntimeEvidence() {
  return {
    runtimeReceipt: { ok: true, status: 'UBERCEL_ECONOMIC_DEPLOYMENT_OBSERVED', economicRuntime: { ok: true, evidenceRefs: ['runtime:fixture'] } },
    domainObservation: { domainId: 'uberbond.cloud', ownerAuthorized: true, dnsAuthenticated: true, evidenceFreshness: 'FRESH', evidenceRef: 'dns:fixture' },
    inboxReconciliation: { ok: true, status: 'UBERINBOXES_FULLY_OBSERVED', confirmedAddresses: ['mohamed@uberbond.cloud'] },
    warmDecision: { state: 'RAMP', mailboxId: 'mbx-1', address: 'mohamed@uberbond.cloud', recommendedColdDailyCap: 5 },
    mailboxObservation: { mailboxId: 'mbx-1', address: 'mohamed@uberbond.cloud', authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_COMPLETE', currentDailyCap: 5, providerDailyCap: 5, paused: false },
    egressReceipt: { ok: true, status: 'UBEREGRESS_READY', totalReadyColdDailyCap: 5, topology: { topologyDigest: 'egress-fixture', totalReadyColdDailyCap: 5 } },
    transportObservation: { state: 'READY', authenticated: true, evidenceRef: 'transport:fixture' },
    recipientProviderObservation: { state: 'READY', observedDailyBudget: 5, evidenceRef: 'provider-budget:fixture' }
  };
}

function leadFusionReceipt() {
  return {
    version: 'uberbond.uberlead-launch-fusion.v1',
    rankedDiscovery: {
      state: 'READY', sourceClass: 'PUBLIC_BUSINESS_DATA', qualifiedProspectCount: 1,
      evidenceRef: 'lead-fusion:fixture', protectedSource: false, captchaBypass: false, privateDataInference: false
    }
  };
}

function capsule(overrides = {}) {
  return compileSovereignOutreachLaunchCapsule({
    sourceReadiness: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'main:verified' },
    leadFusionReceipt: leadFusionReceipt(),
    runtimeEvidence: greenRuntimeEvidence(),
    genome: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'genome:verified' },
    recipient: { safeForOutreach: true, email: 'buyer@example.com', verificationEvidenceRef: 'contact:direct-public' },
    legal: { status: 'PASSED', evidenceId: 'legal:fixture', policyVersion: 'legal-v1' },
    suppression: { suppressed: false, unsubscribed: false },
    campaignId: 'canary-1',
    message: { to: 'buyer@example.com', from: 'mohamed@uberbond.cloud', campaignId: 'canary-1', subject: 'Evidence canary', body: 'Bounded synthetic fixture.', listUnsubscribe: 'https://uberbond.cloud/unsubscribe/token-fixture' },
    idempotencyKey: 'big-button-fixture-1',
    preparedAt: now,
    expiresAt: '2026-09-15T03:15:00.000Z',
    ...overrides
  });
}

test('green immutable capsule reaches founder-press readiness but creates zero authority', () => {
  const cap = capsule();
  const out = evaluateSovereignOutreachButton({ capsule: cap, expectedDigest: cap.capsuleDigest, now });
  assert.equal(out.state, 'READY_FOR_FOUNDER_PRESS');
  assert.equal(out.oneButtonPressAvailable, true);
  assert.equal(out.automaticSendAuthority, false);
  assert.equal(out.externalEffectAuthority, 'NONE');
  assert.equal(computeOutreachCapsuleDigest(cap), cap.capsuleDigest);
});

test('capsule mutation after preparation is a hard stop', () => {
  const cap = capsule();
  cap.message.subject = 'Mutated after founder preview';
  const out = evaluateSovereignOutreachButton({ capsule: cap, expectedDigest: cap.capsuleDigest, now });
  assert.equal(out.state, 'ABSTAIN');
  assert.ok(out.reasonCodes.includes('launch-capsule-integrity-mismatch'));
});

test('founder digest mismatch cannot authorize a different capsule', () => {
  const cap = capsule();
  const out = evaluateSovereignOutreachButton({ capsule: cap, expectedDigest: 'ubocap_' + '0'.repeat(64), now });
  assert.equal(out.state, 'ABSTAIN');
  assert.ok(out.reasonCodes.includes('founder-pressed-capsule-digest-mismatch'));
});

test('suppression still dominates a fully green capsule', () => {
  const cap = capsule({ suppression: { suppressed: true, unsubscribed: false } });
  const out = evaluateSovereignOutreachButton({ capsule: cap, expectedDigest: cap.capsuleDigest, now });
  assert.equal(out.state, 'ABSTAIN');
  assert.ok(out.reasonCodes.includes('suppression-dominates'));
});

test('missing physical egress keeps the button waiting for reality', () => {
  const runtimeEvidence = greenRuntimeEvidence();
  runtimeEvidence.egressReceipt = { ok: true, status: 'UBEREGRESS_BLOCKED', totalReadyColdDailyCap: 0, topology: { topologyDigest: 'planning-only', totalReadyColdDailyCap: 0 } };
  const cap = capsule({ runtimeEvidence });
  const out = evaluateSovereignOutreachButton({ capsule: cap, expectedDigest: cap.capsuleDigest, now });
  assert.equal(out.state, 'WAITING_FOR_REALITY');
  assert.ok(out.reasonCodes.includes('observed-egress-capacity-required'));
  assert.equal(out.oneButtonPressAvailable, false);
});

test('Postal bridge binds deterministic effect identity and returns explicit provider receipt', async () => {
  let calls = 0;
  const adapter = createPostalGovernedTransportAdapter({
    baseUrl: 'https://postal.example.test',
    apiKey: 'test-secret',
    fromAddress: 'mohamed@uberbond.cloud',
    messageIdDomain: 'uberbond.cloud',
    now: () => now,
    fetchImpl: async (_url, request) => {
      calls += 1;
      const body = JSON.parse(request.body);
      assert.equal(body.to[0], 'buyer@example.com');
      assert.match(body.headers['Message-ID'], /^<v9-[a-f0-9]{64}@uberbond\.cloud>$/);
      return { status: 200, json: async () => ({ status: 'success', data: { message_id: 'postal-generated', messages: { 'buyer@example.com': { id: 77 } } } }) };
    }
  });
  const result = await adapter.send({
    to: 'buyer@example.com', from: 'mohamed@uberbond.cloud', subject: 'x', body: 'y',
    campaignId: 'canary-1', idempotencyKey: 'idem', launchDecisionId: 'launch', authorizationReceiptId: 'auth'
  });
  assert.equal(calls, 1);
  assert.equal(result.confirmed, true);
  assert.equal(result.providerReceiptId, 'postal:77');
});

test('one authenticated founder press can dispatch exactly one governed synthetic canary', async () => {
  const cap = capsule();
  let calls = 0;
  const result = await pressSovereignOutreachBigButton({
    capsule: cap,
    expectedDigest: cap.capsuleDigest,
    now,
    transportAdapter: {
      send: async input => {
        calls += 1;
        assert.equal(input.to, 'buyer@example.com');
        assert.equal(input.campaignId, 'canary-1');
        return { confirmed: true, providerReceiptId: 'postal:fixture-1' };
      }
    }
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.state, 'PROVIDER_CONFIRMED_SEND');
  assert.equal(result.messagesSent, 1);
  assert.equal(result.automaticRetryAuthorized, false);
  assert.match(result.pressId, /^ubpress_[a-f0-9]{64}$/);
  assert.match(result.truthBoundary, /exact immutable capsule/i);
});

test('uncertain provider outcome is not automatically retried by the big button', async () => {
  const cap = capsule();
  let calls = 0;
  const result = await pressSovereignOutreachBigButton({
    capsule: cap,
    expectedDigest: cap.capsuleDigest,
    now,
    transportAdapter: { send: async () => { calls += 1; return { confirmed: false }; } }
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.state, 'DISPATCH_OUTCOME_UNCERTAIN');
  assert.equal(result.automaticRetryAuthorized, false);
});
