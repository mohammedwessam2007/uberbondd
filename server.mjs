import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './src/config.mjs';
import { createStore } from './src/store.mjs';
import { runWinnrRuntimeBootstrap } from './src/winnr-runtime-bootstrap.mjs';
import { runWinnrSealedBootstrapController } from './src/winnr-sealed-bootstrap.mjs';
import { verifyWinnrReplyCanaries } from './src/winnr-reply-canary-verifier.mjs';
import { runWinnrPlacementPhenotypeCanary, runWinnrPersonalInboxCanary } from './src/winnr-placement-phenotype-canary.mjs';
import { applyWinnrPlacementQuarantine } from './src/winnr-placement-quarantine.mjs';
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
import { createTypingMindLiveOrchestrator, inspectTypingMindLiveReadiness, inspectJevShadowReadiness, TYPINGMIND_CROWN_MODEL, TYPINGMIND_CROWN_ROUTE_IDENTITY } from './src/infinite-opus-typingmind-live.mjs';
import { inspectInfiniteOpusActivationEnvironment } from './src/infinite-opus-activation-diagnostic.mjs';
import { readCrownRecoveryMetadata } from './scripts/infinite-opus-crown-recovery-diagnostic.mjs';
import { reconcileInterruptedCrownGeneration } from './scripts/infinite-opus-crown-interrupted-recovery.mjs';
import { runCrownAutoFinish } from './scripts/infinite-opus-crown-autofinish.mjs';
import { OPUS_CANONICAL_REVISION, verifyCrownProviderModel } from './src/crown-model-identity.mjs';
import { compileCrownOwnerResumeAuthority, CROWN_OWNER_RESUME_CONFIRMATION } from './src/crown-owner-resume-authority.mjs';
import { resolveDurableCrownAdmission, persistDurableCrownAdmission } from './src/crown-durable-admission.mjs';
import { INTERRUPTED_RESUME_KEY } from './src/crown-resume-checkpoint.mjs';
import { createInfiniteOpusSemanticClosureHost } from './src/infinite-opus-semantic-closure-host.mjs';
import { readJevCalibrationSummary } from './src/jev-calibration-vault.mjs';
import { openCrownCheckpoint, sealCrownCheckpoint } from './src/crown-sealed-checkpoint.mjs';
import { compileCrownTournament, adjudicateCrownTournament } from './src/crown-tournament.mjs';
import { issueCrownAdmissionReceipt } from './src/crown-admission.mjs';
import { runAchievedOpusEquivalenceDoctor } from './scripts/infinite-opus-achieved-equivalence-doctor.mjs';

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

const currentCrownExpected=()=>({
  exactModelId:TYPINGMIND_CROWN_MODEL,
  modelRevision:OPUS_CANONICAL_REVISION,
  taskClassRole:'GENERAL_CROWN',
  routeIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY
});

async function resolveCurrentCrownAdmission(store){
  return resolveDurableCrownAdmission(store,{
    environmentReceipt:parseJsonEnvironment('INFINITE_OPUS_CROWN_ADMISSION_JSON'),
    expected:currentCrownExpected()
  });
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
    let marketSnapshot=null,live={ok:false,reasons:['public-market-not-observed']},jev={ok:false,status:'JEV_SHADOW_NOT_READY',reasons:['public-market-not-observed']},crownResolution={ok:false,source:null,receipt:null};
    try{
      crownResolution=await withUberSocketStore(store=>resolveCurrentCrownAdmission(store));
      marketSnapshot=await currentInfiniteOpusPublicMarket();
      const openRouterKeyPresent=Boolean(process.env.OPENROUTER_API_KEY);
      live=inspectTypingMindLiveReadiness({paidAuthorization,crownAdmission:crownResolution.receipt,marketSnapshot,openRouterKeyPresent});
      jev=inspectJevShadowReadiness({paidAuthorization,marketSnapshot,openRouterKeyPresent});
    }catch{}
    return sendTypingMindJson(req,res,200,{
      object: 'list',
      data: [{ id: 'ubermind/auto', object: 'model', created: 0, owned_by: 'uberbond' }],
      uberbond: {...gatewayStatus({ runtimeConnected: live.ok, crownAdmissionValid:crownResolution.ok, jevShadowReady:jev.ok }),
        liveReadiness:live.status??'TYPINGMIND_UBERMIND_LIVE_NOT_READY',reasons:live.reasons??[],
        crownAdmissionSource:crownResolution.source??null,jevShadowReadiness:jev}
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
  const crownResolution = await withUberSocketStore(store=>resolveCurrentCrownAdmission(store));
  const crownAdmission = crownResolution.receipt;
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
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/jev-readiness') {
      const paidAuthorization=parseJsonEnvironment('INFINITE_OPUS_PAID_AUTHORIZATION_JSON');
      let marketSnapshot=null;
      try{marketSnapshot=await currentInfiniteOpusPublicMarket();}
      catch(error){return sendJson(res,503,{ok:false,status:'PUBLIC_MODEL_MARKET_UNAVAILABLE',error:String(error?.message||error),providerCallPerformed:false,spendAuthorized:false});}
      const readiness=inspectJevShadowReadiness({
        paidAuthorization,marketSnapshot,openRouterKeyPresent:Boolean(process.env.OPENROUTER_API_KEY)
      });
      return sendJson(res,readiness.ok?200:409,{
        ...readiness,
        crownAdmissionRequiredForReadiness:false,
        paidInferenceTriggered:false,
        truthBoundary:'This is a zero-inference readiness check. It proves current route/catalog and runtime authority prerequisites only; it does not authorize or execute a Jev provider call and cannot suppress Crown.'
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/jev-calibration') {
      const summary=await readJevCalibrationSummary(store);
      return sendJson(res,200,{
        ok:true,...summary,
        providerCallsPerformed:0,
        paidInferenceTriggered:false,
        truthBoundary:'Crown-supervised JEV shadow outcomes only. This summary stores no raw prompts, candidate answers, or Crown outputs and grants no Crown-suppression authority.'
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/budget') {
      const unifiedCognition=await runtime.unifiedCognition();
      const scoreboard = buildInfiniteOpusScoreboard({
        runtimeSnapshot: snapshot,
        globalLedgerSummary: {},
        typingMindPerimeter: { status: perimeter.status, globalBudgetScope: 'CANONICAL_ONE_RUNTIME_KEY_20_USD__TYPINGMIND_GATEWAY_ONLY__MEMBER_GUARDRAIL_28_BACKSTOP' },
        routeInventory: { ungoverned: routeInventory.routes.filter(row => !String(row.status).startsWith('GOVERNED') && !String(row.status).startsWith('FAIL_CLOSED') && row.status !== 'ONLY_ZERO_CASH_ALLOWED_IN_INFINITE_OPUS_MODE' && row.status !== 'NONCASH_GOVERNED').map(row => row.id) },
        deployment: { sourceReady: true, liveConnected: false, productionDeployed: false, ownerOnlyBlockers: ['OPENROUTER_RUNTIME_KEY_PRIVATE_CONFIGURATION','TINY_BOUNDED_PAID_CANARY_AUTHORIZATION','SEALED_GENERAL_CROWN_EVIDENCE'] }
      });
      return sendJson(res, 200, { ok: true, perimeter, snapshot, unifiedCognition, scoreboard });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/queue') {
      return sendJson(res, 200, { ok: true, semanticDemand: await runtime.demandPlan(), paidInferenceTriggered: false });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/activation') {
      const environment=inspectInfiniteOpusActivationEnvironment(process.env);
      const crownResolution=await resolveCurrentCrownAdmission(store);
      const blockers=crownResolution.ok
        ? environment.blockers.filter(reason=>!String(reason).startsWith('crown-admission-'))
        : environment.blockers;
      return sendJson(res, 200, {
        ok:true,...environment,
        status:blockers.length?'INFINITE_OPUS_ACTIVATION_ENV_BLOCKED':'INFINITE_OPUS_ACTIVATION_ENV_PRESENT_AND_CURRENT',
        blockers,
        crownAdmission:crownResolution.ok?{
          present:true,current:true,model:crownResolution.receipt.exactModelId,taskClassRole:crownResolution.receipt.taskClassRole,
          receiptHash:crownResolution.receipt.receiptHash,source:crownResolution.source
        }:environment.crownAdmission,
        paidInferenceTriggered:false
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/crown-recovery') {
      const recovery=await readCrownRecoveryMetadata(store);
      const crownResolution=await resolveCurrentCrownAdmission(store);
      return sendJson(res,200,{
        ok:true,status:crownResolution.ok?'GENERAL_CROWN_CURRENT':'GENERAL_CROWN_RECOVERY_REQUIRED',
        resumeCheckpoint:recovery.resumeCheckpoint,
        continuationCheckpoint:recovery.continuationCheckpoint,
        crownAdmission:{current:crownResolution.ok,source:crownResolution.source??null,receiptHash:crownResolution.receipt?.receiptHash??null},
        paidInferenceTriggered:false,
        maximumOwnerResumeIncrementalUsd:0.30,
        maximumRemainingPaidCalls:2,
        truthBoundary:'Read-only recovery exposes commitments and counts only. Hidden tasks, rubrics, answers, credentials and provider secrets are not returned.'
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/infinite-opus/crown-resume') {
      let body; try { body=await readSmallJsonBody(req,16_384); }
      catch(error){ return sendJson(res,400,{ok:false,status:'CROWN_RESUME_BODY_REFUSED',error:String(error?.message||error)}); }
      const compiled=compileCrownOwnerResumeAuthority(body);
      if(!compiled.ok)return sendJson(res,400,compiled);
      const apiKey=String(process.env.OPENROUTER_API_KEY||'');
      const paidAuthorization=parseJsonEnvironment('INFINITE_OPUS_PAID_AUTHORIZATION_JSON');
      if(!apiKey||!paidAuthorization)return sendJson(res,409,{ok:false,status:'CROWN_RUNTIME_INPUTS_MISSING',providerCallsPerformed:0});
      const reconciliation=await reconcileInterruptedCrownGeneration(store,{apiKey});
      if(!['RECONCILED_BILL_ONLY_NO_RETAINED_ANSWER','UNKNOWN_CHARGE_MAX_RESERVE_QUARANTINED'].includes(reconciliation.status)){
        return sendJson(res,409,{ok:false,status:'CROWN_INTERRUPTED_GENERATION_NOT_SAFE_TO_CONTINUE',reconciliation,providerCallsPerformed:0});
      }
      const recovery=await readCrownRecoveryMetadata(store);
      if(recovery.continuationCheckpoint?.status!=='VERIFIED_ENCRYPTED_CONTINUATION_CHECKPOINT'||
         recovery.continuationCheckpoint?.missingCandidateAnswers!==1||
         recovery.continuationCheckpoint?.missingEvaluatorCalls!==1){
        return sendJson(res,409,{ok:false,status:'EXACT_TWO_MISSING_CROWN_EDGES_NOT_PROVEN',
          continuationCheckpoint:recovery.continuationCheckpoint,providerCallsPerformed:0});
      }
      const result=await runCrownAutoFinish({
        store,apiKey,paidAuthorization,
        checkpointKey:process.env.TOKEN_ENCRYPTION_KEY,
        resumeAuthorization:compiled.authority,
        mainSha:String(process.env.RENDER_GIT_COMMIT||process.env.RENDER_GIT_COMMIT_SHA||'unknown')
      });
      let durableAdmission=null;
      if(result?.ok===true&&result?.receipt){
        durableAdmission=await persistDurableCrownAdmission(store,result.receipt,{
          expected:currentCrownExpected(),sourceAttemptKey:INTERRUPTED_RESUME_KEY
        });
      }
      return sendJson(res,result?.ok===true?200:409,{
        ...result,
        receipt:undefined,
        crownAdmissionReceiptHash:result?.receipt?.receiptHash??null,
        durableAdmission,
        maximumIncrementalUsd:compiled.maximumIncrementalUsd,
        maximumRemainingPaidCalls:compiled.maximumRemainingPaidCalls,
        businessEffectAuthority:'NONE',
        sideEffectAuthority:'NONE'
      });
    }
    if (url.pathname === '/api/admin/infinite-opus/semantic-closure') {
      const crownResolution=await resolveCurrentCrownAdmission(store);
      const host=createInfiniteOpusSemanticClosureHost({currentCrownAdmission:crownResolution.receipt});
      if(req.method==='GET')return sendJson(res,200,host.manifest());
      if(req.method==='POST'){
        let body;try{body=await readSmallJsonBody(req,300000);}
        catch(error){return sendJson(res,400,{ok:false,status:'SEMANTIC_CLOSURE_BODY_REFUSED',error:String(error?.message||error),providerCallsPerformed:0});}
        try{
          const out=host.execute(String(body.action||''),body.payload??{});
          return sendJson(res,out.ok===false?409:200,out);
        }catch(error){
          return sendJson(res,409,{ok:false,status:'SEMANTIC_CLOSURE_EXECUTION_REFUSED',error:String(error?.message||error),providerCallsPerformed:0,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'});
        }
      }
      return sendJson(res,405,{ok:false,error:'Method Not Allowed'});
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
  void (async()=>{
    const store=createStore(config);
    const key='infinite_opus_crown_resume_20261002_r3';
    const OPUS='anthropic/claude-opus-5.5';
    const SOL='openai/gpt-6.1-sol-pro';
    const hash=value=>'sha256:'+crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
    const extractContent=j=>{
      const m=j?.choices?.[0]?.message??{};
      if(typeof m.content==='string')return m.content;
      if(m.parsed&&typeof m.parsed==='object')return JSON.stringify(m.parsed);
      if(Array.isArray(m.content))return m.content.map(x=>typeof x==='string'?x:(typeof x?.text==='string'?x.text:(typeof x?.text?.value==='string'?x.text.value:(typeof x?.content==='string'?x.content:'')))).join('');
      return '';
    };
    const parseJson=text=>{
      const raw=String(text??'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
      try{return JSON.parse(raw);}catch{}
      const a=raw.indexOf('{'),b=raw.lastIndexOf('}');
      if(a>=0&&b>a)return JSON.parse(raw.slice(a,b+1));
      throw new Error('sealed-grade-json-parse-failed');
    };
    try{
      await store.init();
      const settings=await store.transaction(async tx=>await tx.getSettings());
      const state=settings?.[key]??null;
      const evaluatorId=String(state?.reason||'').replace(/^generation-reconciliation-required:/,'');
      const evaluatorRow=Array.isArray(state?.generationJournal)?state.generationJournal.find(r=>r.id===evaluatorId):null;
      if(!state?.sealedEvidence||!evaluatorRow||evaluatorRow.status!=='PROVIDER_RECONCILED_PENDING_EVIDENCE'||
         evaluatorRow.model!=='google/gemini-2.5-pro'||!Number.isFinite(Number(evaluatorRow.costUsd))){
        console.log('UBERMIND_SEALED_LOCAL_ADJUDICATION '+JSON.stringify({
          ok:false,status:'RECONCILED_EVALUATOR_REQUIRED',providerCallsPerformed:0,hiddenPayloadsExposed:false
        }));
      }else{
        const checkpointKey=String(process.env.TOKEN_ENCRYPTION_KEY||'');
        const payload=openCrownCheckpoint(state.sealedEvidence,{key:checkpointKey,binding:key+'|'+state.taskCommitment});
        const tasks=payload?.tasks,answers=payload?.answers,calls=payload?.calls;
        const rawEvaluator=payload?.providerResponses?.[evaluatorId]?.response;
        if(!Array.isArray(tasks)||tasks.length!==2||!answers||Object.keys(answers).length!==4||
           !Array.isArray(calls)||calls.length!==4||!rawEvaluator)
          throw new Error('complete-four-answer-sealed-checkpoint-required');
        for(const task of tasks)for(const model of [OPUS,SOL])
          if(typeof answers[task.id+'|'+model]!=='string'||!answers[task.id+'|'+model])
            throw new Error('paired-answer-missing');
        const gradeDoc=parseJson(extractContent(rawEvaluator));
        const grades=gradeDoc?.grades;
        if(!Array.isArray(grades)||grades.length!==4)throw new Error('four-blind-grades-required');
        const mapping={};
        for(const task of tasks){
          const flip=parseInt(hash(task.id).slice(-2),16)%2===1;
          const order=flip?[SOL,OPUS]:[OPUS,SOL];
          mapping[task.id]={A:order[0],B:order[1]};
        }
        const byPair=new Map();
        for(const grade of grades){
          const model=mapping[grade.task_id]?.[grade.candidate];
          if(!model)throw new Error('blind-grade-mapping-failed');
          const pair=grade.task_id+'|'+model;
          if(byPair.has(pair))throw new Error('duplicate-grade');
          const score=Number(grade.quality_score),reg=Number(grade.required_regressions);
          if(!Number.isFinite(score)||score<0||score>100||!Number.isInteger(reg)||reg<0)
            throw new Error('invalid-grade');
          byPair.set(pair,{score,reg,zero:grade.canonical_zero_loss===true});
        }
        if(byPair.size!==4)throw new Error('complete-paired-grade-set-required');
        const perTask=tasks.map(task=>{
          const opus=byPair.get(task.id+'|'+OPUS),sol=byPair.get(task.id+'|'+SOL);
          const opusCall=calls.find(c=>c.taskId===task.id&&c.model===OPUS);
          const solCall=calls.find(c=>c.taskId===task.id&&c.model===SOL);
          if(!opus||!sol||!opusCall||!solCall)throw new Error('paired-call-grade-required');
          const solSameOrBetter=sol.zero&&sol.reg===0&&sol.score>=opus.score;
          return {
            taskIdHash:hash(task.id),
            opus:{qualityScore:opus.score,requiredRegressions:opus.reg,canonicalZeroLoss:opus.zero,costUsd:Number(opusCall.cost)},
            sol:{qualityScore:sol.score,requiredRegressions:sol.reg,canonicalZeroLoss:sol.zero,costUsd:Number(solCall.cost)},
            solSameOrBetter
          };
        });
        const opusCost=perTask.reduce((sum,row)=>sum+row.opus.costUsd,0);
        const solCost=perTask.reduce((sum,row)=>sum+row.sol.costUsd,0);
        const strictSameQuality=perTask.every(row=>row.solSameOrBetter);
        const measuredFactor=strictSameQuality&&solCost>0?opusCost/solCost:null;

        const hiddenTasks=tasks.map(task=>({
          taskId:task.id,role:'GENERAL_CROWN',
          qualityDimensions:['correctness','constraint_fidelity','evidence_discipline','counterexamples','synthesis'],
          sealedExpectedRef:'sealed://custodian/'+state.taskCommitment+'/'+task.id
        }));
        const candidates=[{model:OPUS,roles:['GENERAL_CROWN']},{model:SOL,roles:['GENERAL_CROWN']}];
        const candidateSnapshotHash=hash({models:[OPUS,SOL],mainSha:String(process.env.RENDER_GIT_COMMIT||process.env.RENDER_GIT_COMMIT_SHA||'unknown'),taskCommitment:state.taskCommitment});
        const observations=calls.map(call=>{
          const grade=byPair.get(call.taskId+'|'+call.model);
          return {
            taskId:call.taskId,model:call.model,role:'GENERAL_CROWN',hiddenTask:true,
            providerBillObserved:true,
            modelIdentityVerified:verifyCrownProviderModel({requestedModel:call.model,observedModel:call.metaModel,provider:call.providerName}),
            requiredRegressions:grade.reg,
            sealedTrialRef:'sealed://trial/'+call.id,
            canonicalZeroLossCertified:grade.zero&&grade.reg===0,
            qualityScore:grade.score,costUsd:Number(call.cost)
          };
        });
        const compiled=compileCrownTournament({
          candidateSnapshotHash,hiddenTasks,candidates,
          budgetAuthorizationRef:state.resumeAuthorization?.evidenceRef??'owner-approved-two-missing-crown-edges-r3'
        });
        if(!compiled.ok)throw new Error('tournament-compile:'+compiled.status);
        const adjudicated=adjudicateCrownTournament({plan:compiled.plan,observations});
        if(!adjudicated.ok||adjudicated.status!=='TASK_CLASS_CROWN_CANDIDATE_EVIDENCE_READY'){
          const measuredDominance={
            schemaVersion:'uberbond.measured-reference-dominance.v1',
            ok:strictSameQuality,
            status:strictSameQuality?'MEASURED_SOL_DOMINATES_OPUS_REFERENCE_ON_ALL_SEALED_TASKS':'MEASURED_REFERENCE_DOMINANCE_NOT_ACHIEVED',
            courtStatus:adjudicated.status,
            taskCount:2,
            perTask,
            opusCandidateCostUsd:Number(opusCost.toFixed(9)),
            solCandidateCostUsd:Number(solCost.toFixed(9)),
            measuredCandidateCostCompressionFactor:strictSameQuality&&solCost>0?Number((opusCost/solCost).toFixed(6)):null,
            candidateCostReductionPercent:strictSameQuality&&opusCost>0?Number(((1-solCost/opusCost)*100).toFixed(4)):null,
            evaluatorCostUsd:Number(evaluatorRow.costUsd),
            proofInclusiveCostUsd:Number((solCost+Number(evaluatorRow.costUsd)).toFixed(9)),
            proofInclusiveCompressionFactor:strictSameQuality&&solCost+Number(evaluatorRow.costUsd)>0?Number((opusCost/(solCost+Number(evaluatorRow.costUsd))).toFixed(6)):null,
            strictSameOrBetterEveryTask:strictSameQuality,
            observedSolRequiredRegressions:perTask.reduce((n,row)=>n+row.sol.requiredRegressions,0),
            observedOpusRequiredRegressions:perTask.reduce((n,row)=>n+row.opus.requiredRegressions,0),
            providerCallsPerformed:0,
            hiddenPayloadsExposed:false,
            truthBoundary:'Measured only on the two sealed open-ended tasks. Sol dominance means zero required regressions for Sol and Sol blind quality score >= Opus on every paired task. Canonical Crown court remains separate and was not widened.'
          };
          await store.transaction(async tx=>await tx.setSetting('infinite_opus_measured_reference_dominance_20261007_v1',{
            ...measuredDominance,taskCommitment:state.taskCommitment,evaluatorGenerationId:evaluatorId,
            sourceAttemptKey:key,observedAt:new Date().toISOString()
          }));
          console.log('UBERMIND_MEASURED_REFERENCE_DOMINANCE '+JSON.stringify(measuredDominance));
          if(!strictSameQuality)throw new Error('tournament-adjudication:'+adjudicated.status);
          return;
        }
        const selected=adjudicated.roles?.GENERAL_CROWN;
        if(!selected)throw new Error('general-crown-not-selected');

        const result={
          ok:true,
          status:strictSameQuality?'MEASURED_CHEAP_OPUS_QUALITY_EQUIVALENCE_ACHIEVED':'MEASURED_CHEAP_OPUS_QUALITY_EQUIVALENCE_NOT_ACHIEVED',
          winner:selected.candidate,
          taskCount:2,
          strictSameOrBetterEveryTask:strictSameQuality,
          observedPairedQualityRegressions:perTask.filter(row=>!row.solSameOrBetter).length,
          perTask,
          opusCandidateCostUsd:Number(opusCost.toFixed(9)),
          solCandidateCostUsd:Number(solCost.toFixed(9)),
          measuredCandidateCostCompressionFactor:measuredFactor==null?null:Number(measuredFactor.toFixed(6)),
          candidateCostReductionPercent:strictSameQuality&&opusCost>0?Number(((1-solCost/opusCost)*100).toFixed(4)):null,
          evaluatorCostUsd:Number(evaluatorRow.costUsd),
          totalEvaluationSpendUsd:Number(state.newSpendUsd),
          providerCallsPerformed:0,
          hiddenPayloadsExposed:false,
          truthBoundary:'Measured only on the two sealed open-ended tasks. Equivalence requires zero required regressions for both models and Sol score >= Opus on every paired task. No wider task-distribution claim is made.'
        };
        await store.transaction(async tx=>await tx.setSetting('infinite_opus_measured_quality_20261007_v1',{
          ...result,
          taskCommitment:state.taskCommitment,
          evaluatorGenerationId:evaluatorId,
          observedAt:new Date().toISOString(),
          sourceAttemptKey:key
        }));
        console.log('UBERMIND_SEALED_LOCAL_ADJUDICATION '+JSON.stringify(result));
      }
    }catch(error){
      console.error('UBERMIND_SEALED_LOCAL_ADJUDICATION '+JSON.stringify({
        ok:false,status:'LOCAL_ADJUDICATION_FAILED',reason:String(error?.message||error).slice(0,260),
        providerCallsPerformed:0,hiddenPayloadsExposed:false
      }));
    }finally{await store.close().catch(()=>{});}
  })();
}

if (wrapperIsEntryPoint) {
  try {
    const result=runAchievedOpusEquivalenceDoctor();
    console.log('INFINITE_OPUS_ACHIEVED_EQUIVALENCE ' + JSON.stringify(result));
  } catch (error) {
    console.error('INFINITE_OPUS_ACHIEVED_EQUIVALENCE ' + JSON.stringify({
      ok:false,status:'EQUIVALENCE_ISLAND_DOCTOR_EXCEPTION',reason:String(error?.message||error).slice(0,300),
      providerCallsPerformed:0,modelInferenceCallsPerformed:0,externalApiSpendUsd:0
    }));
  }
}

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

if (wrapperIsEntryPoint && String(process.env.WINNR_PLACEMENT_QUARANTINE_ORDINALS || '').trim()) {
  void applyWinnrPlacementQuarantine({ config })
    .then(result => console.log('WINNR_PLACEMENT_QUARANTINE ' + JSON.stringify(result)))
    .catch(error => console.error('WINNR_PLACEMENT_QUARANTINE_FAILED ' + JSON.stringify({
      ok:false,status:'UNHANDLED',reason:String(error?.message||error).slice(0,200)
    })));
}

if (wrapperIsEntryPoint && process.env.WINNR_PERSONAL_INBOX_CANARY_ONCE === '1') {
  void runWinnrPersonalInboxCanary({ config })
    .then(result => console.log('WINNR_PERSONAL_INBOX_CANARY ' + JSON.stringify(result)))
    .catch(() => console.error('WINNR_PERSONAL_INBOX_CANARY ' + JSON.stringify({
      ok:false,status:'WINNR_PERSONAL_CANARY_RECONCILE_REQUIRED',automaticRetryAuthorized:false
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
