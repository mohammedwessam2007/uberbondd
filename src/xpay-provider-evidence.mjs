// Read-only independent evidence. Never a canonical receipt or fulfilment gate.
// Contract: docs.xpay.app /account, /checkout/sessions/{id}, checkout-session.
export const XPAY_PROVIDER_EVIDENCE_VERSION = 'uberbond.xpay-provider-evidence.v1';
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const minor = value => Number.isSafeInteger(value) && value > 0;
const validBinding = binding => binding && validId(binding.sessionId) && validId(binding.merchantId)
  && minor(binding.amountMinor) && /^[A-Z]{3}$/.test(binding.currency || '')
  && validId(binding.intentId) && validId(binding.leadId) && validId(binding.product);
const refused = errorCode => ({ ok: false, cleared: false, commercialTruthEligible: false,
  businessEffectAuthority: 'NONE', errorCode });

// `binding` comes from a server-owned intent, NEVER webhook metadata/customer input.
export function evaluateXPayProviderEvidence({ account, session, binding, environment } = {}) {
  if (!['test', 'live'].includes(environment)) return refused('xpay-environment-required');
  if (!validBinding(binding)) {
    return refused('xpay-server-intent-binding-required');
  }
  const live = environment === 'live';
  if (account?.id !== binding.merchantId || account?.livemode !== live
    || account?.apiKey?.mode !== environment || !['SECRET', 'RESTRICTED'].includes(account?.apiKey?.type)) {
    return refused('xpay-account-key-binding-mismatch');
  }
  if (live && account.livePaymentsEnabled !== true) return refused('xpay-live-payments-not-enabled');
  if (session?.id !== binding.sessionId || session?.merchantId !== account.id
    || session?.object !== 'checkout.session' || session?.mode !== 'payment'
    || session?.livemode !== live) return refused('xpay-session-binding-mismatch');
  if (session.status !== 'complete' || session.paymentStatus !== 'paid') return refused('xpay-session-not-paid');
  const intent = session.paymentIntent;
  const charge = intent?.latestCharge;
  if (!validId(intent?.id) || session.paymentIntentId !== intent.id
    || intent.object !== 'payment_intent' || intent.checkoutSessionId !== session.id
    || !validId(charge?.id) || charge.object !== 'charge' || charge.paymentIntentId !== intent.id) {
    return refused('xpay-payment-identity-chain-mismatch');
  }
  if (intent.status !== 'SUCCEEDED' || charge.status !== 'SUCCEEDED'
    || charge.paid !== true || charge.captured !== true || intent.amountCapturable !== 0) {
    return refused('xpay-payment-not-captured');
  }
  if ([session.amountTotal, intent.amount, intent.amountReceived, charge.amount, charge.amountCaptured]
    .some(value => !minor(value) || value !== binding.amountMinor)
    || [session.currency, intent.currency, charge.currency].some(value => value !== binding.currency)) {
    return refused('xpay-payment-economics-mismatch');
  }
  // Unknown reversal/hold state is not a clean sale. Partial refunds also refuse.
  if (charge.refunded !== false || charge.disputed !== false || charge.amountRefunded !== 0
    || (charge.activeHoldId !== null && charge.activeHoldId !== '')
    || !Array.isArray(charge.refunds) || charge.refunds.length !== 0) {
    return refused('xpay-payment-reversal-or-hold-not-cleared');
  }
  return { ok: true, cleared: false, commercialTruthEligible: false, businessEffectAuthority: 'NONE',
    status: live ? 'LIVE_CAPTURE_EVIDENCE_REQUIRES_CANONICAL_RECONCILIATION' : 'TEST_CAPTURE_EVIDENCE_ONLY',
    policyVersion: XPAY_PROVIDER_EVIDENCE_VERSION,
    evidence: { provider: 'xpay', environment, merchantId: account.id, sessionId: session.id,
      paymentIntentId: intent.id, chargeId: charge.id, amountMinor: binding.amountMinor,
      currency: binding.currency, intentId: binding.intentId, leadId: binding.leadId, product: binding.product },
    errorCode: 'xpay-canonical-reconciliation-required' };
}

export function createXPayProviderEvidenceReader({ secretKey, environment, fetchImpl = globalThis.fetch,
  timeoutMs = 15000 } = {}) {
  return async ({ binding } = {}) => {
    if (!secretKey || !['test', 'live'].includes(environment) || typeof fetchImpl !== 'function') {
      return refused('xpay-evidence-reader-not-configured');
    }
    // Validate before constructing any URL; the origin cannot be caller overridden.
    if (!validBinding(binding)) return refused('xpay-server-intent-binding-required');
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('deadline')); },
        Math.max(1, Math.min(30000, Number(timeoutMs) || 15000)));
    });
    let providerCalls = 0;
    const run = async () => {
      const get = async path => {
        providerCalls += 1;
        const response = await fetchImpl(`https://api.xpay.app${path}`, { method: 'GET', redirect: 'error',
          signal: controller.signal, headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' } });
        if (!response?.ok) throw new Error('provider-http-failure');
        return response.json();
      };
      const account = await get('/account');
      if (controller.signal.aborted) throw new Error('deadline');
      // Do not read customer-bearing session data under a mismatched merchant/key.
      if (account?.id !== binding.merchantId || account?.livemode !== (environment === 'live')
        || account?.apiKey?.mode !== environment || !['SECRET', 'RESTRICTED'].includes(account?.apiKey?.type)
        || (environment === 'live' && account?.livePaymentsEnabled !== true)) {
        return refused('xpay-account-key-binding-mismatch');
      }
      const session = await get(`/checkout/sessions/${binding.sessionId}`);
      return evaluateXPayProviderEvidence({ account, session, binding, environment });
    };
    try {
      const result = await Promise.race([run(), deadline]);
      return { ...result, providerCalls };
    } catch {
      // Never echo provider payloads, clientSecret, bearer token or thrown messages.
      return { ...refused('xpay-provider-evidence-unavailable'), providerCalls };
    } finally { clearTimeout(timer); controller.abort(); }
  };
}
