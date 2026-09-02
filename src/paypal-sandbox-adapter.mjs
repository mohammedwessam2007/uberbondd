// Read-only PayPal Sandbox provider adapter. It is intentionally a verifier
// for the existing canonical billing inbox, not a second payment ledger.

export const PAYPAL_SANDBOX_ADAPTER_VERSION = 'paypal-sandbox-adapter-1.0.0';
export const PAYPAL_SANDBOX_API = 'https://api-m.sandbox.paypal.com';
const text = (v, max = 240) => String(v ?? '').trim().slice(0, max);

function safeResponse(response) {
  return { ok: response?.ok === true, status: Number(response?.status) || 0 };
}

export function createPayPalSandboxVerifier({ clientId, clientSecret, fetchImpl = globalThis.fetch, apiBase = PAYPAL_SANDBOX_API, timeoutMs = 15_000 } = {}) {
  const id = String(clientId || '');
  const secret = String(clientSecret || '');
  return async function verifyPayPalSandboxEvent({ objectId, eventName } = {}) {
    if (!id || !secret) return { cleared: false, terminal: true, errorCode: 'paypal-sandbox-credentials-not-configured' };
    if (typeof fetchImpl !== 'function') return { cleared: false, errorCode: 'fetch-implementation-required' };
    const orderId = text(objectId, 80);
    if (!orderId) return { cleared: false, terminal: true, errorCode: 'paypal-object-id-required' };
    let timer;
    try {
      const authResponse = await Promise.race([
        fetchImpl(`${apiBase}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('paypal-auth-timeout')), timeoutMs); })
      ]);
      if (!authResponse?.ok) {
        const status = safeResponse(authResponse).status;
        return { cleared: false, terminal: status === 401 || status === 403, errorCode: `paypal-oauth-http-${status || 'unknown'}` };
      }
      const auth = await authResponse.json();
      const accessToken = text(auth?.access_token, 4000);
      if (!accessToken) return { cleared: false, terminal: true, errorCode: 'paypal-oauth-token-missing' };
      const orderResponse = await fetchImpl(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
      if (!orderResponse?.ok) {
        const status = safeResponse(orderResponse).status;
        return { cleared: false, terminal: status === 400 || status === 404, errorCode: `paypal-order-http-${status || 'unknown'}` };
      }
      const order = await orderResponse.json();
      const status = text(order?.status, 40).toUpperCase();
      const captured = Array.isArray(order?.purchase_units) && order.purchase_units.some(unit => Array.isArray(unit?.payments?.captures) && unit.payments.captures.some(capture => text(capture?.status, 40).toUpperCase() === 'COMPLETED'));
      if (status === 'COMPLETED' && captured) {
        return { cleared: true, canonicalReceiptRef: `paypal:sandbox:${orderId}`, providerStatus: status, eventName: text(eventName, 120) };
      }
      return { cleared: false, errorCode: `paypal-order-${status || 'status-missing'}` };
    } catch (error) {
      return { cleared: false, errorCode: 'paypal-verification-uncertain', detail: text(error?.message, 160) };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
