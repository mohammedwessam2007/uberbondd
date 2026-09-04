import { createPayPalSandboxVerifier } from './paypal-sandbox-adapter.mjs';

export const PAYMENT_PROVIDER_VERIFIER_DISPATCH_VERSION = 'uberbond.payment-provider-verifier-dispatch-1.0.0';

function normalizeProviders(values) {
  if (!Array.isArray(values)) return null;
  const providers = [...new Set(values.map(value => String(value || '').trim().toLowerCase()).filter(Boolean))];
  return providers.length ? providers : [];
}

export function bindPaymentVerifierProviders(verifier, providers = []) {
  if (typeof verifier !== 'function') throw new Error('payment-provider-verifier-function-required');
  const normalized = normalizeProviders(providers);
  if (!normalized?.length) throw new Error('payment-provider-scope-required');
  const scoped = async event => {
    const provider = String(event?.provider || '').trim().toLowerCase();
    if (!normalized.includes(provider)) {
      return {
        cleared: false,
        terminal: false,
        errorCode: 'payment-provider-outside-verifier-scope',
        provider,
        supportedProviders: [...normalized]
      };
    }
    return verifier(event);
  };
  Object.defineProperty(scoped, 'supportedProviders', {
    value: Object.freeze([...normalized]),
    writable: false,
    enumerable: true,
    configurable: false
  });
  return scoped;
}

export function supportedPaymentProviders(verifier) {
  if (typeof verifier !== 'function') return [];
  const declared = normalizeProviders(verifier.supportedProviders);
  return declared === null ? null : declared;
}

export function createConfiguredPaymentVerifier({ cfg, explicitVerifier = null, fetchImpl = globalThis.fetch } = {}) {
  if (typeof explicitVerifier === 'function') return explicitVerifier;
  if (!cfg?.providers?.paypal?.configured) return null;
  const paypal = createPayPalSandboxVerifier({
    clientId: cfg.providers.paypal.clientId,
    clientSecret: cfg.providers.paypal.clientSecret,
    fetchImpl
  });
  return bindPaymentVerifierProviders(paypal, ['paypal']);
}
