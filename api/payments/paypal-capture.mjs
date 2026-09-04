import { PostgresStore } from '../../src/store.mjs';
import { capturePayPalFirstCashOrder } from '../../src/paypal-payment-truth.mjs';

let liveStorePromise = null;

function html(message, status = 200) {
  const safe = String(message || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UberBond payment</title><main style="font-family:system-ui;max-width:42rem;margin:4rem auto;padding:0 1.25rem"><h1>UberBond payment</h1><p>${safe}</p></main>`, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    }
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

export function createFetchHandler(deps = {}) {
  const env = deps.env || process.env;
  const storeFactory = deps.getStore || defaultStore;
  const capture = deps.capturePayPalFirstCashOrder || capturePayPalFirstCashOrder;
  return async function handler(request) {
    if (request?.method && request.method !== 'GET') return html('This endpoint only accepts the PayPal approval return.', 405);
    let url;
    try { url = new URL(request.url); } catch { return html('The PayPal return URL is invalid.', 400); }
    const intentId = String(url.searchParams.get('intent') || '').trim();
    const providerOrderId = String(url.searchParams.get('token') || '').trim();
    if (!intentId || !providerOrderId) return html('The PayPal return is missing its payment identity.', 400);
    let store;
    try { store = await storeFactory(env); } catch { return html('Payment verification storage is temporarily unavailable. No payment status was inferred.', 503); }
    const result = await capture({ store, intentId, providerOrderId, env });
    if (!result?.ok) {
      if (result?.status === 'PROVIDER_EFFECT_UNCERTAIN') {
        return html('PayPal may have received the capture request, but UberBond does not yet have safe confirmation. Do not pay again. Provider verification is pending.', 202);
      }
      return html('UberBond could not safely bind this PayPal return to the prepared payment. No cleared payment was inferred.', 400);
    }
    if (result.status === 'ALREADY_RECONCILED') return html('Payment has already been verified by provider-origin evidence. You may close this page.');
    return html('PayPal accepted the capture request. UberBond is waiting for signed provider confirmation before treating the payment as cleared.', 202);
  };
}

export const GET = createFetchHandler();
