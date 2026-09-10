#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import {
  compileFounderConsoleBinding,
  compileFounderConsoleSnapshot,
  constantTimeTokenEqual,
  parseFounderConsoleInput
} from '../src/sovereign-founder-console.mjs';
import { createModelExecutorFactory } from '../src/agent-model-executor-factory.mjs';

const MAX_BODY = 16_384;
const CONTROL_DIR = path.resolve(process.env.UBERBOND_CONTROL_DIR || '/var/lib/uberbond-control');
const PROMOTION_DIR = path.resolve(process.env.UBERBOND_PROMOTION_DIR || '/var/lib/uberbond-promotion');
const AUTONOMY_DIR = path.join(CONTROL_DIR, 'autonomy');
const INTENT_DIR = path.join(CONTROL_DIR, 'founder-intents');
const DIALOGUE_DIR = path.join(CONTROL_DIR, 'founder-dialogue');
const AUTHORCTL = process.env.UBERBOND_AUTHORCTL || '/opt/uberbond/control/uberbond-authorctl';
const HOST = String(process.env.UBERBOND_FOUNDER_CONSOLE_HOST || '127.0.0.1').trim();
const PORT = Number(process.env.UBERBOND_FOUNDER_CONSOLE_PORT || 8787);
const TOKEN = String(process.env.UBERBOND_FOUNDER_CONSOLE_TOKEN || '');
const binding = compileFounderConsoleBinding({ host: HOST, token: TOKEN });
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function json(res, status, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'"
  });
  res.end(body);
}
function runCtl(command) {
  return new Promise(resolve => execFile(AUTHORCTL, [command], { timeout: 60 * 60_000, maxBuffer: 8_000_000, windowsHide: true }, (error, stdout, stderr) => resolve({
    exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0),
    stdout: String(stdout || ''), stderr: String(stderr || '')
  })));
}
async function readJson(file) {
  try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8_000_000) return null; const v = JSON.parse(await fs.readFile(file, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; }
}
async function atomicJson(file, value, mode = 0o600) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode }); await fs.chmod(tmp, mode); await fs.rename(tmp, file);
}
async function latestIntent() {
  try {
    const names = (await fs.readdir(INTENT_DIR)).filter(name => /^intent-[a-f0-9]{24}\.json$/.test(name)).sort();
    return names.length ? readJson(path.join(INTENT_DIR, names[names.length - 1])) : null;
  } catch { return null; }
}
async function snapshot() {
  const [autonomyStatus, continuation, verifiedChange, localPromotion, localReleaseRequest, legacyReleaseRequest, runtimeReceipt, intent] = await Promise.all([
    readJson(path.join(AUTONOMY_DIR, 'status.json')),
    readJson(path.join(AUTONOMY_DIR, 'continuation-receipt.json')),
    readJson(path.join(AUTONOMY_DIR, 'verified-change.json')),
    readJson(path.join(PROMOTION_DIR, 'promotion-receipt.json')),
    readJson(path.join(PROMOTION_DIR, 'sovereign-release-request.json')),
    readJson(path.join(CONTROL_DIR, 'sovereign-release-request.json')),
    readJson(path.join(CONTROL_DIR, 'runtime-receipt.json')),
    latestIntent()
  ]);
  return compileFounderConsoleSnapshot({ autonomyStatus, continuation, verifiedChange, localPromotion, releaseRequest:localReleaseRequest || legacyReleaseRequest, runtimeReceipt, latestIntent: intent });
}
function authorized(req) {
  if (!binding.tokenRequired) return true;
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return constantTimeTokenEqual(TOKEN, supplied);
}
function validOrigin(req) {
  const origin = String(req.headers.origin || '');
  if (!origin) return true;
  const allowed = new Set([`http://${HOST}:${PORT}`, `http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);
  return allowed.has(origin);
}
async function bodyJson(req) {
  let bytes = 0; const chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > MAX_BODY) throw new Error('request-body-too-large'); chunks.push(chunk); }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}
async function queueIntent(founderIntent) {
  const id = crypto.createHash('sha256').update(`${new Date().toISOString()}\0${founderIntent}\0${crypto.randomBytes(16).toString('hex')}`).digest('hex').slice(0, 24);
  const receipt = {
    schemaVersion: 'uberbond.founder-intent.v1', id: `intent-${id}`, createdAt: new Date().toISOString(), state: 'QUEUED',
    intent: founderIntent, consequenceClass: 'FOUNDER_CONTEXT_ONLY', businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE',
    truthBoundary: 'Founder intent is context, not authority. It may influence future bounded planning only through normal policy and effect gates.'
  };
  await atomicJson(path.join(INTENT_DIR, `${receipt.id}.json`), receipt);
  return receipt;
}
function dialogueConfig() {
  const enabled = String(process.env.UBERBOND_FOUNDER_DIALOGUE_ENABLED || '').toLowerCase() === 'true';
  const endpoint = String(process.env.OPEN_MODEL_ENDPOINT || '').trim();
  let loopback = false;
  try { const url = new URL(endpoint); loopback = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname); } catch {}
  return {
    enabled,
    loopback,
    runtime: String(process.env.OPEN_MODEL_RUNTIME || '').trim().toUpperCase(),
    model: String(process.env.OPEN_MODEL_MODEL || '').trim(),
    endpoint
  };
}
async function runLocalDialogue(founderIntent, intentReceipt, statusSnapshot) {
  const cfg = dialogueConfig();
  if (!cfg.enabled) return { ok:false, status:'FOUNDER_DIALOGUE_LOCAL_MODEL_NOT_ENABLED', reasonCodes:['founder-dialogue-explicitly-disabled'], intentId:intentReceipt.id, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE' };
  if (!cfg.loopback) return { ok:false, status:'FOUNDER_DIALOGUE_LOCAL_MODEL_REFUSED', reasonCodes:['founder-dialogue-requires-loopback-open-model-runtime'], intentId:intentReceipt.id, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE' };
  let executor;
  try { executor = createModelExecutorFactory({ env: process.env })({ provider: 'open-model', model: cfg.model }); }
  catch (error) { return { ok:false, status:'FOUNDER_DIALOGUE_LOCAL_MODEL_NOT_READY', reasonCodes:[String(error?.message || error).slice(0,300)], intentId:intentReceipt.id, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE' }; }
  const task = {
    taskId: `founder_dialogue_${intentReceipt.id.replace('intent-','')}`,
    objective: `Respond directly and usefully to the founder's message while preserving UberBond truth and authority boundaries. Founder message: ${founderIntent}\nCurrent safe control snapshot: ${JSON.stringify(statusSnapshot).slice(0,12000)}`,
    originAgent: 'sovereign-founder-console', targetAgent: 'open-model', parentTask: null,
    contextRefs: [`founder-intent:${intentReceipt.id}`, `autonomy-status:${statusSnapshot?.autonomy?.status || 'UNKNOWN'}`],
    evidenceRefs: statusSnapshot?.autonomy?.baseRevision ? [`main:${statusSnapshot.autonomy.baseRevision}`] : [],
    constraints: ['local-dialogue-only','do-not-infer-missing-runtime-or-external-evidence','capability-does-not-create-authority','do-not-read-personal-civilization-vault'],
    forbiddenActions: ['merge','deploy','send','spend','purchase','change-credentials','change-dns','mutate-production','customer-contact','payment-action'],
    requiredOutputs: ['reply','observedFacts','unknowns','recommendedNextStep','founderDecisionRequired'], acceptanceTests: [],
    economicObjective: 'answer the founder correctly with minimum founder attention', consequenceClass: 'LOCAL_PREPARATION'
  };
  const result = await executor({ task, maxTokens: Number(process.env.UBERBOND_FOUNDER_DIALOGUE_MAX_TOKENS || 4096), costCeilingCents: Number(process.env.UBERBOND_FOUNDER_DIALOGUE_MAX_COST_CENTS || 25) });
  const receipt = {
    schemaVersion:'uberbond.founder-dialogue-receipt.v1', id:`dialogue-${intentReceipt.id.slice(7)}`, intentId:intentReceipt.id,
    createdAt:new Date().toISOString(), ok:result?.ok === true, outcome:result?.outcome || null, runtime:result?.runtime || cfg.runtime,
    configuredModel:result?.configuredModel || cfg.model, observedModel:result?.observedModel || null, identityVerification:result?.identityVerification || null,
    usage:result?.usage || null, result:result?.result || null, reasonCodes:Array.isArray(result?.reasonCodes)?result.reasonCodes:[],
    businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:result?.externalEffectLedger || null,
    truthBoundary:'This local dialogue may reason and prepare text only. It cannot merge, deploy, send, spend, mutate production, or create customer/payment/runtime truth.'
  };
  await atomicJson(path.join(DIALOGUE_DIR, `${receipt.id}.json`), receipt);
  return receipt;
}
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UberBond Founder Console</title><style>body{font:16px system-ui;max-width:760px;margin:40px auto;padding:0 18px;background:#0b0d10;color:#e9eef5}button,input{font:inherit;padding:10px;margin:4px}input{width:min(520px,70%)}pre{white-space:pre-wrap;background:#151922;padding:14px;border-radius:10px}button{cursor:pointer}.auth{margin:12px 0;padding:10px;background:#151922;border-radius:10px}.hint{opacity:.78;font-size:14px}</style></head><body><h1>UberBond Founder Console</h1><p>Local sovereign control, local promotion status, release state, and optional local-model dialogue. No private-life vault access. No signing/deployment/payment authority.</p><div class="auth"><input id="token" type="password" autocomplete="off" placeholder="Founder token, required off-host"><button onclick="unlock()">Unlock</button><span id="authstate" class="hint">Token stays only in this page's memory.</span></div><div><button onclick="cmd('status')">Status</button><button onclick="cmd('wake')">Wake</button><button onclick="cmd('pause')">Pause</button><button onclick="cmd('resume')">Resume</button><button onclick="cmd('verify')">Verify</button></div><div><input id="q" placeholder="Talk to UberBond, or type continue/status"><button onclick="send()">Send</button></div><pre id="out">Enter the founder token if this console is protected, then press Unlock.</pre><script>let authToken='';function headers(extra){let h=Object.assign({},extra||{});if(authToken)h.authorization='Bearer '+authToken;return h}function unlock(){let t=document.getElementById('token');authToken=t.value;t.value='';document.getElementById('authstate').textContent=authToken?'Token loaded in memory only.':'No token loaded.';load()}async function api(command){let r=await fetch('/api/command',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({command})});document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2)}function cmd(x){api(x)}function send(){let q=document.getElementById('q');api(q.value);q.value=''}async function load(){let r=await fetch('/api/status',{headers:headers()});document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2)}if(!${binding.tokenRequired ? 'true' : 'false'})load()</script></body></html>`;

if (!binding.ok || !Number.isSafeInteger(PORT) || PORT < 1 || PORT > 65535) {
  process.stderr.write(`${JSON.stringify(binding.ok ? { ok:false, reasonCodes:['valid-founder-console-port-required'] } : binding, null, 2)}\n`); process.exit(2);
}
const server = http.createServer(async (req, res) => {
  try {
    if (!validOrigin(req)) return json(res, 403, { ok:false, status:'FOUNDER_CONSOLE_ORIGIN_REFUSED' });
    // The HTML shell contains no repository, model, autonomy, token, or private
    // state. Serving it without Bearer auth is what makes a strong-token private
    // network console usable from a browser. Every data/control API below stays
    // authenticated, so an unauthenticated shell grants zero control authority.
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'"}); return res.end(PAGE); }
    if (!authorized(req)) return json(res, 401, { ok:false, status:'FOUNDER_CONSOLE_AUTH_REQUIRED' });
    if (req.method === 'GET' && req.url === '/api/status') return json(res, 200, { ...(await snapshot()), localDialogue: dialogueConfig() });
    if (req.method === 'POST' && req.url === '/api/command') {
      const parsed = parseFounderConsoleInput(await bodyJson(req));
      if (!parsed.ok) return json(res, 400, parsed);
      if (parsed.kind === 'FOUNDER_INTENT') {
        const intent = await queueIntent(parsed.founderIntent); const snap = await snapshot(); const dialogue = await runLocalDialogue(parsed.founderIntent, intent, snap);
        return json(res, dialogue.ok ? 200 : 202, { ok:true, status:dialogue.ok ? 'FOUNDER_DIALOGUE_COMPLETED_LOCALLY' : 'FOUNDER_INTENT_QUEUED', intentId:intent.id, dialogue, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', truthBoundary:intent.truthBoundary });
      }
      const execution = await runCtl(parsed.command);
      let ctlResult = null; try { ctlResult = execution.stdout ? JSON.parse(execution.stdout) : null; } catch { ctlResult = { output: execution.stdout.slice(0, 20_000) }; }
      return json(res, execution.exitCode === 0 ? 200 : 409, { ok:execution.exitCode === 0, status:'FOUNDER_CONTROL_COMMAND_COMPLETED', command:parsed.command, exitCode:execution.exitCode, result:ctlResult, stderr:execution.stderr.slice(0,2000), snapshot:await snapshot(), businessEffectAuthority:'NONE', externalEffectAuthority:'NONE' });
    }
    return json(res, 404, { ok:false, status:'FOUNDER_CONSOLE_ROUTE_NOT_FOUND' });
  } catch (error) { return json(res, 500, { ok:false, status:'FOUNDER_CONSOLE_INTERNAL_REFUSAL', reasonCodes:[String(error?.message || error).slice(0,300)], businessEffectAuthority:'NONE', externalEffectAuthority:'NONE' }); }
});
server.listen(PORT, HOST, () => process.stdout.write(`${JSON.stringify({ ok:true, status:'FOUNDER_CONSOLE_LISTENING', host:HOST, port:PORT, tokenRequired:binding.tokenRequired, dialogue:dialogueConfig(), publicExposureAuthorized:false }, null, 2)}\n`));
