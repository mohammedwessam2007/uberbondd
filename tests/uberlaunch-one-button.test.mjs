import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberLaunchManifest, prepareUberLaunchDiscovery, pressUberLaunchButton } from '../src/uberlaunch-one-button.mjs';

const now = new Date('2026-09-15T00:00:00.000Z');

function readyInputs() {
  return {
    sourceReadiness: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'src-proof-1' },
    discovery: { state: 'READY', sourceClass: 'PUBLIC_BUSINESS_DATA', qualifiedProspectCount: 25, evidenceRef: 'disc-proof-1' },
    substrate: { mode: 'SELF_HOSTED', controlPlane: 'OWNED', substrateId: 'UBERCLOUD', observedHealthy: true, evidenceRef: 'runtime-proof-1' },
    launchInputs: {
      genome: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'genome-proof-1' },
      domainState: { domainId: 'uberbond.cloud', state: 'READY_FOR_LIMITED_OUTREACH', outreachState: 'AUTHORIZED', evidenceFreshness: 'FRESH' },
      mailboxState: { mailboxId: 'mbx-1', authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_COMPLETE', paused: false, currentDailyCap: 5 },
      egress: { state: 'READY', observedColdDailyCap: 5, evidenceRef: 'egress-proof-1' },
      transport: { state: 'READY', authenticated: true, evidenceRef: 'transport-proof-1' },
      campaignAuthorization: { authorized: true, receiptId: 'campaign-auth-1', expiresAt: '2026-09-15T01:00:00.000Z' },
      recipient: { safeForOutreach: true, email: 'buyer@example.com', verificationEvidenceRef: 'verify-proof-1' },
      legal: { status: 'PASSED', evidenceId: 'legal-proof-1', policyVersion: 'legal-v1' },
      suppression: { suppressed: false, unsubscribed: false },
      recipientProvider: { state: 'READY', observedDailyBudget: 5, evidenceRef: 'provider-budget-proof-1' }
    },
    ownerAuthorization: { authorized: true, receiptId: 'owner-press-1', expiresAt: '2026-09-15T00:15:00.000Z' },
    now
  };
}

test('public-business discovery adapter is wired into launch preparation without private-data inference', async () => {
  const payload = {
    elements: [{
      type: 'node',
      id: 123,
      lat: 30,
      lon: 31,
      tags: { name: 'Clinic Fixture', amenity: 'clinic', website: 'https://clinic.example' }
    }]
  };
  const fetcher = async () => ({ ok: true, status: 200, json: async () => payload, headers: new Headers() });
  const out = await prepareUberLaunchDiscovery({
    discoveryConfig: {
      endpoint: 'https://overpass-api.de/api/interpreter',
      categories: ['clinic'],
      bbox: [29.9, 30.9, 30.1, 31.1],
      maxBboxSpan: 5,
      timeoutMs: 1000,
      retryAttempts: 1,
      minIntervalMs: 0,
      dailyCap: 10,
      userAgent: 'UberBond-test'
    },
    discoveryOptions: { categories: ['clinic'], bbox: [29.9, 30.9, 30.1, 31.1], limit: 10 },
    fetcher
  });
  assert.equal(out.state, 'READY');
  assert.equal(out.sourceClass, 'PUBLIC_BUSINESS_DATA');
  assert.equal(out.qualifiedProspectCount, 1);
  assert.equal(out.privateDataInference, false);
  assert.match(out.evidenceRef, /^ubdisc_[a-f0-9]{64}$/);
  assert.equal(out.prospects[0].company, 'Clinic Fixture');
});

test('green sovereign evidence compiles one READY_TO_PRESS manifest with zero automatic authority', () => {
  const out = compileUberLaunchManifest(readyInputs());
  assert.equal(out.state, 'READY_TO_PRESS');
  assert.equal(out.oneButtonPressAvailable, true);
  assert.equal(out.selfHost.ok, true);
  assert.equal(out.automaticSendAuthority, false);
  assert.equal(out.externalEffectAuthority, 'NONE');
  assert.match(out.manifestId, /^ublaunch_[a-f0-9]{64}$/);
});

test('non-self-hosted runtime is not launch ready', () => {
  const input = readyInputs();
  input.substrate = { mode: 'MANAGED_SAAS', controlPlane: 'THIRD_PARTY', substrateId: 'OTHER', observedHealthy: true, evidenceRef: 'x' };
  const out = compileUberLaunchManifest(input);
  assert.equal(out.state, 'WAIT_EXTERNAL_EVIDENCE');
  assert.ok(out.waitReasonCodes.includes('self-hosted-runtime-required'));
  assert.ok(out.waitReasonCodes.includes('owned-control-plane-required'));
});

test('protected-source or private-data discovery is a hard stop', () => {
  const input = readyInputs();
  input.discovery.protectedSource = true;
  input.discovery.privateDataInference = true;
  const out = compileUberLaunchManifest(input);
  assert.equal(out.state, 'ABSTAIN');
  assert.ok(out.hardStopReasonCodes.includes('prohibited-discovery-method'));
});

test('suppression still dominates the big button', () => {
  const input = readyInputs();
  input.launchInputs.suppression.suppressed = true;
  const out = compileUberLaunchManifest(input);
  assert.equal(out.state, 'ABSTAIN');
  assert.ok(out.hardStopReasonCodes.includes('suppression-dominates'));
});

test('missing physical egress proof keeps launch waiting instead of fabricating readiness', () => {
  const input = readyInputs();
  input.launchInputs.egress = { state: 'UNKNOWN', observedColdDailyCap: 0 };
  const out = compileUberLaunchManifest(input);
  assert.equal(out.state, 'WAIT_EXTERNAL_EVIDENCE');
  assert.ok(out.waitReasonCodes.includes('observed-ready-egress-required'));
  assert.ok(out.waitReasonCodes.includes('egress-evidence-reference-required'));
});

test('expired founder press receipt cannot dispatch', async () => {
  const manifest = compileUberLaunchManifest(readyInputs());
  const result = await pressUberLaunchButton({
    manifest,
    ownerAuthorization: { authorized: true, receiptId: 'owner-old', expiresAt: '2026-09-14T23:59:59.000Z' },
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'BIG_BUTTON_REFUSED');
  assert.equal(result.providerCalls, 0);
});

test('ready big button delegates to governed dispatch and never bypasses its exact action authorization', async () => {
  const input = readyInputs();
  const manifest = compileUberLaunchManifest(input);
  let calls = 0;
  const result = await pressUberLaunchButton({
    manifest,
    ownerAuthorization: input.ownerAuthorization,
    dispatchAuthorization: {
      authorized: true,
      receiptId: 'dispatch-auth-1',
      authorizedBy: 'FOUNDER',
      recipientEmail: 'buyer@example.com',
      campaignId: 'canary-1',
      expiresAt: '2026-09-15T00:10:00.000Z'
    },
    message: {
      to: 'buyer@example.com',
      from: 'founder@uberbond.cloud',
      campaignId: 'canary-1',
      subject: 'Evidence canary',
      body: 'Bounded synthetic test fixture.'
    },
    transportAdapter: { send: async () => { calls += 1; return { confirmed: true, providerReceiptId: 'provider-receipt-1' }; } },
    idempotencyKey: 'idem-1',
    now
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.state, 'PROVIDER_CONFIRMED_SEND');
  assert.equal(result.messagesSent, 1);
  assert.equal(result.automaticRetryAuthorized, false);
  assert.match(result.truthBoundary, /not a bypass/i);
});

test('dispatch recipient mismatch remains refused underneath the big button', async () => {
  const input = readyInputs();
  const manifest = compileUberLaunchManifest(input);
  let calls = 0;
  const result = await pressUberLaunchButton({
    manifest,
    ownerAuthorization: input.ownerAuthorization,
    dispatchAuthorization: {
      authorized: true,
      receiptId: 'dispatch-auth-1',
      authorizedBy: 'FOUNDER',
      recipientEmail: 'other@example.com',
      campaignId: 'canary-1',
      expiresAt: '2026-09-15T00:10:00.000Z'
    },
    message: { to: 'buyer@example.com', campaignId: 'canary-1', subject: 'x', body: 'y' },
    transportAdapter: { send: async () => { calls += 1; return { confirmed: true, providerReceiptId: 'never' }; } },
    idempotencyKey: 'idem-2',
    now
  });
  assert.equal(calls, 0);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('authorization-recipient-mismatch'));
});
