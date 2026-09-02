// Provider adapter for the Vercel AI Gateway, inside the bounded UberBond
// agent-worker runtime.
//
// This exists because of one owner law and one measured fact. The law: routing
// around an exhausted or unavailable provider is pre-authorized and needs no
// further approval. The fact: `describeProviderReadiness` currently reports
// zero configured providers, so `executeWithFailover` has a routing order and
// nothing to route to. A second lane of provider reachability behind a single
// credential is the smallest thing that turns "we may fail over" into "there is
// somewhere to fail over to".
//
// It is a *lane*, not a policy brain. It does not rank, choose, or decide what
// to try next -- `agent-model-router.mjs` decides the order and
// `agent-model-failover.mjs` walks it. This module only knows how to make one
// call and describe what came back, which is why the gateway can be added
// without a second routing engine appearing next to the first.
//
// The contract is copied deliberately, field for field, from
// `openai-agent-executor.mjs` and `anthropic-agent-executor.mjs`:
// `{ ok, outcome, reasonCodes, ... }` where outcome is COMPLETED,
// CONFIRMED_FAILURE or UNCERTAIN. `classifyRouteFailure` reads exactly those
// fields to decide whether another route is a sensible answer, so a gateway
// with its own vocabulary would be a lane the failover walker cannot classify.
//
// Three things this module refuses to do:
//
//   It never claims which model served without evidence. A gateway sits in
//   front of many providers, which makes "the model I asked for is the model
//   that answered" an assumption rather than an observation. The response's own
//   model field is the only thing that can settle it, so the result carries
//   `identityVerification: 'OBSERVED' | 'UNVERIFIED'` and a `servedModel` that
//   is null when nothing observed it. Concealing which model actually served is
//   forbidden by the same law that pre-authorizes the routing.
//
//   It never retries. Exactly one fetch per invocation, no loop, no backoff.
//   Retrying inside a lane hides the failure from the walker above it, which is
//   the component that knows whether the task may safely run twice at all.
//
//   It never reports a zero effect ledger for a call it made. A provider call
//   is a provider call; a refusal before the call is a proven zero; a transport
//   failure is genuinely unknown and says so with the canonical sentinel rather
//   than rounding itself down to zero.
//
// Being importable is not being enabled. Constructing this performs no request.
// A caller must enable it, inject a credential, inject pricing evidence, and
// invoke it through the compute-budgeted worker.

import {
  CANONICAL_EFFECT_KEYS,
  ZERO_EXTERNAL_EFFECTS,
  unknownEffectLedger
} from './effect-ledgers.mjs';
import { redactSecrets } from './secret-patterns.mjs';

/**
 * A transport or provider error message is written by someone else and lands
 * in a durable receipt. A client that echoes the request it failed on -- which
 * is ordinary behaviour -- puts the Authorization header into that string, so
 * copying it verbatim writes the credential into task history. Scrubbed on the
 * way in rather than on the way out, because every later reader is a place it
 * could have escaped from.
 */
function safeErrorDetail(error, max = 500) {
  return text(redactSecrets(String(error?.message ?? error ?? '')), max);
}

export const VERCEL_AI_GATEWAY_EXECUTOR_POLICY_VERSION = 'vercel-ai-gateway-executor-1.0.0';

export const VERCEL_AI_GATEWAY_ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';

const ENDPOINT = VERCEL_AI_GATEWAY_ENDPOINT;
const MAX_BODY_BYTES = 300_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 60_000;

// The gateway addresses a model as `<provider>/<model>`. A bare model name is
// ambiguous across the providers behind one credential, so it is refused unless
// the caller configured which provider a bare name belongs to.
const QUALIFIED_MODEL_RE = /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/;

// Statuses that prove the gateway did not accept the request. Everything else
// leaves open the possibility that work started, so it stays uncertain.
const DEFINITE_REJECTION_STATUSES = [400, 401, 402, 403, 404, 413, 422, 429];

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

function bytes(value) {
  return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value ?? null), 'utf8');
}

/** A refusal that happened before any request left this process. */
function refusal(reasonCodes, extra = {}) {
  return {
    ok: false,
    outcome: 'CONFIRMED_FAILURE',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    policyVersion: VERCEL_AI_GATEWAY_EXECUTOR_POLICY_VERSION,
    businessEffectAuthority: 'NONE',
    // Provably zero: the fetch never happened, so this is an observation and
    // not an aspiration.
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...extra
  };
}

/** A failure the gateway answered with. The call happened. */
function answeredFailure(reasonCodes, outcome, extra = {}) {
  return {
    ok: false,
    outcome,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    policyVersion: VERCEL_AI_GATEWAY_EXECUTOR_POLICY_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS, providerCalls: 1 },
    ...extra
  };
}

/**
 * A failure where it is not knowable whether the gateway did anything.
 *
 * A socket that hung up, a request that timed out, a body that did not parse:
 * each of these is compatible with the provider having run the work and billed
 * for it. Reporting `providerCalls: 0` there would be a claim nobody observed,
 * so the canonical UNKNOWN sentinel carries the uncertainty instead of a number
 * that rounds it away.
 */
function uncertainFailure(reasonCodes, extra = {}) {
  return {
    ok: false,
    outcome: 'UNCERTAIN',
    uncertain: true,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    policyVersion: VERCEL_AI_GATEWAY_EXECUTOR_POLICY_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...unknownEffectLedger(['providerCalls', 'spendCents']) },
    ...extra
  };
}

function zeroLedgerSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(CANONICAL_EFFECT_KEYS.map(key => [key, { type: 'integer', enum: [0] }])),
    required: [...CANONICAL_EFFECT_KEYS]
  };
}

// The same canonical worker-result schema the other two executors demand, so a
// result produced through the gateway is indistinguishable in shape from one
// produced directly and no downstream consumer needs to know which lane ran.
export const VERCEL_AI_GATEWAY_RESULT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: {
    outcome: { type: 'string' },
    changedArtifacts: { type: 'array', items: { type: 'string' } },
    testsActuallyRun: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          command: { type: 'string' },
          status: { type: 'string', enum: ['PASS', 'FAIL', 'NOT_RUN'] },
          total: { type: 'integer', minimum: 0 },
          passed: { type: 'integer', minimum: 0 },
          failed: { type: 'integer', minimum: 0 },
          skipped: { type: 'integer', minimum: 0 }
        },
        required: ['command', 'status', 'total', 'passed', 'failed', 'skipped']
      }
    },
    truthTable: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          claim: { type: 'string' },
          status: { type: 'string', enum: ['VERIFIED', 'INFERRED', 'UNRESOLVED', 'PASS', 'FAIL', 'NOT_RUN'] },
          evidenceRefs: { type: 'array', items: { type: 'string' } }
        },
        required: ['claim', 'status', 'evidenceRefs']
      }
    },
    externalEffectLedger: zeroLedgerSchema(),
    decision: { type: 'string', enum: ['PROCEED', 'REPAIR', 'STOP'] },
    coordination: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: [
            'DONE', 'RESEARCH_REQUIRED', 'ENGINEERING_REQUIRED', 'REVIEW_REQUIRED',
            'REPAIR_REQUIRED', 'DISPUTE_REQUIRED', 'SHADOW_REQUIRED', 'CANARY_REQUIRED',
            'ECONOMIC_TEST_REQUIRED', 'OWNER_REVIEW_REQUIRED', 'BLOCKED_EXTERNAL'
          ]
        },
        objective: { type: 'string' },
        summary: { type: 'string' },
        evidenceRefs: { type: 'array', items: { type: 'string' } },
        contextRefs: { type: 'array', items: { type: 'string' } },
        acceptanceTests: { type: 'array', items: { type: 'string' } },
        requiredOutputs: { type: 'array', items: { type: 'string' } },
        constraints: { type: 'array', items: { type: 'string' } },
        tokenBudget: { type: 'integer', minimum: 1 },
        confidence: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: [
        'action', 'objective', 'summary', 'evidenceRefs', 'contextRefs',
        'acceptanceTests', 'requiredOutputs', 'constraints', 'tokenBudget', 'confidence'
      ]
    },
    evidenceRefs: { type: 'array', items: { type: 'string' } }
  },
  required: [
    'outcome', 'changedArtifacts', 'testsActuallyRun', 'truthTable',
    'externalEffectLedger', 'decision', 'coordination', 'evidenceRefs'
  ]
});

/**
 * Resolve the gateway's `<provider>/<model>` address.
 *
 * Guessing the provider half would be the gateway equivalent of guessing a DKIM
 * selector: it produces a plausible string that addresses the wrong thing, and
 * the failure surfaces as a model that does not exist rather than as the
 * configuration mistake it is.
 */
export function qualifyGatewayModel(model, gatewayProvider = '') {
  const requested = text(model, 200);
  if (!requested) return { ok: false, reasonCodes: ['model-required'] };
  if (QUALIFIED_MODEL_RE.test(requested)) return { ok: true, model: requested };
  const provider = text(gatewayProvider, 80).toLowerCase();
  if (!provider) return { ok: false, reasonCodes: ['vercel-ai-gateway-model-must-be-provider-qualified'] };
  const qualified = `${provider}/${requested}`;
  if (!QUALIFIED_MODEL_RE.test(qualified)) {
    return { ok: false, reasonCodes: ['vercel-ai-gateway-model-must-be-provider-qualified'] };
  }
  return { ok: true, model: qualified };
}

function messageText(choice) {
  const content = choice?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(part => (part && typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }
  return '';
}

function usage(payload, pricing) {
  const inputTokens = integer(payload?.usage?.prompt_tokens, 0, 100_000_000);
  const outputTokens = integer(payload?.usage?.completion_tokens, 0, 100_000_000);
  const totalTokens = integer(payload?.usage?.total_tokens, 0, 100_000_000);
  if (inputTokens == null || outputTokens == null || totalTokens == null) return null;
  if (totalTokens < inputTokens + outputTokens) return null;
  const inputRate = finite(pricing?.inputUsdPerMillion, 0, 1_000_000);
  const outputRate = finite(pricing?.outputUsdPerMillion, 0, 1_000_000);
  if (inputRate == null || outputRate == null) return null;
  // Conservative cent rounding, matching the direct executors. Cached input is
  // charged at the full configured input rate until an authoritative billing
  // reconciler replaces this estimate.
  const estimatedUsd = (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
  const costCents = Math.ceil(estimatedUsd * 100 - 1e-12);
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    costCents,
    costBasis: 'CONFIGURED_CONSERVATIVE_ESTIMATE'
  };
}

/**
 * The worst this call can cost if the model writes to the token ceiling.
 *
 * Deliberately computed before the request rather than compared after it. A
 * ceiling checked only on the way back is a report, not a limit: the money is
 * already spent by the time it disagrees.
 *
 * Input tokens are estimated from the serialized request at three bytes per
 * token, which over-counts ordinary text (roughly four) on purpose. A ceiling
 * that under-estimates is not a ceiling.
 */
export function projectGatewayCostCents({ requestBytes, maxOutputTokens, pricing }) {
  const inputRate = finite(pricing?.inputUsdPerMillion, 0, 1_000_000);
  const outputRate = finite(pricing?.outputUsdPerMillion, 0, 1_000_000);
  const outputTokens = integer(maxOutputTokens, 1, 128_000);
  const sizeBytes = integer(requestBytes, 0, MAX_BODY_BYTES);
  if (inputRate == null || outputRate == null || outputTokens == null || sizeBytes == null) return null;
  const estimatedInputTokens = Math.ceil(sizeBytes / 3);
  const estimatedUsd = (estimatedInputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
  return {
    estimatedInputTokens,
    maxOutputTokens: outputTokens,
    projectedCostCents: Math.ceil(estimatedUsd * 100 - 1e-12)
  };
}

function validatePricing(pricing) {
  return finite(pricing?.inputUsdPerMillion, 0, 1_000_000) != null
    && finite(pricing?.outputUsdPerMillion, 0, 1_000_000) != null
    && text(pricing?.sourceRef, 500).length > 0
    && text(pricing?.verifiedAt, 80).length > 0;
}

function requestBody({ task, model, maxTokens }) {
  return {
    model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'system',
        content: [
          'You are one worker inside the UberBond bounded agent mesh.',
          'Complete only the supplied local-preparation task.',
          'Do not claim external actions, revenue, deployment, sending, purchases, DNS changes or credential changes.',
          'Do not invent evidence. Unknown facts stay unresolved.',
          'Return only the required structured result. If another agent is needed, use the coordination action and a precise bounded objective.',
          'For DONE or owner-boundary actions, use an empty coordination objective if no follow-up task is needed.'
        ].join(' ')
      },
      {
        role: 'user',
        content: JSON.stringify({
          taskId: task.taskId,
          objective: task.objective,
          originAgent: task.originAgent,
          targetAgent: task.targetAgent,
          parentTask: task.parentTask || null,
          contextRefs: task.contextRefs || [],
          evidenceRefs: task.evidenceRefs || [],
          constraints: task.constraints || [],
          forbiddenActions: task.forbiddenActions || [],
          requiredOutputs: task.requiredOutputs || [],
          acceptanceTests: task.acceptanceTests || [],
          economicObjective: task.economicObjective || '',
          consequenceClass: task.consequenceClass || 'LOCAL_PREPARATION'
        })
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'uberbond_agent_worker_result',
        strict: true,
        schema: VERCEL_AI_GATEWAY_RESULT_SCHEMA
      }
    }
  };
}

/**
 * Read the gateway's failure vocabulary out of an error body.
 *
 * A 429 is reported by providers both for a burst rate limit and for an
 * exhausted balance, and the two call for different operator action even though
 * both move to the next route. `classifyRouteFailure` reads quota before rate
 * limit, so naming which one this was is the whole difference between "wait"
 * and "top up the account".
 */
function errorHints(payload) {
  const code = text(payload?.error?.code ?? payload?.error?.type, 120).toLowerCase();
  const message = text(payload?.error?.message, 400).toLowerCase();
  const joined = `${code} ${message}`;
  return {
    quota: /insufficient_quota|quota|credit|billing|payment_required|balance/.test(joined),
    modelUnavailable: /model_not_found|unknown_model|model_unavailable|unsupported_model|no such model/.test(joined),
    code: code || null
  };
}

async function readErrorBody(response) {
  try {
    const raw = await response.text();
    if (bytes(raw) > MAX_RESPONSE_BYTES) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Build the executor.
 *
 * Every guard below is a refusal rather than a default, because the failure
 * mode this whole lane exists to avoid is a provider path that silently does
 * nothing and is indistinguishable from a worker with no work.
 */
export function createVercelAIGatewayExecutor({
  apiKey,
  enabled = false,
  defaultModel = '',
  gatewayProvider = '',
  pricing,
  fetchImpl = globalThis.fetch,
  endpoint = ENDPOINT,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const key = String(apiKey || '');
  const configuredModel = text(defaultModel, 200);
  const configuredProvider = text(gatewayProvider, 80).toLowerCase();
  const validEndpoint = endpoint === ENDPOINT;
  const validFetch = typeof fetchImpl === 'function';
  const timeout = integer(timeoutMs, 1, 600_000);

  return async function vercelAIGatewayExecutor({
    task,
    model,
    maxTokens,
    costCeilingCents
  } = {}) {
    if (!enabled) return refusal(['vercel-ai-gateway-executor-disabled']);
    if (!key || key.length < 12) return refusal(['vercel-ai-gateway-api-key-required']);
    if (!validEndpoint) return refusal(['vercel-ai-gateway-endpoint-not-allowlisted']);
    if (!validFetch) return refusal(['fetch-implementation-required']);
    if (timeout == null) return refusal(['vercel-ai-gateway-timeout-required']);
    if (!task?.taskId || !task?.objective) return refusal(['valid-agent-task-required']);
    if (task.consequenceClass && task.consequenceClass !== 'LOCAL_PREPARATION') {
      return refusal(['vercel-ai-gateway-worker-only-accepts-local-preparation']);
    }
    // A credential without pricing evidence is not free compute. It is a lane
    // whose spend would be a number this system invented, so it stays refused.
    if (!validatePricing(pricing)) return refusal(['verified-pricing-config-required']);

    const outputLimit = integer(maxTokens, 1, 128_000);
    const costLimit = integer(costCeilingCents, 0, 10_000_000);
    if (outputLimit == null) return refusal(['valid-max-output-tokens-required']);
    if (costLimit == null) return refusal(['valid-cost-ceiling-required']);

    const qualified = qualifyGatewayModel(model || configuredModel, configuredProvider);
    if (!qualified.ok) return refusal(qualified.reasonCodes);
    const requestedModel = qualified.model;

    const body = requestBody({ task, model: requestedModel, maxTokens: outputLimit });
    const requestBytes = bytes(body);
    if (requestBytes > MAX_BODY_BYTES) return refusal(['vercel-ai-gateway-request-body-too-large']);

    const projection = projectGatewayCostCents({ requestBytes, maxOutputTokens: outputLimit, pricing });
    if (!projection) return refusal(['vercel-ai-gateway-cost-projection-unavailable']);
    if (projection.projectedCostCents > costLimit) {
      return refusal(['vercel-ai-gateway-projected-cost-exceeds-ceiling'], {
        requestedModel,
        costCeilingCents: costLimit,
        projectedCostCents: projection.projectedCostCents
      });
    }

    // Exactly one call. No retry, no backoff, no second attempt on any branch:
    // whether this task may run twice is a property of the task, known to the
    // failover walker above and not to this lane.
    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout)
      });
    } catch (error) {
      const name = text(error?.name, 80);
      const aborted = name === 'TimeoutError' || name === 'AbortError';
      return uncertainFailure(
        [aborted ? 'vercel-ai-gateway-timeout-uncertain' : 'vercel-ai-gateway-transport-uncertain'],
        { requestedModel, servedModel: null, identityVerification: 'UNVERIFIED', detail: safeErrorDetail(error) }
      );
    }

    if (!response?.ok) {
      const status = integer(response?.status, 0, 999) ?? 0;
      const hints = errorHints(await readErrorBody(response));
      if (DEFINITE_REJECTION_STATUSES.includes(status)) {
        const reasonCodes = [`vercel-ai-gateway-http-${status}`];
        if (status === 429 || status === 402) {
          reasonCodes.push(hints.quota
            ? 'vercel-ai-gateway-quota-exhausted'
            : 'vercel-ai-gateway-rate-limited');
        }
        if (status === 401 || status === 403) reasonCodes.push('vercel-ai-gateway-credential-rejected');
        if (hints.modelUnavailable) reasonCodes.push('vercel-ai-gateway-model-not-found');
        return answeredFailure(reasonCodes, 'CONFIRMED_FAILURE', {
          requestedModel,
          servedModel: null,
          identityVerification: 'UNVERIFIED'
        });
      }
      return uncertainFailure(
        [`vercel-ai-gateway-http-${status || 'unknown'}`, 'vercel-ai-gateway-provider-outcome-uncertain'],
        { requestedModel, servedModel: null, identityVerification: 'UNVERIFIED' }
      );
    }

    let raw;
    try {
      const rawText = await response.text();
      if (bytes(rawText) > MAX_RESPONSE_BYTES) {
        return uncertainFailure(['vercel-ai-gateway-response-too-large'], { requestedModel });
      }
      raw = JSON.parse(rawText);
    } catch (error) {
      return uncertainFailure(['vercel-ai-gateway-response-parse-uncertain'], {
        requestedModel,
        detail: safeErrorDetail(error)
      });
    }

    const providerRequestId = text(raw?.id, 240) || null;

    // A gateway can answer HTTP 200 with an error body. That is not a success,
    // and it is not a clean refusal either: the upstream provider may already
    // have run the work before the gateway gave up on relaying it.
    if (raw?.error) {
      return uncertainFailure(['vercel-ai-gateway-body-error-uncertain'], {
        requestedModel,
        providerRequestId,
        gatewayErrorCode: errorHints(raw).code
      });
    }

    // Identity is read from the response or it is not claimed. The gateway
    // fronts many providers, so the requested model answering is an assumption
    // until something observes it.
    const observedModel = text(raw?.model, 200) || null;
    const identityVerification = observedModel ? 'OBSERVED' : 'UNVERIFIED';
    const identityMatchesRequest = observedModel ? observedModel === requestedModel : null;
    const notices = [];
    if (!observedModel) notices.push('SERVING_MODEL_IDENTITY_NOT_OBSERVED');
    else if (!identityMatchesRequest) notices.push('SERVED_MODEL_DIFFERS_FROM_REQUESTED_MODEL');

    const identity = {
      requestedModel,
      servedModel: observedModel,
      identityVerification,
      identityMatchesRequest,
      notices
    };

    const choices = Array.isArray(raw?.choices) ? raw.choices : [];
    if (choices.length !== 1) {
      return uncertainFailure(['vercel-ai-gateway-single-choice-required'], { providerRequestId, ...identity });
    }

    const finishReason = text(choices[0]?.finish_reason, 80) || null;
    const metered = usage(raw, pricing);
    if (!metered) {
      return uncertainFailure(['vercel-ai-gateway-usage-or-pricing-invalid'], {
        providerRequestId,
        providerStatus: finishReason,
        ...identity
      });
    }

    if (finishReason === 'length') {
      return uncertainFailure(['vercel-ai-gateway-max-tokens-before-canonical-result'], {
        providerRequestId,
        providerStatus: finishReason,
        usage: metered,
        ...identity
      });
    }

    const bodyText = messageText(choices[0]);
    if (!bodyText) {
      return uncertainFailure(['vercel-ai-gateway-structured-output-missing'], {
        providerRequestId,
        providerStatus: finishReason,
        usage: metered,
        ...identity
      });
    }

    let result;
    try {
      result = JSON.parse(bodyText);
    } catch (error) {
      return uncertainFailure(['vercel-ai-gateway-structured-output-json-invalid'], {
        providerRequestId,
        providerStatus: finishReason,
        usage: metered,
        detail: safeErrorDetail(error),
        ...identity
      });
    }

    return {
      ok: true,
      outcome: 'COMPLETED',
      policyVersion: VERCEL_AI_GATEWAY_EXECUTOR_POLICY_VERSION,
      businessEffectAuthority: 'NONE',
      providerRequestId,
      providerStatus: finishReason || 'stop',
      // `model` keeps the field the other executors publish. It is the observed
      // one when there is one, and `identityVerification` says which it is, so a
      // reader can never mistake the requested model for a confirmed one.
      model: observedModel || requestedModel,
      ...identity,
      usage: metered,
      pricingEvidence: {
        sourceRef: text(pricing.sourceRef, 500),
        verifiedAt: text(pricing.verifiedAt, 80),
        inputUsdPerMillion: Number(pricing.inputUsdPerMillion),
        outputUsdPerMillion: Number(pricing.outputUsdPerMillion),
        costBasis: metered.costBasis
      },
      projectedCostCents: projection.projectedCostCents,
      budgetWarning: metered.costCents > costLimit ? 'ESTIMATED_COST_EXCEEDS_RESERVED_CEILING' : null,
      // A completed provider call is an effect. Saying otherwise would make the
      // compute ledger quietly fictional in exactly the direction that flatters.
      externalEffectLedger: {
        ...ZERO_EXTERNAL_EFFECTS,
        providerCalls: 1,
        spendCents: metered.costCents
      },
      result
    };
  };
}
