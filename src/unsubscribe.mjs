import crypto from 'node:crypto';

const b64 = value => Buffer.from(value).toString('base64url');
const unb64 = value => Buffer.from(value, 'base64url').toString('utf8');

export function createUnsubscribeToken(prospectId, secret, expiresAt = Date.now() + 365 * 86400000) {
  if (!prospectId || !secret) return '';
  const payload = b64(JSON.stringify({ p: prospectId, e: Number(expiresAt) }));
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyUnsubscribeToken(token, secret, currentTime = Date.now()) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature || !secret) return null;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(unb64(payload));
    if (!data.p || !Number.isFinite(Number(data.e)) || Number(data.e) < currentTime) return null;
    return { prospectId: String(data.p), expiresAt: Number(data.e) };
  } catch { return null; }
}

export function unsubscribeUrl(baseUrl, prospectId, secret) {
  const token = createUnsubscribeToken(prospectId, secret);
  if (!token) return '';
  const url = new URL('/unsubscribe', baseUrl);
  url.searchParams.set('token', token);
  return url.href;
}

export function oneClickUnsubscribeUrl(baseUrl, prospectId, secret) {
  const token = createUnsubscribeToken(prospectId, secret);
  if (!token) return '';
  const url = new URL('/api/public/unsubscribe', baseUrl);
  url.searchParams.set('token', token);
  return url.href;
}
