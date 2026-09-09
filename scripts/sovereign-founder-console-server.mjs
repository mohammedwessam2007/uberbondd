#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  compileFounderConsoleBinding,
  compileFounderConsoleSnapshot,
  constantTimeTokenEqual,
  parseFounderConsoleInput
} from '../src/sovereign-founder-console.mjs';

const MAX_BODY = 16_384;
const CONTROL_DIR = path.resolve(process.env.UBERBOND_CONTROL_DIR || '/var/lib/uberbond-control');
const AUTONOMY_DIR = path.join(CONTROL_DIR, 'autonomy');
const INTENT_DIR = path.join(CONTROL_DIR, 'founder-intents');
const AUTHORCTL = process.env.UBERBOND_AUTHORCTL || '/opt/uberbond/control/uberbond-authorctl';
const HOST = String(process.env.UBERBOND_FOUNDER_CONSOLE_HOST || '127.0.0.1').trim();
const PORT = Number(process.env.UBERBOND_FOUNDER_CONSOLE_PORT || 8787);
const TOKEN = String(process.env.UBERBOND_FOUNDER_CONSOLE_TOKEN || '');
const binding = compileFounderConsoleBinding({ host: HOST, token: TOKEN });

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
async function latestIntent() {
  try {
    const names = (await fs.readdir(INTENT_DIR)).filter(name => /^intent-[a-f0-9]{24}\.json$/.test(name)).sort();
    return names.length ? readJson(path.join(INTENT_DIR, names[names.length - 1])) : null;
  } catch { return null; }
}
async function snapshot() {
  const [autonomyStatus, continuation, verifiedChange, releaseRequest, runtimeReceipt, intent] = await Promise.all([
    readJson(path.join(AUTONOMY_DIR, 'status.json')),
    readJson(path.join(AUTONOMY_DIR, 'continuation-receipt.json')),
    readJson(path.join(AUTONOMY_DIR, 'verified-change.json')),
    readJson(path.join(CONTROL_DIR, 'sovereign-release-request.json')),
    readJson(path.join(CONTROL_DIR, 'runtime-receipt.json')),
    latestIntent()
  ]);
  return compileFounderConsoleSnapshot({ autonomyStatus, continuation, verifiedChange, releaseRequest, runtimeReceipt, latestIntent: intent });
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
  await fs.mkdir(INTENT_DIR, { recursive: true, mode: 0o700 });
  const target = path.join(INTENT_DIR, `${receipt.id}.json`); const tmp = `${target}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); await fs.rename(tmp, target);
  return receipt;
}
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UberBond Founder Console</title><style>body{font:16px system-ui;max-width:760px;margin:40px auto;padding:0 18px;background:#0b0d10;color:#e9eef5}button,input{font:inherit;padding:10px;margin:4px}input{width:min(520px,70%)}pre{white-space:pre-wrap;background:#151922;padding:14px;border-radius:10px}button{cursor:pointer}</style></head><body><h1>UberBond Founder Console</h1><p>Local sovereign control. No private-life vault access. No signing/deployment/payment authority.</p><div><button onclick="cmd('status')">Status</button><button onclick="cmd('wake')">Wake</button><button onclick="cmd('pause')">Pause</button><button onclick="cmd('resume')">Resume</button><button onclick="cmd('verify')">Verify</button></div><div><input id="q" placeholder="Tell UberBond an intent or type continue/status"><button onclick="send()">Send</button></div><pre id="out">Loading…</pre><script>async function api(command){let r=await fetch('/api/command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command})});document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2)}function cmd(x){api(x)}function send(){let q=document.getElementById('q');api(q.value);q.value=''}async function load(){let r=await fetch('/api/status');document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2)}load()</script></body></html>`;

if (!binding.ok || !Number.isSafeInteger(PORT) || PORT < 1 || PORT > 65535) {
  process.stderr.write(`${JSON.stringify(binding.ok ? { ok:false, reasonCodes:['valid-founder-console-port-required'] } : binding, null, 2)}\n`); process.exit(2);
}
const server = http.createServer(async (req, res) => {
  try {
    if (!validOrigin(req)) return json(res, 403, { ok:false, status:'FOUNDER_CONSOLE_ORIGIN_REFUSED' });
    if (!authorized(req)) return json(res, 401, { ok:false, status:'FOUNDER_CONSOLE_AUTH_REQUIRED' });
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'"}); return res.end(PAGE); }
    if (req.method === 'GET' && req.url === '/api/status') return json(res, 200, await snapshot());
    if (req.method === 'POST' && req.url === '/api/command') {
      const parsed = parseFounderConsoleInput(await bodyJson(req));
      if (!parsed.ok) return json(res, 400, parsed);
      if (parsed.kind === 'FOUNDER_INTENT') {
        const intent = await queueIntent(parsed.founderIntent);
        return json(res, 202, { ok:true, status:'FOUNDER_INTENT_QUEUED', intentId:intent.id, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', truthBoundary:intent.truthBoundary });
      }
      const execution = await runCtl(parsed.command);
      let ctlResult = null; try { ctlResult = execution.stdout ? JSON.parse(execution.stdout) : null; } catch { ctlResult = { output: execution.stdout.slice(0, 20_000) }; }
      return json(res, execution.exitCode === 0 ? 200 : 409, { ok:execution.exitCode === 0, status:'FOUNDER_CONTROL_COMMAND_COMPLETED', command:parsed.command, exitCode:execution.exitCode, result:ctlResult, stderr:execution.stderr.slice(0,2000), snapshot:await snapshot(), businessEffectAuthority:'NONE', externalEffectAuthority:'NONE' });
    }
    return json(res, 404, { ok:false, status:'FOUNDER_CONSOLE_ROUTE_NOT_FOUND' });
  } catch (error) { return json(res, 500, { ok:false, status:'FOUNDER_CONSOLE_INTERNAL_REFUSAL', reasonCodes:[String(error?.message || error).slice(0,300)], businessEffectAuthority:'NONE', externalEffectAuthority:'NONE' }); }
});
server.listen(PORT, HOST, () => process.stdout.write(`${JSON.stringify({ ok:true, status:'FOUNDER_CONSOLE_LISTENING', host:HOST, port:PORT, tokenRequired:binding.tokenRequired, publicExposureAuthorized:false }, null, 2)}\n`));
