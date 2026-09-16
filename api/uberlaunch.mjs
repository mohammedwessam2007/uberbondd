import crypto from 'node:crypto';
import {
  compileUberLaunchPreflight,
  createFilePressLedger,
  createPostalGovernedTransport,
  executeUberLaunchPress,
  readUberLaunchPacket
} from '../src/uberlaunch-runtime.mjs';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer'
};

function send(res, status, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(status).json(payload);
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}
function bearerHeader(value) {
  if (Array.isArray(value)) return value.length === 1 && typeof value[0] === 'string' ? value[0] : '';
  return typeof value === 'string' ? value : '';
}
function equalBearer(header, secret) {
  if (typeof secret !== 'string' || !secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(bearerHeader(header));
  return actual.length === expected.length && actual.length > 0 && crypto.timingSafeEqual(actual, expected);
}
async function readBody(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  if (typeof req?.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  if (!req || typeof req[Symbol.asyncIterator] !== 'function') return {};
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error('request-body-too-large');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return null; }
}

export function createHandler(deps = {}) {
  const env = deps.env || process.env;
  const clock = deps.now || (() => new Date());
  const readPacket = deps.readUberLaunchPacket || readUberLaunchPacket;
  const compilePreflight = deps.compileUberLaunchPreflight || compileUberLaunchPreflight;
  const executePress = deps.executeUberLaunchPress || executeUberLaunchPress;
  const makeLedger = deps.createFilePressLedger || createFilePressLedger;
  const makeTransport = deps.createPostalGovernedTransport || createPostalGovernedTransport;
  return async function handler(req, res) {
    const method = String(req?.method || '').toUpperCase();
    if (!['GET', 'POST'].includes(method)) return send(res, 405, { ok: false, state: 'REFUSED', reasonCodes: ['method-not-allowed'] });
    if (!env.ADMIN_TOKEN) return send(res, 503, { ok: false, state: 'REFUSED', reasonCodes: ['command-center-admin-auth-not-configured'] });
    if (!equalBearer(req?.headers?.authorization, env.ADMIN_TOKEN)) return send(res, 401, { ok: false, state: 'REFUSED', reasonCodes: ['unauthorized'] });

    const now = clock();
    const packetRead = await readPacket(env, now);
    const preflight = compilePreflight({ packetRead, adminSecret: env.ADMIN_TOKEN, now });
    if (method === 'GET') return send(res, 200, { ...preflight, provider: 'SELF_HOSTED_POSTAL', effectAuthority: 'NONE_UNTIL_FOUNDER_PRESS' });

    let body;
    try { body = await readBody(req); }
    catch (error) { return send(res, 413, { ok: false, state: 'REFUSED', reasonCodes: [String(error?.message || 'invalid-body')] }); }
    if (!body || body.confirm !== 'PRESS_UBERLAUNCH') return send(res, 400, { ok: false, state: 'BIG_BUTTON_REFUSED', reasonCodes: ['explicit-press-confirmation-required'], providerCalls: 0, messagesSent: 0 });
    if (!preflight.pressable) return send(res, 409, { ok: false, state: 'BIG_BUTTON_REFUSED', reasonCodes: [...(preflight.hardStopReasonCodes || []), ...(preflight.waitReasonCodes || []), ...(preflight.reasonCodes || [])], providerCalls: 0, messagesSent: 0 });
    if (!env.UBERLAUNCH_PRESS_LEDGER_DIR) return send(res, 503, { ok: false, state: 'BIG_BUTTON_REFUSED', reasonCodes: ['durable-press-ledger-directory-required'], providerCalls: 0, messagesSent: 0 });

    let ledger;
    let transportAdapter;
    try {
      ledger = deps.ledger || makeLedger({ directory: env.UBERLAUNCH_PRESS_LEDGER_DIR });
      transportAdapter = deps.transportAdapter || makeTransport({ env, fetchImpl: deps.fetchImpl || globalThis.fetch, now: () => clock() });
    } catch (error) {
      return send(res, 503, { ok: false, state: 'BIG_BUTTON_REFUSED', reasonCodes: ['self-hosted-postal-runtime-not-configured'], error: String(error?.message || error).slice(0, 500), providerCalls: 0, messagesSent: 0 });
    }

    const result = await executePress({
      packetRead,
      adminSecret: env.ADMIN_TOKEN,
      suppliedNonce: body.nonce,
      ledger,
      transportAdapter,
      now
    });
    const status = result?.ok ? 200 : result?.state === 'DUPLICATE_PRESS_REFUSED' ? 409 : 422;
    return send(res, status, result);
  };
}

export default createHandler();