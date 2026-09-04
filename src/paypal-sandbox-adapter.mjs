// Read-only PayPal Sandbox provider adapter. It is intentionally a verifier
// for provider configuration and sandbox behavior, never evidence of real money.
// The existing canonical billing/payment pipeline remains the only revenue truth.

export const PAYPAL_SANDBOX_ADAPTER_VERSION = 'paypal-sandbox-adapter-1.2.0';
export const PAYPAL_SANDBOX_API = 'https://api-m.sandbox.paypal.com';
const text = (v, max = 240) => String(v ?? '').trim().slice(0, max);

function safeResponse(response) {
  return { ok: response?.ok === true, status: Number(response?.status) || 0 };
}

function sandboxResult(extra = {}) {
  return {
    cleared: false,
    environment: 'SANDBOX',
    economicEligible: false,
    commercialTruthEligible: false,
    ...extra
  };
}

export function createPayPalSandboxVerifier({ clientId, clientSecret, fetchImpl = globalThis.fetch, apiBase = PAYPAL_SANDBOX_API, timeoutMs = 15_000 } = {}) {
  const id = String(clientId || '');
  const secret = String(clientSecret || '');
  const verifier = async function verifyPayPalSandboxEvent({ provider, objectId, eventName } = {}) {
    const normalizedProvider = text(provider, 80).toLowerCase();
    if (normalizedProvider && normalizedProvider !== 'paypal') {
      return sandboxResult({ terminal: false, errorCode: 'payment-provider-outside-verifier-scope', provider: normalizedProvider });
    }
    if (!id || !secret) return sandboxResult({ terminal: true, errorCode: 'paypal-sandbox-credentials-not-configured' });
    if (typeof fetchImpl !== 'function') return sandboxResult({ errorCode: 'fetch-implementation-required' });
    const orderId = text(objectId, 80);
    if (!orderId) return sandboxResult({ terminal: true, errorCode: 'paypal-object-id-required' });
    let timer;
    try {
      const authResponse = await Promise.race([
        fetchImpl(`${apiBase}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('paypal-auth-timeout')), timeoutMs); })
      ]);
      if (!authResponse?.ok) {
        const status = safeResponse(authResponse).status;
        return sandboxResult({ terminal: status === 401 || status === 403, errorCode: `paypal-oauth-http-${status || 'unknown'}` });
      }
      const auth = await authResponse.json();
      const accessToken = text(auth?.access_token, 4000);
      if (!accessToken) return sandboxResult({ terminal: true, errorCode: 'paypal-oauth-token-missing' });
      const orderResponse = await fetchImpl(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
      if (!orderResponse?.ok) {
        const status = safeResponse(orderResponse).status;
        return sandboxResult({ terminal: status === 400 || status === 404, errorCode: `paypal-order-http-${status || 'unknown'}` });
      }
      const order = await orderResponse.json();
      const providerOrderId = text(order?.id, 80);
      if (providerOrderId && providerOrderId !== orderId) return sandboxResult({ terminal: true, errorCode: 'paypal-order-id-mismatch' });
      const status = text(order?.status, 40).toUpperCase();
      const captures = Array.isArray(order?.purchase_units)
        ? order.purchase_units.flatMap(unit => Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [])
        : [];
      const completedCaptures = captures.filter(capture => text(capture?.status, 40).toUpperCase() === 'COMPLETED');
      const completed = status === 'COMPLETED' && completedCaptures.length > 0;
      if (!completed) return sandboxResult({ sandboxVerified: true, providerStatus: status, errorCode: `paypal-order-${status || 'status-missing'}` });

      const amounts = completedCaptures.map(capture => ({
        value: text(capture?.amount?.value, 40),
        currency: text(capture?.amount?.currency_code, 12).toUpperCase(),
        captureId: text(capture?.id, 100)
      }));
      const amountPairs = new Set(amounts.filter(item => item.value && item.currency).map(item => `${item.value}:${item.currency}`));
      if (amountPairs.size > 1) return sandboxResult({ sandboxVerified: true, providerStatus: status, errorCode: 'paypal-capture-amount-currency-disagreement' });
      const amount = amounts.find(item => item.value && item.currency) || null;

      // A completed Sandbox order proves only that the Sandbox integration works.
      // It deliberately never returns cleared:true or a canonical real-money receipt.
      return sandboxResult({
        sandboxVerified: true,
        providerStatus: status,
        sandboxReceiptRef: `paypal:sandbox:${orderId}`,
        captureRefs: amounts.map(item => item.captureId).filter(Boolean),
        amount: amount?.value || null,
        currency: amount?.currency || null,
        eventName: text(eventName, 120),
        errorCode: 'paypal-sandbox-verification-only'
      });
    } catch (error) {
      return sandboxResult({ errorCode: 'paypal-verification-uncertain', detail: text(error?.message, 160) });
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  Object.defineProperty(verifier, 'supportedProviders', {
    value: Object.freeze(['paypal']),
    writable: false,
    enumerable: true,
    configurable: false
  });
  return verifier;
}