import { createHash, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Non-finite numbers are not canonical');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

export function sha256(value) {
  const input = typeof value === 'string' ? value : canonicalize(value);
  return createHash('sha256').update(input).digest('hex');
}

export function digestObject(object, omitted = []) {
  const copy = { ...object };
  for (const key of omitted) delete copy[key];
  return sha256(copy);
}

export function signDigestHex(digest, privateKey) {
  if (!/^[a-f0-9]{64}$/i.test(String(digest || ''))) throw new TypeError('Expected sha256 hex digest');
  return cryptoSign(null, Buffer.from(digest, 'hex'), privateKey).toString('base64url');
}

export function verifyDigestSignature(digest, signature, publicKey) {
  if (!/^[a-f0-9]{64}$/i.test(String(digest || '')) || !signature || !publicKey) return false;
  try {
    return cryptoVerify(null, Buffer.from(digest, 'hex'), publicKey, Buffer.from(signature, 'base64url'));
  } catch {
    return false;
  }
}
