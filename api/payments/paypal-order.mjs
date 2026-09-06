import crypto from 'node:crypto';

import { PostgresStore } from '../../src/store.mjs';
import { preparePayPalFirstCashOrder } from '../../src/paypal-payment-truth.mjs';

let liveStorePromise = null;

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}

function safeBearer(request, secret) {
  const expected = Buffer.from(`Bearer ${String(secret || '')}`, 'utf8');
  const observed = Buffer.from(String(request?.headers?.get?.('authorization') || ''), 'utf8');
  return Boolean(secret) && expected.length === observed.length && crypto.timingSafeEqual(expected, observed);
}

async function defaultStore(env) {
  if (!env.DATABASE_URL) throw new Error('database-url-required');
  if (!liveStorePromise) {
    liveStorePromise = (async () => {
      const store = new PostgresStore({
        databaseUrl: env.DATABASE_URL,
        ssl: String(env.DATABASE_SSL || '').toLowerCase() !== 'false'
      });
      await store.init();
      return store;
    })();
  }
  return liveStorePromise;
}

export function createFetchHandler(deps = {}) {
  const env = deps.env || process.env;
  const storeFactory = deps.getStore || defaultStore;
  const prepare = deps.preparePayPalFirstCashOrder || preparePayPalFirstCashOrder;
  return async function handler(request) {
    if (request?.method && request.method !== 'POST') return json({ ok: false, status: 'REFUSED', reasonCodes: ['method-not-allowed'] }, 405);
    if (!env.ADMIN_TOKEN) return json({ ok: false, status: 'REFUSED', reasonCodes: ['admin-token-not-configured'] }, 503);
    if (!safeBearer(request, env.ADMIN_TOKEN)) return json({ ok: false, status: 'REFUSED', reasonCodes: ['unauthorized'] }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, status: 'REFUSED', reasonCodes: ['valid-json-required'] }, 400); }
    const leadId = String(body?.leadId || '').trim();
    const attemptKey = String(body?.attemptKey || 'first-cash-v1').trim();
    if (!leadId) return json({ ok: false, status: 'REFUSED', reasonCodes: ['lead-id-required'] }, 400);
    let store;
    try { store = await storeFactory(env); } catch { return json({ ok: false, status: 'REFUSED', reasonCodes: ['payment-store-unavailable'] }, 503); }
    const result = await prepare({ store, leadId, attemptKey, env });
    const status = result?.ok ? 200 : (result?.status === 'NOT_CONFIGURED' ? 503 : 400);
    return json(result, status);
  };
}

export const POST = createFetchHandler();
