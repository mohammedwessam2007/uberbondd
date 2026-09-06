import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUberBondCommandCenterStatus } from '../src/uberbond-command-center-status.mjs';
import { normalizeUberBondCommandCenterStatus } from '../src/uberbond-command-center-normalizer.mjs';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer'
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function send(res, status, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(status).json(payload);
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}
function bearerHeader(value) {
  if (Array.isArray(value)) return value.length === 1 && typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}
function equalBearer(header, secret) {
  if (typeof secret !== 'string' || !secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(bearerHeader(header));
  return actual.length === expected.length && actual.length > 0 && crypto.timingSafeEqual(actual, expected);
}

export function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const build = deps.buildUberBondCommandCenterStatus || buildUberBondCommandCenterStatus;
  const normalize = deps.normalizeUberBondCommandCenterStatus || normalizeUberBondCommandCenterStatus;
  const repositoryRoot = deps.root || root;
  const clock = deps.now || (() => new Date());
  return async function handler(req, res) {
    if (String(req?.method || '').toUpperCase() !== 'GET') {
      return send(res, 405, { ok: false, status: 'REFUSED', reasonCodes: ['method-not-allowed'] });
    }
    if (!env.ADMIN_TOKEN) {
      return send(res, 503, { ok: false, status: 'REFUSED', reasonCodes: ['command-center-admin-auth-not-configured'] });
    }
    if (!equalBearer(req?.headers?.authorization, env.ADMIN_TOKEN)) {
      return send(res, 401, { ok: false, status: 'REFUSED', reasonCodes: ['unauthorized'] });
    }
    try {
      const status = await build({
        root: repositoryRoot,
        now: clock(),
        runtime: {
          platform: env.VERCEL ? 'VERCEL' : 'NODE',
          environment: env.VERCEL_ENV || env.NODE_ENV || 'unknown',
          sourceCommit: env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || null,
          region: env.VERCEL_REGION || null,
          adminAuthConfigured: true
        }
      });
      const normalized = await normalize(status, { root: repositoryRoot });
      return send(res, 200, normalized);
    } catch {
      return send(res, 503, { ok: false, status: 'COMMAND_CENTER_STATUS_UNAVAILABLE', reasonCodes: ['status-compilation-failed'] });
    }
  };
}

export default createHandler();
