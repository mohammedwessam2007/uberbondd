import { sha256Hex } from './tokens.mjs';
import { LiteInputError } from './validate.mjs';

const MAX_BODY_BYTES = 8 * 1024;

export async function readJson(req, maxBytes = MAX_BODY_BYTES) {
  // Vercel's Node runtime pre-parses JSON bodies onto req.body.
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      if (req.body.length > maxBytes) throw new LiteInputError('Request body is too large.', 413);
      try { return JSON.parse(req.body || '{}'); }
      catch { throw new LiteInputError('Invalid JSON body.'); }
    }
    if (typeof req.body === 'object') {
      // Vercel pre-parses JSON bodies, so the streaming byte counter below is
      // bypassed. Re-enforce the same application limit on the parsed value.
      if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > maxBytes) {
        throw new LiteInputError('Request body is too large.', 413);
      }
      return req.body;
    }
    return {};
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new LiteInputError('Request body is too large.', 413);
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); }
  catch { throw new LiteInputError('Invalid JSON body.'); }
}

export function clientAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '')).split(',')[0].trim();
  return first || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

// Hashed with a salt so raw visitor IPs are never persisted.
export function requesterHash(req) {
  const salt = process.env.LITE_HASH_SALT || 'uberbond-lite-v1';
  return sha256Hex(`${salt}:${clientAddress(req)}`);
}

export function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-robots-tag', 'noindex');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

export function handleError(res, error, context = 'lite-api') {
  if (error instanceof LiteInputError || (error?.status >= 400 && error?.status < 500 && error?.message)) {
    return sendJson(res, error.status || 400, { ok: false, error: error.message });
  }
  if (error?.code === 'no_database' || error?.status === 503) {
    console.error(`[${context}] database not configured or unreachable:`, error?.message);
    return sendJson(res, 503, { ok: false, error: 'The audit service is still being set up. Please try again soon.' });
  }
  console.error(`[${context}] unexpected error:`, error);
  return sendJson(res, 500, { ok: false, error: 'Something went wrong on our side. Please try again.' });
}
