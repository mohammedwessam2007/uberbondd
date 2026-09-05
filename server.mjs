import http from 'node:http';
import { fileURLToPath } from 'node:url';

// Harden the externally reachable request handler while preserving the mature
// server implementation byte-for-byte in server-core.mjs. The donor keeps its
// store, queue, scheduler, startup and shutdown semantics; this facade changes
// only privileged credential transport and the admin OAuth launch handoff.

const originalCreateServer = http.createServer;
const originalArgv1 = process.argv[1];
const wrapperPath = fileURLToPath(import.meta.url);
const coreUrl = new URL('./server-core.mjs', import.meta.url);
const corePath = fileURLToPath(coreUrl);
const wrapperIsEntryPoint = originalArgv1 === wrapperPath;
let createdHardenedHandler = null;

const publicCapabilityPath = pathname => pathname === '/unsubscribe'
  || pathname === '/api/public/unsubscribe'
  || pathname.startsWith('/api/public/');

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer'
  });
  res.end(JSON.stringify(payload));
}

function captureResponse() {
  let statusCode = 200;
  const headers = {};
  const chunks = [];
  return {
    res: {
      writeHead(status, nextHeaders = {}) {
        statusCode = status;
        for (const [key, value] of Object.entries(nextHeaders || {})) headers[String(key).toLowerCase()] = value;
        return this;
      },
      setHeader(key, value) { headers[String(key).toLowerCase()] = value; },
      end(chunk) {
        if (chunk !== undefined && chunk !== null) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
    },
    snapshot() {
      return { statusCode, headers: { ...headers }, body: Buffer.concat(chunks).toString('utf8') };
    }
  };
}

async function brokerGoogleOAuthStart(coreHandler, req, res, url) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Unauthorized' });
  const slot = url.searchParams.get('slot') === 'B' ? 'B' : 'A';
  const capture = captureResponse();
  const proxyReq = {
    method: 'GET',
    url: `/oauth/google/start?slot=${slot}`,
    headers: req.headers,
    socket: req.socket
  };
  await coreHandler(proxyReq, capture.res);
  const result = capture.snapshot();
  const authorizationUrl = String(result.headers.location || '');
  if (result.statusCode !== 302 || !authorizationUrl) {
    let message = 'OAuth authorization could not be started';
    try { message = JSON.parse(result.body || '{}')?.error || message; } catch {}
    return sendJson(res, result.statusCode >= 400 && result.statusCode < 600 ? result.statusCode : 502, { error: message });
  }
  let parsed;
  try { parsed = new URL(authorizationUrl); } catch { return sendJson(res, 502, { error: 'OAuth provider URL was invalid' }); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'accounts.google.com') {
    return sendJson(res, 502, { error: 'OAuth provider URL was refused' });
  }
  return sendJson(res, 200, { authorizationUrl: parsed.toString() });
}

function harden(coreHandler) {
  return async function hardenedRequestHandler(req, res) {
    const url = new URL(req.url, 'http://uberbond.local');

    // Public unsubscribe/report capability tokens are a separate evidence class
    // and stay intact. Privileged admin credentials, however, never gain
    // authority through a URL/query-string channel.
    if (url.searchParams.has('token') && !publicCapabilityPath(url.pathname)) {
      return sendJson(res, 401, { error: 'Privileged query-token authentication is not supported' });
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/oauth/google/start') {
      return brokerGoogleOAuthStart(coreHandler, req, res, url);
    }

    return coreHandler(req, res);
  };
}

// server-core.mjs constructs its server once at module load. Interpose only for
// that construction, then restore Node's http module immediately. If this facade
// itself is the process entry point, temporarily present the donor path as argv[1]
// so its existing listen + SIGTERM/SIGINT shutdown code remains authoritative.
http.createServer = function hardenedCreateServer(handler, ...rest) {
  createdHardenedHandler = harden(handler);
  return originalCreateServer.call(http, createdHardenedHandler, ...rest);
};

if (wrapperIsEntryPoint) process.argv[1] = corePath;
let core;
try {
  core = await import(coreUrl.href);
} finally {
  process.argv[1] = originalArgv1;
  http.createServer = originalCreateServer;
}

export const requestHandler = createdHardenedHandler || harden(core.requestHandler);
export default requestHandler;
