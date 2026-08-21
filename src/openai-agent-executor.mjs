// Provider adapter for the bounded UberBond agent-worker runtime.
//
// This module intentionally performs NO call merely by being imported or
// constructed. A caller must explicitly enable it, inject a key and pricing,
// and invoke the returned executor through the compute-budgeted worker.
// It exposes no business-world tools to the model.

export const OPENAI_AGENT_EXECUTOR_POLICY_VERSION = 'openai-agent-executor-1.0.0';

const ENDPOINT = 'https://api.openai.com/v1/responses';
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

export const OPENAI_AGENT_RESULT_SCHEMA = Object.freeze({
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

function outputText(payload) {
  if (!Array.isArray(payload?.output)) return '';
  const chunks = [];
  for (const item of payload.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const part of item.content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('').trim();
}

function usage(payload, pricing) {
  const inputTokens = integer(payload?.usage?.input_tokens, 0, 100_000_000);
  const outputTokens = integer(payload?.usage?.output_tokens, 0, 100_000_000);
  const totalTokens = integer(payload?.usage?.total_tokens, 0, 100_000_000);
  if (inputTokens == null || outputTokens == null || totalTokens == null) return null;
  if (totalTokens < inputTokens + outputTokens) return null;
  const inputRate = finite(pricing?.inputUsdPerMillion, 0, 1_000_000);
  const outputRate = finite(pricing?.outputUsdPerMillion, 0, 1_000_000);
  if (inputRate == null || outputRate == null) return null;
  // Conservative cent rounding. Cached input is deliberately charged here at
  // the full configured input rate unless a later reconciler replaces this
  // estimate with authoritative billing data.
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

function requestBody({ task, model, maxTokens, reasoningEffort = 'medium' }) {
  return {
    model,
    reasoning: { effort: reasoningEffort },
    max_output_tokens: maxTokens,
    input: [
      {
        role: 'developer',
        content: [
          {
            type: 'input_text',
            text: [
              'You are one worker inside the UberBond bounded agent mesh.',
              'Complete only the supplied local-preparation task.',
              'Do not claim external actions, revenue, deployment, sending, purchases, DNS changes or credential changes.',
              'Do not invent evidence. Unknown facts stay unresolved.',
              'Return only the required structured result. If another agent is needed, use the coordination action and a precise bounded objective.',
              'For DONE or owner-boundary actions, use an empty coordination objective if no follow-up task is needed.'
            ].join(' ')
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({
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
        ]
      }
    ],
    text: {
      verbosity: 'medium',
      format: {
        type: 'json_schema',
        name: 'uberbond_agent_worker_result',
        strict: true,
        schema: OPENAI_AGENT_RESULT_SCHEMA
      }
    }
  };
}

function validatePricing(pricing) {
  return finite(pricing?.inputUsdPerMillion, 0, 1_000_000) != null
    && finite(pricing?.outputUsdPerMillion, 0, 1_000_000) != null
    && text(pricing?.sourceRef, 500).length > 0
    && text(pricing?.verifiedAt, 80).length > 0;
}

export function createOpenAIAgentExecutor({
  apiKey,
  enabled = false,
  defaultModel = 'gpt-5.6-sol',
  pricing,
  fetchImpl = globalThis.fetch,
  endpoint = ENDPOINT,
  reasoningEffort = 'medium'
} = {}) {
  const key = String(apiKey || '');
  const configuredModel = text(defaultModel, 160);
  const validEndpoint = endpoint === ENDPOINT;
  const validFetch = typeof fetchImpl === 'function';
  const validReasoning = ['none', 'low', 'medium', 'high', 'xhigh', 'max'].includes(reasoningEffort);

  return async function openAIAgentExecutor({
    task,
    model,
    maxTokens,
    costCeilingCents
  } = {}) {
    if (!enabled) return failure(['openai-agent-executor-disabled']);
    if (!key || key.length < 12) return failure(['openai-api-key-required']);
    if (!validEndpoint) return failure(['openai-endpoint-not-allowlisted']);
    if (!validFetch) return failure(['fetch-implementation-required']);
    if (!validReasoning) return failure(['invalid-reasoning-effort']);
    if (!task?.taskId || !task?.objective) return failure(['valid-agent-task-required']);
    if (task.consequenceClass && task.consequenceClass !== 'LOCAL_PREPARATION') {
      return failure(['openai-worker-only-accepts-local-preparation']);
    }
    if (!validatePricing(pricing)) return failure(['verified-pricing-config-required']);
    const outputLimit = integer(maxTokens, 1, 128_000);
    const costLimit = integer(costCeilingCents, 0, 10_000_000);
    if (outputLimit == null) return failure(['valid-max-output-tokens-required']);
    if (costLimit == null) return failure(['valid-cost-ceiling-required']);
    const selectedModel = text(model || configuredModel, 160);
    if (!selectedModel) return failure(['model-required']);

    const body = requestBody({ task, model: selectedModel, maxTokens: outputLimit, reasoningEffort });
    if (bytes(body) > MAX_BODY_BYTES) return failure(['openai-request-body-too-large']);

    let response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      return failure(['openai-transport-uncertain'], 'UNCERTAIN', {
        uncertain: true,
        detail: text(error?.message, 500)
      });
    }

    // Explicit client/auth/rate-limit rejections are treated as confirmed
    // no-result failures. Server-side failures remain uncertain because work
    // may have started before the error surfaced.
    if (!response?.ok) {
      const status = integer(response?.status, 0, 999, 0);
      if ([400, 401, 403, 404, 409, 413, 422, 429].includes(status)) {
        return failure([`openai-http-${status}`], 'CONFIRMED_FAILURE');
      }
      return failure([`openai-http-${status || 'unknown'}`, 'openai-provider-outcome-uncertain'], 'UNCERTAIN', { uncertain: true });
    }

    let raw;
    try {
      const rawText = await response.text();
      if (bytes(rawText) > MAX_RESPONSE_BYTES) return failure(['openai-response-too-large'], 'UNCERTAIN', { uncertain: true });
      raw = JSON.parse(rawText);
    } catch (error) {
      return failure(['openai-response-parse-uncertain'], 'UNCERTAIN', { uncertain: true, detail: text(error?.message, 500) });
    }

    const providerRequestId = text(raw?.id, 240) || null;
    if (String(raw?.status || '').toLowerCase() !== 'completed') {
      return failure(['openai-response-not-completed'], 'UNCERTAIN', {
        uncertain: true,
        providerRequestId,
        providerStatus: text(raw?.status, 80) || null
      });
    }

    const metered = usage(raw, pricing);
    if (!metered) {
      return failure(['openai-usage-or-pricing-invalid'], 'UNCERTAIN', {
        uncertain: true,
        providerRequestId
      });
    }

    const bodyText = outputText(raw);
    if (!bodyText) {
      return failure(['openai-structured-output-missing'], 'UNCERTAIN', {
        uncertain: true,
        providerRequestId,
        usage: metered
      });
    }

    let result;
    try {
      result = JSON.parse(bodyText);
    } catch (error) {
      return failure(['openai-structured-output-json-invalid'], 'UNCERTAIN', {
        uncertain: true,
        providerRequestId,
        usage: metered,
        detail: text(error?.message, 500)
      });
    }

    return {
      ok: true,
      outcome: 'COMPLETED',
      providerRequestId,
      providerStatus: 'completed',
      model: text(raw?.model || selectedModel, 160),
      usage: metered,
      pricingEvidence: {
        sourceRef: text(pricing.sourceRef, 500),
        verifiedAt: text(pricing.verifiedAt, 80),
        inputUsdPerMillion: Number(pricing.inputUsdPerMillion),
        outputUsdPerMillion: Number(pricing.outputUsdPerMillion),
        costBasis: metered.costBasis
      },
      budgetWarning: metered.costCents > costLimit ? 'ESTIMATED_COST_EXCEEDS_RESERVED_CEILING' : null,
      result
    };
  };
}
