import { authorizeVercelCronRequest, publicCronResult } from '../src/agent-mesh-cron-boundary.mjs';
import { createModelExecutorFactory, describeProviderReadiness } from '../src/agent-model-executor-factory.mjs';
import { runSelfMaintainerProposalWorker } from '../.github/workflows/runtime/self-maintainer-proposal-worker.mjs';

export const SELF_MAINTAINER_PROPOSAL_CRON_VERSION = 'self-maintainer-proposal-cron-1.0.0';
export const SELF_MAINTAINER_PROPOSAL_CRON_SCHEDULE = '37 13 * * *';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const MAX_GITHUB_RESPONSE_BYTES = 500_000;
const SUPPORTED_PROPOSAL_PROVIDERS = new Set(['ai-gateway', 'open-model']);

function text(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function sendJson(res, status, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(status).json(payload);
  res.writeHead(status, { ...JSON_HEADERS, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(payload));
}
function header(req, name) { return req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()] ?? ''; }
function parseRepository(value) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(text(value, 300));
  return match ? { owner: match[1], repo: match[2], fullName: `${match[1]}/${match[2]}` } : null;
}
function refusal(reasonCodes, extra = {}) {
  return { ok: false, policyVersion: SELF_MAINTAINER_PROPOSAL_CRON_VERSION, status: 'REFUSED', reasonCodes: [...new Set(reasonCodes)], businessEffectAuthority: 'NONE', ...extra };
}

function githubClient({ token, fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'UberBond-Self-Maintainer-Proposal-Cron' };
  async function request(method, pathname, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`https://api.github.com${pathname}`, { method, signal: controller.signal, headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } finally { clearTimeout(timer); }
    const declared = Number(response?.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > MAX_GITHUB_RESPONSE_BYTES) throw new Error('github-response-too-large');
    const raw = String(await response.text());
    if (Buffer.byteLength(raw, 'utf8') > MAX_GITHUB_RESPONSE_BYTES) throw new Error('github-response-too-large');
    const payload = raw ? JSON.parse(raw) : null;
    if (!response?.ok) throw new Error(`github-http-${Number(response?.status || 0)}`);
    return payload;
  }
  return Object.freeze({
    createIssue: ({ owner, repo, title, body, labels }) => request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, { title, body, labels }),
    listIssues: ({ owner, repo, state = 'open', labels = [], perPage = 20 }) => {
      const query = new URLSearchParams({ state: String(state || 'open').toLowerCase(), per_page: String(Math.max(1, Math.min(50, Number(perPage) || 20))) });
      if (labels.length) query.set('labels', labels.join(','));
      return request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${query}`);
    },
    getIssue: ({ owner, repo, issueNumber }) => request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`),
    getComments: ({ owner, repo, issueNumber }) => request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments?per_page=100`),
    addComment: ({ owner, repo, issueNumber, body }) => request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`, { body }),
    addLabels: ({ owner, repo, issueNumber, labels }) => request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels`, { labels }),
    closeIssue: ({ owner, repo, issueNumber, stateReason }) => request('PATCH', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`, { state: 'closed', state_reason: stateReason })
  });
}

export function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const now = deps.now || (() => new Date());

  return async function handler(req, res) {
    const authorized = authorizeVercelCronRequest({
      method: req?.method,
      authorizationHeader: header(req, 'authorization'),
      cronSecret: env.CRON_SECRET,
      scheduleHeader: header(req, 'x-vercel-cron-schedule'),
      expectedSchedule: SELF_MAINTAINER_PROPOSAL_CRON_SCHEDULE
    });
    if (!authorized.ok) return sendJson(res, authorized.httpStatus, publicCronResult(authorized));

    if (env.SELF_MAINTAINER_PROPOSAL_ENABLED !== 'true') {
      return sendJson(res, 200, { ok: true, policyVersion: SELF_MAINTAINER_PROPOSAL_CRON_VERSION, status: 'DISABLED_RESTING_STATE', businessEffectAuthority: 'NONE' });
    }

    const repository = parseRepository(env.GITHUB_REPOSITORY);
    const githubToken = String(env.GITHUB_TOKEN || '');
    const provider = text(env.SELF_MAINTAINER_PROPOSAL_PROVIDER || 'ai-gateway', 80).toLowerCase();
    const model = text(env.SELF_MAINTAINER_PROPOSAL_MODEL, 200);
    const reasoningEffort = text(env.SELF_MAINTAINER_PROPOSAL_REASONING_EFFORT || 'high', 40).toLowerCase();
    const reasons = [];
    if (!repository) reasons.push('github-repository-required');
    if (!githubToken) reasons.push('github-credential-required');
    if (!SUPPORTED_PROPOSAL_PROVIDERS.has(provider)) reasons.push('proposal-provider-not-supported-by-free-form-result-path');
    if (!model) reasons.push('proposal-model-identity-required');
    if (reasons.length) return sendJson(res, 503, refusal(reasons));

    const readiness = describeProviderReadiness({ env });
    const selectedReadiness = readiness.find(row => row.provider === provider);
    if (!selectedReadiness?.ready) {
      return sendJson(res, 503, refusal(['proposal-provider-not-ready', ...(selectedReadiness?.blockers || [])], {
        provider,
        credentialPresent: selectedReadiness?.credentialPresent === true,
        pricingEvidencePresent: selectedReadiness?.pricingEvidencePresent === true
      }));
    }

    let modelExecutor;
    try {
      modelExecutor = createModelExecutorFactory({ env, fetchImpl })({ provider, model, reasoningEffort });
    } catch (error) {
      return sendJson(res, 503, refusal(['proposal-model-executor-construction-failed'], { detail: text(error?.message, 240) }));
    }

    let result;
    try {
      result = await runSelfMaintainerProposalWorker({
        client: deps.githubClient || githubClient({ token: githubToken, fetchImpl }),
        owner: repository.owner,
        repo: repository.repo,
        modelExecutor,
        workerId: `vercel-self-maintainer-proposal:${text(env.VERCEL_DEPLOYMENT_ID || env.VERCEL_GIT_COMMIT_SHA || 'runtime', 80)}`,
        date: now()
      });
    } catch (error) {
      result = refusal(['proposal-worker-runtime-failed'], { detail: text(error?.message, 240) });
    }

    const httpStatus = result?.ok ? 200 : ([
      'COMPUTE_BUDGET_NOT_AUTHORIZED', 'PROVIDER_CREDENTIAL_REQUIRED', 'PROVIDER_PRICING_EVIDENCE_REQUIRED',
      'PROVIDER_NOT_ACTIVATED', 'PROVIDER_CAPACITY_BLOCKED', 'PROVIDER_OUTCOME_UNCERTAIN'
    ].includes(result?.status) ? 409 : 500);
    return sendJson(res, httpStatus, {
      ok: result?.ok === true,
      policyVersion: SELF_MAINTAINER_PROPOSAL_CRON_VERSION,
      status: result?.status || 'UNKNOWN',
      taskId: result?.taskId || null,
      issueNumber: result?.issueNumber || null,
      changeSetId: result?.changeSetId || null,
      provider,
      model,
      reasonCodes: result?.reasonCodes || [],
      taskRemainsRecoverable: result?.taskRemainsRecoverable === true,
      businessEffectAuthority: 'NONE'
    });
  };
}

export default createHandler();
