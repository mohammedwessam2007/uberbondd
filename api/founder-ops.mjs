import crypto from 'node:crypto';
import { config } from '../src/config.mjs';
import { createStore } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { buildFounderOpsView } from '../src/founder-ops-view.mjs';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow, noarchive'
};

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

let liveContextPromise = null;

async function defaultContext(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('live-database-not-configured');
  if (!liveContextPromise) {
    liveContextPromise = (async () => {
      const cfg = {
        ...config,
        storeBackend: 'postgres',
        databaseUrl: env.DATABASE_URL,
        databaseSsl: String(env.DATABASE_SSL ?? config.databaseSsl).toLowerCase() !== 'false'
      };
      const store = createStore(cfg);
      await store.init();
      const revenueEngine = new RevenueEngine(store, cfg, null);
      return { store, cfg, revenueEngine };
    })().catch(error => {
      liveContextPromise = null;
      throw error;
    });
  }
  return liveContextPromise;
}

export function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const build = deps.buildFounderOpsView || buildFounderOpsView;
  const getContext = deps.getContext || (() => defaultContext(env));
  const clock = deps.now || (() => new Date());

  return async function handler(req, res) {
    if (String(req?.method || '').toUpperCase() !== 'GET') {
      return send(res, 405, { ok: false, status: 'REFUSED', reasonCodes: ['method-not-allowed'] });
    }
    if (!env.ADMIN_TOKEN) {
      return send(res, 503, { ok: false, status: 'REFUSED', reasonCodes: ['founder-ops-admin-auth-not-configured'] });
    }
    if (!equalBearer(req?.headers?.authorization, env.ADMIN_TOKEN)) {
      return send(res, 401, { ok: false, status: 'REFUSED', reasonCodes: ['founder-ops-unauthorized'] });
    }
    if (!env.DATABASE_URL && !deps.getContext) {
      return send(res, 503, { ok: false, status: 'FOUNDER_OPS_UNAVAILABLE', reasonCodes: ['live-database-not-configured'] });
    }

    try {
      const { store, cfg, revenueEngine } = await getContext();
      const view = await build({
        store,
        cfg,
        revenueEngine,
        env,
        now: clock(),
        runtime: {
          platform: env.VERCEL ? 'VERCEL' : 'NODE',
          environment: env.VERCEL_ENV || env.NODE_ENV || 'unknown',
          sourceCommit: env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || null,
          region: env.VERCEL_REGION || null
        }
      });
      if (!view?.ok) return send(res, 503, view || { ok: false, status: 'FOUNDER_OPS_UNAVAILABLE' });
      return send(res, 200, view);
    } catch {
      return send(res, 503, {
        ok: false,
        status: 'FOUNDER_OPS_UNAVAILABLE',
        reasonCodes: ['live-operational-view-failed'],
        businessEffectAuthority: 'NONE'
      });
    }
  };
}

export default createHandler();
