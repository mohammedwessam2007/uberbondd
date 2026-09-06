import { verifyGithubActionsOidcToken } from '../../../src/github-actions-oidc-verifier.mjs';
import { createModelExecutorFactory, describeProviderReadiness } from '../../../src/agent-model-executor-factory.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../../../src/effect-ledgers.mjs';
import {
  createSelfMaintainerProposalModelWrapper
} from './self-maintainer-proposal-model-wrapper.mjs';
import {
  selfMaintainerProposalTaskReasons
} from './self-maintainer-proposal-contract.mjs';

export const SELF_MAINTAINER_PROPOSAL_API_POLICY_VERSION = 'self-maintainer-proposal-api-1.0.0';

const MAX_BODY_BYTES = 250_000;
const EXACT_SHA = /^[a-f0-9]{40}$/i;
const PROVIDER_ORDER = Object.freeze(['ai-gateway', 'open-model']);
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

function workerFor(provider, env) {
  if (provider === 'ai-gateway') {
    return {
      provider,
      model: text(env.AI_GATEWAY_MODEL, 160) || 'openai/gpt-5.4',
      reasoningEffort: text(env.SELF_MAINTAINER_REASONING_EFFORT, 40).toLowerCase() || 'high'
    };
  }
  return {
    provider,
    model: text(env.OPEN_MODEL_MODEL, 400)
  };
}

/**
 * OIDC-authenticated proposal endpoint. It performs reasoning only. GitHub
 * claiming/submission, source apply, verification, and review-PR promotion stay
 * in the existing self-maintainer workflow and its separately attested gates.
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

    const oidcToken = bearer(req);
    if (!oidcToken) return sendJson(res, 401, failure(['github-actions-oidc-bearer-required'], 'OIDC_REJECTED'));
    const verified = await verifyOidc({ token: oidcToken, expectedSha, fetchImpl, date: date() });
    if (!verified?.ok) {
      return sendJson(res, 401, failure(verified?.reasonCodes || ['github-actions-oidc-rejected'], 'OIDC_REJECTED'));
    }

    const readiness = providerReadiness || describeProviderReadiness({ env });
    const ready = readyProviderNames(readiness);
    if (!ready.size) {
      return sendJson(res, 503, failure(['no-zero-authority-proposal-provider-ready'], 'PROVIDER_BLOCKED', {
        providerReadiness: (Array.isArray(readiness) ? readiness : []).map(row => ({
          provider: row?.provider || null,
          ready: row?.ready === true,
          blockers: Array.isArray(row?.blockers) ? row.blockers : []
        }))
      }));
    }

    const makeExecutor = executorFactory || createModelExecutorFactory({ env, fetchImpl });
    const attempts = [];
    for (const provider of PROVIDER_ORDER) {
      if (!ready.has(provider)) continue;
      const worker = workerFor(provider, env);
      let executor;
      try {
        executor = makeExecutor(worker);
      } catch {
        attempts.push({ provider, status: 'FACTORY_REFUSED' });
        continue;
      }
      const wrapped = createSelfMaintainerProposalModelWrapper({ modelExecutor: executor });
      const result = await wrapped({
        task,
        model: worker.model || undefined,
        maxTokens: budget.maxTokens,
        costCeilingCents: budget.maxCostCents,
        idempotencyKey: `self-maintainer-proposal:${task.taskId}`
      });
      attempts.push({ provider, status: result?.ok ? 'COMPLETED' : text(result?.outcome || result?.status, 80) || 'FAILED' });
      if (result?.ok) {
        return sendJson(res, 200, {
          ...result,
          policyVersion: SELF_MAINTAINER_PROPOSAL_API_POLICY_VERSION,
          proposalProvider: provider,
          oidcIdentity: verified.identity,
          attempts,
          businessEffectAuthority: 'NONE'
        });
      }
      if (result?.outcome === 'UNCERTAIN' || result?.uncertain === true) {
        return sendJson(res, 503, failure(result.reasonCodes || ['proposal-provider-outcome-uncertain'], 'PROVIDER_OUTCOME_UNCERTAIN', {
          attempts
        }));
      }
    }

    return sendJson(res, 409, failure(['all-ready-proposal-providers-confirmed-failure'], 'PROPOSAL_NOT_PRODUCED', { attempts }));
  };
}
