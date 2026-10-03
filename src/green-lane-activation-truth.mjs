// FOUNDER ONE-BUTTON ROUTE TRUTH.
//
// The founder one-button must consume the SAME canonical route/preflight truth
// as the rest of the system, never a model of its own. This projection takes
// the router decision (and, when present, the preflight result) and answers one
// question: may a governed activation proceed on this route right now?
//
// It may display GREEN ROUTE FOUND, and it still blocks activation while ANY of
// these hold: identity incomplete, effect incomplete, sender unhealthy, policy
// stale, history unknown, suppression hit, authorization absent (and the
// provider/governance gate refusing the route type).
//
// There is no shadow policy: every status below is read from the router's
// `sendPrerequisites`, the policy-evidence state and the effect package; this
// module only labels them. It never grants, mints or implies send authority.

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { SEND_PREREQUISITES } from './global-green-lane-router.mjs';

export const GREEN_LANE_ACTIVATION_TRUTH_VERSION = 'uberbond.green-lane-activation-truth.v1';

const GATE_LABELS = Object.freeze({
  suppressionClean: 'suppression',
  historyClean: 'history',
  identityComplete: 'identity',
  senderEligible: 'sender',
  providerAllowed: 'provider',
  effectComplete: 'effect',
  authorizationValid: 'authorization'
});

/**
 * @param {object} input
 * @param {object} input.routeDecision        result of routeGlobalGreenLane
 * @param {object} [input.preflight]          result of runProspectPreflight (effect package state)
 * @param {boolean} [input.authorizationVerified] true only when the caller verified a founder-signed approval through governance
 */
export function compileGreenLaneActivationTruth({ routeDecision = null, preflight = null, authorizationVerified = false } = {}) {
  const gates = {};
  const blockers = [];
  const decision = routeDecision && typeof routeDecision === 'object' ? routeDecision : null;
  if (!decision) {
    return finish({ display: 'ROUTE UNKNOWN', routeFound: false, gates: {}, blockers: [{ gate: 'route', code: 'no-route-decision' }] });
  }
  const policyStale = decision.state === 'POLICY_REFRESH_REQUIRED';
  const prereq = decision.sendPrerequisites || {};
  for (const key of SEND_PREREQUISITES) {
    const entry = prereq[key] || { status: 'UNKNOWN', codes: ['gate-not-reported'] };
    let status = entry.status;
    let codes = entry.codes || [];
    if (key === 'effectComplete') {
      const state = preflight?.effectPackage?.state;
      const digest = preflight?.effectPackage?.finalEffectDigest;
      status = state === 'READY_FOR_AUTHORIZATION' && digest ? 'PASS' : 'FAIL';
      codes = status === 'PASS' ? [] : [preflight ? `effect-package:${String(state || 'absent').toLowerCase()}` : 'effect-package-not-compiled'];
    }
    if (key === 'authorizationValid') {
      status = authorizationVerified === true ? 'PASS' : 'FAIL';
      codes = status === 'PASS' ? [] : ['founder-signed-authorization-absent-or-unverified'];
    }
    gates[key] = { gate: GATE_LABELS[key], status, codes };
    if (status !== 'PASS') for (const code of codes.length ? codes : ['unresolved']) blockers.push({ gate: GATE_LABELS[key], code });
  }
  if (policyStale) for (const r of decision.policyRefreshRequired || []) blockers.push({ gate: 'policy', code: `policy-refresh-required:${r.ruleId}` });
  if (!decision.green && !policyStale) blockers.push({ gate: 'route', code: `route-not-green:${decision.state}` });
  const display = decision.green ? 'GREEN ROUTE FOUND' : policyStale ? 'POLICY REFRESH REQUIRED' : String(decision.state || 'ROUTE UNKNOWN').replace(/_/g, ' ');
  return finish({ display, routeFound: decision.green === true, gates, blockers, routeClass: decision.routeClass, routeDigest: decision.routeDigest, policyStale });
}

function finish({ display, routeFound, gates, blockers, routeClass = null, routeDigest = null, policyStale = false }) {
  const unique = [];
  const seen = new Set();
  for (const b of blockers) { const key = `${b.gate}:${b.code}`; if (!seen.has(key)) { seen.add(key); unique.push(b); } }
  return {
    version: GREEN_LANE_ACTIVATION_TRUTH_VERSION,
    display,
    routeFound,
    routeClass,
    routeDigest,
    policyStale,
    gates,
    blockers: unique,
    // Blocked unless every gate passes. Even then this is readiness for GOVERNED
    // activation, never automatic send authority.
    activationBlocked: !routeFound || unique.length > 0,
    automaticSendAuthority: false,
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    truthBoundary: 'GREEN ROUTE FOUND is a statement about policy/evidence prerequisites, not permission. Identity, effect package, sender health, fresh policy evidence, clean history, suppression, provider governance and a verified founder-signed authorization are each separately required.'
  };
}
