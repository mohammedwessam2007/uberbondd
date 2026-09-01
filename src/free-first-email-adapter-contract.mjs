import {
  FREE_FIRST_OUTREACH_POLICY_VERSION,
  FREE_FIRST_PROVIDER_REGISTRY,
  providerEligibility,
  routeFreeFirst
} from './free-first-outreach-router.mjs';

export const FREE_FIRST_EMAIL_ADAPTER_CONTRACT_VERSION = 'free-first-email-adapter-1.0.0';

export const FREE_FIRST_EMAIL_CAPABILITIES = Object.freeze([
  'probe',
  'quota',
  'eligible',
  'reserve',
  'send',
  'resolveUncertainSend',
  'ingestDeliveryEvent',
  'ingestBounce',
  'ingestComplaint',
  'ingestReply',
  'suppress',
  'health'
]);

function result(provider, capability, status, extra = {}) {
  return Object.freeze({
    ok: status === 'OK',
    provider,
    capability,
    status,
    contractVersion: FREE_FIRST_EMAIL_ADAPTER_CONTRACT_VERSION,
    policyVersion: FREE_FIRST_OUTREACH_POLICY_VERSION,
    ...extra
  });
}

export function validateFreeFirstEmailAdapter(adapter) {
  const missing = FREE_FIRST_EMAIL_CAPABILITIES.filter(name => typeof adapter?.[name] !== 'function');
  return { ok: missing.length === 0, missing };
}

export function createUnconfiguredFreeEmailAdapter(providerId) {
  const provider = String(providerId || 'unknown').trim().toLowerCase();
  const adapter = { providerId: provider, configured: false };
  for (const capability of FREE_FIRST_EMAIL_CAPABILITIES) {
    adapter[capability] = async () => result(provider, capability, 'PROVIDER_AUTH_REQUIRED');
  }
  adapter.probe = async () => result(provider, 'probe', 'PROVIDER_AUTH_REQUIRED');
  adapter.eligible = async ({ purpose, date = new Date(), usage = {} } = {}) => {
    const record = FREE_FIRST_PROVIDER_REGISTRY.find(item => item.id === provider);
    if (!record) return result(provider, 'eligible', 'UNKNOWN_PROVIDER');
    const eligibility = providerEligibility(record, { purpose, date, usage });
    return result(provider, 'eligible', eligibility.ok ? 'OK' : eligibility.reason, { eligibility });
  };
  return adapter;
}

function normalizeConfiguredAdapter({ providerId, implementation, now = () => new Date() }) {
  const provider = String(providerId || '').trim().toLowerCase();
  const record = FREE_FIRST_PROVIDER_REGISTRY.find(item => item.id === provider);
  if (!record) return { ok: false, reason: 'UNKNOWN_PROVIDER', adapter: createUnconfiguredFreeEmailAdapter(provider) };
  if (!implementation || typeof implementation !== 'object') return { ok: false, reason: 'PROVIDER_NOT_CONFIGURED', adapter: createUnconfiguredFreeEmailAdapter(provider) };

  const requiredExternal = ['probe', 'send', 'resolveUncertainSend'];
  if (requiredExternal.some(name => typeof implementation[name] !== 'function')) {
    return { ok: false, reason: 'INCOMPLETE_PROVIDER_IMPLEMENTATION', adapter: createUnconfiguredFreeEmailAdapter(provider) };
  }

  const adapter = {
    providerId: provider,
    configured: true,
    async probe(input = {}) {
      return implementation.probe(input);
    },
    async quota({ date = now(), usage = {} } = {}) {
      const eligibility = providerEligibility(record, { purpose: 'TRANSACTIONAL', date, usage });
      return result(provider, 'quota', 'OK', { quota: eligibility.quota || null });
    },
    async eligible({ purpose, date = now(), usage = {} } = {}) {
      const eligibility = providerEligibility(record, { purpose, date, usage });
      return result(provider, 'eligible', eligibility.ok ? 'OK' : eligibility.reason, { eligibility });
    },
    async reserve(input = {}) {
      if (!input.messageId) return result(provider, 'reserve', 'MESSAGE_ID_REQUIRED');
      if (!input.purpose) return result(provider, 'reserve', 'PURPOSE_REQUIRED');
      const eligibility = providerEligibility(record, { purpose: input.purpose, date: input.date || now(), usage: input.usage || {} });
      if (!eligibility.ok) return result(provider, 'reserve', eligibility.reason, { eligibility });
      return result(provider, 'reserve', 'OK', {
        reservation: Object.freeze({
          provider,
          messageId: String(input.messageId),
          purpose: input.purpose,
          createdAt: (input.date || now()).toISOString(),
          state: 'RESERVED'
        })
      });
    },
    async send(input = {}) {
      const reservation = input.reservation;
      if (!reservation || reservation.provider !== provider || reservation.state !== 'RESERVED') {
        return result(provider, 'send', 'VALID_RESERVATION_REQUIRED');
      }
      const eligibility = providerEligibility(record, { purpose: reservation.purpose, date: input.date || now(), usage: input.usage || {} });
      if (!eligibility.ok) return result(provider, 'send', eligibility.reason, { eligibility });
      try {
        const external = await implementation.send(input);
        if (!external || external.ok !== true) {
          return result(provider, 'send', external?.uncertain ? 'EXTERNAL_OUTCOME_UNKNOWN' : 'PROVIDER_SEND_FAILED', { external: external || null });
        }
        return result(provider, 'send', 'OK', {
          providerMessageId: String(external.providerMessageId || external.id || ''),
          providerThreadId: external.providerThreadId ? String(external.providerThreadId) : null,
          receipt: external.receipt || null
        });
      } catch (error) {
        return result(provider, 'send', 'EXTERNAL_OUTCOME_UNKNOWN', { reason: String(error?.message || error).slice(0, 500) });
      }
    },
    async resolveUncertainSend(input = {}) {
      return implementation.resolveUncertainSend(input);
    },
    async ingestDeliveryEvent(input = {}) {
      return typeof implementation.ingestDeliveryEvent === 'function'
        ? implementation.ingestDeliveryEvent(input)
        : result(provider, 'ingestDeliveryEvent', 'UNSUPPORTED_CAPABILITY');
    },
    async ingestBounce(input = {}) {
      return typeof implementation.ingestBounce === 'function'
        ? implementation.ingestBounce(input)
        : result(provider, 'ingestBounce', 'UNSUPPORTED_CAPABILITY');
    },
    async ingestComplaint(input = {}) {
      return typeof implementation.ingestComplaint === 'function'
        ? implementation.ingestComplaint(input)
        : result(provider, 'ingestComplaint', 'UNSUPPORTED_CAPABILITY');
    },
    async ingestReply(input = {}) {
      return typeof implementation.ingestReply === 'function'
        ? implementation.ingestReply(input)
        : result(provider, 'ingestReply', 'UNSUPPORTED_CAPABILITY');
    },
    async suppress(input = {}) {
      return typeof implementation.suppress === 'function'
        ? implementation.suppress(input)
        : result(provider, 'suppress', 'LOCAL_GLOBAL_SUPPRESSION_REQUIRED');
    },
    async health(input = {}) {
      return typeof implementation.health === 'function'
        ? implementation.health(input)
        : result(provider, 'health', 'OK', { health: 'UNKNOWN' });
    }
  };

  const validation = validateFreeFirstEmailAdapter(adapter);
  return validation.ok
    ? { ok: true, reason: 'ADAPTER_READY', adapter }
    : { ok: false, reason: `ADAPTER_CONTRACT_INVALID:${validation.missing.join(',')}`, adapter: createUnconfiguredFreeEmailAdapter(provider) };
}

export function resolveFreeFirstEmailAdapter({ providerId, implementations = {}, now } = {}) {
  return normalizeConfiguredAdapter({ providerId, implementation: implementations?.[providerId], now });
}

export function planFreeFirstEmailDispatch({ purpose, date = new Date(), usage = {}, implementations = {} } = {}) {
  const route = routeFreeFirst({ purpose, date, usage });
  if (!route.ok) return { ok: false, route, adapter: null };
  const resolved = resolveFreeFirstEmailAdapter({ providerId: route.provider, implementations, now: () => date });
  if (!resolved.ok) {
    return {
      ok: false,
      route,
      adapter: resolved.adapter,
      status: 'SELECTED_FREE_PROVIDER_NOT_CONFIGURED',
      provider: route.provider
    };
  }
  return { ok: true, route, adapter: resolved.adapter, status: 'FREE_PROVIDER_READY', provider: route.provider };
}
