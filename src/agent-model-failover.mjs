// Executing down the routing order that already existed.
//
// `routeModel` in agent-model-router.mjs has always returned a `selected`
// candidate and a ranked `alternatives` list, and agent-model-routing-integration
// has always passed both through. Nothing ever executed down them. A grep for
// `failover`, `fallbackProvider` or `FALLBACK` across src/ returned nothing: the
// fallback ordering was computed, carried, reported -- and never used. When a
// provider hit a quota wall the run simply failed, next to a list naming exactly
// which model should have served it.
//
// This is the missing execution half, and deliberately only that half. It does
// not rank, score, or choose: `routeModel` decides the order and this walks it.
// A second component that decided routing would be a second policy brain, which
// is the specific failure the external capability registry warns about for
// gateway runtimes.
//
// It also never calls a provider itself. The caller supplies `execute`, so the
// only code that reaches the network stays the executors in
// agent-model-executor-factory.mjs, and this module remains pure enough to
// prove every branch without a credential.
//
// Three properties carry the weight:
//
//   Identity is preserved. Every attempt records the provider and model that
//   actually served or failed, and the result names the one that answered.
//   Nothing is rewritten to look like the primary.
//
//   No fallback is silent. Every attempt is in the returned ledger, including
//   the ones that were skipped and why. A caller that got a fallback answer can
//   always see that it did, and what it cost to get there.
//
//   An unknown outcome is not a licence to retry. The executors report
//   UNCERTAIN when a provider may have done the work -- a transport failure
//   after the request was accepted, a 5xx that could have been the response
//   getting lost rather than the request being refused. Failing over on that
//   runs the same task twice. So retrying an uncertain attempt is a property
//   the caller must declare about the task, and the default is that it may not.

import crypto from 'node:crypto';

export const AGENT_MODEL_FAILOVER_POLICY_VERSION = 'agent-model-failover-1.0.0';

const MAX_ROUTE_ATTEMPTS = 8;

/**
 * Why a route stopped being usable.
 *
 * These are the conditions under which a *different* route is a sensible
 * answer. They are not every way a call can fail.
 */
export const ROUTE_FAILURE_CLASSES = Object.freeze({
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  RATE_LIMITED: 'RATE_LIMITED',
  PROVIDER_OUTAGE: 'PROVIDER_OUTAGE',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE'
});

// Failures that a different provider cannot fix, kept apart on purpose.
//
// A malformed request is malformed everywhere; walking the whole route list to
// discover that four times is waste, and it buries the real defect under a
// fallback story.
//
// Credential rejection is the interesting one, and it is terminal by decision
// rather than by accident. Operationally a fallback would keep working while
// provider A's key stayed broken -- which is exactly why it is refused here. A
// credential that stops working is a configuration defect, and routing around
// it means nobody fixes it and the bill quietly moves to another provider.
// Trying identities until one is accepted is also the shape of behaviour this
// project forbids outright. If an operator wants a dead credential to fail over,
// that is a deliberate policy change, made here, visibly.
export const TERMINAL_FAILURE_CLASSES = Object.freeze({
  REQUEST_REJECTED: 'REQUEST_REJECTED',
  CREDENTIAL_REJECTED: 'CREDENTIAL_REJECTED',
  UNCLASSIFIED: 'UNCLASSIFIED'
});

const text = (value, max = 240) => String(value ?? '').trim().slice(0, max);

const fail = (reasonCodes, status = 'BLOCKED', extra = {}) => ({
  ok: false,
  policyVersion: AGENT_MODEL_FAILOVER_POLICY_VERSION,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  served: null,
  attempts: [],
  failoverOccurred: false,
  exhausted: false,
  ...extra
});

function httpStatusFrom(reasonCodes) {
  for (const code of reasonCodes) {
    const match = /-http-(\d{3})$/.exec(code);
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * Decide what a failed executor result means for routing.
 *
 * Reads the executor contract as it actually is: `{ ok:false, outcome, reasonCodes }`
 * where outcome is CONFIRMED_FAILURE or UNCERTAIN. A 429 arrives as a confirmed
 * failure alongside 400 and 422, so the class cannot come from the outcome
 * alone -- it comes from the reason codes, and the outcome then decides whether
 * retrying is safe.
 */
export function classifyRouteFailure(result = {}) {
  const reasonCodes = Array.isArray(result.reasonCodes) ? result.reasonCodes.map(code => text(code, 120)) : [];
  const joined = reasonCodes.join(' ').toLowerCase();
  const status = httpStatusFrom(reasonCodes);
  const uncertain = result.outcome === 'UNCERTAIN' || result.uncertain === true;

  // Quota before rate limit: providers report an exhausted balance as a 429
  // too, and the two call for different operator action even though both move
  // to the next route.
  if (/insufficient_quota|quota|billing|credit|payment_required/.test(joined) || status === 402) {
    return { failureClass: ROUTE_FAILURE_CLASSES.QUOTA_EXHAUSTED, failoverEligible: true, requiresIdempotency: uncertain, uncertain };
  }
  if (status === 429 || /rate_limit|rate-limit|too_many_requests/.test(joined)) {
    return { failureClass: ROUTE_FAILURE_CLASSES.RATE_LIMITED, failoverEligible: true, requiresIdempotency: uncertain, uncertain };
  }
  if (/model_not_found|model-not-found|unknown_model|model_unavailable|unsupported_model/.test(joined)) {
    return { failureClass: ROUTE_FAILURE_CLASSES.MODEL_UNAVAILABLE, failoverEligible: true, requiresIdempotency: uncertain, uncertain };
  }
  if (/overloaded|service_unavailable|transport|outage|timeout/.test(joined)
    || (status !== null && status >= 500)) {
    // An outage is the case that most often arrives UNCERTAIN, because a 5xx
    // can mean the request was refused or that the answer was lost on the way
    // back. Whether that may be retried is the caller's declaration.
    return { failureClass: ROUTE_FAILURE_CLASSES.PROVIDER_OUTAGE, failoverEligible: true, requiresIdempotency: uncertain, uncertain };
  }
  if (status === 401 || status === 403 || /unauthorized|forbidden|invalid_api_key|authentication/.test(joined)) {
    return { failureClass: TERMINAL_FAILURE_CLASSES.CREDENTIAL_REJECTED, failoverEligible: false, requiresIdempotency: false, uncertain };
  }
  if (status !== null && status >= 400 && status < 500) {
    return { failureClass: TERMINAL_FAILURE_CLASSES.REQUEST_REJECTED, failoverEligible: false, requiresIdempotency: false, uncertain };
  }
  // Never guess a class. An unrecognised failure is terminal, because moving to
  // another provider on a failure nobody understands is how one broken call
  // becomes a bill on every provider at once.
  return { failureClass: TERMINAL_FAILURE_CLASSES.UNCLASSIFIED, failoverEligible: false, requiresIdempotency: false, uncertain };
}

function routeIdentity(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const provider = text(candidate.provider, 80).toLowerCase();
  const model = text(candidate.model, 120);
  if (!provider || !model) return null;
  const candidateId = text(candidate.candidateId, 80)
    || `model_${crypto.createHash('sha256').update(JSON.stringify({ provider, model })).digest('hex').slice(0, 20)}`;
  return { provider, model, candidateId };
}

/**
 * Walk the routing order until something serves, or nothing can.
 *
 * @param {object}   options
 * @param {object}   options.route                a routeModel result: { selected, alternatives }
 * @param {string[]} options.authorizedProviders  providers this run may use at all
 * @param {Function} options.execute              async ({provider, model, candidateId}) => executor result
 * @param {string}  [options.taskIdempotency]     'IDEMPOTENT' allows retrying an uncertain attempt
 * @param {number}  [options.maxAttempts]
 */
export async function executeWithFailover({
  route = null,
  authorizedProviders = [],
  execute,
  taskIdempotency = 'NOT_IDEMPOTENT',
  maxAttempts = 4,
  now = () => new Date()
} = {}) {
  if (typeof execute !== 'function') return fail(['execute-function-required']);
  if (!route || route.ok !== true || !route.selected) return fail(['routed-model-required']);
  if (!Array.isArray(authorizedProviders)) return fail(['authorized-provider-list-required']);

  // An empty authorization list is not "everything is allowed". A run that was
  // never told which providers it may use has no authority to pick one.
  const authorized = new Set(authorizedProviders.map(value => text(value, 80).toLowerCase()).filter(Boolean));
  if (!authorized.size) return fail(['no-authorized-provider-configured']);

  const idempotent = taskIdempotency === 'IDEMPOTENT';
  const limit = Math.max(1, Math.min(MAX_ROUTE_ATTEMPTS, Number(maxAttempts) || 1));

  const ordered = [route.selected, ...(Array.isArray(route.alternatives) ? route.alternatives : [])]
    .map(routeIdentity)
    .filter(Boolean);
  if (!ordered.length) return fail(['route-carries-no-identifiable-candidate']);

  const attempts = [];
  const reasonCodes = [];
  let served = null;
  let servedResult = null;
  let exhausted = true;

  for (const candidate of ordered) {
    if (attempts.filter(item => item.attempted).length >= limit) {
      reasonCodes.push('attempt-budget-reached');
      exhausted = false;
      break;
    }

    // Identity is checked before the call, never after. A provider this run may
    // not use is not attempted and then explained -- it is not attempted.
    if (!authorized.has(candidate.provider)) {
      attempts.push({
        sequence: attempts.length + 1,
        ...candidate,
        attempted: false,
        outcome: 'SKIPPED',
        failureClass: 'PROVIDER_NOT_AUTHORIZED',
        reasonCodes: ['provider-not-authorized'],
        at: now().toISOString()
      });
      continue;
    }

    const startedAt = now().toISOString();
    let result;
    try {
      result = await execute({ ...candidate });
    } catch (error) {
      // A thrown error is not a provider answer. It is treated as an uncertain
      // outage, which means it only moves on for an idempotent task.
      result = { ok: false, outcome: 'UNCERTAIN', reasonCodes: ['executor-threw', text(error?.message, 200)].filter(Boolean) };
    }

    if (result?.ok === true) {
      attempts.push({
        sequence: attempts.length + 1,
        ...candidate,
        attempted: true,
        outcome: 'SERVED',
        failureClass: null,
        reasonCodes: [],
        startedAt,
        finishedAt: now().toISOString()
      });
      served = { ...candidate };
      servedResult = result;
      exhausted = false;
      break;
    }

    const classification = classifyRouteFailure(result || {});
    const blockedByIdempotency = classification.failoverEligible
      && classification.requiresIdempotency
      && !idempotent;

    attempts.push({
      sequence: attempts.length + 1,
      ...candidate,
      attempted: true,
      outcome: 'FAILED',
      failureClass: classification.failureClass,
      uncertain: classification.uncertain === true,
      reasonCodes: [
        ...(Array.isArray(result?.reasonCodes) ? result.reasonCodes.map(code => text(code, 120)) : []),
        ...(blockedByIdempotency ? ['uncertain-outcome-not-retryable-for-non-idempotent-task'] : [])
      ],
      startedAt,
      finishedAt: now().toISOString()
    });

    if (!classification.failoverEligible) {
      reasonCodes.push(`terminal-${String(classification.failureClass).toLowerCase()}`);
      exhausted = false;
      break;
    }
    if (blockedByIdempotency) {
      // Stopping here is the safe answer, not a lesser one: the provider may
      // already have done the work, and a second provider doing it again is a
      // worse outcome than a failed run the caller can decide about.
      reasonCodes.push('uncertain-outcome-not-retryable-for-non-idempotent-task');
      exhausted = false;
      break;
    }
    reasonCodes.push(`failover-${String(classification.failureClass).toLowerCase()}`);
  }

  const attemptedCount = attempts.filter(item => item.attempted).length;
  const failoverOccurred = Boolean(served) && attempts.findIndex(item => item.outcome === 'SERVED') > 0;

  if (served) {
    return {
      ok: true,
      policyVersion: AGENT_MODEL_FAILOVER_POLICY_VERSION,
      status: failoverOccurred ? 'SERVED_BY_FALLBACK' : 'SERVED_BY_PRIMARY',
      // The route that actually answered. Never the one that was asked first.
      served,
      primary: ordered[0],
      failoverOccurred,
      exhausted: false,
      attempts,
      reasonCodes: [...new Set(reasonCodes)],
      result: servedResult
    };
  }

  return {
    ok: false,
    policyVersion: AGENT_MODEL_FAILOVER_POLICY_VERSION,
    status: exhausted && attemptedCount ? 'ALL_ROUTES_EXHAUSTED'
      : attemptedCount ? 'ROUTE_FAILED_WITHOUT_ELIGIBLE_FALLBACK'
        : 'NO_AUTHORIZED_ROUTE_AVAILABLE',
    served: null,
    primary: ordered[0],
    failoverOccurred: false,
    exhausted: exhausted && attemptedCount > 0,
    attempts,
    reasonCodes: [...new Set(reasonCodes)],
    result: null
  };
}
