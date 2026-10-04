(() => {
'use strict';
const $ = id => document.getElementById(id);
const SENTINEL = 'owner-session-cookie';
const REDUCED = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
let token = '', data = null, sel = null, lens = 'pipeline', view = { x: 0, y: 0, k: 0.7 };
let pos = new Map(), grid = new Map(), pulses = [], playing = false, raf = 0, expandId = null, atParam = null, gsRun = null;
const cv = $('cv'), ctx = cv.getContext('2d');
const COLORS = {
  pipeline: { DISCOVERED: '#6f7f9f', QUEUED: '#53d8ff', SENT: '#ad8cff', REPLIED: '#ffb454', HALTED: '#ff6f7d', PAID: '#54f6a9' },
  type: { core: '#ffd166', offer: '#53d8ff', sender: '#ad8cff', infra: '#9aa9c8', cluster: '#7083a8', prospect: '#7083a8' }
};
const LENSES = [['pipeline', 'Pipeline'], ['economic', 'Economic'], ['proof', 'Evidence'], ['buyer', 'Buyer'], ['infrastructure', 'Infra'], ['uncertainty', 'Uncertainty']];
const TAU = Math.PI * 2;
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

// ---- deterministic spatial memory: no random layout churn across reloads
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
function layout(d) {
  const next = new Map(); next.set('core:gspot', { x: 0, y: 0 });
  const by = t => d.nodes.filter(n => n.type === t);
  const ring = (list, r, a0 = 0) => list.forEach((n, i) => { const a = a0 + (i / Math.max(1, list.length)) * TAU; next.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r }); });
  ring(by('offer'), 230); ring(by('sender'), 435, 0.4); ring(by('infra'), 605, 0.9);
  const groups = new Map();
  for (const n of d.nodes.filter(n => n.type === 'prospect' || n.type === 'cluster')) {
    const offer = n.offerId || (n.id.startsWith('cluster:') ? n.id.split('|')[1] : null);
    const key = offer && next.has(`offer:${offer}`) ? `offer:${offer}` : 'core:gspot';
    (groups.get(key) || groups.set(key, []).get(key)).push(n);
  }
  for (const [key, list] of groups) {
    const o = next.get(key); const out = key === 'core:gspot' ? 0 : 1.68; const base = { x: o.x * out, y: o.y * out };
    list.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.id.localeCompare(b.id)).forEach((n, i) => {
      const r = (key === 'core:gspot' ? 125 : 48) + 16 * Math.sqrt(i); const a = i * 2.39996 + hash(key) * TAU;
      next.set(n.id, { x: base.x + Math.cos(a) * r, y: base.y + Math.sin(a) * r });
    });
  }
  pos = next; grid = new Map();
  for (const n of d.nodes) { const p = pos.get(n.id); if (!p) continue; const key = `${Math.floor(p.x / 80)},${Math.floor(p.y / 80)}`; (grid.get(key) || grid.set(key, []).get(key)).push(n); }
}

// ---- lens semantics: missing data stays grey, never invented
const heat = v => `hsl(${Math.round(210 - 170 * Math.max(0, Math.min(1, v)))} 82% 60%)`;
function style(n) {
  const base = n.type === 'prospect' || n.type === 'cluster' ? (COLORS.pipeline[n.stage] || '#7083a8') : COLORS.type[n.type];
  let color = base, alpha = 1, ring = null;
  if (lens === 'economic') { color = n.type === 'prospect' || n.type === 'cluster' ? heat(Math.min(1, (n.mass || 0) / 6)) : base; if (n.stage === 'PAID') ring = '#54f6a9'; }
  else if (lens === 'proof') { color = n.uncertainty === undefined ? '#526078' : heat(1 - n.uncertainty); }
  else if (lens === 'buyer') { color = { EXPLICIT_DEMAND: '#54f6a9', SIGNAL_STACK: '#53d8ff', FIT_ONLY: '#ad8cff' }[n.lane] || (n.type === 'prospect' ? '#526078' : base); }
  else if (lens === 'infrastructure') { if (n.type === 'sender' || n.type === 'infra') color = { OK: '#54f6a9', DEGRADED: '#ff6f7d', UNKNOWN: '#7083a8' }[n.health] || '#7083a8'; else alpha = 0.2; }
  else if (lens === 'uncertainty') { alpha = 0.2 + 0.8 * (1 - (n.uncertainty ?? 1)); if ((n.uncertainty ?? 1) > 0.65) ring = '#ffb454'; }
  if (n.halted) ring = '#ff6f7d';
  return { color, alpha, ring, confidence: 1 - Math.max(0, Math.min(1, n.uncertainty ?? 1)) };
}
function rgb(hex) { const h = String(hex).replace('#', ''); const x = h.length === 3 ? h.split('').map(c => c + c).join('') : h; const n = parseInt(x, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }

// ---- renderer: every luminous data mark is tied to runtime state
function resize() { const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); schedule(); }
const toScreen = p => ({ x: (p.x - view.x) * view.k + cv.clientWidth / 2, y: (p.y - view.y) * view.k + cv.clientHeight / 2 });
const toWorld = (sx, sy) => ({ x: (sx - cv.clientWidth / 2) / view.k + view.x, y: (sy - cv.clientHeight / 2) / view.k + view.y });
function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
function curve(A, B, seed = 0.5) {
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.max(1, Math.hypot(dx, dy));
  const bend = (seed - .5) * Math.min(90, len * .22);
  return { x: (A.x + B.x) / 2 - dy / len * bend, y: (A.y + B.y) / 2 + dx / len * bend };
}
function pathEdge(A, B, seed) { const C = curve(A, B, seed); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(C.x, C.y, B.x, B.y); return C; }
function rounded(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function polygon(x, y, r, sides, rotation = 0) { ctx.beginPath(); for (let i = 0; i < sides; i++) { const a = rotation + i / sides * TAU; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); }
function nodeRadius(n, k) { return Math.max(3, (3.6 + Math.sqrt(Math.max(.2, n.mass || 1)) * 2.7) * Math.min(1.65, Math.sqrt(k))); }
function activeGspot() { const s = String(gsRun?.state || ''); return Boolean(s) && !/COMPLETE|BLOCKED|NO_RUN|IDLE|DRY_RUN_COMPLETE/i.test(s); }

function drawSemanticGuides(screen, ts) {
  const core = screen.get('core:gspot'); if (!core) return;
  ctx.save();
  for (const [radius, alpha] of [[230, .055], [435, .035], [605, .025]]) {
    const rr = radius * view.k; ctx.strokeStyle = `rgba(113,151,223,${alpha})`; ctx.lineWidth = 1; ctx.setLineDash([2, 8]);
    ctx.beginPath(); ctx.arc(core.x, core.y, rr, 0, TAU); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Real offer clusters get fields whose strength follows actual attached mass.
  for (const n of data.nodes.filter(n => n.type === 'offer')) {
    const s = screen.get(n.id); if (!s) continue;
    const mass = data.edges.filter(e => e.from === n.id && (e.kind === 'contains' || e.kind === 'targets')).reduce((sum, e) => sum + Number(e.weight || 1), 0);
    if (!mass) continue;
    const radius = Math.min(190, 48 + Math.log2(1 + mass) * 24) * Math.min(1.3, Math.max(.55, view.k));
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, radius);
    const c = lens === 'economic' ? '#54f6a9' : '#53d8ff';
    g.addColorStop(0, rgba(c, .045 + Math.min(.08, mass / 2500))); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, radius, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawNode(n, s, st, k, ts) {
  const r = nodeRadius(n, k), chosen = n.id === sel;
  ctx.save(); ctx.globalAlpha = st.alpha;
  // Confidence aura is data, not decoration.
  if (st.confidence > .05 || chosen || n.type === 'core') {
    const auraR = r + 7 + st.confidence * 14;
    const g = ctx.createRadialGradient(s.x, s.y, Math.max(1, r * .4), s.x, s.y, auraR);
    g.addColorStop(0, rgba(st.color, .18 * st.confidence + (n.type === 'core' ? .12 : 0))); g.addColorStop(1, rgba(st.color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, auraR, 0, TAU); ctx.fill();
  }
  ctx.shadowColor = rgba(st.color, n.type === 'core' ? .8 : .38); ctx.shadowBlur = n.type === 'core' ? 24 : 9;
  const fill = ctx.createRadialGradient(s.x - r * .28, s.y - r * .3, 1, s.x, s.y, Math.max(3, r));
  fill.addColorStop(0, '#ffffff'); fill.addColorStop(.14, st.color); fill.addColorStop(1, rgba(st.color, .42)); ctx.fillStyle = fill;

  if (n.type === 'offer') { polygon(s.x, s.y, r + 2, 6, Math.PI / 6); ctx.fill(); }
  else if (n.type === 'sender') { polygon(s.x, s.y, r + 1, 4, Math.PI / 4); ctx.fill(); }
  else if (n.type === 'infra') { rounded(s.x - r, s.y - r, r * 2, r * 2, Math.max(2, r * .34)); ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(s.x, s.y, n.type === 'cluster' ? r + 2 : r, 0, TAU); ctx.fill(); }
  ctx.shadowBlur = 0;

  if (n.type === 'core') {
    const heartbeat = !REDUCED && gsRun ? 1 + .10 * Math.sin(ts / 240) : 1;
    ctx.strokeStyle = rgba('#ffd166', .78); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(s.x, s.y, (r + 8) * heartbeat, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(activeGspot() ? '#53d8ff' : '#ad8cff', .32); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(s.x, s.y, (r + 15) * heartbeat, -Math.PI / 2, -Math.PI / 2 + TAU * .72); ctx.stroke();
  }
  if (n.type === 'cluster') {
    ctx.strokeStyle = rgba(st.color, .38); ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.arc(s.x, s.y, r + 7, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  if ((n.uncertainty ?? 0) > .65) {
    ctx.strokeStyle = rgba('#ffb454', .7); ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(s.x, s.y, r + 5, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  if (st.ring) { ctx.strokeStyle = st.ring; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, r + 4, 0, TAU); ctx.stroke(); }
  if (chosen) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(s.x, s.y, r + 8, 0, TAU); ctx.stroke(); }
  if (n.halted) { ctx.strokeStyle = '#ff6f7d'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(s.x-r*.55,s.y-r*.55);ctx.lineTo(s.x+r*.55,s.y+r*.55);ctx.moveTo(s.x+r*.55,s.y-r*.55);ctx.lineTo(s.x-r*.55,s.y+r*.55);ctx.stroke(); }
  ctx.restore();
  return r;
}

function drawLabel(n, s, r, major, k) {
  if (!(major || k >= 1.8 || (k >= .7 && n.rank && n.rank <= 12))) return;
  const title = n.type === 'cluster' ? `${n.label} ×${n.count}` : n.label;
  ctx.save(); ctx.font = `${major ? 600 : 500} ${major ? 11 : 10}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const width = Math.min(220, ctx.measureText(title).width + 12), y = s.y - r - 11;
  ctx.fillStyle = 'rgba(3,7,15,.72)'; rounded(s.x - width/2, y - 8, width, 16, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(132,161,218,.13)'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = major ? '#e5edff' : '#afbdd8'; ctx.fillText(title, s.x, y);
  if (k >= 3 && n.stage) { ctx.fillStyle = '#74829e'; ctx.font = '9px system-ui'; ctx.fillText(n.stage + (n.lane ? ` · ${n.lane}` : ''), s.x, s.y + r + 12); }
  ctx.restore();
}

function frame(ts) {
  raf = 0; const w = cv.clientWidth, h = cv.clientHeight; ctx.clearRect(0, 0, w, h); if (!data) return;
  const k = view.k;
  const vis = n => { const p = pos.get(n.id); if (!p) return null; const s = toScreen(p); return s.x > -80 && s.x < w + 80 && s.y > -80 && s.y < h + 80 ? s : null; };
  const screen = new Map(); for (const n of data.nodes) { const s = vis(n); if (s) screen.set(n.id, s); }
  drawSemanticGuides(screen, ts);

  const now = Date.parse(data.at);
  for (const e of data.edges) {
    const a = screen.get(e.from), b = screen.get(e.to); if (!a && !b) continue;
    const pa = pos.get(e.from), pb = pos.get(e.to); if (!pa || !pb) continue;
    const A = a || toScreen(pa), B = b || toScreen(pb), seed = hash(`${e.from}>${e.to}:${e.kind}`);
    let stroke = 'rgba(100,123,170,.14)', width = 1, glow = 0;
    if (e.causal) { const age = Math.max(0, (now - e.at) / 3600000); const alpha = Math.max(.16, .92 - age / 48); stroke = e.kind === 'cleared-payment' ? rgba('#54f6a9', alpha) : e.kind === 'reply' ? rgba('#ffb454', alpha) : rgba('#ad8cff', alpha); width = 1.6; glow = 8; }
    else if (e.kind === 'contains' || e.kind === 'governs' || e.kind === 'sends-through' || e.kind === 'depends-on') { width = Math.min(3.5, .7 + Math.log2(1 + (e.weight || 1)) * .28); stroke = 'rgba(113,139,193,.18)'; }
    else if (k <= .9) continue;
    ctx.save(); ctx.strokeStyle = stroke; ctx.lineWidth = width; if (glow) { ctx.shadowColor = stroke; ctx.shadowBlur = glow; }
    pathEdge(A, B, seed); ctx.stroke(); ctx.restore();
  }

  for (const n of data.nodes) { const s = screen.get(n.id); if (!s) continue; const st = style(n); const r = drawNode(n, s, st, k, ts); drawLabel(n, s, r, n.type !== 'prospect', k); }

  // Event particles exist only for actual replayed events.
  pulses = pulses.filter(p => ts - p.t0 < 1000);
  for (const p of pulses) {
    const a = pos.get(p.from), b = pos.get(p.to); if (!a || !b) continue;
    const f = Math.min(1, (ts - p.t0) / 1000), A = toScreen(a), B = toScreen(b), C = curve(A, B, hash(`${p.from}>${p.to}`));
    const u = 1-f, s = { x:u*u*A.x+2*u*f*C.x+f*f*B.x, y:u*u*A.y+2*u*f*C.y+f*f*B.y };
    ctx.save(); ctx.shadowColor = p.color; ctx.shadowBlur = 16; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, TAU); ctx.fill(); ctx.restore();
  }
  if (pulses.length || playing || (!REDUCED && activeGspot())) schedule();
}

// ---- interaction: pointer pan, pinch/wheel semantic zoom, tap select
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
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * .0015)); }, { passive: false });
function zoomAt(cx, cy, f) { const r = cv.getBoundingClientRect(), w0 = toWorld(cx - r.left, cy - r.top); view.k = Math.max(.15, Math.min(8, view.k * f)); const w1 = toWorld(cx - r.left, cy - r.top); view.x += w0.x - w1.x; view.y += w0.y - w1.y; set($('zoomhint'), `zoom ${view.k.toFixed(2)}× · ${view.k < .7 ? 'organism' : view.k < 1.8 ? 'economic clusters' : view.k < 3 ? 'prospects' : 'X-Ray detail'}`); schedule(); }
function tap(cx, cy) {
  if (!data) return; const r = cv.getBoundingClientRect(), w = toWorld(cx - r.left, cy - r.top); let best = null, bd = (24 / view.k) ** 2;
  const gx = Math.floor(w.x / 80), gy = Math.floor(w.y / 80);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const n of grid.get(`${gx + i},${gy + j}`) || []) { const p = pos.get(n.id), d = (p.x - w.x) ** 2 + (p.y - w.y) ** 2; if (d < bd) { bd = d; best = n; } }
  sel = best ? best.id : null; schedule();
  if (best?.type === 'cluster') { expandId = best.id; load(); }
  else if (best?.type === 'prospect') loadXray(best.id.slice('prospect:'.length));
}

// ---- panels: dynamic text uses textContent because replies/evidence are untrusted
function renderPanels(d, q, rr, rel, gs) {
  const lg = $('legend'); lg.replaceChildren();
  for (const [k, c] of Object.entries(COLORS.pipeline)) { const s = el('span', k.toLowerCase()); const i = el('i'); i.style.background = c; i.style.color = c; s.prepend(i); lg.append(s); }
  set($('at'), (d.replay ? 'REPLAY ' : 'LIVE ') + d.at.slice(0, 16).replace('T', ' ') + 'Z');
  set($('status'), `${d.clustered ? 'CLUSTERED · ' : ''}${d.nodes.length} nodes · ${d.economics?.clearedPayments || 0} cleared`);
  gsRun = gs.run; set($('gs-state'), gsRun ? gsRun.state : 'no run');
  const st = $('gs-stages'); st.replaceChildren(); const hist = {}; for (const i of gsRun?.items || []) hist[i.stage] = (hist[i.stage] || 0) + 1; for (const [k2, v] of Object.entries(hist)) st.append(el('span', `${k2} ${v}`));
  $('gs-authorize').disabled = !(gsRun?.batch?.items?.length && !gsRun.authorization); $('gs-dispatch').disabled = !gsRun?.authorization || !!gsRun.authorization.consumedAt;
  set($('rr-count'), String(rr.counts.material)); const rl = $('rr'); rl.replaceChildren();
  for (const i of rr.items.slice(0, 20)) { const li = el('li'); li.append(el('b', `${i.label.toUpperCase()} · ${i.urgency} · ${i.automation}`), el('div', i.untrustedBody.slice(0, 280)), el('div', `Mohamed replies manually · prospect ${i.prospectId || '?'}${i.injectionFlags.length ? ' · INJECTION FLAGGED' : ''}`, 'note')); rl.append(li); }
  set($('mq-count'), `${q.counts.ranked} ranked · ${q.counts.excluded} excluded`); const ml = $('mq'); ml.replaceChildren();
  for (const i of q.items.slice(0, 15)) { const li = el('li'); li.append(el('b', `#${i.rank} ${i.prospectId} · ${i.lane}`), el('div', `score ${i.rankScore} · demand ${i.explanation.demand.score} · fit ${i.explanation.offerFit.score} · exp. contribution ¢${i.explanation.expectedContributionCents} (${i.explanation.expectedContributionBasis})`, 'note')); ml.append(li); }
  const r = $('rel'); r.replaceChildren(); r.append(el('div', `Verdict: ${rel.funnel.verdict}`)); r.append(el('div', `Escape: ${rel.escape.decision} (${rel.escape.reason})`)); r.append(el('div', `Funnel: ${Object.entries(rel.counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`, 'note'));
}
async function loadXray(id) {
  const b = $('xr-body'); b.replaceChildren(el('div', 'Loading…'));
  try { const x = await api(`/api/revenue/xray?prospectId=${encodeURIComponent(id)}`); b.replaceChildren(); if (!x.ok) { b.append(el('div', x.state)); return; }
    b.append(el('b', `${x.prospect.company || x.prospect.id} · ${x.stage}`)); b.append(el('div', x.moneyQueue ? `Rank ${x.moneyQueue.rank} · ${x.moneyQueue.lane}` : 'Not in Money Queue', 'note'));
    if (x.gspot) b.append(el('div', `G-SPOT: ${x.gspot.stage}${x.gspot.blocks.length ? ' · blocked: ' + x.gspot.blocks.join(', ') : ''}`, 'note'));
    for (const t of x.timeline) b.append(el('div', `${t.at.slice(0, 16)} ${t.type}${t.inbox ? ' via ' + t.inbox : ''}`, 'note')); for (const u of x.unknowns) b.append(el('div', `UNKNOWN: ${u}`, 'warn'));
  } catch (e) { b.replaceChildren(el('div', e.message, 'err')); }
}

// ---- data
let loading = false, fitted = false;
function fit() {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9; for (const p of pos.values()) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  if (minX > maxX) return; view.x = (minX + maxX) / 2; view.y = (minY + maxY) / 2; view.k = Math.max(.15, Math.min(1.2, .85 * Math.min(cv.clientWidth / Math.max(1, maxX - minX), cv.clientHeight / Math.max(1, maxY - minY))));
}
async function load() {
  if (loading) return; loading = true;
  try {
    const qs = new URLSearchParams(); if (atParam) qs.set('at', atParam); if (expandId) qs.set('expand', expandId);
    const [d, q, rr, rel, gs] = await Promise.all([api('/api/revenue/constellation?' + qs), api('/api/revenue/money-queue'), api('/api/revenue/reply-radar'), api('/api/revenue/reliability'), api('/api/revenue/gspot')]);
    data = d; layout(d); if (!fitted) { fit(); fitted = true; } renderPanels(d, q, rr, rel, gs); $('auth').hidden = true; set($('auth-error'), ''); schedule();
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
  const step = () => { if (i >= evs.length || !playing) { playing = false; return; } const e = evs[i++]; const pid = e.prospectId && `prospect:${e.prospectId}`; const from = e.type === 'sent' && e.inbox ? `sender:${e.inbox}` : pid, to = e.type === 'sent' ? pid : 'core:gspot';
    if (pos.has(from) && pos.has(to)) { pulses.push({ from, to, t0: performance.now(), color: e.type === 'cleared_payment' ? '#54f6a9' : e.type === 'reply' ? '#ffb454' : '#ad8cff' }); schedule(); } setTimeout(step, REDUCED ? 600 : 330); };
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
