import crypto from 'node:crypto';
import {
  createGithubRelayTask,
  pollGithubRelayTasks,
  claimGithubRelayTask,
  heartbeatGithubRelayTask,
  submitGithubRelayResult,
  readGithubRelayTask
} from '../src/github-relay.mjs';

const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

const MAX_BODY_BYTES = 250_000;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(payload);
  }
  res.writeHead(status, { ...JSON_HEADERS, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
  return undefined;
}

function requestUrl(req) {
  try { return new URL(req.url || '/', 'https://uberbond.invalid'); }
  catch { return new URL('/'); }
}

function bearer(req) {
  const header = String(req.headers?.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  let raw = '';
  if (req && typeof req[Symbol.asyncIterator] === 'function') {
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
        const error = new Error('request body too large');
        error.status = 413;
        throw error;
      }
    }
  }
  if (!raw) return {};
  return JSON.parse(raw);
}

function runtimeConfig(env = process.env) {
  const repository = String(env.GITHUB_REPOSITORY || '').trim();
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(repository);
  return {
    relayToken: String(env.UBERBOND_RELAY_TOKEN || ''),
    githubToken: String(env.GITHUB_TOKEN || ''),
    owner: match?.[1] || '',
    repo: match?.[2] || '',
    repositoryConfigured: Boolean(match),
    githubConfigured: Boolean(env.GITHUB_TOKEN)
  };
}

function authFailure(config) {
  if (!config.relayToken || !config.githubConfigured || !config.repositoryConfigured) {
    return { status: 503, body: { ok: false, status: 'RELAY_NOT_CONFIGURED' } };
  }
  return null;
}

function githubClient({ token, api = fetch }) {
  const base = 'https://api.github.com';
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'UberBond-Bounded-Relay'
  };

  async function request(method, pathname, body) {
    const response = await api(`${base}${pathname}`, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    if (!response.ok) {
      const error = new Error(`GitHub relay request failed (${response.status})`);
      error.status = response.status >= 500 ? 502 : 400;
      throw error;
    }
    return parsed;
  }

  return {
    async createIssue({ owner, repo, title, body, labels }) {
      return request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, { title, body, labels });
    },
    async listIssues({ owner, repo, state, labels, perPage }) {
      const query = new URLSearchParams({ state, per_page: String(perPage) });
      if (labels?.length) query.set('labels', labels.join(','));
      return request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${query}`);
    },
    async getIssue({ owner, repo, issueNumber }) {
      return request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`);
    },
    async getComments({ owner, repo, issueNumber }) {
      return request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments?per_page=100`);
    },
    async addComment({ owner, repo, issueNumber, body }) {
      return request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`, { body });
    },
    async addLabels({ owner, repo, issueNumber, labels }) {
      return request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/labels`, { labels });
    },
    async closeIssue({ owner, repo, issueNumber, stateReason }) {
      return request('PATCH', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`, { state: 'closed', state_reason: stateReason });
    }
  };
}

function issueNumber(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const api = deps.fetch || fetch;
  const config = runtimeConfig(env);

  return async function handler(req, res) {
    const configured = authFailure(config);
    if (configured) return sendJson(res, configured.status, configured.body);
    if (!safeEqual(bearer(req), config.relayToken)) {
      return sendJson(res, 401, { ok: false, status: 'UNAUTHORIZED' });
    }

    const client = deps.client || githubClient({ token: config.githubToken, api });
    const url = requestUrl(req);
    try {
      if (req.method === 'GET') {
        const operation = String(url.searchParams.get('op') || 'health').toLowerCase();
        if (operation === 'health') {
          return sendJson(res, 200, {
            ok: true,
            status: 'READY',
            transport: 'github-issues',
            repository: `${config.owner}/${config.repo}`,
            externalEffectLedger: { ...ZERO_EFFECTS }
          });
        }
        if (operation === 'poll') {
          return sendJson(res, 200, await pollGithubRelayTasks({
            client, owner: config.owner, repo: config.repo,
            targetAgent: url.searchParams.get('targetAgent') || 'claude-code',
            limit: url.searchParams.get('limit') || 10
          }));
        }
        if (operation === 'read') {
          const number = issueNumber(url.searchParams.get('issueNumber'));
          if (!number) return sendJson(res, 400, { ok: false, status: 'INVALID_ISSUE_NUMBER', externalEffectLedger: { ...ZERO_EFFECTS } });
          return sendJson(res, 200, await readGithubRelayTask({ client, owner: config.owner, repo: config.repo, issueNumber: number }));
        }
        return sendJson(res, 400, { ok: false, status: 'UNKNOWN_OPERATION', externalEffectLedger: { ...ZERO_EFFECTS } });
      }

      if (req.method !== 'POST') return sendJson(res, 405, { ok: false, status: 'METHOD_NOT_ALLOWED', externalEffectLedger: { ...ZERO_EFFECTS } });
      const body = await readBody(req);
      const operation = String(body.operation || '').toLowerCase();
      if (operation === 'create') {
        return sendJson(res, 200, await createGithubRelayTask({ client, owner: config.owner, repo: config.repo, input: body.input || {} }));
      }
      const number = issueNumber(body.issueNumber);
      if (!number) return sendJson(res, 400, { ok: false, status: 'INVALID_ISSUE_NUMBER', externalEffectLedger: { ...ZERO_EFFECTS } });
      if (operation === 'claim') {
        return sendJson(res, 200, await claimGithubRelayTask({ client, owner: config.owner, repo: config.repo, issueNumber: number, workerId: body.workerId }));
      }
      if (operation === 'heartbeat') {
        return sendJson(res, 200, await heartbeatGithubRelayTask({ client, owner: config.owner, repo: config.repo, issueNumber: number, workerId: body.workerId }));
      }
      if (operation === 'submit') {
        return sendJson(res, 200, await submitGithubRelayResult({
          client, owner: config.owner, repo: config.repo, issueNumber: number,
          workerId: body.workerId, status: body.status, result: body.result || {}
        }));
      }
      return sendJson(res, 400, { ok: false, status: 'UNKNOWN_OPERATION', externalEffectLedger: { ...ZERO_EFFECTS } });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 502;
      return sendJson(res, status, { ok: false, status: 'RELAY_REQUEST_FAILED', externalEffectLedger: { ...ZERO_EFFECTS } });
    }
  };
}

export { runtimeConfig };
export default createHandler();
