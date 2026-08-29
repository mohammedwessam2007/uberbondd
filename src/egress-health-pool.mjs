import crypto from 'node:crypto';

export const EGRESS_HEALTH_POLICY_VERSION = 'uberbond.egress-health-pool.v1';
const PROHIBITED_PURPOSES = new Set(['CAPTCHA_BYPASS','ACCESS_CONTROL_BYPASS','REPUTATION_EVASION','BLOCK_EVASION','FINGERPRINT_SPOOFING']);
const ACTIVE_STATES = new Set(['HEALTHY','DEGRADED']);
const text = (v, m = 300) => String(v ?? '').trim().slice(0, m);
const sha = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: EGRESS_HEALTH_POLICY_VERSION,
    status: 'BLOCKED',
    reasonCodes: [...new Set(reasonCodes)],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { networkCalls: 0, proxyRotations: 0, browserLaunches: 0, spendCents: 0 },
    ...extra
  };
}

function hasSpoofing(input = {}) {
  return Boolean(
    input.fingerprintOverride || input.webglSpoof || input.canvasSpoof || input.userAgentSpoof ||
    input.screenSpoof || input.deviceSpoof || input.captchaBypass || input.rotateOnBlock
  );
}

export function selectEgressRoute(input = {}) {
  const purpose = text(input.purpose, 80).toUpperCase();
  const targetRef = text(input.targetRef, 240);
  const targetAccessState = text(input.targetAccessState, 80).toUpperCase();
  const now = new Date(input.now || Date.now());
  const routes = Array.isArray(input.routes) ? input.routes : [];
  const reasons = [];
  if (!purpose) reasons.push('purpose-required');
  if (PROHIBITED_PURPOSES.has(purpose)) reasons.push('prohibited-evasion-purpose');
  if (!targetRef) reasons.push('target-ref-required');
  if (!Number.isFinite(now.getTime())) reasons.push('valid-now-required');
  if (hasSpoofing(input)) reasons.push('browser-fingerprint-or-block-evasion-prohibited');
  if (['CAPTCHA','BLOCKED','ACCESS_DENIED','AUTH_REQUIRED'].includes(targetAccessState)) reasons.push('target-access-challenge-requires-stop-and-review');
  if (reasons.length) return fail(reasons, { disposition: 'STOP_AND_REVIEW' });

  const eligible = routes.map((r) => {
    const observedAt = new Date(r?.observedAt || 0);
    const state = text(r?.state, 30).toUpperCase();
    const allowedPurposes = new Set((Array.isArray(r?.allowedPurposes) ? r.allowedPurposes : []).map((v) => text(v,80).toUpperCase()));
    const blocked = r?.blocked === true || r?.captchaObserved === true || r?.accessDenied === true;
    const latencyMs = Number(r?.latencyMs);
    const successRate = Number(r?.successRate);
    const failureStreak = Math.max(0, Number(r?.failureStreak) || 0);
    const ageMs = now.getTime() - observedAt.getTime();
    const fresh = Number.isFinite(observedAt.getTime()) && ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000;
    const policyRef = text(r?.policyRef, 240);
    const routeRef = text(r?.routeRef, 160);
    const eligible = Boolean(routeRef && policyRef && fresh && ACTIVE_STATES.has(state) && !blocked && allowedPurposes.has(purpose));
    const score = eligible ? (Number.isFinite(successRate) ? successRate : 0.5) * 1000 - (Number.isFinite(latencyMs) ? latencyMs : 5000) - failureStreak * 250 - (state === 'DEGRADED' ? 500 : 0) : -Infinity;
    return { routeRef, policyRef, state, observedAt: fresh ? observedAt.toISOString() : null, eligible, score };
  }).filter((r) => r.eligible).sort((a,b) => b.score - a.score || a.routeRef.localeCompare(b.routeRef));

  if (!eligible.length) return fail(['no-policy-eligible-healthy-egress-route'], { disposition: 'NO_ROUTE' });
  const selected = eligible[0];
  return {
    ok: true,
    policyVersion: EGRESS_HEALTH_POLICY_VERSION,
    status: 'EGRESS_ROUTE_SELECTED',
    selection: {
      selectionId: `egress_${sha([purpose,targetRef,selected.routeRef,selected.observedAt]).slice(0,28)}`,
      routeRef: selected.routeRef,
      policyRef: selected.policyRef,
      purpose,
      targetRef,
      rotationLaw: 'ROTATE_FOR_RELIABILITY_OR_CAPACITY_ONLY; NEVER_ROTATE_TO_EVADE_BLOCKS_CAPTCHA_OR_ACCESS_CONTROLS',
      browserIdentityLaw: 'DO_NOT_SPOOF_WEBGL_CANVAS_DEVICE_SCREEN_OR_BROWSER_IDENTITY'
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { networkCalls: 0, proxyRotations: 0, browserLaunches: 0, spendCents: 0 }
  };
}

export function normalizeEgressOutcome(input = {}) {
  const routeRef = text(input.routeRef, 160);
  const outcome = text(input.outcome, 80).toUpperCase();
  const observedAt = new Date(input.observedAt || '');
  const reasons = [];
  if (!routeRef) reasons.push('route-ref-required');
  if (!['SUCCESS','TIMEOUT','NETWORK_ERROR','RATE_LIMITED','BLOCKED','CAPTCHA','ACCESS_DENIED'].includes(outcome)) reasons.push('invalid-outcome');
  if (!Number.isFinite(observedAt.getTime())) reasons.push('valid-observed-at-required');
  if (reasons.length) return fail(reasons);
  const quarantine = ['BLOCKED','CAPTCHA','ACCESS_DENIED'].includes(outcome);
  return {
    ok: true,
    policyVersion: EGRESS_HEALTH_POLICY_VERSION,
    status: 'EGRESS_OUTCOME_NORMALIZED',
    outcome: {
      eventId: `egress_evt_${sha([routeRef,outcome,observedAt.toISOString()]).slice(0,28)}`,
      routeRef,
      outcome,
      observedAt: observedAt.toISOString(),
      nextState: quarantine ? 'QUARANTINED' : outcome === 'SUCCESS' ? 'HEALTHY' : 'DEGRADED',
      retryDisposition: quarantine ? 'STOP_TARGET_AND_REVIEW; DO_NOT_ROTATE_AROUND_BLOCK' : 'MAY_REEVALUATE_CAPACITY'
    },
    businessEffectAuthority: 'NONE'
  };
}
