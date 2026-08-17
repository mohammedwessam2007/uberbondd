import { createHash, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';

function canonical(value, seen) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Non-finite numbers are not canonical');
    return JSON.stringify(value);
  }
  if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof value)) {
    throw new TypeError(`Unsupported canonical type: ${typeof value}`);
  }
  if (typeof value !== 'object') throw new TypeError(`Unsupported canonical type: ${typeof value}`);
  if (seen.has(value)) throw new TypeError('Cyclic structures are not canonical');
  seen.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map(item => canonical(item, seen)).join(',')}]`;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError('Only plain objects are canonical');
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(value[key], seen)}`).join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

export function canonicalize(value) {
  return canonical(value, new WeakSet());
}

export function sha256(value) {
  const input = typeof value === 'string' ? value : canonicalize(value);
  return createHash('sha256').update(input).digest('hex');
}

export function digestObject(object, omitted = []) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new TypeError('Expected object');
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
