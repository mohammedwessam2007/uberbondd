import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.mjs';
import { createStore } from './src/store.mjs';
import { DurableQueue } from './src/queue.mjs';
import { prepareOutreach100kRuntime } from './src/outreach-100k-runtime-control.mjs';

// Harden the externally reachable request handler while preserving the mature
// server implementation byte-for-byte in server-core.mjs. The donor keeps its
// store, queue, scheduler, startup and shutdown semantics; this facade changes
// only privileged credential transport and tightly bounded admin orchestration.

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

async function readSmallJsonBody(req, maxBytes = 64 * 1024) {
  let content = '';
  for await (const chunk of req) {
    content += chunk;
    if (Buffer.byteLength(content) > maxBytes) throw new Error('Request body too large');
  }
  if (!content.trim()) return {};
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON body must be an object');
  return parsed;
}

async function adminSummary(coreHandler, req) {
  const capture = captureResponse();
  await coreHandler({ method: 'GET', url: '/api/summary', headers: req.headers, socket: req.socket }, capture.res);
  const result = capture.snapshot();
  let payload = {};
  try { payload = JSON.parse(result.body || '{}'); } catch {}
  return { ok: result.statusCode === 200, statusCode: result.statusCode, payload };
}

async function compile100kStatus(coreHandler, req) {
  const auth = await adminSummary(coreHandler, req);
  if (!auth.ok) return { auth };
  const prepared = await prepareOutreach100kRuntime({
    liveSummary: { ...auth.payload, schedulerActive: config.autopilot === true }
  });
  return { auth, prepared };
}

async function brokerOutreach100kStatus(coreHandler, req, res) {
  const result = await compile100kStatus(coreHandler, req);
  if (!result.auth.ok) return sendJson(res, result.auth.statusCode || 401, result.auth.payload || { error: 'Unauthorized' });
  return sendJson(res, result.prepared?.ok === false ? 409 : 200, result.prepared);
}

async function brokerOutreach100kStart(coreHandler, req, res) {
  let body;
  try { body = await readSmallJsonBody(req); }
  catch (error) { return sendJson(res, 400, { error: error.message }); }
  if (Number(body.confirmExactTarget) !== 100000) {
    return sendJson(res, 400, { error: 'confirmExactTarget must equal 100000' });
  }
  const result = await compile100kStatus(coreHandler, req);
  if (!result.auth.ok) return sendJson(res, result.auth.statusCode || 401, result.auth.payload || { error: 'Unauthorized' });
  const prepared = result.prepared;
  if (!prepared?.ok || prepared?.certificate?.state !== 'CERTIFIED_100K_READY' || prepared?.pressable !== true) {
    return sendJson(res, 409, { error: 'Certified 100K launch is not ready', prepared });
  }
  if (config.storeBackend !== 'postgres') {
    return sendJson(res, 503, { error: '100K launch requires the durable PostgreSQL store backend' });
  }

  const pressedAt = new Date().toISOString();
  const authHeaderDigest = crypto.createHash('sha256').update(String(req.headers.authorization || '')).digest('hex');
  const founderPressReceiptId = `ub100kpress_${crypto.createHash('sha256').update(JSON.stringify({
    certificateId: prepared.certificate.certificateId,
    recipientSetDigest: prepared.corpus.recipientSetDigest,
    pressedAt,
    authHeaderDigest
  })).digest('hex')}`;

  const store = createStore(config);
  try {
    await store.init();
    const queue = new DurableQueue(store, config, console);
    const job = await queue.enqueue('outreach.100k.process', {
      cursor: 0,
      limit: 250,
      certificateId: prepared.certificate.certificateId,
      recipientSetDigest: prepared.corpus.recipientSetDigest,
      founderPressReceiptId
    }, {
      maxAttempts: 3,
      dedupeKey: `outreach100k:start:${prepared.certificate.certificateId}`
    });
    return sendJson(res, 202, {
      ok: true,
      state: 'CERTIFIED_100K_JOB_ENQUEUED',
      jobId: job.id,
      certificateId: prepared.certificate.certificateId,
      recipientSetDigest: prepared.corpus.recipientSetDigest,
      founderPressReceiptId,
      pressedAt,
      automaticRetryAuthorized: false,
      truthBoundary: 'The authenticated founder press enqueued only the certified 100K worker. Every batch and every recipient remains independently gated; an uncertain provider outcome quarantines the stream.'
    });
  } finally {
    await store.close().catch(() => {});
  }
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

    if (url.searchParams.has('token') && !publicCapabilityPath(url.pathname)) {
      return sendJson(res, 401, { error: 'Privileged query-token authentication is not supported' });
    }

    if (req.method === 'GET' && url.pathname === '/api/outreach/100k/status') {
      return brokerOutreach100kStatus(coreHandler, req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/outreach/100k/start') {
      return brokerOutreach100kStart(coreHandler, req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/oauth/google/start') {
      return brokerGoogleOAuthStart(coreHandler, req, res, url);
    }

    return coreHandler(req, res);
  };
}

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
