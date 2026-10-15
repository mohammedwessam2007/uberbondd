import crypto from 'node:crypto';

// Stable JSON for digests: object keys are sorted at every depth and arrays keep
// their order. `undefined` members are dropped, matching JSON.stringify.
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function digestOf(value) {
  return sha256Hex(canonicalJson(value));
}

// Plain code-unit order. localeCompare depends on the host locale, which would
// make sorted receipts and findings differ between machines.
export function compareText(a, b) {
  const x = String(a);
  const y = String(b);
  if (x === y) return 0;
  return x < y ? -1 : 1;
}
