import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOutreach100kLaunchCertificate, compileOutreach100kCompletion } from '../src/outreach-100k-launch-contract.mjs';

const NOW = new Date('2026-09-15T02:00:00.000Z');
const fresh = { observedAt: '2026-09-15T01:30:00.000Z', evidenceRef: 'receipt:fresh' };
function readyInput() {
  return {
    now: NOW,
    inventory: { ...fresh, eligibleVerifiedUnsuppressedRemaining: 100000, recipientSetDigest: 'sha256:eligible', recipientProviderCounts: { gmail: 50000, microsoft: 50000 } },
    domains: [
      { ...fresh, domainId: 'uberbond.agency', ownerAuthorized: true, dnsAuthenticated: true, reputationHealthy: true },
      { ...fresh, domainId: 'uberbond.cloud', ownerAuthorized: true, dnsAuthenticated: true, reputationHealthy: true }
    ],
    mailboxes: [
      { ...fresh, mailboxId: 'm1', address: 'mohamed.001@uberbond.agency', domainId: 'uberbond.agency', egressRouteId: 'r1', authenticated: true, warmupState: 'HOLD', observedColdDailyCap: 50000, observedColdHourlyCap: 10000, usedToday: 0 },
      { ...fresh, mailboxId: 'm2', address: 'mohamed.001@uberbond.cloud', domainId: 'uberbond.cloud', egressRouteId: 'r2', authenticated: true, warmupState: 'HOLD', observedColdDailyCap: 50000, observedColdHourlyCap: 10000, usedToday: 0 }
    ],
    egressRoutes: [
      { ...fresh, routeId: 'r1', ready: true, authorized: true, termsCompatible: true, observedColdDailyCap: 50000, usedToday: 0 },
      { ...fresh, routeId: 'r2', ready: true, authorized: true, termsCompatible: true, observedColdDailyCap: 50000, usedToday: 0 }
    ],
    recipientProviders: [
      { ...fresh, providerId: 'gmail', ready: true, observedDailyBudget: 50000, usedToday: 0 },
      { ...fresh, providerId: 'microsoft', ready: true, observedDailyBudget: 50000, usedToday: 0 }
    ],
    campaign: { ...fresh, authorized: true, dailyCeiling: 100000, usedToday: 0, expiresAt: '2026-09-16T00:00:00.000Z' },
    runtime: { ...fresh, ready: true, state: 'RUNTIME_EVIDENCE_READY' },
    schedule: { ...fresh, ready: true, remainingDispatchCapacityToday: 100000 },
    outbound: { enabled: true, dryRun: false, globalPaused: false, uncertain: 0, workerOnline: true, schedulerActive: true, providerConfirmedToday: 0 }
  };
}

test('certifies exactly 100k only when every observed capacity dimension clears 100k', () => {
  const r = compileOutreach100kLaunchCertificate(readyInput());
  assert.equal(r.state, 'CERTIFIED_100K_READY');
  assert.equal(r.oneButton100kPressAvailable, true);
  assert.equal(r.certifiableToday, 100000);
  assert.equal(r.shortfall, 0);
});

test('99,999 capacity refuses rather than rounding or borrowing from another layer', () => {
  const input = readyInput();
  input.egressRoutes[1].observedColdDailyCap = 49999;
  const r = compileOutreach100kLaunchCertificate(input);
  assert.equal(r.state, 'WAIT_EXTERNAL_EVIDENCE');
  assert.equal(r.certifiableToday, 99999);
  assert.equal(r.shortfall, 1);
  assert.ok(r.waitReasonCodes.includes('100k-observed-capacity-shortfall'));
});

test('shared egress does not multiply mailbox capacity', () => {
  const input = readyInput();
  input.mailboxes[1].egressRouteId = 'r1';
  input.egressRoutes = [{ ...fresh, routeId: 'r1', ready: true, authorized: true, termsCompatible: true, observedColdDailyCap: 50000, usedToday: 0 }];
  const r = compileOutreach100kLaunchCertificate(input);
  assert.equal(r.certifiableToday, 50000);
  assert.equal(r.shortfall, 50000);
});

test('uncertain provider outcome is a hard stop', () => {
  const input = readyInput();
  input.outbound.uncertain = 1;
  const r = compileOutreach100kLaunchCertificate(input);
  assert.equal(r.state, 'ABSTAIN');
  assert.ok(r.hardStopReasonCodes.includes('uncertain-provider-outcomes-must-be-zero'));
});

test('provider distribution must exactly cover eligible inventory', () => {
  const input = readyInput();
  input.inventory.recipientProviderCounts = { gmail: 50000 };
  const r = compileOutreach100kLaunchCertificate(input);
  assert.equal(r.state, 'WAIT_EXTERNAL_EVIDENCE');
  assert.ok(r.waitReasonCodes.includes('recipient-provider-distribution-must-cover-exact-eligible-inventory'));
});

test('completion counts unique provider-confirmed receipts only', () => {
  const rows = Array.from({ length: 100000 }, (_, i) => ({ state: 'PROVIDER_CONFIRMED_SEND', messagesSent: 1, dispatchId: `d${i}`, providerReceiptId: `p${i}`, observedAt: '2026-09-15T12:00:00.000Z' }));
  rows.push({ ...rows[0] }, { state: 'DISPATCH_OUTCOME_UNCERTAIN', dispatchId: 'u1', observedAt: '2026-09-15T12:00:00.000Z' });
  const r = compileOutreach100kCompletion({ dispatchReceipts: rows, date: '2026-09-15' });
  assert.equal(r.state, '100K_PROVIDER_CONFIRMED_COMPLETE');
  assert.equal(r.providerConfirmedUniqueSends, 100000);
  assert.equal(r.uncertainOutcomeCount, 1);
});
