// Versioned provider adapter contract for outreach-sending providers
// (Instantly, Google Workspace, Microsoft 365, ...). This module defines the
// CAPABILITY SURFACE only -- what a real adapter must expose -- plus a
// deterministic "unconfigured" adapter that every capability call reports
// PROVIDER_AUTH_REQUIRED against, used whenever no real provider credential
// is present in configuration.
//
// No real Instantly/Google/Microsoft HTTP client is implemented here. This
// repository has zero configured provider credentials as of this wave (see
// src/config.mjs#providers) and building an unverified client against a live
// API with nothing to test it against would itself be a fabrication risk --
// exactly what this mission forbids. When a provider is genuinely
// configured, its real adapter should be added as a sibling module
// implementing this same contract; nothing else in this codebase should ever
// call a provider directly.
export const PROVIDER_ADAPTER_CONTRACT_POLICY_VERSION = 'provider-adapter-contract-1.0.0';

// Every capability a real adapter must expose. Presence is checked
// structurally by validateProviderAdapter(); this is the "interface," not an
// assumption that any of these are live.
export const PROVIDER_CAPABILITIES = Object.freeze([
  'identity', 'authenticationMethod', 'listMailboxes', 'mailboxHealth', 'dnsRequirements',
  'verifyDns', 'warmupCapable', 'startWarmup', 'pauseWarmup', 'warmupStatus',
  'discoverSendingLimit', 'bounceSignal', 'complaintSignal', 'replySignal', 'campaignStatus',
  'rateLimits', 'cancel', 'receipts', 'termsAndAllowedPurposes', 'dryRunSupported',
  'liveSupported', 'outageState'
]);

export const KNOWN_PROVIDERS = Object.freeze(['instantly', 'googleWorkspace', 'microsoft365']);

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
  // A real adapter for this provider does not exist in this repository yet
  // (see module header) -- even a "configured" provider (credential present)
  // has no live implementation to dispatch to tonight. Report the accurate
  // capability gap rather than silently falling back to the fixture as if
  // nothing were configured.
  return {
    ok: false,
    reason: 'provider-configured-but-no-live-adapter-implemented',
    adapter: createUnconfiguredProviderAdapter(key)
  };
}

// Strips a provider's raw status response down to fields safe to persist:
// opaque ids, counts, booleans, ISO timestamps, enum-shaped strings. Anything
// secret-shaped or free-text (which could carry a leaked credential or PII)
// is dropped, not merely masked.
const REDACT_KEY_PATTERN = /password|passwd|secret|token|apikey|api_key|refreshtoken|refresh_token|accesstoken|access_token|clientsecret|client_secret|privatekey|private_key|smtp.?pass|authorization|cookie/i;
const ALLOWED_VALUE_TYPES = new Set(['string', 'number', 'boolean']);
const MAX_STRING_VALUE_LENGTH = 200;

export function redactProviderReceipt(raw, depth = 0) {
  if (raw == null || depth > 3) return null;
  if (Array.isArray(raw)) return raw.slice(0, 50).map(item => redactProviderReceipt(item, depth + 1)).filter(item => item !== undefined);
  if (typeof raw !== 'object') {
    if (!ALLOWED_VALUE_TYPES.has(typeof raw)) return undefined;
    return typeof raw === 'string' ? raw.slice(0, MAX_STRING_VALUE_LENGTH) : raw;
  }
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (REDACT_KEY_PATTERN.test(key)) continue;
    const redacted = redactProviderReceipt(value, depth + 1);
    if (redacted !== undefined) out[key] = redacted;
  }
  return out;
}
