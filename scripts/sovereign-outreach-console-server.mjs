#!/usr/bin/env node
import http from 'node:http';
import { execFile } from 'node:child_process';
import { compileFounderConsoleBinding, constantTimeTokenEqual } from '../src/sovereign-founder-private-gateway.mjs';

const HOST = String(process.env.UBERBOND_FOUNDER_CONSOLE_HOST || '127.0.0.1').trim();
const PORT = Number(process.env.UBERBOND_OUTREACH_CONSOLE_PORT || 8789);
const TOKEN = String(process.env.UBERBOND_FOUNDER_CONSOLE_TOKEN || '');
const OUTREACHCTL = process.env.UBERBOND_OUTREACHCTL || '/opt/uberbond/control/uberbond-outreachctl';
const binding = compileFounderConsoleBinding({ host: HOST, token: TOKEN });

function json(res, status, body) {
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff' });
  res.end(JSON.stringify(body));
}
function authorized(req) {
  if (!binding.tokenRequired) return true;
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') && constantTimeTokenEqual(header.slice(7), TOKEN);
}
function validOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  return origin === `http://${HOST}:${PORT}` || origin === `https://${HOST}:${PORT}`;
}
function runCtl(args) {
  return new Promise(resolve => execFile(OUTREACHCTL, args, { timeout: 120_000, maxBuffer: 2_000_000, windowsHide:true }, (error, stdout, stderr) => {
    let result = null;
    try { result = stdout ? JSON.parse(stdout) : null; } catch { result = { output:String(stdout || '').slice(0,20_000) }; }
    resolve({ exitCode: Number(error?.code || 0), result, stderr:String(stderr || '').slice(0,2000) });
  }));
}
async function bodyJson(req) {
  const chunks=[]; let bytes=0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 20_000) throw new Error('request-too-large'); chunks.push(chunk); }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>UberBond Big Button</title><style>*{box-sizing:border-box}body{margin:0;background:#07090d;color:#f4f7fb;font:15px/1.45 system-ui,-apple-system,sans-serif}.shell{max-width:760px;margin:auto;min-height:100vh;padding:24px;display:flex;flex-direction:column;justify-content:center}.card{background:#101620;border:1px solid #263246;border-radius:24px;padding:24px}.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.58}.title{font-size:34px;font-weight:850;letter-spacing:-.04em;margin:6px 0}.state{font-size:18px;margin:14px 0}.digest{font-family:ui-monospace,monospace;font-size:11px;opacity:.55;word-break:break-all}.big{width:100%;min-height:150px;margin:22px 0 14px;border:0;border-radius:26px;font:900 28px/1 system-ui;background:#e9eef6;color:#080b10;cursor:pointer}.big.ready{background:#c7ff8b}.big:disabled{opacity:.35;cursor:not-allowed}.reasons{white-space:pre-wrap;background:#0a0f16;border-radius:14px;padding:12px;min-height:52px;color:#b9c5d4}.auth{display:flex;gap:8px;margin-bottom:14px}.auth input{flex:1;min-width:0;background:#0a0f16;color:#fff;border:1px solid #2b384c;border-radius:10px;padding:10px}.auth button,.small{background:#182231;color:#fff;border:1px solid #30405a;border-radius:10px;padding:10px 12px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.mini{background:#0b1018;border-radius:12px;padding:10px}.label{font-size:10px;text-transform:uppercase;opacity:.5}.value{overflow-wrap:anywhere}.result{margin-top:12px;white-space:pre-wrap;font:12px/1.4 ui-monospace,monospace;max-height:260px;overflow:auto}.hidden{display:none}@media(max-width:600px){.shell{padding:14px}.title{font-size:29px}.big{min-height:170px}.meta{grid-template-columns:1fr}}</style></head><body><main class="shell"><section class="card"><div class="eyebrow">Sovereign Outreach Control</div><div class="title">The Big Button</div><div id="auth" class="auth"><input id="token" type="password" autocomplete="off" placeholder="Founder token"><button onclick="unlock()">Unlock</button></div><div id="state" class="state">Locked</div><div id="digest" class="digest"></div><button id="big" class="big" disabled onclick="pressBigButton()">WAITING FOR REALITY</button><div id="reasons" class="reasons">Authenticate to inspect the immutable launch capsule.</div><div class="meta"><div class="mini"><div class="label">Campaign</div><div id="campaign" class="value">—</div></div><div class="mini"><div class="label">Recipient</div><div id="recipient" class="value">—</div></div></div><div id="result" class="result"></div></section></main><script>let authToken='';let currentDigest='';let pressing=false;function headers(extra){const h=Object.assign({},extra||{});if(authToken)h.authorization='Bearer '+authToken;return h}async function request(url,opts){const r=await fetch(url,opts);let body={};try{body=await r.json()}catch{}if(r.status===401)throw new Error('Founder authentication required');return body}function render(s){const state=s&&s.state||s&&s.status||'UNKNOWN';document.getElementById('state').textContent=state;currentDigest=s&&s.capsuleDigest||'';document.getElementById('digest').textContent=currentDigest;document.getElementById('campaign').textContent=s&&s.campaignId||'—';document.getElementById('recipient').textContent=s&&s.recipientEmail||'—';document.getElementById('reasons').textContent=(s&&s.reasonCodes&&s.reasonCodes.length?s.reasonCodes.join('\n'):'All non-founder gates are green.');const b=document.getElementById('big');const ready=!!(s&&s.oneButtonPressAvailable&&currentDigest);b.disabled=!ready||pressing;b.classList.toggle('ready',ready);b.textContent=ready?'PRESS BIG BUTTON':'WAITING FOR REALITY'}async function unlock(){authToken=document.getElementById('token').value.trim();await refresh();if(authToken)document.getElementById('auth').classList.add('hidden')}async function refresh(){try{render(await request('/api/status',{headers:headers()}))}catch(e){document.getElementById('state').textContent=String(e.message||e)}}async function pressBigButton(){if(!currentDigest||pressing)return;pressing=true;document.getElementById('big').disabled=true;document.getElementById('big').textContent='PRESSING…';try{const body=await request('/api/press',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({capsuleDigest:currentDigest})});document.getElementById('result').textContent=JSON.stringify(body,null,2)}catch(e){document.getElementById('result').textContent=String(e.message||e)}finally{pressing=false;await refresh()}}if(!${binding.tokenRequired?'true':'false'})refresh()</script></body></html>`;

if (!binding.ok || !Number.isSafeInteger(PORT) || PORT < 1 || PORT > 65535) {
  process.stderr.write(`${JSON.stringify(binding.ok ? { ok:false, reasonCodes:['valid-outreach-console-port-required'] } : binding, null, 2)}\n`); process.exit(2);
}

const server = http.createServer(async (req,res) => {
  try {
    if (!validOrigin(req)) return json(res,403,{ok:false,status:'OUTREACH_CONSOLE_ORIGIN_REFUSED'});
    if (req.method==='GET' && req.url==='/') { res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'"}); return res.end(PAGE); }
    if (!authorized(req)) return json(res,401,{ok:false,status:'FOUNDER_CONSOLE_AUTH_REQUIRED'});
    if (req.method==='GET' && req.url==='/api/status') {
      const execution=await runCtl(['status']);
      return json(res, execution.exitCode===0?200:409, execution.result || {ok:false,status:'OUTREACH_STATUS_UNAVAILABLE',stderr:execution.stderr});
    }
    if (req.method==='POST' && req.url==='/api/press') {
      const body=await bodyJson(req); const digest=String(body?.capsuleDigest||'').trim();
      if (!/^ubocap_[a-f0-9]{64}$/.test(digest)) return json(res,400,{ok:false,status:'OUTREACH_BIG_BUTTON_REFUSED',reasonCodes:['valid-capsule-digest-required']});
      const execution=await runCtl(['press',digest]);
      return json(res, execution.exitCode===0?200:409, execution.result || {ok:false,status:'OUTREACH_PRESS_UNAVAILABLE',stderr:execution.stderr});
    }
    return json(res,404,{ok:false,status:'OUTREACH_CONSOLE_ROUTE_NOT_FOUND'});
  } catch(error) { return json(res,500,{ok:false,status:'OUTREACH_CONSOLE_INTERNAL_REFUSAL',reasonCodes:[String(error?.message||error).slice(0,300)]}); }
});
server.listen(PORT,HOST,()=>process.stdout.write(`${JSON.stringify({ok:true,status:'OUTREACH_BIG_BUTTON_CONSOLE_LISTENING',host:HOST,port:PORT,tokenRequired:binding.tokenRequired,publicExposureAuthorized:false},null,2)}\n`));
