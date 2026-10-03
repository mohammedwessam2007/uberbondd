import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGreenLaneActivationTruth } from '../src/green-lane-activation-truth.mjs';
import { routeGlobalGreenLane } from '../src/global-green-lane-router.mjs';
import { createPolicyEvidenceRegistry } from '../src/global-policy-evidence.mjs';
import { ukLtdInput, egyptSenderSide } from './fixtures/outreach/global-green-lane.fixture.mjs';

const now = new Date('2026-10-03T12:00:00.000Z');
const decision = (over = {}) => routeGlobalGreenLane(ukLtdInput(now, over));
const readyPreflight = { effectPackage: { state: 'READY_FOR_AUTHORIZATION', finalEffectDigest: 'd'.repeat(64) } };
const gates = t => Object.fromEntries(Object.entries(t.gates).map(([k, v]) => [k, v.status]));

test('GREEN ROUTE FOUND is displayed but activation stays blocked while any gate fails (the one-button never invents readiness)', () => {
  const t = compileGreenLaneActivationTruth({ routeDecision: decision() });
  assert.equal(t.display, 'GREEN ROUTE FOUND');
  assert.equal(t.routeFound, true);
  assert.equal(t.activationBlocked, true);
  assert.equal(t.automaticSendAuthority, false);
  assert.equal(t.sendAuthority, false);
  assert.ok(t.blockers.some(b => b.gate === 'provider' && /governance-refuses/.test(b.code)), 'the provider governance gate still refuses the cold route type');
  assert.ok(t.blockers.some(b => b.gate === 'effect'));
  assert.ok(t.blockers.some(b => b.gate === 'authorization'));
});

test('each named blocking condition blocks on its own: identity incomplete, effect incomplete, sender unhealthy, policy stale, history unknown, suppression hit, authorization absent', () => {
  const cases = {
    'identity incomplete': [{ sender: { identity: { legalBusinessSenderName: 'LEGAL_BUSINESS_SENDER_NAME', authorizedPublicPostalAddress: '', footerUseAuthorized: false } } }, 'identity'],
    'sender unhealthy': [{ sender: { allocation: { ok: false, reasonCodes: ['no-eligible-mailbox'] } } }, 'sender'],
    'sender-side hold': [{ sender: { senderSide: egyptSenderSide } }, 'sender'],
    'history unknown': [{ history: { status: 'CHECK_FAILED' } }, 'history'],
    'suppression hit': [{ suppression: { suppressed: true } }, 'suppression']
  };
  for (const [label, [over, gate]] of Object.entries(cases)) {
    const t = compileGreenLaneActivationTruth({ routeDecision: decision(over), preflight: readyPreflight, authorizationVerified: true });
    assert.equal(t.activationBlocked, true, label);
    assert.ok(t.blockers.some(b => b.gate === gate), `${label} -> ${gate}`);
  }
  const stale = compileGreenLaneActivationTruth({ routeDecision: routeGlobalGreenLane({ ...ukLtdInput(now), policyRegistry: createPolicyEvidenceRegistry({ rows: [], now }) }), preflight: readyPreflight, authorizationVerified: true });
  assert.equal(stale.display, 'POLICY REFRESH REQUIRED');
  assert.equal(stale.policyStale, true);
  assert.equal(stale.routeFound, false);
  assert.ok(stale.blockers.some(b => b.gate === 'policy' && /policy-refresh-required:recipient:GB/.test(b.code)));
  const noEffect = compileGreenLaneActivationTruth({ routeDecision: decision(), preflight: { effectPackage: { state: 'READY_EXCEPT_IDENTITY', finalEffectDigest: null } }, authorizationVerified: true });
  assert.ok(noEffect.blockers.some(b => b.gate === 'effect'));
  const noAuth = compileGreenLaneActivationTruth({ routeDecision: decision(), preflight: readyPreflight, authorizationVerified: false });
  assert.ok(noAuth.blockers.some(b => b.gate === 'authorization'));
  assert.equal(gates(noAuth).authorizationValid, 'FAIL');
});

test('there is no shadow policy: gates are read from the router and the effect package, and unreported gates are UNKNOWN, never PASS', () => {
  const t = compileGreenLaneActivationTruth({ routeDecision: { green: true, state: 'ROUTE_GREEN', routeClass: 'CORPORATE_GREEN', sendPrerequisites: {} }, preflight: readyPreflight, authorizationVerified: true });
  assert.equal(t.activationBlocked, true);
  for (const k of ['suppressionClean', 'historyClean', 'identityComplete', 'senderEligible', 'providerAllowed']) assert.equal(t.gates[k].status, 'UNKNOWN', k);
  assert.equal(t.gates.effectComplete.status, 'PASS');
  assert.equal(t.gates.authorizationValid.status, 'PASS');
  const none = compileGreenLaneActivationTruth({});
  assert.equal(none.display, 'ROUTE UNKNOWN');
  assert.equal(none.activationBlocked, true);
});

test('a non-green route never displays as found', () => {
  const t = compileGreenLaneActivationTruth({ routeDecision: decision({ suppression: { suppressed: true } }) });
  assert.equal(t.routeFound, false);
  assert.notEqual(t.display, 'GREEN ROUTE FOUND');
  assert.equal(t.externalEffectAuthority, 'NONE');
});
