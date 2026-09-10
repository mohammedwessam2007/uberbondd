import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGithubRelayTask } from '../src/github-relay.mjs';

export const FREE_MODEL = 'inclusionai/ling-3.0-flash-sante-free';
const MAX_BODY_BYTES = 64_000;
const MAX_MESSAGE_CHARS = 6_000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARS = 12_000;
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
const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow, noarchive'
});
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function send(res, status, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(status).json(payload);
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}
function boundedText(value, max) { return String(value ?? '').trim().slice(0, max); }
function repoIdentity(env) {
  const explicit = boundedText(env.GITHUB_REPOSITORY, 300);
  const parsed = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(explicit);
  if (parsed) return { owner: parsed[1], repo: parsed[2], repository: explicit };
  const owner = boundedText(env.VERCEL_GIT_REPO_OWNER, 160);
  const repo = boundedText(env.VERCEL_GIT_REPO_SLUG, 160);
  return owner && repo ? { owner, repo, repository: `${owner}/${repo}` } : { owner: '', repo: '', repository: '' };
}
function config(env) {
  const repo = repoIdentity(env);
  const gatewayCredential = boundedText(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN, 20_000);
  return {
    ...repo,
    sourceCommit: boundedText(env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA, 80) || null,
    sourceBranch: boundedText(env.VERCEL_GIT_COMMIT_REF, 180) || null,
    environment: boundedText(env.VERCEL_ENV || env.NODE_ENV, 80) || 'unknown',
    gatewayCredential,
    gatewayAuth: env.AI_GATEWAY_API_KEY ? 'AI_GATEWAY_API_KEY' : (env.VERCEL_OIDC_TOKEN ? 'VERCEL_OIDC_TOKEN' : 'NONE'),
    githubToken: boundedText(env.GITHUB_TOKEN, 20_000)
  };
}
function statusView(env) {
  const c = config(env);
  return {
    ok: true,
    status: 'FOUNDER_CENTER_READY',
    schemaVersion: 'uberbond.founder-center.v1',
    runtime: 'VERCEL_SERVER_BACKED',
    environment: c.environment,
    sourceCommit: c.sourceCommit,
    sourceBranch: c.sourceBranch,
    model: FREE_MODEL,
    modelPricing: 'FREE_ONLY_NO_PAID_FALLBACK',
    modelReady: Boolean(c.gatewayCredential),
    gatewayAuth: c.gatewayAuth,
    relayReady: Boolean(c.githubToken && c.owner && c.repo),
    relayRepository: c.repository || null,
    founderChatPrivacy: 'CHAT_TEXT_IS_SENT_ONLY_TO_THE_CONFIGURED_SERVER_SIDE_MODEL_ROUTE_AND_IS_NOT_WRITTEN_TO_GITHUB_BY_THIS_ENDPOINT',
    keepWorkingPrivacy: 'KEEP_WORKING_CREATES_ONLY_A_GENERIC_CANONICAL_RELAY_TASK_AND_NEVER_COPIES_RAW_FOUNDER_CHAT',
    businessEffectAuthority: 'NONE_BY_DEFAULT__FOUNDER_BUTTON_MAY_CREATE_ONE_BOUNDED_GITHUB_RELAY_TASK',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
function sameOrigin(req) {
  const origin = boundedText(req?.headers?.origin, 1000);
  if (!origin) return true;
  const host = boundedText(req?.headers?.host, 500);
  if (!host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') {
    const raw = JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw Object.assign(new Error('body-too-large'), { status: 413 });
    return req.body;
  }
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw && req && typeof req[Symbol.asyncIterator] === 'function') {
    for await (const chunk of req) {
      raw += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw Object.assign(new Error('body-too-large'), { status: 413 });
    }
  }
  if (!raw) return {};
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw Object.assign(new Error('body-too-large'), { status: 413 });
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('invalid-json'), { status: 400 }); }
}
function readCanon(root = defaultRoot) {
  const specs = [
    ['NORTH_STAR.md', 5000],
    ['docs/CURRENT_HANDOFF.json', 7000],
    ['UBERBOND_BOOTSTRAP.json', 4000]
  ];
  const chunks = [];
  for (const [relative, max] of specs) {
    try {
      const absolute = path.join(root, relative);
      const text = fs.readFileSync(absolute, 'utf8').slice(0, max);
      chunks.push(`### ${relative}\n${text}`);
    } catch {}
  }
  return chunks.join('\n\n').slice(0, 15000);
}
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  let used = 0;
  const rows = [];
  for (const item of history.slice(-MAX_HISTORY_MESSAGES)) {
    const role = item?.role === 'assistant' ? 'assistant' : 'user';
    const left = MAX_HISTORY_CHARS - used;
    if (left <= 0) break;
    const content = boundedText(item?.content, Math.min(2500, left));
    if (!content) continue;
    used += content.length;
    rows.push({ role, content });
  }
  return rows;
}
async function gatewayChat({ env, fetchImpl, root, message, history }) {
  const c = config(env);
  if (!c.gatewayCredential) return { ok: false, status: 'MODEL_AUTH_UNAVAILABLE', reasonCodes: ['vercel-oidc-or-ai-gateway-key-required'] };
  const canon = readCanon(root);
  const system = [
    'You are UberBond Communication Center, the private founder-facing intelligence surface.',
    'Terminal goal: a sovereign Personal Civilization / Ubermensch machine around the founder\'s free will. Economic systems are subordinate organs, never the terminal objective.',
    'Truth law: distinguish source code, deployed serverless runtime, actual external effects, and lived-world evidence. Never claim a change, action, payment, deployment, customer event, or physical runtime happened unless supplied evidence proves it.',
    'Privacy law: never instruct the founder to paste secrets. Do not reproduce private founder chat into public-repository artifacts.',
    'You may recommend actions. This chat call itself has no GitHub write/deploy/payment/messaging authority.',
    `Current deployed source commit: ${c.sourceCommit || 'UNKNOWN'}.`,
    `Canonical excerpts follow:\n${canon}`
  ].join('\n');
  const response = await fetchImpl('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${c.gatewayCredential}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: FREE_MODEL,
      messages: [{ role: 'system', content: system }, ...sanitizeHistory(history), { role: 'user', content: message }],
      max_tokens: 420,
      temperature: 0.2,
      stream: false
    })
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    return { ok: false, status: 'MODEL_CALL_FAILED', httpStatus: response.status, reasonCodes: ['free-model-route-failed'] };
  }
  const answer = boundedText(parsed?.choices?.[0]?.message?.content, 12000);
  if (!answer) return { ok: false, status: 'MODEL_EMPTY_RESPONSE', reasonCodes: ['model-returned-no-text'] };
  return {
    ok: true,
    status: 'ANSWERED',
    model: FREE_MODEL,
    answer,
    sourceCommit: c.sourceCommit,
    usage: parsed?.usage || null,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
function githubClient({ token, fetchImpl }) {
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'UberBond-Founder-Center'
  };
  async function request(method, pathname, body) {
    const res = await fetchImpl(`https://api.github.com${pathname}`, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) throw Object.assign(new Error('github-request-failed'), { status: res.status });
    return parsed;
  }
  return {
    createIssue: ({ owner, repo, title, body, labels }) => request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, { title, body, labels }),
    listIssues: ({ owner, repo, state, labels, perPage }) => {
      const q = new URLSearchParams({ state: String(state || 'open').toLowerCase(), per_page: String(perPage || 50) });
      if (labels?.length) q.set('labels', labels.join(','));
      return request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${q}`);
    }
  };
}
function canonicalContinueTask(c) {
  const head = c.sourceCommit || 'UNKNOWN';
  return {
    taskId: `founder_continue_${String(head).slice(0, 24)}`,
    objective: 'Continue UberBond exact-current self-completion from canonical truth. Select the highest-value finite dependency-satisfied internal engineering leaf, implement only source-local work, adversarially test it, and leave exact receipts. Stop at any external-effect, private-data, founder-choice, credential, spend, customer, payment, deployment, signing, or physical-runtime boundary.',
    originAgent: 'uberbond-founder-center',
    targetAgent: 'claude-code',
    parentTask: `main:${head}`,
    contextRefs: ['doc:docs/CURRENT_HANDOFF.json', 'doc:NORTH_STAR.md', 'doc:UBERBOND_BOOTSTRAP.json'],
    evidenceRefs: ['doc:docs/CURRENT_HANDOFF.json'],
    constraints: [
      'refresh exact current main before editing',
      'preserve founder privacy and never copy raw founder chat into public artifacts',
      'do not weaken tests or authority boundaries',
      'zero external effects',
      'truthfully distinguish source proof from physical runtime proof'
    ],
    requiredOutputs: ['bounded source change or evidence-bound no-op', 'tests actually run', 'exact source commit', 'findings and limitations'],
    acceptanceTests: ['focused hostile tests pass', 'privacy boundary preserved', 'zero external effects', 'current canon remains truthful'],
    budget: { maxTokens: 100000, maxCostCents: 0 },
    economicObjective: 'terminal Personal Civilization objective first; economic systems remain subordinate',
    consequenceClass: 'LOCAL_PREPARATION'
  };
}
async function keepWorking({ env, fetchImpl, createRelayTask }) {
  const c = config(env);
  if (!c.githubToken || !c.owner || !c.repo) {
    return { ok: false, status: 'RELAY_NOT_CONFIGURED', reasonCodes: [!c.githubToken ? 'github-token-unavailable' : 'repository-identity-unavailable'], relayRepository: c.repository || null };
  }
  const client = githubClient({ token: c.githubToken, fetchImpl });
  return createRelayTask({ client, owner: c.owner, repo: c.repo, input: canonicalContinueTask(c), date: new Date() });
}

export function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetch || fetch;
  const root = deps.root || defaultRoot;
  const createRelayTask = deps.createRelayTask || createGithubRelayTask;
  return async function handler(req, res) {
    const method = String(req?.method || '').toUpperCase();
    if (method === 'GET') return send(res, 200, statusView(env));
    if (method !== 'POST') return send(res, 405, { ok: false, status: 'METHOD_NOT_ALLOWED' });
    if (!sameOrigin(req)) return send(res, 403, { ok: false, status: 'CROSS_ORIGIN_REFUSED' });
    try {
      const body = await readBody(req);
      const action = boundedText(body.action, 80).toLowerCase();
      if (action === 'status') return send(res, 200, statusView(env));
      if (action === 'chat') {
        const message = boundedText(body.message, MAX_MESSAGE_CHARS);
        if (!message) return send(res, 400, { ok: false, status: 'MESSAGE_REQUIRED' });
        const result = await gatewayChat({ env, fetchImpl, root, message, history: body.history });
        return send(res, result.ok ? 200 : 503, result);
      }
      if (action === 'keep-working') {
        const result = await keepWorking({ env, fetchImpl, createRelayTask });
        return send(res, result.ok ? 200 : 409, result);
      }
      return send(res, 400, { ok: false, status: 'UNKNOWN_ACTION' });
    } catch (error) {
      return send(res, Number.isInteger(error?.status) ? error.status : 500, { ok: false, status: 'FOUNDER_CENTER_REQUEST_FAILED', reasonCodes: [boundedText(error?.message, 160) || 'unknown-error'] });
    }
  };
}

export default createHandler();
