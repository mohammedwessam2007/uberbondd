// Shared provider-payload minimization. Provider adapters may receive secrets,
// credentials, cookies, or large PII-bearing payloads. No caller should need
// to remember a different redaction implementation for each adapter.

export const PROVIDER_RECEIPT_REDACTION_POLICY_VERSION = 'provider-receipt-redaction-1.0.0';

const REDACT_KEY_PATTERN = /password|passwd|secret|token|apikey|api_key|refreshtoken|refresh_token|accesstoken|access_token|clientsecret|client_secret|privatekey|private_key|smtp.?pass|authorization|cookie/i;
const ALLOWED_VALUE_TYPES = new Set(['string', 'number', 'boolean']);
const MAX_STRING_VALUE_LENGTH = 200;
const MAX_ARRAY_ITEMS = 50;
const MAX_DEPTH = 3;

// This function intentionally drops secret-shaped fields instead of masking
// them. A masked value can still be mistaken for safe material and later be
// persisted or displayed. It also bounds depth, strings, and arrays so a
// provider can never fill an audit receipt with an unbounded response.
export function redactProviderReceipt(raw, depth = 0) {
  if (raw == null || depth > MAX_DEPTH) return null;
  if (Array.isArray(raw)) {
    return raw.slice(0, MAX_ARRAY_ITEMS)
      .map(item => redactProviderReceipt(item, depth + 1))
      .filter(item => item !== undefined);
  }
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

export function providerReceiptDigestInput(raw) {
  const safe = redactProviderReceipt(raw);
  return safe == null ? null : safe;
}
