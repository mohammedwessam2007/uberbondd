import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const equal = (a, b) => { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && timingSafeEqual(x, y); };
const expected = { owner: 'uberbond2007', name: 'automatic-fortnight-gx6xxpjjp5pjcwxq9', repo: 'mohammedwessam2007/uberbondd' };

// Transport injection is for isolated tests and an independently verified MCP adapter.
// Provider credentials and destinations can never come from an HTTP request.
export function createWakeEngine({ token, fetchImpl = fetch, probe, now = Date.now, receipt = () => {} }) {
  if (!token) throw new Error('GITHUB_CODESPACES_TOKEN required');
  let pending, lastStart = -Infinity, lastVerified = null;
  async function github(method) {
    const response = await fetchImpl(`https://api.github.com/user/codespaces/${expected.name}${method === 'POST' ? '/start' : ''}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok) { const e = new Error(`GitHub HTTP ${response.status}: check owner permission, quota and provider availability`); e.code = response.status; throw e; }
    const item = await response.json();
    if (item.name !== expected.name || item.owner?.login !== expected.owner || item.repository?.full_name !== expected.repo) throw new Error('Codespace identity mismatch; refusing');
    return item;
  }
  async function inspect() {
    const item = await github('GET');
    const base = { codespace: expected.name, owner: expected.owner, providerState: item.state, lastVerified };
    if (item.state === 'Shutdown') return { ...base, state: 'SLEEPING' };
    if (['Starting', 'Created', 'Queued', 'Provisioning', 'Rebuilding'].includes(item.state)) return { ...base, state: 'STARTING' };
    if (item.state !== 'Available') return { ...base, state: 'BLOCKED', reason: `Provider state: ${item.state}` };
    // A running VM, HTTP 200, or live tunnel process is not an MCP success receipt.
    if (!probe) return { ...base, state: 'RECONNECTING', reason: 'Codespace available; authenticated MCP verifier is not configured' };
    const evidence = await probe();
    const ok = evidence?.localServer === true && evidence?.tunnelConnected === true && evidence?.phoenixToolSucceeded === true && evidence?.cosToolSucceeded === true && typeof evidence?.receiptDigest === 'string' && /^sha256:[a-f0-9]{64}$/.test(evidence.receiptDigest) && Number.isFinite(evidence.observedAt) && now() - evidence.observedAt >= 0 && now() - evidence.observedAt < 60000;
    if (ok) lastVerified = { observedAt: evidence.observedAt, receiptDigest: evidence.receiptDigest };
    return { ...base, lastVerified, state: ok ? 'READY' : 'RECONNECTING', reason: ok ? undefined : 'Fresh authenticated MCP success evidence is missing' };
  }
  async function action(wake) {
    try {
      let result = await inspect();
      if (wake && result.state === 'SLEEPING') {
        if (now() - lastStart < 60000) return { ...result, state: 'STARTING', reason: 'Start already requested; waiting for GitHub' };
        await github('POST'); lastStart = now();
        result = { ...result, state: 'STARTING', reason: 'GitHub accepted start; MCP recovery has not yet been verified' };
      }
      receipt({ at: now(), action: wake ? 'wake' : 'status', state: result.state });
      return result;
    } catch (e) {
      const result = { state: 'BLOCKED', reason: e.code ? e.message : 'Provider, identity or MCP verification failed; inspect protected operator logs', lastVerified };
      receipt({ at: now(), action: wake ? 'wake' : 'status', state: result.state, code: e.code || 'VERIFY_FAILED' });
      return result;
    }
  }
  return { status: () => action(false), wake: () => { if (pending) return pending; pending = action(true).finally(() => { pending = undefined; }); return pending; } };
}

const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="apple-mobile-web-app-capable" content="yes"><title>WAKE UBERBOND</title><style>body{font:18px system-ui;max-width:560px;margin:10vh auto;padding:24px;background:#101725;color:#f5f7fc}button,input{box-sizing:border-box;width:100%;padding:20px;border-radius:16px;margin:12px 0;font-size:20px}button{background:#7fffd1;color:#102024;border:0;font-weight:800}pre{white-space:pre-wrap;font:15px system-ui}small{color:#c2cee0}</style><h1>PHOENIX Wake</h1><label>Owner access key<input type="password" id="key" autocomplete="current-password"></label><button id="login">UNLOCK</button><button id="wake" disabled>WAKE UBERBOND</button><pre id="state">LOCKED</pre><small>Safari → Share → Add to Home Screen. GitHub credentials stay on the server. READY requires fresh tool-call evidence.</small><script src="/wake.js"></script></html>`;
const client = `const key=document.querySelector('#key'),out=document.querySelector('#state'),wake=document.querySelector('#wake');let timer;async function call(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Phoenix-Wake':'1'},body:JSON.stringify(body||{})});const d=await r.json();out.textContent=JSON.stringify(d,null,2);return r.ok;}document.querySelector('#login').onclick=async()=>{try{if(await call('/login',{key:key.value})){key.value='';wake.disabled=false;}}catch{out.textContent='BLOCKED: wake controller unreachable';}};wake.onclick=async()=>{wake.disabled=true;clearInterval(timer);try{await call('/wake');let n=0;timer=setInterval(async()=>{try{await call('/status');}catch{out.textContent='BLOCKED: status unavailable';}if(++n>=24)clearInterval(timer);},5000);}catch{out.textContent='BLOCKED: wake controller unreachable';}finally{wake.disabled=false;}};`;

export function createWakeServer({ origin, ownerKey, engine, now = Date.now }) {
  if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://') || !ownerKey || ownerKey.length < 32) throw new Error('HTTPS WAKE_ORIGIN and owner key of at least 32 characters required');
  const sessions = new Map(); let attempts = [], requests = [];
  return createServer(async (req, res) => {
    const send = (code, value, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" }); res.end(type === 'application/json' ? JSON.stringify(value) : value); };
    if (req.method === 'GET' && req.url === '/') return send(200, page, 'text/html');
    if (req.method === 'GET' && req.url === '/wake.js') return send(200, client, 'text/javascript');
    if (req.method !== 'POST' || !['/login', '/wake', '/status'].includes(req.url)) return send(404, { state: 'BLOCKED' });
    if (req.headers.origin !== origin || req.headers['x-phoenix-wake'] !== '1' || req.headers['content-type'] !== 'application/json') return send(403, { state: 'BLOCKED', reason: 'Origin/CSRF refusal' });
    let text = ''; try { for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 2048) return send(413, { state: 'BLOCKED' }); } } catch { return send(400, { state: 'BLOCKED' }); }
    if (req.url === '/login') {
      attempts = attempts.filter(t => now() - t < 60000); if (attempts.length >= 5) return send(429, { state: 'BLOCKED', reason: 'Login rate limit' }); attempts.push(now());
      let input; try { input = JSON.parse(text); } catch { return send(400, { state: 'BLOCKED' }); }
      if (typeof input.key !== 'string' || !equal(input.key, ownerKey)) return send(401, { state: 'BLOCKED', reason: 'Owner authentication required' });
      for (const [k,v] of sessions) if (v < now()) sessions.delete(k);
      if (sessions.size >= 20) return send(429, { state: 'BLOCKED', reason: 'Session limit' });
      const secret = randomBytes(32).toString('hex'); sessions.set(createHash('sha256').update(secret).digest('hex'), now() + 12 * 3600000);
      res.setHeader('Set-Cookie', '__Host-phoenix-wake=' + secret + '; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'); return send(200, { state: 'UNLOCKED' });
    }
    const secret = /(?:^|; )__Host-phoenix-wake=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1] || '';
    if ((sessions.get(createHash('sha256').update(secret).digest('hex')) || 0) <= now()) return send(401, { state: 'BLOCKED', reason: 'Owner authentication required' });
    requests = requests.filter(t => now() - t < 60000); if (requests.length >= 30) return send(429, { state: 'BLOCKED', reason: 'Request rate limit' }); requests.push(now());
    return send(200, await (req.url === '/wake' ? engine.wake() : engine.status()));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const engine = createWakeEngine({ token: process.env.GITHUB_CODESPACES_TOKEN, receipt: event => process.stdout.write(JSON.stringify(event) + '\n') });
  createWakeServer({ origin: process.env.WAKE_ORIGIN, ownerKey: process.env.WAKE_OWNER_KEY, engine }).listen(Number(process.env.PORT || 8080), '127.0.0.1');
}
