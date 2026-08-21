// Provider adapter for the bounded UberBond agent-worker runtime.
//
// This module performs no request merely by being imported or constructed.
// A caller must explicitly enable it, supply credentials and pricing evidence,
// and invoke the returned executor through the compute-budgeted worker.
// The only model-facing "tool" is a structured result-return channel. It does
// not grant the model customer messaging, purchasing, deployment, DNS,
// credential, production or business-spend authority.

export const ANTHROPIC_AGENT_EXECUTOR_POLICY_VERSION = 'anthropic-agent-executor-1.0.0';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const RESULT_TOOL_NAME = 'submit_uberbond_result';
const MAX_BODY_BYTES = 300_000;
const MAX_RESPONSE_BYTES = 1_000_000;

const EFFECT_KEYS = [
  'providerCalls', 'messages', 'purchases', 'deployments',
  'credentialChanges', 'dnsChanges', 'productionMutations', 'spendCents'
];

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

function failure(reasonCodes, outcome = 'CONFIRMED_FAILURE', extra = {}) {
  return {
    ok: false,
    outcome,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    ...extra
  };
}

function zeroLedgerSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(EFFECT_KEYS.map(key => [key, { type: 'integer', enum: [0] }])),
    required: EFFECT_KEYS
  };
}

export const ANTHROPIC_AGENT_RESULT_SCHEMA = Object.freeze({
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

function requestBody({ task, model, maxTokens }) {
  return {
    model,
    max_tokens: maxTokens,
    system: [
      'You are one worker inside the UberBond bounded agent mesh.',
      'Complete only the supplied local-preparation task.',
      'Do not claim external actions, revenue, deployment, sending, purchases, DNS changes or credential changes.',
      'Do not invent evidence. Unknown facts stay unresolved.',
      'Return the final result only by calling submit_uberbond_result.',
      'If another agent is needed, use the coordination action and a precise bounded objective.',
      'For DONE or owner-boundary actions, use an empty coordination objective when no follow-up task is needed.'
    ].join(' '),
    messages: [
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
    tools: [
      {
        name: RESULT_TOOL_NAME,
        description: 'Return the canonical UberBond bounded agent-worker result. This records a result only and performs no external action.',
        input_schema: ANTHROPIC_AGENT_RESULT_SCHEMA
      }
    ],
    tool_choice: { type: 'tool', name: RESULT_TOOL_NAME }
  };
}

function resultToolInput(payload) {
  if (!Array.isArray(payload?.content)) return null;
  const matches = payload.content.filter(block => block?.type === 'tool_use' && block?.name === RESULT_TOOL_NAME);
  if (matches.length !== 1) return null;
  const input = matches[0]?.input;
  return input && typeof input === 'object' && !Array.isArray(input) ? input : null;
}

function usage(payload, pricing) {
  const uncachedInput = integer(payload?.usage?.input_tokens ?? 0, 0, 100_000_000);
  const cacheCreation = integer(payload?.usage?.cache_creation_input_tokens ?? 0, 0, 100_000_000);
  const cacheRead = integer(payload?.usage?.cache_read_input_tokens ?? 0, 0, 100_000_000);
  const outputTokens = integer(payload?.usage?.output_tokens ?? 0, 0, 100_000_000);
  if ([uncachedInput, cacheCreation, cacheRead, outputTokens].some(value => value == null)) return null;

  const inputRate = finite(pricing?.inputUsdPerMillion, 0, 1_000_000);
  const outputRate = finite(pricing?.outputUsdPerMillion, 0, 1_000_000);
  if (inputRate == null || outputRate == null) return null;
  const cacheWriteRate = finite(pricing?.cacheWriteUsdPerMillion, 0, 1_000_000) ?? inputRate;
  const cacheReadRate = finite(pricing?.cacheReadUsdPerMillion, 0, 1_000_000) ?? inputRate;

  const inputTokens = uncachedInput + cacheCreation + cacheRead;
  const totalTokens = inputTokens + outputTokens;
  const estimatedUsd = (
    uncachedInput * inputRate
    + cacheCreation * cacheWriteRate
    + cacheRead * cacheReadRate
    + outputTokens * outputRate
  ) / 1_000_000;
  const costCents = Math.ceil(estimatedUsd * 100 - 1e-12);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    costCents,
    uncachedInputTokens: uncachedInput,
    cacheCreationInputTokens: cacheCreation,
    cacheReadInputTokens: cacheRead,
    costBasis: pricing?.cacheWriteUsdPerMillion == null || pricing?.cacheReadUsdPerMillion == null
      ? 'CONFIGURED_CONSERVATIVE_ESTIMATE'
      : 'CONFIGURED_RATE_ESTIMATE'
  };
}

function validatePricing(pricing) {
  return finite(pricing?.inputUsdPerMillion, 0, 1_000_000) != null
    && finite(pricing?.outputUsdPerMillion, 0, 1_000_000) != null
    && text(pricing?.sourceRef, 500).length > 0
    && text(pricing?.verifiedAt, 80).length > 0;
}

export function createAnthropicAgentExecutor({
  apiKey,
  enabled = false,
  defaultModel = '',
  pricing,
  fetchImpl = globalThis.fetch,
  endpoint = ENDPOINT,
  anthropicVersion = API_VERSION
} = {}) {
  const key = String(apiKey || '');
  const configuredModel = text(defaultModel, 160);
  const validEndpoint = endpoint === ENDPOINT;
  const validVersion = anthropicVersion === API_VERSION;
  const validFetch = typeof fetchImpl === 'function';

  return async function anthropicAgentExecutor({
    task,
    model,
    maxTokens,
    costCeilingCents
  } = {}) {
    if (!enabled) return failure(['anthropic-agent-executor-disabled']);
    if (!key || key.length < 12) return failure(['anthropic-api-key-required']);
    if (!validEndpoint) return failure(['anthropic-endpoint-not-allowlisted']);
    if (!validVersion) return failure(['anthropic-api-version-not-allowlisted']);
    if (!validFetch) return failure(['fetch-implementation-required']);
    if (!task?.taskId || !task?.objective) return failure(['valid-agent-task-required']);
    if (task.consequenceClass && task.consequenceClass !== 'LOCAL_PREPARATION') {
      return failure(['anthropic-worker-only-accepts-local-preparation']);
    }
    if (!validatePricing(pricing)) return failure(['verified-pricing-config-required']);

    const outputLimit = integer(maxTokens, 1, 128_000);
    const costLimit = integer(costCeilingCents, 0, 10_000_000);
    if (outputLimit == null) return failure(['valid-max-output-tokens-required']);
    if (costLimit == null) return failure(['valid-cost-ceiling-required']);
    const selectedModel = text(model || configuredModel, 160);
    if (!selectedModel) return failure(['model-required']);

    const body = requestBody({ task, model: selectedModel, maxTokens: outputLimit });
    if (bytes(body) > MAX_BODY_BYTES) return failure(['anthropic-request-body-too-large']);

    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': API_VERSION,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      return failure(['anthropic-transport-uncertain'], 'UNCERTAIN', {
        uncertain: true,
        detail: text(error?.message, 500)
      });
    }

    if (!response?.ok) {
      const status = integer(response?.status, 0, 999, 0);
      if ([400, 401, 403, 404, 413, 422, 429].includes(status)) {
        return failure([`anthropic-http-${status}`], 'CONFIRMED_FAILURE');
      }
      return failure([`anthropic-http-${status || 'unknown'}`, 'anthropic-provider-outcome-uncertain'], 'UNCERTAIN', {
        uncertain: true
      });
    }

    let raw;
    try {
      const rawText = await response.text();
      if (bytes(rawText) > MAX_RESPONSE_BYTES) {
        return failure(['anthropic-response-too-large'], 'UNCERTAIN', { uncertain: true });
      }
      raw = JSON.parse(rawText);
    } catch (error) {
      return failure(['anthropic-response-parse-uncertain'], 'UNCERTAIN', {
        uncertain: true,
        detail: text(error?.message, 500)
      });
    }

    const providerRequestId = text(raw?.id, 240) || null;
    const metered = usage(raw, pricing);
    if (!metered) {
      return failure(['anthropic-usage-or-pricing-invalid'], 'UNCERTAIN', {
        uncertain: true,
        providerRequestId
      });
    }

    const providerStopReason = text(raw?.stop_reason, 80) || null;
    if (providerStopReason === 'max_tokens') {
      return failure(['anthropic-max-tokens-before-canonical-result'], 'UNCERTAIN', {
        uncertain: true,
        providerRequestId,
        providerStopReason,
        usage: metered
      });
    }

    const result = resultToolInput(raw);
    if (!result) {
      return failure(['anthropic-canonical-result-tool-missing'], 'UNCERTAIN', {
        uncertain: true,
        providerRequestId,
        providerStopReason,
        usage: metered
      });
    }

    return {
      ok: true,
      outcome: 'COMPLETED',
      providerRequestId,
      providerStatus: providerStopReason || 'tool_use',
      model: text(raw?.model || selectedModel, 160),
      usage: metered,
      pricingEvidence: {
        sourceRef: text(pricing.sourceRef, 500),
        verifiedAt: text(pricing.verifiedAt, 80),
        inputUsdPerMillion: Number(pricing.inputUsdPerMillion),
        outputUsdPerMillion: Number(pricing.outputUsdPerMillion),
        cacheWriteUsdPerMillion: pricing?.cacheWriteUsdPerMillion == null ? null : Number(pricing.cacheWriteUsdPerMillion),
        cacheReadUsdPerMillion: pricing?.cacheReadUsdPerMillion == null ? null : Number(pricing.cacheReadUsdPerMillion),
        costBasis: metered.costBasis
      },
      budgetWarning: metered.costCents > costLimit ? 'ESTIMATED_COST_EXCEEDS_RESERVED_CEILING' : null,
      result
    };
  };
}
