import { verifyGithubActionsOidcToken } from '../../../src/github-actions-oidc-verifier.mjs';
import { createModelExecutorFactory, describeProviderReadiness } from '../../../src/agent-model-executor-factory.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../../../src/effect-ledgers.mjs';
import { createSelfMaintainerProposalModelWrapper } from './self-maintainer-proposal-model-wrapper.mjs';
import { createSelfMaintainerContextSelector } from './self-maintainer-context-selector.mjs';
import { selfMaintainerProposalTaskReasons } from './self-maintainer-proposal-contract.mjs';
import {
  SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE,
  selfMaintainerFreeAiRuntimeEnv
} from './self-maintainer-free-ai-profile.mjs';
import {
  validateSourceContextEnvelope,
  validateSourceInventoryEnvelope
} from './self-maintainer-source-context.mjs';

export const SELF_MAINTAINER_PROPOSAL_API_POLICY_VERSION = 'self-maintainer-proposal-api-1.3.0';

const MAX_BODY_BYTES = 450_000;
const EXACT_SHA = /^[a-f0-9]{40}$/i;
const PROVIDER_ORDER = Object.freeze(['ai-gateway', 'open-model']);
const STAGES = new Set(['SELECT_CONTEXT', 'PROPOSE']);
const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
});

function zeroEffects() {
  return structuredClone(ZERO_EXTERNAL_EFFECTS);
}

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function failure(reasonCodes, status = 'REFUSED', extra = {}) {
  return {
    ok: false,
    policyVersion: SELF_MAINTAINER_PROPOSAL_API_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function sendJson(res, httpStatus, payload) {
  if (typeof res?.status === 'function' && typeof res?.json === 'function') {
    return res.status(httpStatus).json(payload);
  }
  const body = JSON.stringify(payload);
  res.writeHead(httpStatus, JSON_HEADERS);
  res.end(body);
  return undefined;
}

function bearer(req) {
  const value = String(req?.headers?.authorization || req?.headers?.Authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function readBody(req) {
  if (req?.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    const serialized = JSON.stringify(req.body);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) throw new Error('request-body-too-large');
    return req.body;
  }
  let raw = '';
  let size = 0;
  if (typeof req?.[Symbol.asyncIterator] === 'function') {
    for await (const chunk of req) {
      const piece = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      size += Buffer.byteLength(piece, 'utf8');
      if (size > MAX_BODY_BYTES) throw new Error('request-body-too-large');
      raw += piece;
    }
  }
  if (!raw) return {};
  return JSON.parse(raw);
}

function budgetFor(task) {
  const maxTokens = Number(task?.budget?.maxTokens);
  const maxCostCents = Number(task?.budget?.maxCostCents);
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 128_000) return null;
  if (!Number.isSafeInteger(maxCostCents) || maxCostCents < 0 || maxCostCents > 100_000) return null;
  return { maxTokens, maxCostCents };
}

function readyProviderNames(readiness) {
  return new Set((Array.isArray(readiness) ? readiness : [])
    .filter(row => row?.ready === true && PROVIDER_ORDER.includes(String(row.provider || '')))
    .map(row => String(row.provider)));
}

function workerFor(provider, runtimeEnv) {
  if (provider === 'ai-gateway') {
    // Deliberately ignore AI_GATEWAY_MODEL and reasoning env overrides. This
    // OIDC-authenticated self-maintenance lane is allowed to run only the
    // immutable, officially free profile. A project setting cannot substitute a
    // paid model or add an unsupported reasoning parameter behind the 0-cent
    // reservation.
    return {
      provider,
      model: SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.model
    };
  }
  return {
    provider,
    model: text(runtimeEnv.OPEN_MODEL_MODEL, 400)
  };
}

function publicReadiness(readiness) {
  return (Array.isArray(readiness) ? readiness : []).map(row => ({
    provider: row?.provider || null,
    ready: row?.ready === true,
    blockers: Array.isArray(row?.blockers) ? row.blockers : []
  }));
}

/**
 * OIDC-authenticated reasoning endpoint. Exact repository source is selected
 * from and read by the trusted GitHub checkout, not by Vercel. The endpoint may
 * choose context and reason over exact bytes, but source apply, verification,
 * relay submission and review-PR promotion remain in the existing workflow.
 *
 * The AI Gateway lane is source-authorized only for the immutable 0-cost model
 * profile above. This does not create a credential: the canonical provider
 * factory still requires either an existing AI_GATEWAY_API_KEY or Vercel's
 * deployment-scoped VERCEL_OIDC_TOKEN. It also creates no spend authority: both
 * selection and proposal remain under the task's exact cent ceiling, which is
 * currently zero.
 */
export function createSelfMaintainerProposalApiHandler({
  env = process.env,
  fetchImpl = globalThis.fetch,
  verifyOidc = verifyGithubActionsOidcToken,
  executorFactory = null,
  providerReadiness = null,
  date = () => new Date()
} = {}) {
  return async function selfMaintainerProposalApiHandler(req, res) {
    if (String(req?.method || '').toUpperCase() !== 'POST') {
      return sendJson(res, 405, failure(['post-required']));
    }

    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      const reason = String(error?.message || '') === 'request-body-too-large'
        ? 'request-body-too-large'
        : 'request-json-invalid';
      return sendJson(res, reason === 'request-body-too-large' ? 413 : 400, failure([reason]));
    }

    const stage = text(body?.stage || 'PROPOSE', 40).toUpperCase();
    if (!STAGES.has(stage)) return sendJson(res, 400, failure(['proposal-stage-invalid']));

    const expectedSha = text(body?.expectedSha, 80).toLowerCase();
    if (!EXACT_SHA.test(expectedSha)) return sendJson(res, 400, failure(['exact-request-sha-required']));
    const task = body?.task;
    const taskReasons = selfMaintainerProposalTaskReasons(task);
    if (taskReasons.length) return sendJson(res, 400, failure(taskReasons, 'TASK_REJECTED'));
    if (String(task.parentTask || '').toLowerCase() !== `main:${expectedSha}`) {
      return sendJson(res, 409, failure(['task-request-sha-mismatch'], 'TASK_REJECTED'));
    }
    const budget = budgetFor(task);
    if (!budget) return sendJson(res, 400, failure(['valid-task-compute-budget-required'], 'TASK_REJECTED'));
    if (budget.maxCostCents !== SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.spendCeilingCents) {
      return sendJson(res, 409, failure(['self-maintainer-zero-cent-budget-required'], 'TASK_REJECTED'));
    }

    const oidcToken = bearer(req);
    if (!oidcToken) return sendJson(res, 401, failure(['github-actions-oidc-bearer-required'], 'OIDC_REJECTED'));
    const verified = await verifyOidc({ token: oidcToken, expectedSha, fetchImpl, date: date() });
    if (!verified?.ok) {
      return sendJson(res, 401, failure(verified?.reasonCodes || ['github-actions-oidc-rejected'], 'OIDC_REJECTED'));
    }

    const runtimeEnv = selfMaintainerFreeAiRuntimeEnv(env);
    const readiness = providerReadiness || describeProviderReadiness({ env: runtimeEnv });
    const ready = readyProviderNames(readiness);
    if (!ready.size) {
      return sendJson(res, 503, failure(['no-zero-authority-proposal-provider-ready'], 'PROVIDER_BLOCKED', {
        providerReadiness: publicReadiness(readiness),
        freeGatewayModel: SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.model
      }));
    }

    let validatedInventory = null;
    let validatedSource = null;
    if (stage === 'PROPOSE') {
      validatedInventory = validateSourceInventoryEnvelope(body?.sourceInventory, expectedSha);
      if (!validatedInventory.ok) {
        return sendJson(res, 400, failure(['exact-source-inventory-required', ...(validatedInventory.reasonCodes || [])], 'SOURCE_INVENTORY_REJECTED'));
      }
      validatedSource = validateSourceContextEnvelope(body?.sourceContext, expectedSha);
      if (!validatedSource.ok) {
        return sendJson(res, 400, failure(['exact-source-context-required', ...(validatedSource.reasonCodes || [])], 'SOURCE_CONTEXT_REJECTED'));
      }
      if (!validatedSource.inventoryDigest || validatedSource.inventoryDigest !== validatedInventory.inventoryDigest) {
        return sendJson(res, 409, failure(['source-context-inventory-digest-mismatch'], 'SOURCE_CONTEXT_REJECTED'));
      }
    }

    const makeExecutor = executorFactory || createModelExecutorFactory({ env: runtimeEnv, fetchImpl });
    const attempts = [];
    for (const provider of PROVIDER_ORDER) {
      if (!ready.has(provider)) continue;
      const worker = workerFor(provider, runtimeEnv);
      let executor;
      try {
        executor = makeExecutor(worker);
      } catch {
        attempts.push({ provider, status: 'FACTORY_REFUSED' });
        continue;
      }

      let result;
      if (stage === 'SELECT_CONTEXT') {
        const selector = createSelfMaintainerContextSelector({ modelExecutor: executor });
        result = await selector({
          task,
          sourceInventory: body?.sourceInventory,
          model: worker.model || undefined,
          maxTokens: Math.min(budget.maxTokens, 6000),
          costCeilingCents: 0,
          idempotencyKey: `self-maintainer-context:${task.taskId}`
        });
      } else {
        const wrapped = createSelfMaintainerProposalModelWrapper({ modelExecutor: executor });
        result = await wrapped({
          task,
          sourceInventory: validatedInventory,
          sourceContext: validatedSource,
          model: worker.model || undefined,
          maxTokens: budget.maxTokens,
          costCeilingCents: budget.maxCostCents,
          idempotencyKey: `self-maintainer-proposal:${task.taskId}`
        });
      }

      attempts.push({ provider, status: result?.ok ? 'COMPLETED' : text(result?.outcome || result?.status, 80) || 'FAILED' });
      if (result?.ok) {
        return sendJson(res, 200, {
          ...result,
          policyVersion: SELF_MAINTAINER_PROPOSAL_API_POLICY_VERSION,
          stage,
          proposalProvider: provider,
          proposalModel: worker.model || null,
          oidcIdentity: verified.identity,
          attempts,
          businessEffectAuthority: 'NONE'
        });
      }
      if (result?.outcome === 'UNCERTAIN' || result?.uncertain === true) {
        return sendJson(res, 503, failure(result.reasonCodes || ['proposal-provider-outcome-uncertain'], 'PROVIDER_OUTCOME_UNCERTAIN', {
          stage,
          attempts
        }));
      }
    }

    return sendJson(res, 409, failure([
      stage === 'SELECT_CONTEXT'
        ? 'all-ready-context-providers-confirmed-failure'
        : 'all-ready-proposal-providers-confirmed-failure'
    ], stage === 'SELECT_CONTEXT' ? 'CONTEXT_NOT_SELECTED' : 'PROPOSAL_NOT_PRODUCED', { stage, attempts }));
  };
}
