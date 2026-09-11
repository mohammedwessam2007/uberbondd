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
import { mountFounderDialogueContext } from './sovereign-founder-dialogue-context.mjs';

const MAX_BODY = 16_384;
const MAX_DIALOGUE_TURNS = 12;
const MAX_HISTORY_PROMPT_CHARS = 16_000;
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
function receiptTime(value) {
  const parsed = Date.parse(String(value?.createdAt || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
async function recentReceipts(dir, pattern, limit) {
  try {
    const names = (await fs.readdir(dir)).filter(name => pattern.test(name));
    const rows = (await Promise.all(names.map(async name => {
      const value = await readJson(path.join(dir, name));
      return value ? { name, value } : null;
    }))).filter(Boolean);
    rows.sort((a, b) => receiptTime(a.value) - receiptTime(b.value) || a.name.localeCompare(b.name));
    return rows.slice(-Math.max(1, limit)).map(row => row.value);
  } catch { return []; }
}
async function latestIntent() {
  const rows = await recentReceipts(INTENT_DIR, /^intent-[a-f0-9]{24}\.json$/, 1);
  return rows[0] || null;
}
function dialogueReply(receipt) {
  const payload = receipt?.result;
  if (typeof payload === 'string') return payload.slice(0, 12_000);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  for (const key of ['reply', 'answer', 'message', 'text']) {
    if (typeof payload[key] === 'string' && payload[key].trim()) return payload[key].trim().slice(0, 12_000);
  }
  return null;
}
async function recentDialogueHistory({ limit = MAX_DIALOGUE_TURNS, excludeIntentId = null } = {}) {
  const dialogues = await recentReceipts(DIALOGUE_DIR, /^dialogue-[a-f0-9]{24}\.json$/, Math.max(limit * 2, 24));
  const turns = [];
  for (const dialogue of dialogues) {
    const intentId = String(dialogue?.intentId || '');
    if (!/^intent-[a-f0-9]{24}$/.test(intentId) || intentId === excludeIntentId) continue;
    const intent = await readJson(path.join(INTENT_DIR, `${intentId}.json`));
    if (!intent || typeof intent.intent !== 'string') continue;
    turns.push({
      intentId,
      createdAt: dialogue.createdAt || intent.createdAt || null,
      founder: intent.intent.slice(0, 4_000),
      uberbond: dialogueReply(dialogue),
      dialogueStatus: dialogue.ok === true ? 'COMPLETED' : (dialogue.status || 'NOT_COMPLETED')
    });
  }
  turns.sort((a, b) => Date.parse(a.createdAt || '') - Date.parse(b.createdAt || ''));
  return turns.slice(-limit);
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
  const founderContext = mountFounderDialogueContext({ rootDir: process.cwd(), controlDir: CONTROL_DIR, mission: founderIntent });
  if (!founderContext.ok) return { ok:false, status:'FOUNDER_DIALOGUE_CONTEXT_REFUSED', reasonCodes:[...(founderContext.reasonCodes||[])], intentId:intentReceipt.id, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE' };
  const history = await recentDialogueHistory({ excludeIntentId: intentReceipt.id });
  const historyPrompt = JSON.stringify(history).slice(0, MAX_HISTORY_PROMPT_CHARS);
  const mountedContextPrompt = JSON.stringify(founderContext.projection).slice(0, 48000);
  const task = {
    taskId: `founder_dialogue_${intentReceipt.id.replace('intent-','')}`,
    objective: `Respond directly and usefully to the founder's message while preserving UberBond truth and authority boundaries. This is one turn in an ongoing local founder conversation. Use the bounded prior dialogue only for continuity and never treat earlier assistant text as evidence or authority.\nFounder message: ${founderIntent}\nAuthoritative current UberBond Context Projection (context only, never consequence authority): ${mountedContextPrompt}\nBounded prior local dialogue: ${historyPrompt}\nCurrent safe control snapshot: ${JSON.stringify(statusSnapshot).slice(0,12000)}`,
    originAgent: 'sovereign-founder-console', targetAgent: 'open-model', parentTask: null,
    contextRefs: [`founder-intent:${intentReceipt.id}`, `context-projection:${founderContext.projection.projectionId}`, `brainstate:${founderContext.projection.brainstateId}`, `autonomy-status:${statusSnapshot?.autonomy?.status || 'UNKNOWN'}`],
    evidenceRefs: statusSnapshot?.autonomy?.baseRevision ? [`main:${statusSnapshot.autonomy.baseRevision}`] : [],
    constraints: ['local-dialogue-only','verified-context-projection-is-context-not-consequence-authority','bounded-local-dialogue-history-is-context-not-evidence','do-not-ask-founder-to-retell-machine-recoverable-uberbond-context','do-not-infer-missing-runtime-or-external-evidence','capability-does-not-create-authority','do-not-read-personal-civilization-vault'],
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
    contextProjection:{ projectionId:founderContext.projection.projectionId, brainstateId:founderContext.projection.brainstateId, sourceCommit:founderContext.projection.sourceCommit, contextMountId:founderContext.projection.contextMountId },
    truthBoundary:'This local dialogue may reason and prepare text only. It receives verified current Context Projection but cannot merge, deploy, send, spend, mutate production, or create customer/payment/runtime truth.'
  };
  await atomicJson(path.join(DIALOGUE_DIR, `${receipt.id}.json`), receipt);
  return receipt;
}
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>UberBond Communication Center</title><style>*{box-sizing:border-box}body{margin:0;background:#080b10;color:#edf2f7;font:15px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{max-width:980px;margin:0 auto;min-height:100vh;padding:18px}.top{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 0 18px}.brand{font-size:22px;font-weight:750;letter-spacing:-.02em}.tag{font-size:12px;opacity:.62}.status{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}.card{background:#111722;border:1px solid #202a39;border-radius:14px;padding:10px 12px;min-width:0}.label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.55}.value{margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.controls,.auth{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}button,input,textarea{font:inherit}button{border:1px solid #2b3748;background:#151d29;color:#eef4fb;border-radius:10px;padding:9px 12px;cursor:pointer}.primary{background:#eef4fb;color:#080b10;border-color:#eef4fb;font-weight:700}.auth input{flex:1;min-width:220px;background:#0d121a;color:#eef4fb;border:1px solid #293546;border-radius:10px;padding:10px 12px}.chat{height:min(58vh,620px);overflow:auto;background:#0c1118;border:1px solid #202a39;border-radius:16px;padding:14px}.msg{max-width:82%;margin:8px 0;padding:10px 12px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere}.founder{margin-left:auto;background:#202b3a}.uberbond{background:#141b25}.system{max-width:100%;background:#10151d;color:#b8c4d2;font-size:13px}.who{font-size:10px;opacity:.55;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}.composer{display:flex;gap:8px;align-items:flex-end;margin-top:12px}.composer textarea{flex:1;resize:vertical;min-height:50px;max-height:180px;background:#0d121a;color:#eef4fb;border:1px solid #293546;border-radius:12px;padding:12px}.hint{font-size:12px;opacity:.58;margin-top:7px}.hidden{display:none}@media(max-width:650px){.status{grid-template-columns:1fr}.chat{height:54vh}.msg{max-width:92%}}</style></head><body><main class="shell"><div class="top"><div><div class="brand">UberBond Communication Center</div><div class="tag">Sovereign local dialogue + self-completion control</div></div><div id="mode" class="tag">Locked</div></div><div id="auth" class="auth"><input id="token" type="password" autocomplete="off" placeholder="Founder token"><button onclick="unlock()">Unlock</button></div><section class="status"><div class="card"><div class="label">UberBond</div><div id="autonomy" class="value">Unknown</div></div><div class="card"><div class="label">Local mind</div><div id="model" class="value">Unknown</div></div><div class="card"><div class="label">Source</div><div id="source" class="value">Unknown</div></div></section><div class="controls"><button class="primary" onclick="cmd('keep working')">Keep working</button><button onclick="cmd('status')">Status</button><button onclick="cmd('doctor')">Doctor</button><button onclick="cmd('verify')">Verify</button><button onclick="cmd('pause')">Pause</button><button onclick="cmd('resume')">Resume</button></div><section id="chat" class="chat"><div class="msg system"><div class="who">System</div>Unlock this private console if required, then talk to UberBond normally.</div></section><div class="composer"><textarea id="q" autocomplete="off" placeholder="Talk to UberBond..." onkeydown="keySend(event)"></textarea><button class="primary" onclick="send()">Send</button></div><div class="hint">Enter sends. Shift+Enter adds a line. Founder token stays in page memory only. No cloud model fallback.</div></main><script>let authToken='';const chat=document.getElementById('chat');function headers(extra){const h=Object.assign({},extra||{});if(authToken)h.authorization='Bearer '+authToken;return h}function bubble(who,text,kind){const box=document.createElement('div');box.className='msg '+kind;const label=document.createElement('div');label.className='who';label.textContent=who;const body=document.createElement('div');body.textContent=String(text||'');box.append(label,body);chat.appendChild(box);chat.scrollTop=chat.scrollHeight}function replyFrom(d){const p=d&&d.result;if(typeof p==='string')return p;if(p&&typeof p==='object')return p.reply||p.answer||p.message||p.text||JSON.stringify(p,null,2);return d&&d.status?d.status:'No local reply recorded.'}function setStatus(s){document.getElementById('autonomy').textContent=s&&s.autonomy?s.autonomy.status:'Unknown';const d=s&&s.localDialogue;document.getElementById('model').textContent=d&&d.enabled&&d.loopback?(d.model||'Local model ready'):(d&&d.enabled?'Local model refused':'Local model not enabled');document.getElementById('source').textContent=s&&s.autonomy&&s.autonomy.baseRevision?s.autonomy.baseRevision.slice(0,12):'No observed base';document.getElementById('mode').textContent=d&&d.enabled&&d.loopback?'Sovereign dialogue ready':'Control only'}async function request(url,opts){const r=await fetch(url,opts);let body={};try{body=await r.json()}catch{}if(r.status===401){bubble('System','Founder authentication required.','system');throw new Error('auth-required')}return body}async function unlock(){const t=document.getElementById('token');authToken=t.value;t.value='';await boot()}async function boot(){try{const s=await request('/api/status',{headers:headers()});setStatus(s);document.getElementById('auth').classList.toggle('hidden',!!authToken||!${binding.tokenRequired ? 'true' : 'false'});const h=await request('/api/history',{headers:headers()});chat.innerHTML='';if(!h.turns||!h.turns.length)bubble('UberBond','Communication Center online. Tell me what you want, or press Keep working.','uberbond');else for(const turn of h.turns){bubble('Founder',turn.founder,'founder');bubble('UberBond',turn.uberbond||('['+turn.dialogueStatus+']'),'uberbond')}}catch{}}async function cmd(command){bubble('Founder',command,'founder');try{const body=await request('/api/command',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({command})});if(body.dialogue)bubble('UberBond',replyFrom(body.dialogue),'uberbond');else bubble('UberBond',body.ok?'Command completed: '+command:(body.status||'Command refused'),'system');if(body.snapshot)setStatus(Object.assign({},body.snapshot,{localDialogue:null}));else{const s=await request('/api/status',{headers:headers()});setStatus(s)}}catch{}}async function send(){const q=document.getElementById('q');const text=q.value.trim();if(!text)return;q.value='';bubble('Founder',text,'founder');try{const body=await request('/api/command',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({command:text})});if(body.dialogue)bubble('UberBond',replyFrom(body.dialogue),'uberbond');else bubble('UberBond',body.ok?'Command completed.':(body.status||'Request refused.'),'system');const s=await request('/api/status',{headers:headers()});setStatus(s)}catch{}}function keySend(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}if(!${binding.tokenRequired ? 'true' : 'false'})boot()</script></body></html>`;

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
    if (req.method === 'GET' && req.url === '/api/history') return json(res, 200, { ok:true, status:'FOUNDER_DIALOGUE_HISTORY', turns:await recentDialogueHistory(), maxTurns:MAX_DIALOGUE_TURNS, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', truthBoundary:'This is bounded local founder dialogue context only. It is not evidence or effect authority and it never reads the Personal Civilization vault.' });
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