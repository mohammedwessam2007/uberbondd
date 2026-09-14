import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOutreachLaunchGate, OUTREACH_LAUNCH_STATES } from '../src/outreach-launch-gate.mjs';

const ready = overrides => evaluateOutreachLaunchGate({
  genome: { state: 'VERIFIED_SOURCE_READY', evidenceRef: 'commit:abc' },
  domainState: { domainId: 'd1', state: 'READY_FOR_LIMITED_OUTREACH', outreachState: 'AUTHORIZED', evidenceFreshness: 'FRESH' },
  mailboxState: { mailboxId: 'm1', authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_COMPLETE', paused: false, currentDailyCap: 5 },
  egress: { state: 'READY', observedColdDailyCap: 5, evidenceRef: 'egress:1' },
  transport: { state: 'READY', authenticated: true, evidenceRef: 'transport:1' },
  campaignAuthorization: { authorized: true, receiptId: 'auth:1', expiresAt: '2026-09-16T00:00:00.000Z' },
  recipient: { email: 'buyer@example.com', safeForOutreach: true, verificationEvidenceRef: 'verify:1' },
  legal: { status: 'PASSED', evidenceId: 'legal:1', policyVersion: 'legal-v1' },
  suppression: { suppressed: false, unsubscribed: false },
  recipientProvider: { state: 'READY', observedDailyBudget: 5, evidenceRef: 'recipient-provider:1' },
  now: new Date('2026-09-15T00:00:00.000Z'),
  ...overrides
});

test('full evidence reaches governed canary readiness without creating authority', () => {
  const result = ready();
  assert.equal(result.state, OUTREACH_LAUNCH_STATES.READY);
  assert.equal(result.readyForGovernedCanary, true);
  assert.equal(result.automaticSendAuthority, false);
  assert.equal(result.externalEffectAuthority, 'NONE');
});

test('suppression always abstains', () => {
  const result = ready({ suppression: { suppressed: true, unsubscribed: false } });
  assert.equal(result.state, OUTREACH_LAUNCH_STATES.ABSTAIN);
  assert.ok(result.hardStopReasonCodes.includes('suppression-dominates'));
});

test('unknown physical sender evidence waits rather than inventing capacity', () => {
  const result = ready({ egress: {}, transport: {}, mailboxState: { mailboxId: 'm1', authenticationStatus: 'AUTHENTICATED', warmupStatus: 'WARMUP_COMPLETE', paused: false, currentDailyCap: 5 } });
  assert.equal(result.state, OUTREACH_LAUNCH_STATES.WAIT);
  assert.ok(result.waitReasonCodes.includes('observed-ready-egress-required'));
  assert.ok(result.waitReasonCodes.includes('authenticated-transport-required'));
});

test('expired campaign authorization abstains', () => {
  const result = ready({ campaignAuthorization: { authorized: true, receiptId: 'auth:1', expiresAt: '2026-09-14T00:00:00.000Z' } });
  assert.equal(result.state, OUTREACH_LAUNCH_STATES.ABSTAIN);
  assert.ok(result.hardStopReasonCodes.includes('campaign-authorization-expired'));
});
