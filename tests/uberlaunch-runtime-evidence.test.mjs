import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileUberLaunchRuntimeEvidence,
  prepareSovereignOneButtonLaunch
} from '../src/uberlaunch-runtime-evidence.mjs';

const now = new Date('2026-09-15T02:00:00.000Z');

function greenRuntimeEvidence() {
  return {
    runtimeReceipt: {
      ok: true,
      status: 'UBERCEL_ECONOMIC_DEPLOYMENT_OBSERVED',
      economicRuntime: {
        ok: true,
        evidenceRefs: [
          'file:/var/lib/uberbond-control/bootstrap-doctor.json',
          'systemd:uberbond-founder-outcome-mission.timer'
        ]
      }
    },
    domainObservation: {
      domainId: 'uberbond.cloud',
      ownerAuthorized: true,
      dnsAuthenticated: true,
      evidenceFreshness: 'FRESH',
      evidenceRef: 'dns-receipt-1'
    },
    inboxReconciliation: {
      ok: true,
      status: 'UBERINBOXES_FULLY_OBSERVED',
      confirmedAddresses: ['mohamed@uberbond.cloud']
    },
    warmDecision: {
      state: 'RAMP',
      mailboxId: 'mbx-1',
      address: 'mohamed@uberbond.cloud',
      recommendedColdDailyCap: 5
    },
    mailboxObservation: {
      mailboxId: 'mbx-1',
      address: 'mohamed@uberbond.cloud',
      authenticationStatus: 'AUTHENTICATED',
      warmupStatus: 'WARMUP_COMPLETE',
      currentDailyCap: 5,
      providerDailyCap: 5,
      paused: false
    },
    egressReceipt: {
      ok: true,
      status: 'UBEREGRESS_READY',
      totalReadyColdDailyCap: 5,
      topology: { topologyDigest: 'egress-digest-1', totalReadyColdDailyCap: 5 }
    },
    transportObservation: {
      state: 'READY',
      authenticated: true,
      evidenceRef: 'transport-receipt-1'
    },
    recipientProviderObservation: {
      state: 'READY',
      observedDailyBudget: 5,
      evidenceRef: 'recipient-provider-budget-1'
    }
  };
}

test('green observed sovereign receipts normalize into launch-ready runtime evidence', () => {
  const out = compileUberLaunchRuntimeEvidence(greenRuntimeEvidence());
  assert.equal(out.state, 'RUNTIME_EVIDENCE_READY');
  assert.equal(out.substrate.mode, 'SELF_HOSTED');
  assert.equal(out.substrate.controlPlane, 'OWNED');
  assert.equal(out.substrate.substrateId, 'UBERCEL');
  assert.equal(out.launchInputs.domainState.state, 'READY_FOR_LIMITED_OUTREACH');
  assert.equal(out.launchInputs.mailboxState.authenticationStatus, 'AUTHENTICATED');
  assert.equal(out.launchInputs.mailboxState.warmupStatus, 'WARMUP_COMPLETE');
  assert.equal(out.launchInputs.mailboxState.currentDailyCap, 5);
  assert.equal(out.launchInputs.egress.state, 'READY');
  assert.equal(out.launchInputs.transport.state, 'READY');
  assert.equal(out.launchInputs.recipientProvider.state, 'READY');
  assert.equal(out.waitReasonCodes.length, 0);
  assert.equal(out.automaticSendAuthority, false);
  assert.equal(out.externalEffectAuthority, 'NONE');
  assert.match(out.evidenceBundleId, /^ublaunchrt_[a-f0-9]{64}$/);
});

test('planner cannot turn unobserved physical state into green evidence', () => {
  const evidence = greenRuntimeEvidence();
  evidence.egressReceipt = {
    ok: true,
    status: 'UBEREGRESS_BLOCKED',
    totalReadyColdDailyCap: 0,
    topology: { topologyDigest: 'planning-only', totalReadyColdDailyCap: 0 }
  };
  evidence.inboxReconciliation = {
    ok: true,
    status: 'UBERINBOXES_PARTIALLY_OBSERVED',
    confirmedAddresses: []
  };
  const out = compileUberLaunchRuntimeEvidence(evidence);
  assert.equal(out.state, 'WAIT_EXTERNAL_OBSERVATION');
  assert.equal(out.launchInputs.egress.state, 'UNKNOWN');
  assert.equal(out.launchInputs.mailboxState.authenticationStatus, 'UNKNOWN');
  assert.ok(out.waitReasonCodes.includes('observed-egress-capacity-required'));
  assert.ok(out.waitReasonCodes.includes('observed-mailbox-materialization-and-authentication-required'));
});

test('quarantined reputation state cannot create mailbox send capacity', () => {
  const evidence = greenRuntimeEvidence();
  evidence.warmDecision = {
    state: 'QUARANTINED',
    mailboxId: 'mbx-1',
    address: 'mohamed@uberbond.cloud',
    recommendedColdDailyCap: 0
  };
  const out = compileUberLaunchRuntimeEvidence(evidence);
  assert.equal(out.launchInputs.mailboxState.paused, true);
  assert.equal(out.launchInputs.mailboxState.currentDailyCap, 0);
  assert.ok(out.waitReasonCodes.includes('observed-mailbox-warmup-and-health-cap-required'));
});

test('fully fused source path reaches READY_TO_PRESS only with all real-evidence fixtures green', async () => {
  const overpassPayload = {
    elements: [{
      type: 'node',
      id: 11,
      lat: 30.0,
      lon: 31.0,
      tags: { name: 'Alpha Clinic', amenity: 'clinic', website: 'https://alpha.example/' }
    }]
  };
  const fetcher = async () => ({ ok: true, status: 200, json: async () => overpassPayload });
  const result = await prepareSovereignOneButtonLaunch({
    sourceReadiness: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'commit:verified-main' },
    discoveryConfig: {
      categories: ['clinic'],
      bbox: [29.9, 30.9, 30.1, 31.1],
      maxBboxSpan: 5,
      timeoutMs: 1000,
      retryAttempts: 1,
      minIntervalMs: 0,
      endpoint: 'https://overpass-api.de/api/interpreter',
      userAgent: 'UberBond-Test/1.0',
      dailyCap: 10,
      country: 'EG',
      city: 'Giza'
    },
    discoveryOptions: { categories: ['clinic'], limit: 10 },
    leadQuery: { minScore: 0, minEvidenceScore: 0 },
    runtimeEvidence: greenRuntimeEvidence(),
    genome: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'doctor:genome' },
    campaignAuthorization: {
      authorized: true,
      receiptId: 'campaign-auth-1',
      expiresAt: '2026-09-15T03:00:00.000Z'
    },
    recipient: {
      safeForOutreach: true,
      email: 'buyer@example.com',
      verificationEvidenceRef: 'direct-public-business-contact-proof-1'
    },
    legal: { status: 'PASSED', evidenceId: 'legal-proof-1', policyVersion: 'legal-v1' },
    suppression: { suppressed: false, unsubscribed: false },
    ownerAuthorization: {
      authorized: true,
      receiptId: 'owner-big-button-1',
      expiresAt: '2026-09-15T02:10:00.000Z'
    },
    fetcher,
    now
  });

  assert.equal(result.runtime.state, 'RUNTIME_EVIDENCE_READY');
  assert.equal(result.leadLayer.rankedAccounts.length, 1);
  assert.equal(result.manifest.state, 'READY_TO_PRESS');
  assert.equal(result.oneButtonPressAvailable, true);
  assert.equal(result.automaticSendAuthority, false);
  assert.equal(result.externalEffectAuthority, 'NONE');
});

test('even a green runtime cannot bypass suppression', async () => {
  const overpassPayload = {
    elements: [{
      type: 'node',
      id: 12,
      lat: 30.0,
      lon: 31.0,
      tags: { name: 'Beta Clinic', amenity: 'clinic', website: 'https://beta.example/' }
    }]
  };
  const fetcher = async () => ({ ok: true, status: 200, json: async () => overpassPayload });
  const result = await prepareSovereignOneButtonLaunch({
    sourceReadiness: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'commit:verified-main' },
    discoveryConfig: {
      categories: ['clinic'], bbox: [29.9, 30.9, 30.1, 31.1], maxBboxSpan: 5,
      timeoutMs: 1000, retryAttempts: 1, minIntervalMs: 0,
      endpoint: 'https://overpass-api.de/api/interpreter', userAgent: 'UberBond-Test/1.0', dailyCap: 10
    },
    discoveryOptions: { categories: ['clinic'], limit: 10 },
    runtimeEvidence: greenRuntimeEvidence(),
    genome: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'doctor:genome' },
    campaignAuthorization: { authorized: true, receiptId: 'campaign-auth-2', expiresAt: '2026-09-15T03:00:00.000Z' },
    recipient: { safeForOutreach: true, email: 'buyer@example.com', verificationEvidenceRef: 'verify-proof' },
    legal: { status: 'PASSED', evidenceId: 'legal-proof-2', policyVersion: 'legal-v1' },
    suppression: { suppressed: true, unsubscribed: false },
    ownerAuthorization: { authorized: true, receiptId: 'owner-big-button-2', expiresAt: '2026-09-15T02:10:00.000Z' },
    fetcher,
    now
  });
  assert.equal(result.manifest.state, 'ABSTAIN');
  assert.ok(result.manifest.hardStopReasonCodes.includes('suppression-dominates'));
  assert.equal(result.oneButtonPressAvailable, false);
});
