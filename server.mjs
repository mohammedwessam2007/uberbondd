import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.mjs';
import { createStore } from './src/store.mjs';
import { DurableQueue } from './src/queue.mjs';
import { prepareOutreach100kRuntime } from './src/outreach-100k-runtime-control.mjs';
import { prepareOutreach100kArtifacts } from './src/outreach-100k-artifact-preparer.mjs';
import { getUberSocketRuntime } from './src/uber-socket-runtime.mjs';
import { restoreUberSocketState, persistUberSocketState } from './src/uber-socket-durable-state.mjs';
import { createUberMailRuntime } from './src/ubermail-runtime.mjs';

const originalCreateServer = http.createServer;
const originalArgv1 = process.argv[1];
const wrapperPath = fileURLToPath(import.meta.url);
const coreUrl = new URL('./server-core.mjs', import.meta.url);
const corePath = fileURLToPath(coreUrl);
const wrapperIsEntryPoint = originalArgv1 === wrapperPath;
let createdHardenedHandler = null;
let uberSocketRestorePromise = null;
let uberSocketRestoreReceipt = null;
let uberMailRuntime = null;

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
    snapshot() { return { statusCode, headers: { ...headers }, body: Buffer.concat(chunks).toString('utf8') }; }
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

function getUberMailRuntime() {
  if (!uberMailRuntime) {
    uberMailRuntime = createUberMailRuntime({
      webhookMasterSecret: process.env.UBERMAIL_WEBHOOK_MASTER_SECRET || ''
    });
  }
  return uberMailRuntime;
}

async function brokerUberMailStatus(coreHandler, req, res) {
  if (!(await requireAdmin(coreHandler, req, res))) return;
  try { return sendJson(res, 200, await getUberMailRuntime().status()); }
  catch (error) { return sendJson(res, 503, { ok: false, error: String(error?.message || error) }); }
}

async function brokerUberMailBootstrap(coreHandler, req, res) {
  if (!(await requireAdmin(coreHandler, req, res))) return;
  let body = {};
  try { body = await readSmallJsonBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
  try {
    const root = await getUberMailRuntime().bootstrapRootKey({
      name: String(body.name || 'UberMail Root').slice(0, 200),
      permissions: body.permissions,
      expiresAt: body.expires_at || null
    });
    return sendJson(res, 201, {
      ...root,
      oneTimeSecret: true,
      truthBoundary: 'This authenticated admin response is the only bootstrap display of the root UberMail API key. Store it in protected runtime configuration; it is not recoverable from UberMail state.'
    });
  } catch (error) {
    const message = String(error?.code || error?.message || error);
    return sendJson(res, /already-exists/.test(message) ? 409 : 500, { ok: false, error: message });
  }
}

async function brokerUberMail(req, res, url) {
  let body = {};
  if (!['GET', 'HEAD', 'DELETE'].includes(String(req.method || 'GET').toUpperCase())) {
    try { body = await readSmallJsonBody(req, 8 * 1024 * 1024); }
    catch (error) { return sendJson(res, 400, { error: error.message }); }
  }
  try {
    const result = await getUberMailRuntime().http({
      method: req.method,
      path: url.pathname + url.search,
      headers: req.headers,
      body,
      // External-effect approval is deliberately NOT sourced from client
      // headers/body. A trusted UberBond authority integration must inject it.
      effectApproval: null
    });
    return sendJson(res, Number(result?.status || 500), result?.body || {});
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: String(error?.message || error) });
  }
}

async function adminSummary(coreHandler, req) {
  const capture = captureResponse();
  await coreHandler({ method: 'GET', url: '/api/summary', headers: req.headers, socket: req.socket }, capture.res);
  const result = capture.snapshot();
  let payload = {};
  try { payload = JSON.parse(result.body || '{}'); } catch {}
  return { ok: result.statusCode === 200, statusCode: result.statusCode, payload };
}

async function requireAdmin(coreHandler, req, res) {
  const auth = await adminSummary(coreHandler, req);
  if (!auth.ok) {
    sendJson(res, auth.statusCode || 401, auth.payload || { error: 'Unauthorized' });
    return null;
  }
  return auth;
}

async function withUberSocketStore(fn) {
  const store = createStore(config);
  try {
    await store.init();
    return await fn(store);
  } finally {
    await store.close().catch(() => {});
  }
}

async function ensureUberSocketRestored(runtime) {
  if (!uberSocketRestorePromise) {
    uberSocketRestorePromise = withUberSocketStore(store => restoreUberSocketState({ runtime, store }))
      .then(receipt => (uberSocketRestoreReceipt = receipt))
      .catch(error => { uberSocketRestorePromise = null; throw error; });
  }
  return uberSocketRestorePromise;
}

async function persistUberSocket(runtime) {
  return withUberSocketStore(store => persistUberSocketState({ runtime, store }));
}

async function compile100kStatus(coreHandler, req) {
  const auth = await adminSummary(coreHandler, req);
  if (!auth.ok) return { auth };
  const prepared = await prepareOutreach100kRuntime({ liveSummary: { ...auth.payload, schedulerActive: config.autopilot === true } });
  return { auth, prepared };
}

async function brokerOutreach100kStatus(coreHandler, req, res) {
  const result = await compile100kStatus(coreHandler, req);
  if (!result.auth.ok) return sendJson(res, result.auth.statusCode || 401, result.auth.payload || { error: 'Unauthorized' });
  return sendJson(res, result.prepared?.ok === false ? 409 : 200, result.prepared);
}

async function brokerOutreach100kStart(coreHandler, req, res) {
  let body;
  try { body = await readSmallJsonBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
  if (Number(body.confirmExactTarget) !== 100000) return sendJson(res, 400, { error: 'confirmExactTarget must equal 100000' });

  const auth = await adminSummary(coreHandler, req);
  if (!auth.ok) return sendJson(res, auth.statusCode || 401, auth.payload || { error: 'Unauthorized' });
  if (config.storeBackend !== 'postgres') return sendJson(res, 503, { error: '100K launch requires the durable PostgreSQL store backend' });

  const artifacts = await prepareOutreach100kArtifacts({ target: 100000 });
  if (!artifacts?.ok) {
    return sendJson(res, 409, {
      error: '100K launch artifacts are not ready',
      artifacts,
      truthBoundary: 'The founder press cannot queue outreach until durable candidate and physical-evidence inputs can produce an exact governed 100,000-recipient corpus and runtime bundle.'
    });
  }

  const prepared = await prepareOutreach100kRuntime({
    liveSummary: { ...auth.payload, schedulerActive: config.autopilot === true }
  });
  if (!prepared?.ok || prepared?.certificate?.state !== 'CERTIFIED_100K_READY' || prepared?.pressable !== true) {
    return sendJson(res, 409, { error: 'Certified 100K launch is not ready', artifacts, prepared });
  }
  if (artifacts.recipientSetDigest !== prepared.corpus?.recipientSetDigest) {
    return sendJson(res, 409, { error: 'Prepared recipient set changed before certification', artifacts, prepared });
  }

  const pressedAt = new Date().toISOString();
  const authHeaderDigest = crypto.createHash('sha256').update(String(req.headers.authorization || '')).digest('hex');
  const founderPressReceiptId = `ub100kpress_${crypto.createHash('sha256').update(JSON.stringify({ certificateId: prepared.certificate.certificateId, recipientSetDigest: prepared.corpus.recipientSetDigest, pressedAt, authHeaderDigest })).digest('hex')}`;
  const store = createStore(config);
  try {
    await store.init();
    const queue = new DurableQueue(store, config, console);
    const job = await queue.enqueue('outreach.100k.process', { cursor: 0, limit: 250, certificateId: prepared.certificate.certificateId, recipientSetDigest: prepared.corpus.recipientSetDigest, founderPressReceiptId }, { maxAttempts: 1, recoveryPolicy: 'reconcile', dedupeKey: `outreach100k:start:${prepared.certificate.certificateId}` });
    return sendJson(res, 202, { ok: true, state: 'CERTIFIED_100K_JOB_ENQUEUED', jobId: job.id, certificateId: prepared.certificate.certificateId, recipientSetDigest: prepared.corpus.recipientSetDigest, founderPressReceiptId, pressedAt, artifacts, automaticRetryAuthorized: false, truthBoundary: 'The authenticated founder press first materialized the governed artifacts from durable precleared candidates and observed fleet evidence, then re-certified the exact 100,000-recipient set, and only then enqueued the worker. Every batch and recipient remains independently gated; uncertain provider outcomes quarantine the stream.' });
  } finally { await store.close().catch(() => {}); }
}

async function brokerGoogleOAuthStart(coreHandler, req, res, url) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return sendJson(res, 401, { error: 'Unauthorized' });
  const slot = url.searchParams.get('slot') === 'B' ? 'B' : 'A';
  const capture = captureResponse();
  await coreHandler({ method: 'GET', url: `/oauth/google/start?slot=${slot}`, headers: req.headers, socket: req.socket }, capture.res);
  const result = capture.snapshot();
  const authorizationUrl = String(result.headers.location || '');
  if (result.statusCode !== 302 || !authorizationUrl) {
    let message = 'OAuth authorization could not be started';
    try { message = JSON.parse(result.body || '{}')?.error || message; } catch {}
    return sendJson(res, result.statusCode >= 400 && result.statusCode < 600 ? result.statusCode : 502, { error: message });
  }
  let parsed;
  try { parsed = new URL(authorizationUrl); } catch { return sendJson(res, 502, { error: 'OAuth provider URL was invalid' }); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'accounts.google.com') return sendJson(res, 502, { error: 'OAuth provider URL was refused' });
  return sendJson(res, 200, { authorizationUrl: parsed.toString() });
}

async function brokerUberSocket(coreHandler, req, res, url) {
  if (!(await requireAdmin(coreHandler, req, res))) return;
  const runtime = getUberSocketRuntime();
  try { await ensureUberSocketRestored(runtime); }
  catch (error) { return sendJson(res, 503, { ok: false, error: `UberSocket durable restore failed: ${String(error?.message || error)}`, socket: runtime.status() }); }

  const path = url.pathname;
  if (req.method === 'GET' && path === '/api/admin/uber-socket/status') return sendJson(res, 200, { ...runtime.status(), durableRestore: uberSocketRestoreReceipt });
  if (req.method === 'GET' && path === '/api/admin/uber-socket/connectome') return sendJson(res, 200, runtime.connectomeDoctor());

  let body = {};
  const maxBody = path.endsWith('/import-chatgpt') ? 8 * 1024 * 1024 : path.endsWith('/ingest') ? 256 * 1024 : 96 * 1024;
  try { body = await readSmallJsonBody(req, maxBody); } catch (error) { return sendJson(res, 400, { error: error.message }); }

  try {
    if (req.method === 'POST' && path === '/api/admin/uber-socket/register') {
      const peer = await runtime.registerChat(body);
      const durable = await persistUberSocket(runtime);
      return sendJson(res, 200, { ok: true, peer, durable, status: runtime.status() });
    }
    if (req.method === 'POST' && path === '/api/admin/uber-socket/ingest') {
      const document = runtime.ingest(body);
      const durable = await persistUberSocket(runtime);
      return sendJson(res, 200, { ok: true, document, durable, status: runtime.status() });
    }
    if (req.method === 'POST' && path === '/api/admin/uber-socket/import-chatgpt') {
      const imported = await runtime.importChatGPTProject(body);
      const durable = await persistUberSocket(runtime);
      return sendJson(res, 200, { ...imported, durable, status: runtime.status() });
    }
    if (req.method === 'POST' && path === '/api/admin/uber-socket/ask') return sendJson(res, 200, await runtime.ask(body));
    if (req.method === 'POST' && path === '/api/admin/uber-socket/council') return sendJson(res, 200, await runtime.council(body));
    if (req.method === 'POST' && path === '/api/admin/uber-socket/monster') return sendJson(res, 200, await runtime.monster(body));
    if (req.method === 'POST' && path === '/api/admin/uber-socket/whole-brain') return sendJson(res, 200, await runtime.compileWholeBrainMission(body));
    if (req.method === 'POST' && path === '/api/admin/uber-socket/connectome-mission') return sendJson(res, 200, await runtime.compileConnectomeMission(body));
    if (req.method === 'POST' && path === '/api/admin/uber-socket/cognitive-cycle') return sendJson(res, 200, runtime.cognitiveCycle());
    if (req.method === 'POST' && path === '/api/admin/uber-socket/contradiction') return sendJson(res, 200, runtime.reportContradiction(body));
    if (req.method === 'POST' && path === '/api/admin/uber-socket/blocker') return sendJson(res, 200, runtime.reportBlocker(body));
    if (req.method === 'POST' && path === '/api/admin/uber-socket/outreach-100k-council') return sendJson(res, 200, await runtime.outreach100kCouncil(body));
    return sendJson(res, 404, { error: 'UberSocket route not found' });
  } catch (error) {
    const message = String(error?.message || error);
    const status = /not-configured|required|invalid|not-registered|no-council-peers|no-project-chat-peers|archival-only/.test(message) ? 409 : 500;
    return sendJson(res, status, { ok: false, error: message, socket: runtime.status() });
  }
}

function harden(coreHandler) {
  return async function hardenedRequestHandler(req, res) {
    const url = new URL(req.url, 'http://uberbond.local');
    if (url.searchParams.has('token') && !publicCapabilityPath(url.pathname)) return sendJson(res, 401, { error: 'Privileged query-token authentication is not supported' });
    if (req.method === 'GET' && url.pathname === '/api/outreach/100k/status') return brokerOutreach100kStatus(coreHandler, req, res);
    if (req.method === 'POST' && url.pathname === '/api/outreach/100k/start') return brokerOutreach100kStart(coreHandler, req, res);
    if (req.method === 'POST' && url.pathname === '/api/admin/oauth/google/start') return brokerGoogleOAuthStart(coreHandler, req, res, url);
    if (req.method === 'GET' && url.pathname === '/api/admin/ubermail/status') return brokerUberMailStatus(coreHandler, req, res);
    if (req.method === 'POST' && url.pathname === '/api/admin/ubermail/bootstrap') return brokerUberMailBootstrap(coreHandler, req, res);
    if (url.pathname === '/v0' || url.pathname.startsWith('/v0/')) return brokerUberMail(req, res, url);
    if (url.pathname.startsWith('/api/admin/uber-socket/')) return brokerUberSocket(coreHandler, req, res, url);
    return coreHandler(req, res);
  };
}

http.createServer = function hardenedCreateServer(handler, ...rest) {
  createdHardenedHandler = harden(handler);
  return originalCreateServer.call(http, createdHardenedHandler, ...rest);
};

if (wrapperIsEntryPoint) process.argv[1] = corePath;
let core;
try { core = await import(coreUrl.href); }
finally { process.argv[1] = originalArgv1; http.createServer = originalCreateServer; }

export const requestHandler = createdHardenedHandler || harden(core.requestHandler);
export default requestHandler;
