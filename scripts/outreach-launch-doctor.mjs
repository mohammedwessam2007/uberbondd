#!/usr/bin/env node
import assert from 'node:assert/strict';
import { evaluateOutreachLaunchGate } from '../src/outreach-launch-gate.mjs';
import { dispatchGovernedOutreach } from '../src/governed-outreach-dispatch.mjs';

const now = new Date('2026-09-15T00:00:00.000Z');
const launch = evaluateOutreachLaunchGate({
  genome: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'doctor:genome' },
  domainState: { domainId: 'doctor-domain', state: 'READY_FOR_LIMITED_OUTREACH', outreachState: 'AUTHORIZED', evidenceFreshness: 'FRESH' },
  mailboxState: { mailboxId: 'doctor-mailbox', authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_COMPLETE', paused: false, currentDailyCap: 1 },
  egress: { state: 'READY', observedColdDailyCap: 1, evidenceRef: 'doctor:egress' },
  transport: { state: 'READY', authenticated: true, evidenceRef: 'doctor:transport' },
  campaignAuthorization: { authorized: true, receiptId: 'doctor:campaign-auth', expiresAt: '2026-09-16T00:00:00.000Z' },
  recipient: { email: 'doctor@example.com', safeForOutreach: true, verificationEvidenceRef: 'doctor:recipient-verification' },
  legal: { status: 'PASSED', evidenceId: 'doctor:legal', policyVersion: 'doctor-legal-v1' },
  suppression: { suppressed: false, unsubscribed: false },
  recipientProvider: { state: 'READY', observedDailyBudget: 1, evidenceRef: 'doctor:recipient-provider' },
  now
});

let providerCalls = 0;
const denied = await dispatchGovernedOutreach({
  launchDecision: launch,
  authorization: {
    authorized: false,
    receiptId: 'doctor:dispatch-auth',
    authorizedBy: 'doctor',
    recipientEmail: 'doctor@example.com',
    campaignId: 'doctor-campaign',
    expiresAt: '2026-09-16T00:00:00.000Z'
  },
  message: { to: 'doctor@example.com', subject: 'doctor', body: 'doctor', campaignId: 'doctor-campaign' },
  transportAdapter: { send: async () => { providerCalls += 1; return { confirmed: true, providerReceiptId: 'impossible' }; } },
  idempotencyKey: 'doctor:denied',
  now
});
assert.equal(denied.ok, false);
assert.equal(providerCalls, 0);

const confirmed = await dispatchGovernedOutreach({
  launchDecision: launch,
  authorization: {
    authorized: true,
    receiptId: 'doctor:dispatch-auth',
    authorizedBy: 'doctor',
    recipientEmail: 'doctor@example.com',
    campaignId: 'doctor-campaign',
    expiresAt: '2026-09-16T00:00:00.000Z'
  },
  message: { to: 'doctor@example.com', subject: 'doctor', body: 'doctor', campaignId: 'doctor-campaign' },
  transportAdapter: { send: async () => { providerCalls += 1; return { confirmed: true, providerReceiptId: 'doctor-provider-receipt' }; } },
  idempotencyKey: 'doctor:confirmed',
  now
});
assert.equal(confirmed.ok, true);
assert.equal(providerCalls, 1);

const receipt = {
  ok: true,
  status: 'OUTREACH_SOURCE_LAUNCH_PATH_VERIFIED',
  launchGateState: launch.state,
  deniedWithoutAuthority: denied.ok === false && denied.providerCalls === 0,
  exactAuthorizedProviderCalls: confirmed.providerCalls,
  exactAuthorizedMessagesSent: confirmed.messagesSent,
  automaticRetryAuthorized: confirmed.automaticRetryAuthorized,
  externalEffectAuthorityCreatedByDoctor: 'NONE',
  businessEffectAuthorityCreatedByDoctor: 'NONE',
  truthBoundary: 'This doctor proves the source launch gate and provider-neutral dispatch contract execute correctly with synthetic evidence and a fake adapter. It performs zero real provider calls and does not prove physical sender activation, inbox placement, legal eligibility for any real recipient, customer response, revenue, or 100000/day live capacity.'
};
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
