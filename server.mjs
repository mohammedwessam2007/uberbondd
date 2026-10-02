import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.mjs';
import { createStore } from './src/store.mjs';
import { runWinnrRuntimeBootstrap } from './src/winnr-runtime-bootstrap.mjs';
import { runWinnrSealedBootstrapController } from './src/winnr-sealed-bootstrap.mjs';
import { verifyWinnrReplyCanaries } from './src/winnr-reply-canary-verifier.mjs';
import { runWinnrPlacementPhenotypeCanary } from './src/winnr-placement-phenotype-canary.mjs';
import { DurableQueue } from './src/queue.mjs';
import { prepareOutreach100kRuntime } from './src/outreach-100k-runtime-control.mjs';
import { prepareOutreach100kArtifacts } from './src/outreach-100k-artifact-preparer.mjs';
import { getUberSocketRuntime } from './src/uber-socket-runtime.mjs';
import { restoreUberSocketState, persistUberSocketState } from './src/uber-socket-durable-state.mjs';
import { createUberMailRuntime } from './src/ubermail-runtime.mjs';
import { createInfiniteOpusRuntime } from './src/infinite-opus-native-runtime.mjs';
import { compileCognitionEconomicPerimeter } from './src/cognition-economic-perimeter.mjs';
import { cognitionRouteInventory } from './src/cognition-route-inventory.mjs';
import { buildInfiniteOpusScoreboard } from './src/infinite-opus-scoreboard.mjs';
import { compileInfiniteOpusMarket } from './src/infinite-opus-market.mjs';
import { compileTypingMindChatRequest, gatewayStatus, verifyTypingMindGatewayBearer } from './src/infinite-opus-typingmind-gateway.mjs';
import { createTypingMindLiveOrchestrator, inspectTypingMindLiveReadiness } from './src/infinite-opus-typingmind-live.mjs';
import { inspectInfiniteOpusActivationEnvironment } from './src/infinite-opus-activation-diagnostic.mjs';
import { readCrownRecoveryMetadata } from './scripts/infinite-opus-crown-recovery-diagnostic.mjs';
import { reconcileInterruptedCrownGeneration } from './scripts/infinite-opus-crown-interrupted-recovery.mjs';
import { runCrownAutoFinish } from './scripts/infinite-opus-crown-autofinish.mjs';

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
let infiniteOpusPublicMarketCache = null;
const typingMindGatewayFlights = new Map();
const typingMindGatewayRecent = new Map();
const TYPINGMIND_GATEWAY_REPLAY_WINDOW_MS = 30_000;
const TYPINGMIND_GATEWAY_REPLAY_MAX_ENTRIES = 256;
const typingMindGatewayRequestTimes = [];

function admitTypingMindGatewayRequest(){
  const now=Date.now(),windowMs=60_000;
  const max=Math.max(1,Math.min(120,Number(process.env.UBERMIND_TYPINGMIND_RATE_LIMIT_PER_MINUTE)||30));
  while(typingMindGatewayRequestTimes.length&&typingMindGatewayRequestTimes[0]<=now-windowMs)typingMindGatewayRequestTimes.shift();
  if(typingMindGatewayRequestTimes.length>=max)return false;
  typingMindGatewayRequestTimes.push(now);return true;
}

function rememberTypingMindGatewayCompletion(key,completion){
  const now=Date.now();
  for(const [k,v] of typingMindGatewayRecent)if(v.expiresAt<=now)typingMindGatewayRecent.delete(k);
  while(typingMindGatewayRecent.size>=TYPINGMIND_GATEWAY_REPLAY_MAX_ENTRIES){
    const oldest=typingMindGatewayRecent.keys().next().value;
    if(oldest===undefined)break;
    typingMindGatewayRecent.delete(oldest);
  }
  typingMindGatewayRecent.set(key,{expiresAt:now+TYPINGMIND_GATEWAY_REPLAY_WINDOW_MS,completion:structuredClone(completion)});
}

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

function parseJsonEnvironment(name) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

async function currentInfiniteOpusPublicMarket() {
  const now = Date.now();
  if (infiniteOpusPublicMarketCache && Date.parse(infiniteOpusPublicMarketCache.expiresAt) > now + 60_000) return infiniteOpusPublicMarketCache;
  const response = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('openrouter-public-model-catalog-unavailable');
  const raw = await response.text();
  if (Buffer.byteLength(raw) > 10_000_000) throw new Error('openrouter-public-model-catalog-too-large');
  infiniteOpusPublicMarketCache = compileInfiniteOpusMarket(JSON.parse(raw), { verifiedAt: new Date(now).toISOString(), ttlMs: 10 * 60 * 1000 });
  return infiniteOpusPublicMarketCache;
}

function typingMindCors(req) {
  const defaults=['https://www.typingmind.com','https://typingmind.com'];
  const allowed=new Set(String(process.env.UBERMIND_TYPINGMIND_ALLOWED_ORIGINS || defaults.join(',')).split(',').map(x=>x.trim()).filter(Boolean));
  const origin=String(req.headers.origin || '').trim();
  if (!origin) return {ok:true,headers:{}};
  if (!allowed.has(origin)) return {ok:false,headers:{}};
  return {ok:true,headers:{
    'access-control-allow-origin':origin,
    'access-control-allow-methods':'GET,POST,OPTIONS',
    'access-control-allow-headers':'authorization,content-type',
    'access-control-max-age':'600',
    'vary':'Origin'
  }};
}

function sendTypingMindJson(req,res,status,payload){
  const cors=typingMindCors(req);
  if(!cors.ok)return sendJson(res,403,{error:'Origin refused'});
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',
    ...cors.headers
  });
  res.end(JSON.stringify(payload));
}

function sendTypingMindStream(req,res,completion){
  const cors=typingMindCors(req);
  if(!cors.ok)return sendJson(res,403,{error:'Origin refused'});
  res.writeHead(200,{
    'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache, no-transform','connection':'keep-alive',
    'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',
    ...cors.headers
  });
  const content=String(completion?.choices?.[0]?.message?.content??'');
  const base={id:completion.id,object:'chat.completion.chunk',created:completion.created,model:completion.model};
  res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{role:'assistant'},finish_reason:null}]})+'\n\n');
  for(let i=0;i<content.length;i+=2048){
    res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{content:content.slice(i,i+2048)},finish_reason:null}]})+'\n\n');
  }
  res.write('data: '+JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:completion.usage,uberbond:completion.uberbond})+'\n\n');
  res.end('data: [DONE]\n\n');
}

async function brokerTypingMindInfiniteOpus(req, res, url) {
  const cors=typingMindCors(req);
  if(!cors.ok)return sendJson(res,403,{error:'Origin refused'});
  if(req.method==='OPTIONS'){
    res.writeHead(204,{...cors.headers,'cache-control':'no-store'});
    return res.end();
  }
  const expectedToken = String(process.env.UBERMIND_TYPINGMIND_GATEWAY_TOKEN || '');
  if (!verifyTypingMindGatewayBearer(req.headers.authorization, expectedToken)) return sendTypingMindJson(req,res,401,{ error: 'Unauthorized' });
  if(req.method==='POST'&&!admitTypingMindGatewayRequest())return sendTypingMindJson(req,res,429,{ok:false,status:'TYPINGMIND_GATEWAY_RATE_LIMITED',providerCallsPerformed:0,qualityAction:'WAIT'});
  if (req.method === 'GET' && url.pathname === '/api/typingmind/infinite-opus/v1/models') {
    const paidAuthorization = parseJsonEnvironment('INFINITE_OPUS_PAID_AUTHORIZATION_JSON');
    const crownAdmission = parseJsonEnvironment('INFINITE_OPUS_CROWN_ADMISSION_JSON');
    let marketSnapshot=null,live={ok:false,reasons:['public-market-not-observed']};
    try{
      marketSnapshot=await currentInfiniteOpusPublicMarket();
      live=inspectTypingMindLiveReadiness({paidAuthorization,crownAdmission,marketSnapshot,openRouterKeyPresent:Boolean(process.env.OPENROUTER_API_KEY)});
    }catch{}
    return sendTypingMindJson(req,res,200,{
      object: 'list',
      data: [{ id: 'ubermind/auto', object: 'model', created: 0, owned_by: 'uberbond' }],
      uberbond: {...gatewayStatus({ runtimeConnected: live.ok, crownAdmissionValid: live.ok, jevShadowReady: false }),
        liveReadiness:live.status??'TYPINGMIND_UBERMIND_LIVE_NOT_READY',reasons:live.reasons??[]}
    });
  }
  if (req.method !== 'POST' || url.pathname !== '/api/typingmind/infinite-opus/v1/chat/completions') return sendTypingMindJson(req,res,404,{ error: 'TypingMind UberMind route not found' });

  let body;
  try { body = await readSmallJsonBody(req, 300_000); }
  catch (error) { return sendTypingMindJson(req,res,400,{ error: error.message }); }

  let request;
  try { request = compileTypingMindChatRequest(body); }
  catch (error) { return sendTypingMindJson(req,res,400,{ error: String(error?.message || error) }); }

  const paidAuthorization = parseJsonEnvironment('INFINITE_OPUS_PAID_AUTHORIZATION_JSON');
  const crownAdmission = parseJsonEnvironment('INFINITE_OPUS_CROWN_ADMISSION_JSON');
  const openRouterKey = String(process.env.OPENROUTER_API_KEY || '');
  let marketSnapshot;
  try { marketSnapshot = await currentInfiniteOpusPublicMarket(); }
  catch (error) { return sendTypingMindJson(req,res,503,{ ok: false, status: 'PUBLIC_MODEL_MARKET_UNAVAILABLE', error: String(error?.message || error) }); }

  const replayKey=request.requestFingerprint;
  const recent=typingMindGatewayRecent.get(replayKey);
  if(recent && recent.expiresAt>Date.now()){
    const replay={...structuredClone(recent.completion),
      uberbond:{...structuredClone(recent.completion.uberbond),transportReplay:true,additionalProviderCalls:0}};
    return request.streamRequested?sendTypingMindStream(req,res,replay):sendTypingMindJson(req,res,200,replay);
  }
  if(recent)typingMindGatewayRecent.delete(replayKey);

  let flight=typingMindGatewayFlights.get(replayKey);
  if(!flight){
    flight=(async()=>{
      try{
        return await withUberSocketStore(async store => {
          const orchestrator = createTypingMindLiveOrchestrator({ store, openRouterKey, paidAuthorization, crownAdmission, marketSnapshot });
          const ready = orchestrator.readiness();
          if (!ready.ok) return {httpStatus:503,payload:{
            ok:false,status:ready.status,reasons:ready.reasons,qualityAction:'QUEUE_NEVER_DOWNGRADE',sideEffectAuthority:'NONE',
            truthBoundary:'The cockpit refuses live answers until the runtime key, current paid authorization, fresh prices and a valid current General-Crown admission all exist.'
          }};
          const result=await orchestrator.execute(request);
          if(!result.ok)return {httpStatus:/QUEUED|BUDGET/.test(result.status||'')?429:503,payload:result};
          rememberTypingMindGatewayCompletion(replayKey,result.completion);
          return {httpStatus:200,payload:result.completion};
        });
      }catch(error){
        return {httpStatus:503,payload:{ok:false,status:'TYPINGMIND_UBERMIND_EXECUTION_REFUSED',error:String(error?.message||error),qualityAction:'QUEUE_NEVER_DOWNGRADE'}};
      }finally{
        typingMindGatewayFlights.delete(replayKey);
      }
    })();
    typingMindGatewayFlights.set(replayKey,flight);
  }
  const response=await flight;
  if(response.httpStatus===200&&request.streamRequested)return sendTypingMindStream(req,res,response.payload);
  return sendTypingMindJson(req,res,response.httpStatus,response.payload);
}

async function brokerCrownAutofinishTrigger(req,res) {
  if (req.method !== 'POST') return sendJson(res,405,{ok:false,error:'Method Not Allowed'});
  const configured=String(process.env.INFINITE_OPUS_AUTOFINISH_TRIGGER_TOKEN||'');
  const supplied=String(req.headers['x-ubermind-activation-trigger']||'');
  if(!configured||!supplied||configured.length!==supplied.length||
     !crypto.timingSafeEqual(Buffer.from(configured),Buffer.from(supplied))){
    return sendJson(res,401,{ok:false,error:'Unauthorized'});
  }
  const store=createStore(config);
  try { await store.init(); }
  catch(error){ return sendJson(res,503,{ok:false,status:'AUTOFINISH_STORE_UNAVAILABLE',error:String(error?.message||error)}); }
  const paidAuthorization=parseJsonEnvironment('INFINITE_OPUS_PAID_AUTHORIZATION_JSON');
  void runCrownAutoFinish({
    store,
    apiKey:String(process.env.OPENROUTER_API_KEY||''),
    paidAuthorization,
    mainSha:String(process.env.RENDER_GIT_COMMIT||process.env.RENDER_GIT_COMMIT_SHA||'unknown')
  }).catch(error=>console.error('UBERMIND_CROWN_AUTOFINISH_TRIGGER '+JSON.stringify({ok:false,status:'UNHANDLED',reason:String(error?.message||error)})))
    .finally(()=>store.close().catch(()=>{}));
  return sendJson(res,202,{ok:true,status:'AUTOFINISH_CLAIM_REQUEST_ACCEPTED',paidInferenceMayRun:true,
    hardNewSpendCeilingUsd:0.45,sideEffectAuthority:'NONE'});
}

async function brokerInfiniteOpus(coreHandler, req, res, url) {
  if (!(await requireAdmin(coreHandler, req, res))) return;
  return withUberSocketStore(async store => {
    const runtime = createInfiniteOpusRuntime({ store });
    const snapshot = await runtime.snapshot();
    const routeInventory = cognitionRouteInventory();
    const perimeter = compileCognitionEconomicPerimeter({
      runtimeKeyLimitUsd: 20,
      typingMindKeyLimitUsd: 0,
      memberGuardrailUsd: 28,
      guardrailScope: 'MEMBER_ALL_KEYS',
      purchaseFeeRate: 0.055,
      otherPaidKeyLimitsUsd: [],
      limitReset: 'monthly',
      includeByokInLimits: true,
      legacySpendRoutesBlocked: routeInventory.globalBudgetClaimAllowed === true
    });
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/health') {
      return sendJson(res, 200, {
        ok: true,
        status: 'INFINITE_OPUS_SOURCE_READY_PRELIVE',
        storeBackend: config.storeBackend,
        paidInferenceTriggered: false,
        economicPerimeterPlan: perimeter.ok ? perimeter.status : 'REFUSED',
        truthBoundary: 'This endpoint proves source/runtime availability only. It does not prove OpenRouter credentials, provider callability, deployment endurance, current Crown roles, spend, or savings.'
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/budget') {
      const scoreboard = buildInfiniteOpusScoreboard({
        runtimeSnapshot: snapshot,
        globalLedgerSummary: {},
        typingMindPerimeter: { status: perimeter.status, globalBudgetScope: 'CANONICAL_ONE_RUNTIME_KEY_20_USD__TYPINGMIND_GATEWAY_ONLY__MEMBER_GUARDRAIL_28_BACKSTOP' },
        routeInventory: { ungoverned: routeInventory.routes.filter(row => !String(row.status).startsWith('GOVERNED') && !String(row.status).startsWith('FAIL_CLOSED') && row.status !== 'ONLY_ZERO_CASH_ALLOWED_IN_INFINITE_OPUS_MODE' && row.status !== 'NONCASH_GOVERNED').map(row => row.id) },
        deployment: { sourceReady: true, liveConnected: false, productionDeployed: false, ownerOnlyBlockers: ['OPENROUTER_RUNTIME_KEY_PRIVATE_CONFIGURATION','TINY_BOUNDED_PAID_CANARY_AUTHORIZATION','SEALED_GENERAL_CROWN_EVIDENCE'] }
      });
      return sendJson(res, 200, { ok: true, perimeter, snapshot, scoreboard });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/queue') {
      return sendJson(res, 200, { ok: true, semanticDemand: await runtime.demandPlan(), paidInferenceTriggered: false });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/activation') {
      return sendJson(res, 200, { ok:true, ...inspectInfiniteOpusActivationEnvironment(process.env), paidInferenceTriggered:false });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/references') {
      return sendJson(res, 200, await runtime.listReferenceContracts());
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/infinite-opus/references') {
      let body; try { body=await readSmallJsonBody(req,2_000_000); }
      catch(error){ return sendJson(res,400,{ok:false,status:'REFERENCE_CONTRACT_BODY_REFUSED',error:String(error?.message||error)}); }
      const out=await runtime.admitReferenceContract(body); return sendJson(res,out.ok?200:409,out);
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/capital-campaigns') {
      return sendJson(res, 200, await runtime.listCognitiveCapitalCampaigns());
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/infinite-opus/capital-campaigns') {
      let body; try { body=await readSmallJsonBody(req); }
      catch(error){ return sendJson(res,400,{ok:false,status:'CAPITAL_CAMPAIGN_BODY_REFUSED',error:String(error?.message||error)}); }
      const out=await runtime.createCognitiveCapitalCampaign(body); return sendJson(res,out.ok?201:409,out);
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/infinite-opus/capital-campaigns/cost') {
      let body; try { body=await readSmallJsonBody(req); }
      catch(error){ return sendJson(res,400,{ok:false,status:'CAPITAL_COST_BODY_REFUSED',error:String(error?.message||error)}); }
      try { const out=await runtime.appendCognitiveCapitalCost(body); return sendJson(res,out.ok?200:409,out); }
      catch(error){ return sendJson(res,409,{ok:false,status:'CAPITAL_COST_REFUSED',error:String(error?.message||error)}); }
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/infinite-opus/capital-campaigns/asset') {
      let body; try { body=await readSmallJsonBody(req); }
      catch(error){ return sendJson(res,400,{ok:false,status:'CAPITAL_ASSET_BODY_REFUSED',error:String(error?.message||error)}); }
      try { const out=await runtime.registerCognitiveCapitalAsset(body); return sendJson(res,out.ok?200:409,out); }
      catch(error){ return sendJson(res,409,{ok:false,status:'CAPITAL_ASSET_REFUSED',error:String(error?.message||error)}); }
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/infinite-opus/capital-campaigns/close') {
      let body; try { body=await readSmallJsonBody(req); }
      catch(error){ return sendJson(res,400,{ok:false,status:'CAPITAL_CLOSE_BODY_REFUSED',error:String(error?.message||error)}); }
      try { const out=await runtime.closeCognitiveCapitalCampaign(body); return sendJson(res,out.ok?200:409,out); }
      catch(error){ return sendJson(res,409,{ok:false,status:'CAPITAL_CLOSE_REFUSED',error:String(error?.message||error)}); }
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/franchises') {
      return sendJson(res, 200, await runtime.listDecisionFranchises());
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/infinite-opus/franchises/certify') {
      let body;
      try { body = await readSmallJsonBody(req, 2_000_000); }
      catch (error) { return sendJson(res, 400, { ok:false,status:'DECISION_FRANCHISE_CERTIFICATION_BODY_REFUSED',error:String(error?.message||error) }); }
      const admitted=await runtime.admitExhaustiveDecisionFranchise(body);
      return sendJson(res, admitted.ok ? 200 : 409, admitted);
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/contexts') {
      return sendJson(res, 200, await runtime.listContextSnapshots());
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/infinite-opus/contexts') {
      let body;
      try { body = await readSmallJsonBody(req, 1_000_000); }
      catch (error) { return sendJson(res, 400, { ok:false,status:'CONTEXT_SNAPSHOT_BODY_REFUSED',error:String(error?.message||error) }); }
      const admitted=await runtime.admitContextSnapshot(body);
      return sendJson(res, admitted.ok ? 200 : 409, admitted);
    }
    return sendJson(res, 404, { error: 'Infinite Opus route not found' });
  });
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
    if (url.pathname === '/api/internal/infinite-opus/autofinish') return brokerCrownAutofinishTrigger(req,res);
    if (url.pathname.startsWith('/api/typingmind/infinite-opus/v1/')) return brokerTypingMindInfiniteOpus(req, res, url);
    if (url.pathname.startsWith('/api/admin/infinite-opus/')) return brokerInfiniteOpus(coreHandler, req, res, url);
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

if (wrapperIsEntryPoint) {
  void (async () => {
    const result = await runWinnrSealedBootstrapController({ config });
    console.log('WINNR_SEALED_BOOTSTRAP ' + JSON.stringify(result));
  })().catch(error => {
    console.error('WINNR_SEALED_BOOTSTRAP ' + JSON.stringify({
      ok:false,status:'UNHANDLED',reason:String(error?.message||error).slice(0,300)
    }));
  });
}

if (wrapperIsEntryPoint && String(process.env.WINNR_REPLY_CANARY_VERIFY || '') === '1') {
  void verifyWinnrReplyCanaries({ config })
    .then(result => console.log('WINNR_REPLY_CANARY_VERIFY ' + JSON.stringify(result)))
    .catch(error => console.error('WINNR_REPLY_CANARY_VERIFY_FAILED ' + JSON.stringify({
      ok:false,status:'WINNR_REPLY_CANARY_VERIFY_EXCEPTION',reason:String(error?.message||error).slice(0,200)
    })));
}

if (wrapperIsEntryPoint && String(process.env.WINNR_PLACEMENT_PHENOTYPE_ONCE || '') === '1') {
  void runWinnrPlacementPhenotypeCanary({ config })
    .then(result => console.log('WINNR_PLACEMENT_PHENOTYPE ' + JSON.stringify(result)))
    .catch(error => console.error('WINNR_PLACEMENT_PHENOTYPE_FAILED ' + JSON.stringify({
      ok:false,status:'WINNR_PLACEMENT_CANARY_EXCEPTION',reason:String(error?.message||error).slice(0,200)
    })));
}

if (wrapperIsEntryPoint && String(process.env.WINNR_RUNTIME_BOOTSTRAP_ONCE || '') === '1') {
  void (async () => {
    try {
      const encoded = String(process.env.WINNR_BOOTSTRAP_CSV_B64 || '').trim();
      if (!encoded) throw new Error('WINNR_BOOTSTRAP_CSV_B64 is required');
      const csvText = Buffer.from(encoded, 'base64').toString('utf8');
      if (!csvText.trim() || Buffer.byteLength(csvText) > 2_000_000) throw new Error('Winnr bootstrap CSV refused');
      const result = await runWinnrRuntimeBootstrap({
        config,
        csvText,
        canaryTarget: String(process.env.WINNR_RUNTIME_CANARY_TARGET || '').trim()
      });
      console.log('WINNR_RUNTIME_BOOTSTRAP ' + JSON.stringify({
        ok: result?.ok === true,
        status: result?.status || 'UNKNOWN',
        domain: result?.domain || null,
        mailboxCount: Number(result?.mailboxCount || 0),
        accountRowsWritten: Number(result?.accountRowsWritten || 0),
        credentialStorage: result?.credentialStorage || null,
        plaintextCredentialsLogged: result?.plaintextCredentialsLogged ?? null,
        smtpConfirmed: Number(result?.smtpConfirmed || 0),
        imapConfirmed: Number(result?.imapConfirmed || 0),
        messagesSent: Number(result?.messagesSent || 0)
      }));
    } catch (error) {
      console.error('WINNR_RUNTIME_BOOTSTRAP ' + JSON.stringify({
        ok: false,
        status: 'UNHANDLED',
        reason: String(error?.message || error).slice(0, 300)
      }));
    }
  })();
}

if (wrapperIsEntryPoint && String(process.env.INFINITE_OPUS_AUTOFINISH_STARTUP_ONCE||'')==='1') {
  const store=createStore(config);
  void (async()=>{
    try{
      await store.init();
      const result=await runCrownAutoFinish({
        store,
        apiKey:String(process.env.OPENROUTER_API_KEY||''),
        paidAuthorization:parseJsonEnvironment('INFINITE_OPUS_PAID_AUTHORIZATION_JSON'),
        replacementAuthorization:parseJsonEnvironment('INFINITE_OPUS_CROWN_REPLACEMENT_AUTHORIZATION_JSON'),
        resumeAuthorization:parseJsonEnvironment('INFINITE_OPUS_CROWN_RESUME_AUTHORIZATION_JSON'),
        mainSha:String(process.env.RENDER_GIT_COMMIT||process.env.RENDER_GIT_COMMIT_SHA||'unknown')
      });
      console.log('UBERMIND_CROWN_AUTOFINISH_STARTUP '+JSON.stringify({
        ok:result?.ok===true,status:result?.status??'UNKNOWN',
        receiptHash:result?.receipt?.receiptHash??result?.receiptHash??null
      }));
    }catch(error){
      console.error('UBERMIND_CROWN_AUTOFINISH_STARTUP '+JSON.stringify({ok:false,status:'UNHANDLED',reason:String(error?.message||error)}));
    }finally{await store.close().catch(()=>{});}
  })();
}

if (wrapperIsEntryPoint && String(process.env.INFINITE_OPUS_AUTOFINISH_STARTUP_ONCE||'')==='1') {
  setTimeout(async()=>{
    const store=createStore(config);
    try{
      await store.init();
      const settings=await store.transaction(async tx=>await tx.getSettings());
      const state=settings?.infinite_opus_crown_autofinish_20261001_v2??null;
      if(state){
        const safe={
          status:state.status??null,reason:state.reason??null,newSpendUsd:state.newSpendUsd??null,
          lastGeneration:state.lastGeneration?{
            id:state.lastGeneration.id??null,model:state.lastGeneration.model??null,
            costUsd:state.lastGeneration.costUsd??null,provider:state.lastGeneration.provider??null
          }:null,
          taskCommitment:state.taskCommitment??null,hiddenTaskCount:state.hiddenTaskCount??null
        };
        console.log('UBERMIND_CROWN_STATE_DIAGNOSTIC '+JSON.stringify(safe));
        if(safe.lastGeneration?.id && process.env.OPENROUTER_API_KEY){
          try{
            const r=await fetch('https://openrouter.ai/api/v1/generation?id='+encodeURIComponent(safe.lastGeneration.id),{
              headers:{authorization:'Bearer '+String(process.env.OPENROUTER_API_KEY)},signal:AbortSignal.timeout(15000)
            });
            if(r.ok){
              const j=await r.json(),d=j?.data??{};
              console.log('UBERMIND_CROWN_GENERATION_METADATA '+JSON.stringify({
                id:safe.lastGeneration.id,model:d.model??null,provider:d.provider_name??null,
                finishReason:d.finish_reason??null,nativeTokensPrompt:d.native_tokens_prompt??null,
                nativeTokensCompletion:d.native_tokens_completion??null,totalCost:d.total_cost??null,
                generationTime:d.generation_time??null,latency:d.latency??null
              }));
            }else console.log('UBERMIND_CROWN_GENERATION_METADATA '+JSON.stringify({id:safe.lastGeneration.id,status:'metadata-http-'+r.status}));
          }catch(error){
            console.log('UBERMIND_CROWN_GENERATION_METADATA '+JSON.stringify({id:safe.lastGeneration.id,status:'metadata-read-failed',reason:String(error?.message||error)}));
          }
        }
      }
    }catch(error){
      console.error('UBERMIND_CROWN_STATE_DIAGNOSTIC '+JSON.stringify({status:'DIAGNOSTIC_FAILED',reason:String(error?.message||error)}));
    }finally{await store.close().catch(()=>{});}
  },8000);
}

export const requestHandler = createdHardenedHandler || harden(core.requestHandler);
export default requestHandler;

if (wrapperIsEntryPoint && process.env.INFINITE_OPUS_RECOVERY_DIAGNOSTIC_ONCE === '1') {
  const recoveryStore=createStore(config);
  void (async()=>{
    try { await recoveryStore.init();
      console.log('UBERMIND_CROWN_INTERRUPTED_RECOVERY '+JSON.stringify(await reconcileInterruptedCrownGeneration(recoveryStore,{apiKey:process.env.OPENROUTER_API_KEY})));
      console.log('UBERMIND_CROWN_RECOVERY '+JSON.stringify(await readCrownRecoveryMetadata(recoveryStore))); }
    catch { console.error('UBERMIND_CROWN_RECOVERY '+JSON.stringify({status:'STORE_READ_FAILED',providerCallsPerformed:0})); }
    finally { await recoveryStore.close().catch(()=>{}); }
  })();
}
