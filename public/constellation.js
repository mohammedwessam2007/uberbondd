(() => {
'use strict';
const $ = id => document.getElementById(id);
const SENTINEL = 'owner-session-cookie';
let token = '', data = null, sel = null, lens = 'pipeline', view = { x: 0, y: 0, k: 0.7 };
let pos = new Map(), grid = new Map(), pulses = [], playing = false, raf = 0, dirty = true, expandId = null, atParam = null, gsRun = null;
const cv = $('cv'), ctx = cv.getContext('2d');
const COLORS = { pipeline: { DISCOVERED: '#64748b', QUEUED: '#38bdf8', SENT: '#a78bfa', REPLIED: '#f7a327', HALTED: '#f87171', PAID: '#4ade80' }, type: { core: '#f7a327', offer: '#38bdf8', sender: '#a78bfa', infra: '#94a3b8', cluster: '#64748b', prospect: '#64748b' } };
const LENSES = [['pipeline', 'Pipeline'], ['economic', 'Economic'], ['proof', 'Evidence'], ['buyer', 'Buyer'], ['infrastructure', 'Infra'], ['uncertainty', 'Uncertainty']];
const set = (el, s) => { el.textContent = s; };
const el = (tag, s, cls) => { const e = document.createElement(tag); if (s !== undefined) e.textContent = s; if (cls) e.className = cls; return e; };

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (token && token !== SENTINEL) headers.authorization = `Bearer ${token}`;
  if (opts.body) headers['content-type'] = 'application/json';
  const res = await fetch(path, { ...opts, headers, cache: 'no-store' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(body.error || res.statusText); e.status = res.status; throw e; }
  return body;
}

// ---- deterministic layout: no randomness, positions stable across refreshes
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
function layout(d) {
  const next = new Map(); next.set('core:gspot', { x: 0, y: 0 });
  const by = t => d.nodes.filter(n => n.type === t);
  const ring = (list, r, a0 = 0) => list.forEach((n, i) => { const a = a0 + (i / Math.max(1, list.length)) * Math.PI * 2; next.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r }); });
  ring(by('offer'), 230); ring(by('sender'), 430, 0.4); ring(by('infra'), 590, 0.9);
  const groups = new Map();
  for (const n of d.nodes.filter(n => n.type === 'prospect' || n.type === 'cluster')) {
    const offer = n.offerId || (n.id.startsWith('cluster:') ? n.id.split('|')[1] : null);
    const key = offer && next.has(`offer:${offer}`) ? `offer:${offer}` : 'core:gspot';
    (groups.get(key) || groups.set(key, []).get(key)).push(n);
  }
  for (const [key, list] of groups) {
    const o = next.get(key); const out = key === 'core:gspot' ? 0 : 1.7; const base = { x: o.x * out, y: o.y * out };
    list.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.id.localeCompare(b.id)).forEach((n, i) => {
      const r = (key === 'core:gspot' ? 120 : 46) + 16 * Math.sqrt(i); const a = i * 2.39996 + hash(key) * 6;
      next.set(n.id, { x: base.x + Math.cos(a) * r, y: base.y + Math.sin(a) * r });
    });
  }
  pos = next;
  grid = new Map();
  for (const n of d.nodes) { const p = pos.get(n.id); if (!p) continue; const key = `${Math.floor(p.x / 80)},${Math.floor(p.y / 80)}`; (grid.get(key) || grid.set(key, []).get(key)).push(n); }
}

// ---- lens styling (only real fields; missing data is grey, never invented)
const heat = v => `hsl(${Math.round(210 - 170 * Math.max(0, Math.min(1, v)))} 80% 58%)`;
function style(n) {
  const base = n.type === 'prospect' || n.type === 'cluster' ? (COLORS.pipeline[n.stage] || '#64748b') : COLORS.type[n.type];
  let color = base, alpha = 1, ring = null;
  if (lens === 'economic') { color = n.type === 'prospect' || n.type === 'cluster' ? heat(Math.min(1, (n.mass || 0) / 6)) : base; if (n.stage === 'PAID') ring = '#4ade80'; }
  else if (lens === 'proof') { color = n.uncertainty === undefined ? '#475569' : heat(1 - n.uncertainty); }
  else if (lens === 'buyer') { color = { EXPLICIT_DEMAND: '#4ade80', SIGNAL_STACK: '#38bdf8', FIT_ONLY: '#a78bfa' }[n.lane] || (n.type === 'prospect' ? '#475569' : base); }
  else if (lens === 'infrastructure') { if (n.type === 'sender' || n.type === 'infra') color = { OK: '#4ade80', DEGRADED: '#f87171', UNKNOWN: '#64748b' }[n.health] || '#64748b'; else alpha = 0.25; }
  else if (lens === 'uncertainty') { alpha = 1 - 0.75 * (n.uncertainty ?? 1); if ((n.uncertainty ?? 1) > 0.7) ring = '#f7a327'; }
  if (n.halted) ring = '#f87171';
  return { color, alpha, ring };
}

// ---- rendering
function resize() { const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); dirty = true; schedule(); }
const toScreen = p => ({ x: (p.x - view.x) * view.k + cv.clientWidth / 2, y: (p.y - view.y) * view.k + cv.clientHeight / 2 });
const toWorld = (sx, sy) => ({ x: (sx - cv.clientWidth / 2) / view.k + view.x, y: (sy - cv.clientHeight / 2) / view.k + view.y });
function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(ts) {
  raf = 0;
  const w = cv.clientWidth, h = cv.clientHeight;
  ctx.clearRect(0, 0, w, h);
  if (!data) return;
  const k = view.k, showAllLabels = k >= 1.8, showSome = k >= 0.7;
  const vis = n => { const p = pos.get(n.id); if (!p) return null; const s = toScreen(p); return s.x > -40 && s.x < w + 40 && s.y > -40 && s.y < h + 40 ? s : null; };
  const screen = new Map();
  for (const n of data.nodes) { const s = vis(n); if (s) screen.set(n.id, s); }
  // edges: structural edges only when zoomed in; causal edges always, brighter when recent
  const now = Date.parse(data.at);
  for (const e of data.edges) {
    const a = screen.get(e.from), b = screen.get(e.to);
    if (!a && !b) continue;
    const pa = pos.get(e.from), pb = pos.get(e.to); if (!pa || !pb) continue;
    const A = a || toScreen(pa), B = b || toScreen(pb);
    if (e.causal) { const age = Math.max(0, (now - e.at) / 3600000); ctx.strokeStyle = `rgba(247,163,39,${Math.max(0.15, 0.9 - age / 48)})`; ctx.lineWidth = 1.5; }
    else if (k > 0.9 && e.kind !== 'contains') { ctx.strokeStyle = 'rgba(100,116,139,.18)'; ctx.lineWidth = 1; }
    else if (e.kind === 'contains' || e.kind === 'governs' || e.kind === 'sends-through' || e.kind === 'depends-on') { ctx.strokeStyle = 'rgba(100,116,139,.25)'; ctx.lineWidth = Math.min(4, 1 + Math.log2(1 + (e.weight || 1)) * 0.3); }
    else continue;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  }
  // nodes
  for (const n of data.nodes) {
    const s = screen.get(n.id); if (!s) continue;
    const st = style(n); const r = Math.max(2.5, (3 + Math.sqrt(n.mass || 1) * 2.4) * Math.min(1.6, Math.sqrt(k)));
    ctx.globalAlpha = st.alpha; ctx.fillStyle = st.color; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.2832); ctx.fill();
    if (st.ring) { ctx.strokeStyle = st.ring; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, r + 3, 0, 6.2832); ctx.stroke(); }
    if (n.id === sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, r + 6, 0, 6.2832); ctx.stroke(); }
    ctx.globalAlpha = 1;
    const major = n.type !== 'prospect';
    if (major || showAllLabels || (showSome && n.rank && n.rank <= 12)) {
      ctx.fillStyle = '#cbd5e1'; ctx.font = `${major ? 12 : 11}px system-ui`; ctx.textAlign = 'center';
      ctx.fillText(n.type === 'cluster' ? `${n.label} ×${n.count}` : n.label, s.x, s.y - r - 6);
      if (k >= 3 && n.stage) { ctx.fillStyle = '#94a3b8'; ctx.font = '10px system-ui'; ctx.fillText(n.stage + (n.lane ? ` · ${n.lane}` : ''), s.x, s.y + r + 13); }
    }
  }
  // real event pulses (only while replaying actual events)
  pulses = pulses.filter(p => ts - p.t0 < 900);
  for (const p of pulses) {
    const a = pos.get(p.from), b = pos.get(p.to); if (!a || !b) continue;
    const f = (ts - p.t0) / 900, q = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, s = toScreen(q);
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 6.2832); ctx.fill();
  }
  dirty = false;
  if (pulses.length || playing) schedule();
}

// ---- interaction: pointer pan, pinch/wheel zoom, tap select
const ptrs = new Map(); let moved = 0, lastPinch = 0;
cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; });
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy);
  if (ptrs.size === 2) {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (lastPinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / lastPinch); lastPinch = d;
  } else { view.x -= dx / view.k; view.y -= dy / view.k; ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
  schedule();
});
const up = e => { const was = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); lastPinch = 0; if (was && moved < 8 && ptrs.size === 0) tap(e.clientX, e.clientY); };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); lastPinch = 0; });
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
function zoomAt(cx, cy, f) { const r = cv.getBoundingClientRect(), w0 = toWorld(cx - r.left, cy - r.top); view.k = Math.max(0.15, Math.min(8, view.k * f)); const w1 = toWorld(cx - r.left, cy - r.top); view.x += w0.x - w1.x; view.y += w0.y - w1.y; set($('zoomhint'), `zoom ${view.k.toFixed(2)}× · ${view.k < 0.7 ? 'organism' : view.k < 1.8 ? 'clusters / top prospects' : view.k < 3 ? 'all prospects' : 'X-Ray detail'}`); schedule(); }
function tap(cx, cy) {
  if (!data) return; const r = cv.getBoundingClientRect(), w = toWorld(cx - r.left, cy - r.top); let best = null, bd = (22 / view.k) ** 2;
  const gx = Math.floor(w.x / 80), gy = Math.floor(w.y / 80);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const n of grid.get(`${gx + i},${gy + j}`) || []) { const p = pos.get(n.id), d = (p.x - w.x) ** 2 + (p.y - w.y) ** 2; if (d < bd) { bd = d; best = n; } }
  sel = best ? best.id : null; schedule();
  if (best?.type === 'cluster') { expandId = best.id; load(); }
  else if (best?.type === 'prospect') loadXray(best.id.slice('prospect:'.length));
}

// ---- panels (all dynamic text through textContent: replies are untrusted)
function renderPanels(d, q, rr, rel, gs) {
  const lg = $('legend'); lg.replaceChildren();
  for (const [k, c] of Object.entries(COLORS.pipeline)) { const s = el('span', k.toLowerCase()); const i = el('i'); i.style.background = c; s.prepend(i); lg.append(s); }
  set($('at'), (d.replay ? 'REPLAY ' : 'LIVE ') + d.at.slice(0, 16).replace('T', ' ') + 'Z');
  set($('status'), d.clustered ? 'CLUSTERED · ' + d.nodes.length + ' nodes' : d.nodes.length + ' nodes');
  gsRun = gs.run; set($('gs-state'), gsRun ? gsRun.state : 'no run');
  const st = $('gs-stages'); st.replaceChildren();
  const hist = {}; for (const i of gsRun?.items || []) hist[i.stage] = (hist[i.stage] || 0) + 1;
  for (const [k2, v] of Object.entries(hist)) st.append(el('span', `${k2} ${v}`));
  $('gs-authorize').disabled = !(gsRun?.batch?.items?.length && !gsRun.authorization); $('gs-dispatch').disabled = !gsRun?.authorization || !!gsRun.authorization.consumedAt;
  set($('rr-count'), String(rr.counts.material)); const rl = $('rr'); rl.replaceChildren();
  for (const i of rr.items.slice(0, 20)) { const li = el('li'); li.append(el('b', `${i.label.toUpperCase()} · ${i.urgency} · ${i.automation}`), el('div', i.untrustedBody.slice(0, 280)), el('div', `Mohamed replies manually · prospect ${i.prospectId || '?'}${i.injectionFlags.length ? ' · INJECTION FLAGGED' : ''}`, 'note')); rl.append(li); }
  set($('mq-count'), `${q.counts.ranked} ranked · ${q.counts.excluded} excluded`); const ml = $('mq'); ml.replaceChildren();
  for (const i of q.items.slice(0, 15)) { const li = el('li'); li.append(el('b', `#${i.rank} ${i.prospectId} · ${i.lane}`), el('div', `score ${i.rankScore} · demand ${i.explanation.demand.score} · fit ${i.explanation.offerFit.score} · exp. contribution ¢${i.explanation.expectedContributionCents} (${i.explanation.expectedContributionBasis})`, 'note')); ml.append(li); }
  const r = $('rel'); r.replaceChildren();
  r.append(el('div', `Verdict: ${rel.funnel.verdict}`)); r.append(el('div', `Escape: ${rel.escape.decision} (${rel.escape.reason})`)); r.append(el('div', `Funnel: ${Object.entries(rel.counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`, 'note'));
}
async function loadXray(id) {
  const b = $('xr-body'); b.replaceChildren(el('div', 'Loading…'));
  try { const x = await api(`/api/revenue/xray?prospectId=${encodeURIComponent(id)}`); b.replaceChildren();
    if (!x.ok) { b.append(el('div', x.state)); return; }
    b.append(el('b', `${x.prospect.company || x.prospect.id} · ${x.stage}`));
    b.append(el('div', x.moneyQueue ? `Rank ${x.moneyQueue.rank} · ${x.moneyQueue.lane}` : 'Not in Money Queue', 'note'));
    if (x.gspot) b.append(el('div', `G-SPOT: ${x.gspot.stage}${x.gspot.blocks.length ? ' · blocked: ' + x.gspot.blocks.join(', ') : ''}`, 'note'));
    for (const t of x.timeline) b.append(el('div', `${t.at.slice(0, 16)} ${t.type}${t.inbox ? ' via ' + t.inbox : ''}`, 'note'));
    for (const u of x.unknowns) b.append(el('div', `UNKNOWN: ${u}`, 'warn'));
  } catch (e) { b.replaceChildren(el('div', e.message, 'err')); }
}

// ---- data
let loading = false, fitted = false;
function fit() {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const p of pos.values()) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  if (minX > maxX) return;
  view.x = (minX + maxX) / 2; view.y = (minY + maxY) / 2;
  view.k = Math.max(0.15, Math.min(1.2, 0.85 * Math.min(cv.clientWidth / Math.max(1, maxX - minX), cv.clientHeight / Math.max(1, maxY - minY))));
}
async function load() {
  if (loading) return; loading = true;
  try {
    const qs = new URLSearchParams(); if (atParam) qs.set('at', atParam); if (expandId) qs.set('expand', expandId);
    const [d, q, rr, rel, gs] = await Promise.all([api('/api/revenue/constellation?' + qs), api('/api/revenue/money-queue'), api('/api/revenue/reply-radar'), api('/api/revenue/reliability'), api('/api/revenue/gspot')]);
    data = d; layout(d); if (!fitted) { fit(); fitted = true; } renderPanels(d, q, rr, rel, gs); $('auth').hidden = true; set($('auth-error'), ''); dirty = true; schedule();
  } catch (e) {
    if (e.status === 401) { token = ''; data = null; $('auth').hidden = false; set($('status'), 'LOCKED'); ctx.clearRect(0, 0, cv.width, cv.height); } else set($('status'), 'ERROR ' + e.message);
  } finally { loading = false; }
}

// ---- controls
for (const [id, label] of LENSES) { const b = el('button', label); b.type = 'button'; b.dataset.lens = id; b.onclick = () => { lens = id; for (const x of $('lenses').children) x.classList.toggle('on', x.dataset.lens === id); schedule(); }; if (id === lens) b.classList.add('on'); $('lenses').append(b); }
let scrubT = 0;
$('scrub').addEventListener('input', () => { clearTimeout(scrubT); scrubT = setTimeout(() => { const tr = data?.timeRange; if (!tr) return; const a = Date.parse(tr.from), b = Date.parse(tr.to), f = $('scrub').value / 1000; atParam = f >= 1 ? null : new Date(a + (b - a) * f).toISOString(); load(); }, 250); });
$('live').onclick = () => { atParam = null; expandId = null; $('scrub').value = 1000; load(); };
$('play').onclick = () => {
  if (!data?.events?.length || playing) return; playing = true; const evs = data.events.slice(-60); let i = 0;
  const step = () => { if (i >= evs.length || !playing) { playing = false; return; } const e = evs[i++]; const pid = e.prospectId && `prospect:${e.prospectId}`;
    const from = e.type === 'sent' && e.inbox ? `sender:${e.inbox}` : pid, to = e.type === 'sent' ? pid : 'core:gspot';
    if (pos.has(from) && pos.has(to)) { pulses.push({ from, to, t0: performance.now(), color: e.type === 'cleared_payment' ? '#4ade80' : e.type === 'reply' ? '#f7a327' : '#a78bfa' }); schedule(); }
    setTimeout(step, 350); };
  step();
};
async function act(path, body) { try { const r = await api(path, { method: 'POST', body: JSON.stringify(body || {}) }); await load(); return r; } catch (e) { set($('gs-note'), `${e.message}`); } }
$('gs-plan').onclick = () => act('/api/revenue/gspot/plan', {});
$('gs-prepare').onclick = () => gsRun && act('/api/revenue/gspot/prepare-batch', { runId: gsRun.runId });
$('gs-dispatch').onclick = async () => { if (!gsRun) return; const r = await act('/api/revenue/gspot/dispatch', { runId: gsRun.runId }); if (r) set($('gs-note'), r.dryRun ? 'Dry run: zero effects. Live dispatch is not bound on this surface.' : 'Dispatched.'); };
$('gs-authorize').onclick = () => { if (!gsRun?.batch) return; set($('confirm-body'), `run ${gsRun.runId}\ndigest ${gsRun.batch.batchDigest}\nexpires ${gsRun.batch.expiresAt}\n` + gsRun.batch.items.map(i => `• ${i.prospectId} via ${i.senderId} (message ${i.messageDigest.slice(0, 12)}…)`).join('\n')); $('confirm').showModal(); };
$('confirm').addEventListener('close', () => { if ($('confirm').returnValue === 'ok' && gsRun?.batch) act('/api/revenue/gspot/authorize', { runId: gsRun.runId, batchDigest: gsRun.batch.batchDigest }); });
$('auth-form').addEventListener('submit', e => { e.preventDefault(); token = $('owner-token').value.trim(); $('owner-token').value = ''; if (!token) { set($('auth-error'), 'Token required (once per device).'); return; } load(); });
addEventListener('resize', resize); addEventListener('visibilitychange', () => { if (!document.hidden && data) load(); });
setInterval(() => { if (!document.hidden && data && !atParam && !playing) load(); }, 20000);
resize(); load();
})();
