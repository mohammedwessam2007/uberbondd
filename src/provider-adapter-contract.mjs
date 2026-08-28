// Versioned provider adapter contract for outreach-sending and
// domain/mailbox-infrastructure providers. Provider-specific HTTP lives in
// src/provider-http-adapters.mjs. A configured API key makes an adapter
// available; it does not authorize spending, DNS mutation, mailbox creation or
// live outreach. Those operations remain individually approval-gated.
import { createIcemailAdapter, createMailforgeAdapter } from './provider-http-adapters.mjs';

export const PROVIDER_ADAPTER_CONTRACT_POLICY_VERSION = 'provider-adapter-contract-2.0.0';

// Every capability a real adapter must expose. Presence is checked
// structurally by validateProviderAdapter(); this is the "interface," not an
// assumption that any of these are live.
export const PROVIDER_CAPABILITIES = Object.freeze([
  'identity', 'authenticationMethod', 'listMailboxes', 'mailboxHealth', 'dnsRequirements',
  'verifyDns', 'warmupCapable', 'startWarmup', 'pauseWarmup', 'warmupStatus',
  'discoverSendingLimit', 'bounceSignal', 'complaintSignal', 'replySignal', 'campaignStatus',
  'rateLimits', 'cancel', 'receipts', 'termsAndAllowedPurposes', 'dryRunSupported',
  'liveSupported', 'outageState',
  'listWorkspaces', 'createWorkspace', 'domainAvailability', 'listDomains', 'domainDns',
  'provisionDomains', 'provisionMailboxes', 'configureDns', 'configureForwarding',
  'exportMailboxes', 'prewarmPurchase', 'operationStatus', 'webhookEvents'
]);

export const KNOWN_PROVIDERS = Object.freeze(['instantly', 'googleWorkspace', 'microsoft365', 'icemail', 'mailforge']);

const PROVIDER_FACTORIES = Object.freeze({
  icemail: createIcemailAdapter,
  mailforge: createMailforgeAdapter
});

function unconfiguredResult(providerName, capability) {
  return {
    ok: false,
    status: 'PROVIDER_AUTH_REQUIRED',
    provider: providerName,
    capability,
    reason: `${providerName} is not configured -- no credential is present. Add the required configuration, then this capability can be called for real.`,
    policyVersion: PROVIDER_ADAPTER_CONTRACT_POLICY_VERSION
  };
}

// Every method of this adapter is synchronous-shaped but returns the same
// deterministic denial regardless of arguments -- it never performs I/O, so
// it is safe to call from any test or code path without a network boundary.
export function createUnconfiguredProviderAdapter(providerName) {
  const adapter = { providerName: String(providerName || 'unknown') };
  for (const capability of PROVIDER_CAPABILITIES) {
    adapter[capability] = async () => unconfiguredResult(adapter.providerName, capability);
  }
  adapter.dryRunSupported = async () => ({ ok: true, status: 'DRY_RUN_ONLY', provider: adapter.providerName, policyVersion: PROVIDER_ADAPTER_CONTRACT_POLICY_VERSION });
  adapter.liveSupported = async () => ({ ok: false, status: 'PROVIDER_AUTH_REQUIRED', provider: adapter.providerName, policyVersion: PROVIDER_ADAPTER_CONTRACT_POLICY_VERSION });
  adapter.termsAndAllowedPurposes = async () => ({ ok: false, status: 'PROVIDER_AUTH_REQUIRED', provider: adapter.providerName, policyVersion: PROVIDER_ADAPTER_CONTRACT_POLICY_VERSION });
  adapter.configured = false;
  return adapter;
}

// Structural check that a candidate adapter implements the full contract as
// callable functions. Does not call any of them.
export function validateProviderAdapter(adapter) {
  const missing = PROVIDER_CAPABILITIES.filter(capability => typeof adapter?.[capability] !== 'function');
  return { ok: missing.length === 0, missing };
}

// Inspects config.providers (never a raw env var directly) and returns the
// real adapter only for a genuinely configured provider, or the
// unconfigured fixture adapter otherwise. This is the ONLY function in this
// codebase that should decide "is a provider connected" for the domain/
// mailbox system -- callers must not re-derive that from env vars directly.
export function resolveProviderAdapter(cfg, providerName) {
  const key = String(providerName || '').trim();
  if (!KNOWN_PROVIDERS.includes(key)) {
    return { ok: false, reason: `unknown-provider:${key}`, adapter: createUnconfiguredProviderAdapter(key || 'unknown') };
  }
  const providerCfg = cfg?.providers?.[key];
  if (!providerCfg?.configured) {
    return { ok: false, reason: 'provider-not-configured', adapter: createUnconfiguredProviderAdapter(key) };
  }
  const factory = PROVIDER_FACTORIES[key];
  if (factory) {
    const adapter = factory(providerCfg);
    if (!adapter.configured) {
      return { ok: false, reason: 'provider-auth-required', adapter };
    }
    const validation = validateProviderAdapter(adapter);
    if (!validation.ok) {
      return {
        ok: false,
        reason: `provider-adapter-contract-invalid:${validation.missing.join(',')}`,
        adapter: createUnconfiguredProviderAdapter(key)
      };
    }
    return { ok: true, reason: 'provider-adapter-ready', adapter };
  }

  // Instantly, Google Workspace, and Microsoft 365 remain explicit
  // capability gaps in this provider-dispatch surface. The existing Gmail
  // OAuth sending path is separate and must not be confused with a mailbox-
  // provisioning API adapter.
  return {
    ok: false,
    reason: 'provider-configured-but-no-live-adapter-implemented',
    adapter: createUnconfiguredProviderAdapter(key)
  };
}

export { redactProviderReceipt } from './provider-receipt-redaction.mjs';
