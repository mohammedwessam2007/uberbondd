import { PostgresStore } from '../../src/store.mjs';
import { processPayPalWebhook } from '../../src/paypal-payment-truth.mjs';

let liveStorePromise = null;

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
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

function responseStatus(result) {
  if (result?.ok) return 200;
  if (result?.status === 'UNAUTHORIZED') return 401;
  if (['NOT_CONFIGURED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_EFFECT_UNCERTAIN'].includes(result?.status)) return 503;
  if (result?.status === 'REVIEW_REQUIRED') return 200;
  return 400;
}

export function createFetchHandler(deps = {}) {
  const env = deps.env || process.env;
  const storeFactory = deps.getStore || defaultStore;
  const processWebhook = deps.processPayPalWebhook || processPayPalWebhook;
  return async function handler(request) {
    if (request?.method && request.method !== 'POST') return json({ ok: false, status: 'REFUSED', reasonCodes: ['method-not-allowed'] }, 405);
    let raw;
    try { raw = Buffer.from(await request.arrayBuffer()); } catch { return json({ ok: false, status: 'REFUSED', reasonCodes: ['raw-body-read-failed'] }, 400); }
    if (!raw.length) return json({ ok: false, status: 'REFUSED', reasonCodes: ['raw-body-required'] }, 400);
    if (raw.length > 1024 * 1024) return json({ ok: false, status: 'REFUSED', reasonCodes: ['body-too-large'] }, 413);
    let store;
    try { store = await storeFactory(env); } catch { return json({ ok: false, status: 'REFUSED', reasonCodes: ['payment-store-unavailable'] }, 503); }
    const result = await processWebhook({ store, env, rawBody: raw, headers: request.headers });
    // A verified but unresolved reversal/dispute is acknowledged to stop an
    // infinite provider retry storm. The durable payment-retention risk entry
    // keeps commercial truth blocked until independent provider evidence clears it.
    return json(result, responseStatus(result));
  };
}

export const POST = createFetchHandler();
