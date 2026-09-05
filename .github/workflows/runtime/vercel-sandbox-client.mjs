import crypto from 'node:crypto';

export const VERCEL_SANDBOX_CLIENT_POLICY_VERSION = 'uberbond.vercel-sandbox-client-1.0.0';
const DEFAULT_BASE_URL = 'https://vercel.com/api';
const MAX_JSON_BYTES = 1_000_000;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,240}$/;

function text(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }
function digest(value) { return crypto.createHash('sha256').update(String(value ?? '')).digest('hex'); }
function fail(reasonCodes, status = 'VERCEL_SANDBOX_BLOCKED', extra = {}) {
  return { ok: false, policyVersion: VERCEL_SANDBOX_CLIENT_POLICY_VERSION, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], businessEffectAuthority: 'NONE', ...extra };
}

export function decodeVercelOidcClaims(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    return payload;
  } catch { return null; }
}

function boundedJson(raw) {
  if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BYTES) throw new Error('vercel-sandbox-response-too-large');
  return raw ? JSON.parse(raw) : {};
}

export function createVercelSandboxRestClient({ env = process.env, fetchImpl = globalThis.fetch, baseUrl = DEFAULT_BASE_URL } = {}) {
  const token = text(env.VERCEL_OIDC_TOKEN, 20_000);
  const claims = decodeVercelOidcClaims(token) || {};
  const projectId = text(env.VERCEL_PROJECT_ID || claims.project_id, 240);
  const teamId = text(env.VERCEL_TEAM_ID || claims.owner_id, 240);
  const blockers = [];
  if (!token) blockers.push('vercel-oidc-token-required');
  if (!projectId) blockers.push('vercel-project-id-required');
  if (!teamId) blockers.push('vercel-team-id-required');
  if (typeof fetchImpl !== 'function') blockers.push('fetch-implementation-required');

  async function request(pathname, { method = 'GET', body, raw = false, query = {} } = {}) {
    if (blockers.length) throw new Error(blockers.join(','));
    const url = new URL(`${baseUrl}${pathname}`);
    url.searchParams.set('teamId', teamId);
    for (const [key, value] of Object.entries(query)) if (value != null) url.searchParams.set(key, String(value));
    const response = await fetchImpl(url.toString(), {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        'user-agent': 'UberBond-MAX-Self-Maintainer/1.0'
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response?.ok) {
      const status = Number(response?.status || 0);
      throw new Error(`vercel-sandbox-http-${status || 'unknown'}`);
    }
    if (raw) return response;
    return boundedJson(await response.text());
  }

  async function createSandbox({ repository, revision, timeoutMs = 2_700_000, vcpus = 4, name = null } = {}) {
    const repo = text(repository, 300);
    const sha = text(revision, 80).toLowerCase();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return fail(['valid-public-repository-required']);
    if (!/^[a-f0-9]{40}$/.test(sha)) return fail(['exact-base-revision-required']);
    const payload = await request('/v3/sandboxes', {
      method: 'POST',
      body: {
        projectId,
        ...(name ? { name: text(name, 100) } : {}),
        source: { type: 'git', url: `https://github.com/${repo}.git`, revision: sha },
        timeout: Math.max(60_000, Math.min(2_700_000, Number(timeoutMs) || 2_700_000)),
        resources: { vcpus: Math.max(1, Math.min(4, Number(vcpus) || 4)) },
        persistent: false,
        networkPolicy: { mode: 'allow-all' },
        env: {},
        tags: { uberbond: 'max-self-maintainer' }
      }
    });
    const session = payload?.session;
    if (!session?.id || !session?.cwd || !SAFE_ID.test(String(session.id))) return fail(['vercel-sandbox-create-response-invalid'], 'VERCEL_SANDBOX_UNAVAILABLE');
    return { ok: true, policyVersion: VERCEL_SANDBOX_CLIENT_POLICY_VERSION, status: 'SANDBOX_CREATED', sandboxName: payload?.sandbox?.name || name || null, sessionId: String(session.id), cwd: String(session.cwd), networkPolicy: session.networkPolicy || null, businessEffectAuthority: 'NONE' };
  }

  async function startCommand({ sessionId, cwd, command, args = [], env: commandEnv = {}, timeoutMs = 900_000 } = {}) {
    if (!SAFE_ID.test(text(sessionId, 240))) return fail(['valid-session-id-required']);
    const payload = await request(`/v2/sandboxes/sessions/${encodeURIComponent(sessionId)}/cmd`, {
      method: 'POST',
      body: { command: text(command, 1000), args: Array.isArray(args) ? args.map(item => String(item)) : [], cwd: text(cwd, 1000) || undefined, env: commandEnv || {}, sudo: false, timeout: Math.max(1_000, Math.min(2_700_000, Number(timeoutMs) || 900_000)) }
    });
    const cmd = payload?.command;
    if (!cmd?.id || !SAFE_ID.test(String(cmd.id))) return fail(['vercel-sandbox-command-response-invalid']);
    return { ok: true, policyVersion: VERCEL_SANDBOX_CLIENT_POLICY_VERSION, status: 'COMMAND_STARTED', commandId: String(cmd.id), exitCode: cmd.exitCode ?? null, businessEffectAuthority: 'NONE' };
  }

  async function getCommand({ sessionId, commandId, wait = false } = {}) {
    if (!SAFE_ID.test(text(sessionId, 240)) || !SAFE_ID.test(text(commandId, 240))) return fail(['valid-session-and-command-id-required']);
    const payload = await request(`/v2/sandboxes/sessions/${encodeURIComponent(sessionId)}/cmd/${encodeURIComponent(commandId)}`, { query: wait ? { wait: 'true' } : {} });
    const cmd = payload?.command;
    if (!cmd?.id) return fail(['vercel-sandbox-command-status-invalid']);
    return { ok: true, policyVersion: VERCEL_SANDBOX_CLIENT_POLICY_VERSION, status: Number.isInteger(cmd.exitCode) ? 'COMMAND_FINISHED' : 'COMMAND_RUNNING', commandId: String(cmd.id), exitCode: Number.isInteger(cmd.exitCode) ? cmd.exitCode : null, durationMs: Number(cmd.durationMs || 0), businessEffectAuthority: 'NONE' };
  }

  async function readFile({ sessionId, path, cwd } = {}) {
    if (!SAFE_ID.test(text(sessionId, 240))) return fail(['valid-session-id-required']);
    const response = await request(`/v2/sandboxes/sessions/${encodeURIComponent(sessionId)}/fs/read`, { method: 'POST', body: { path: text(path, 1000), cwd: text(cwd, 1000) || undefined }, raw: true });
    const contentType = String(response.headers?.get?.('content-type') || '');
    if (!contentType.includes('application/octet-stream')) return fail(['vercel-sandbox-file-content-type-invalid']);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_JSON_BYTES) return fail(['vercel-sandbox-file-too-large']);
    return { ok: true, policyVersion: VERCEL_SANDBOX_CLIENT_POLICY_VERSION, status: 'FILE_READ', content: buffer.toString('utf8'), sha256: digest(buffer), businessEffectAuthority: 'NONE' };
  }

  async function setNetworkPolicy({ sessionId, mode } = {}) {
    if (!SAFE_ID.test(text(sessionId, 240))) return fail(['valid-session-id-required']);
    if (!['allow-all', 'deny-all'].includes(mode)) return fail(['supported-network-policy-required']);
    const payload = await request(`/v2/sandboxes/sessions/${encodeURIComponent(sessionId)}/network-policy`, { method: 'POST', body: { mode } });
    const observed = payload?.session?.networkPolicy?.mode || payload?.session?.networkPolicy || null;
    if (observed !== mode && !(typeof observed === 'object' && observed?.mode === mode)) return fail(['vercel-sandbox-network-policy-not-attested']);
    return { ok: true, policyVersion: VERCEL_SANDBOX_CLIENT_POLICY_VERSION, status: 'NETWORK_POLICY_UPDATED', mode, businessEffectAuthority: 'NONE' };
  }

  async function stopSession({ sessionId } = {}) {
    if (!SAFE_ID.test(text(sessionId, 240))) return fail(['valid-session-id-required']);
    await request(`/v2/sandboxes/sessions/${encodeURIComponent(sessionId)}/stop`, { method: 'POST' });
    return { ok: true, policyVersion: VERCEL_SANDBOX_CLIENT_POLICY_VERSION, status: 'SANDBOX_STOPPED', receiptRef: `receipt:vercel-sandbox-stop:${digest(sessionId).slice(0, 24)}`, businessEffectAuthority: 'NONE' };
  }

  return Object.freeze({ blockers: [...blockers], projectId, teamId, createSandbox, startCommand, getCommand, readFile, setNetworkPolicy, stopSession });
}
