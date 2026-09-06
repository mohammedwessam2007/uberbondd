(() => {
  const $ = selector => document.querySelector(selector);
  const stage = $('#graph-stage');
  const canvas = $('#ultimate-canvas');
  if (!stage || !canvas) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  const state = {
    active: false,
    lens: 'brain',
    projection: null,
    nodes: [],
    edges: [],
    positions: new Map(),
    targets: new Map(),
    hover: null,
    selected: null,
    history: [],
    transform: { x: 0, y: 0, scale: 1 },
    pointers: new Map(),
    drag: null,
    pinchDistance: null,
    animation: null,
    lastLoadKey: null,
    summary: null
  };

  const palette = Object.freeze({
    organ: '#64e5ff',
    artifact: '#7aa2ff',
    deep: '#bfd7e6',
    genesis: '#ffc96d',
    memory: '#b792ff',
    gate: '#ff758d',
    capability: '#70ffc4',
    donor: '#9da8b5',
    edge: 'rgba(101,209,255,.12)',
    edgeHot: 'rgba(255,200,106,.22)'
  });

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const hash = value => {
    let h = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const token = () => sessionStorage.uberbondGraphToken || localStorage.revenueEngineToken || localStorage.nightshiftToken || '';

  function colorFor(node) {
    const cls = String(node?.class || '').toUpperCase();
    const hay = `${node?.label || ''} ${node?.path || ''}`.toLowerCase();
    if (cls === 'COGNITIVE_ORGAN') return palette.organ;
    if (cls === 'REPOSITORY_ARTIFACT') return palette.artifact;
    if (cls === 'GENESIS_IDEA' || /genesis/.test(hay)) return palette.genesis;
    if (cls === 'TOTAL_BRAIN_MEMORY_ATOM' || cls === 'HISTORICAL_DONOR' || /memory|canon|lineage/.test(hay)) return cls === 'HISTORICAL_DONOR' ? palette.donor : palette.memory;
    if (cls === 'ACTIVATION_GATE') return palette.gate;
    if (cls === 'READINESS_CAPABILITY' || /capability|model|skill|plugin/.test(hay)) return palette.capability;
    if (cls.startsWith('DEEP_')) return palette.deep;
    return '#8ab3c8';
  }

  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutProjection(false);
  }

  function degreeMap() {
    const degree = new Map(state.nodes.map(node => [node.id, 0]));
    for (const edge of state.edges) {
      degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
      degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
    }
    return degree;
  }

  function layoutProjection(animate = true) {
    if (!state.nodes.length) return;
    const rect = stage.getBoundingClientRect();
    const width = Math.max(320, rect.width);
    const height = Math.max(480, rect.height);
    const cx = width / 2;
    const cy = height / 2;
    const degree = degreeMap();
    const byId = new Map(state.nodes.map(node => [node.id, node]));
    const parentArtifact = new Map();
    const parentOrgan = new Map();
    for (const edge of state.edges) {
      if (edge.type === 'DETAIL_DECLARED_IN') parentArtifact.set(edge.from, edge.to);
      if (edge.type === 'MEMBER_OF_ORGAN' || edge.type === 'DETAIL_MEMBER_OF_ORGAN') {
        if (String(edge.to).startsWith('organ:')) parentOrgan.set(edge.from, edge.to);
      }
    }
    for (const [detail, artifact] of parentArtifact) {
      if (parentOrgan.has(artifact) && !parentOrgan.has(detail)) parentOrgan.set(detail, parentOrgan.get(artifact));
    }
    const organs = state.nodes.filter(node => node.class === 'COGNITIVE_ORGAN');
    const organIndex = new Map(organs.map((node, index) => [node.id, index]));
    const targets = new Map();
    organs.forEach((node, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index / Math.max(1, organs.length));
      const wobble = ((hash(node.id) % 100) / 100 - .5) * .05;
      const radiusX = width * (.22 + wobble);
      const radiusY = height * (.20 + wobble);
      targets.set(node.id, { x: cx + Math.cos(angle) * radiusX, y: cy + Math.sin(angle) * radiusY });
    });
    for (const node of state.nodes) {
      if (targets.has(node.id)) continue;
      const cls = String(node.class || '');
      const h = hash(node.id);
      const jitter = ((h >>> 8) % 1000) / 1000;
      const parent = parentOrgan.get(node.id);
      if (parent && targets.has(parent)) {
        const anchor = targets.get(parent);
        const pIndex = organIndex.get(parent) || 0;
        const baseAngle = -Math.PI / 2 + (Math.PI * 2 * pIndex / Math.max(1, organs.length));
        const localAngle = baseAngle + ((h % 1000) / 1000 - .5) * 1.15;
        const localRadius = cls.startsWith('DEEP_') ? 115 + jitter * 75 : 75 + jitter * 60;
        targets.set(node.id, { x: anchor.x + Math.cos(localAngle) * localRadius, y: anchor.y + Math.sin(localAngle) * localRadius * .72 });
      } else if (parentArtifact.has(node.id) && targets.has(parentArtifact.get(node.id))) {
        const anchor = targets.get(parentArtifact.get(node.id));
        const angle = (h % 6283) / 1000;
        targets.set(node.id, { x: anchor.x + Math.cos(angle) * (38 + jitter * 42), y: anchor.y + Math.sin(angle) * (30 + jitter * 35) });
      } else {
        const ring = cls.startsWith('DEEP_') ? .45 : cls === 'REPOSITORY_ARTIFACT' ? .39 : .32;
        const angle = (h % 6283) / 1000;
        targets.set(node.id, { x: cx + Math.cos(angle) * width * ring, y: cy + Math.sin(angle) * height * ring * .74 });
      }
    }
    state.targets = targets;
    if (!animate || !state.positions.size) {
      state.positions = new Map([...targets.entries()].map(([id, point]) => [id, { ...point }]));
    }
  }

  function easePositions() {
    let moving = false;
    for (const [id, target] of state.targets) {
      const current = state.positions.get(id) || { ...target };
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      if (Math.abs(dx) + Math.abs(dy) > .15) moving = true;
      current.x += dx * .085;
      current.y += dy * .085;
      state.positions.set(id, current);
    }
    return moving;
  }

  function worldToScreen(point) {
    const rect = stage.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    return {
      x: (point.x - cx) * state.transform.scale + cx + state.transform.x,
      y: (point.y - cy) * state.transform.scale + cy + state.transform.y
    };
  }

  function screenToWorld(point) {
    const rect = stage.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    return {
      x: (point.x - cx - state.transform.x) / state.transform.scale + cx,
      y: (point.y - cy - state.transform.y) / state.transform.scale + cy
    };
  }

  function drawBackground(width, height) {
    ctx.save();
    ctx.translate(width / 2 + state.transform.x, height / 2 + state.transform.y);
    ctx.scale(state.transform.scale, state.transform.scale);
    for (let i = 1; i <= 5; i += 1) {
      ctx.beginPath();
      ctx.ellipse(0, 0, width * (.09 + i * .07), height * (.07 + i * .055), 0, 0, Math.PI * 2);
      ctx.strokeStyle = i === 2 ? 'rgba(255,199,105,.055)' : 'rgba(98,227,255,.045)';
      ctx.lineWidth = 1 / state.transform.scale;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFrame(now) {
    if (!state.active) { state.animation = requestAnimationFrame(drawFrame); return; }
    easePositions();
    const rect = stage.getBoundingClientRect();
    const width = rect.width, height = rect.height;
    ctx.clearRect(0, 0, width, height);
    drawBackground(width, height);
    const nodeById = new Map(state.nodes.map(node => [node.id, node]));
    const degree = degreeMap();
    ctx.lineWidth = 1;
    for (let i = 0; i < state.edges.length; i += 1) {
      const edge = state.edges[i];
      const a0 = state.positions.get(edge.from), b0 = state.positions.get(edge.to);
      if (!a0 || !b0) continue;
      const a = worldToScreen(a0), b = worldToScreen(b0);
      const hot = /ORGAN_RELATION|MEMBER_OF_ORGAN|DONATES_TO|IMPLEMENTED_BY|LEARNS|RECOMBINES/.test(String(edge.type || ''));
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = hot ? palette.edgeHot : palette.edge;
      ctx.lineWidth = hot ? 1.15 : .7;
      ctx.stroke();
      if (i % 7 === 0) {
        const phase = ((now * .00008) + ((hash(edge.id) % 1000) / 1000)) % 1;
        const x = a.x + (b.x - a.x) * phase;
        const y = a.y + (b.y - a.y) * phase;
        ctx.beginPath();
        ctx.arc(x, y, hot ? 1.8 : 1.1, 0, Math.PI * 2);
        ctx.fillStyle = hot ? 'rgba(255,210,120,.72)' : 'rgba(98,227,255,.62)';
        ctx.fill();
      }
    }
    const ordered = [...state.nodes].sort((a, b) => (a.class === 'COGNITIVE_ORGAN' ? 1 : 0) - (b.class === 'COGNITIVE_ORGAN' ? 1 : 0));
    for (const node of ordered) {
      const p0 = state.positions.get(node.id); if (!p0) continue;
      const p = worldToScreen(p0);
      const deg = degree.get(node.id) || 0;
      const organ = node.class === 'COGNITIVE_ORGAN';
      const artifact = node.class === 'REPOSITORY_ARTIFACT';
      const deep = String(node.class || '').startsWith('DEEP_');
      const radius = (organ ? 7.5 + Math.min(5, deg * .15) : artifact ? 4.8 + Math.min(3.5, deg * .1) : deep ? 2.7 : 3.8) * Math.sqrt(state.transform.scale);
      const color = colorFor(node);
      const selected = state.selected === node.id;
      const hovered = state.hover === node.id;
      if (organ || selected || hovered) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * (selected ? 3 : 2.2), 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(p.x, p.y, radius * .3, p.x, p.y, radius * (selected ? 3 : 2.2));
        grad.addColorStop(0, `${color}55`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = organ || selected ? 15 : hovered ? 11 : 5;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = selected ? '#ffffff' : 'rgba(255,255,255,.18)';
      ctx.stroke();
      const showLabel = organ || selected || hovered || (state.transform.scale > 1.55 && (artifact || deg >= 4));
      if (showLabel) {
        const label = String(node.label || node.id || '').slice(0, 46);
        ctx.font = `${organ ? 700 : 600} ${organ ? 9 : 7}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillStyle = organ ? '#e7faff' : '#a7c2d2';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, p.x + radius + 5, p.y, 210);
      }
    }
    state.animation = requestAnimationFrame(drawFrame);
  }

  function nearestNode(screenX, screenY, radius = 18) {
    let best = null, bestDistance = radius;
    for (const node of state.nodes) {
      const p0 = state.positions.get(node.id); if (!p0) continue;
      const p = worldToScreen(p0);
      const d = Math.hypot(screenX - p.x, screenY - p.y);
      if (d < bestDistance) { best = node; bestDistance = d; }
    }
    return best;
  }

  function showHover(node, x, y) {
    const card = $('#graph-hover-card');
    if (!card) return;
    if (!node) { card.classList.remove('open'); return; }
    card.innerHTML = `<b>${esc(node.label || node.id)}</b><small>${esc(node.class || 'NODE')}${node.path ? ` · ${esc(node.path)}` : ''}</small><em>CLICK TO OPEN NEIGHBORHOOD</em>`;
    const rect = stage.getBoundingClientRect();
    card.style.left = `${clamp(x + 12, 8, rect.width - 285)}px`;
    card.style.top = `${clamp(y + 12, 8, rect.height - 100)}px`;
    card.classList.add('open');
  }

  async function graphApi(params) {
    const owner = token();
    if (!owner) throw Object.assign(new Error('OWNER_KEY_REQUIRED'), { status: 401 });
    const query = new URLSearchParams(params);
    const response = await fetch(`/api/ultimate-graph?${query.toString()}`, { headers: { authorization: `Bearer ${owner}` }, cache: 'no-store' });
    const body = await response.json().catch(() => ({ status: 'INVALID_RESPONSE' }));
    if (!response.ok) throw Object.assign(new Error(body?.reasonCodes?.join(',') || body?.status || 'ULTIMATE_GRAPH_REQUEST_FAILED'), { status: response.status });
    return body;
  }

  function setProjection(data, { pushHistory = true } = {}) {
    if (pushHistory && state.projection) state.history.push({ projection: state.projection, nodes: state.nodes, edges: state.edges, lens: state.lens });
    state.nodes = Array.isArray(data.nodes) ? data.nodes : [];
    state.edges = Array.isArray(data.edges) ? data.edges : [];
    state.projection = data.projection || null;
    state.selected = data.projection?.focusNode || null;
    state.positions.clear();
    state.transform = { x: 0, y: 0, scale: 1 };
    layoutProjection(false);
    updateProjectionUi(data);
    $('#graph-empty-overlay')?.classList.toggle('open', !state.nodes.length);
  }

  function updateProjectionUi(data) {
    const p = data.projection || {};
    const canonicalNodes = p.canonicalNodeCount ?? data.coverage?.canonicalNodeCount ?? '—';
    const canonicalEdges = p.canonicalEdgeCount ?? data.coverage?.canonicalEdgeCount ?? '—';
    const projectedNodes = p.projectedNodeCount ?? state.nodes.length;
    const projectedEdges = p.projectedEdgeCount ?? state.edges.length;
    const hidden = p.hiddenNodeCount ?? Math.max(0, Number(canonicalNodes) - Number(projectedNodes));
    if ($('#projection-label')) $('#projection-label').innerHTML = `<b>${esc(String(projectedNodes))}</b> visible / ${esc(String(canonicalNodes))} canonical · <span class="projection-warning">${esc(String(hidden))} clustered/hidden · 0 deleted</span>`;
    if ($('#projection-digest')) $('#projection-digest').textContent = data.graphDigest ? `graph ${String(data.graphDigest).slice(0,12)} · ${projectedEdges}/${canonicalEdges} edges` : 'graph digest unavailable';
    if ($('#hud-visible')) $('#hud-visible').textContent = projectedNodes;
    if ($('#hud-canonical')) $('#hud-canonical').textContent = canonicalNodes;
    if ($('#hud-hidden')) $('#hud-hidden').textContent = hidden;
    if ($('#hud-lens')) $('#hud-lens').textContent = String(p.lens || state.lens || 'brain').toUpperCase();
    document.querySelectorAll('.graph-lens').forEach(button => button.classList.toggle('active', button.dataset.graphLens === state.lens));
  }

  function augmentFeatureMetrics(summary) {
    const host = $('#feature-metrics');
    if (!host || !summary?.coverage) return;
    host.querySelectorAll('.ultimate-graph-metric').forEach(node => node.remove());
    const rows = [
      ['ultimate nodes', summary.coverage.canonicalNodeCount],
      ['ultimate edges', summary.coverage.canonicalEdgeCount],
      ['deep features', summary.coverage.deepFeatureCount],
      ['graph orphans', summary.coverage.orphanNodeCount]
    ];
    host.insertAdjacentHTML('beforeend', rows.map(([label, value]) => `<div class="metric-row ultimate-graph-metric"><span>${esc(label)}</span><b class="${Number(value) === 0 && label === 'graph orphans' ? 'good' : ''}">${esc(value ?? '—')}</b></div>`).join(''));
  }

  async function loadSummary() {
    try {
      const data = await graphApi({ view: 'summary' });
      state.summary = data;
      augmentFeatureMetrics(data);
      if ($('#visual-law')) $('#visual-law').innerHTML = `<b>NEVER AMPUTATE:</b> canonical ${esc(data.coverage?.canonicalNodeCount ?? '—')} nodes / ${esc(data.coverage?.canonicalEdgeCount ?? '—')} edges. UI filtering changes only the projection.`;
      return data;
    } catch (error) {
      if ($('#visual-law')) $('#visual-law').innerHTML = `<b>ULTIMATE GRAPH:</b> ${error.status === 401 ? 'owner key required' : 'current graph receipt unavailable'}. No fallback counts invented.`;
      return null;
    }
  }

  async function loadLens(lens = state.lens, query = null) {
    state.lens = lens;
    const key = `${lens}:${query || ''}`;
    state.lastLoadKey = key;
    try {
      const data = await graphApi({ view: 'overview', lens, ...(query ? { q: query } : {}), limit: '260' });
      if (state.lastLoadKey !== key) return;
      setProjection(data, { pushHistory: false });
      state.active = true;
      stage.classList.add('ultimate-active');
      $('#toggle-ultimate')?.classList.add('active');
      $('#toggle-ultimate') && ($('#toggle-ultimate').textContent = 'ULTIMATE LIVE');
    } catch (error) {
      $('#graph-empty-overlay')?.classList.add('open');
      const copy = $('#graph-empty-copy');
      if (copy) copy.innerHTML = `<b>${error.status === 401 ? 'OWNER KEY REQUIRED' : 'ULTIMATE GRAPH UNAVAILABLE'}</b>${esc(error.message)}. The canonical graph is not replaced with demo data.`;
    }
  }

  async function openNeighborhood(node) {
    if (!node?.id) return;
    try {
      const data = await graphApi({ view: 'neighborhood', id: node.id, depth: '2', limit: '260' });
      state.history.push({ projection: state.projection, nodes: state.nodes, edges: state.edges, lens: state.lens });
      state.nodes = data.nodes || [];
      state.edges = data.edges || [];
      state.projection = data.projection;
      state.selected = node.id;
      state.positions.clear();
      state.transform = { x: 0, y: 0, scale: 1 };
      layoutProjection(false);
      updateProjectionUi(data);
      openDrawer(node, data);
    } catch {}
  }

  function openDrawer(node, data) {
    const drawer = $('#node-drawer');
    if (!drawer) return;
    $('#drawer-title').textContent = node.label || node.id;
    $('#drawer-kind').textContent = node.class || node.kind || 'ULTIMATE GRAPH NODE';
    $('#drawer-truth').textContent = node.truthClass || 'STRUCTURAL REPOSITORY EVIDENCE';
    const links = (data.edges || []).filter(edge => edge.from === node.id || edge.to === node.id).slice(0, 60);
    $('#drawer-links').innerHTML = links.map(edge => `<div class="drawer-link">${edge.from === node.id ? '→' : '←'} ${esc(edge.type)} · ${esc(edge.from === node.id ? edge.to : edge.from)}</div>`).join('') || '<div class="empty-state">No edges inside this bounded projection.</div>';
    let meta = drawer.querySelector('.graph-node-meta');
    if (!meta) { meta = document.createElement('div'); meta.className = 'graph-node-meta'; $('#drawer-links').before(meta); }
    meta.innerHTML = [
      ['node id', node.id], ['path', node.path || '—'], ['lens', data.projection?.lens || 'neighborhood'], ['canonical nodes', data.projection?.canonicalNodeCount ?? '—']
    ].map(([label,value]) => `<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
    drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
  }

  function goBack() {
    const previous = state.history.pop();
    if (!previous) { loadLens(state.lens); return; }
    state.projection = previous.projection; state.nodes = previous.nodes; state.edges = previous.edges; state.lens = previous.lens;
    state.selected = null; state.positions.clear(); state.transform = { x:0, y:0, scale:1 }; layoutProjection(false);
    updateProjectionUi({ projection: state.projection, graphDigest: state.summary?.graphDigest });
  }

  function activate() {
    state.active = true;
    stage.classList.add('ultimate-active');
    $('#toggle-ultimate')?.classList.add('active');
    if (!state.nodes.length) loadLens(state.lens);
  }
  function deactivate() {
    state.active = false;
    stage.classList.remove('ultimate-active');
    $('#toggle-ultimate')?.classList.remove('active');
    if ($('#toggle-ultimate')) $('#toggle-ultimate').textContent = 'ULTIMATE GRAPH';
    showHover(null);
  }

  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture(event.pointerId);
    const p = pointerPosition(event);
    state.pointers.set(event.pointerId, p);
    if (state.pointers.size === 1) state.drag = { start: p, origin: { ...state.transform }, moved: false };
    if (state.pointers.size === 2) {
      const points = [...state.pointers.values()];
      state.pinchDistance = Math.hypot(points[0].x-points[1].x, points[0].y-points[1].y);
    }
  });
  canvas.addEventListener('pointermove', event => {
    const p = pointerPosition(event);
    if (state.pointers.has(event.pointerId)) state.pointers.set(event.pointerId, p);
    if (state.pointers.size === 1 && state.drag) {
      const dx = p.x - state.drag.start.x, dy = p.y - state.drag.start.y;
      if (Math.abs(dx)+Math.abs(dy) > 4) state.drag.moved = true;
      state.transform.x = state.drag.origin.x + dx; state.transform.y = state.drag.origin.y + dy;
    } else if (state.pointers.size === 2) {
      const points = [...state.pointers.values()];
      const distance = Math.hypot(points[0].x-points[1].x, points[0].y-points[1].y);
      if (state.pinchDistance) state.transform.scale = clamp(state.transform.scale * (distance / state.pinchDistance), .45, 4.5);
      state.pinchDistance = distance;
    } else if (state.active) {
      const node = nearestNode(p.x, p.y, 16);
      state.hover = node?.id || null; showHover(node, p.x, p.y);
    }
  });
  canvas.addEventListener('pointerup', event => {
    const p = pointerPosition(event);
    const wasMoved = state.drag?.moved;
    state.pointers.delete(event.pointerId);
    if (!state.pointers.size) { state.pinchDistance = null; state.drag = null; }
    if (!wasMoved) { const node = nearestNode(p.x, p.y, 20); if (node) openNeighborhood(node); }
  });
  canvas.addEventListener('pointercancel', event => { state.pointers.delete(event.pointerId); state.drag = null; state.pinchDistance = null; });
  canvas.addEventListener('wheel', event => { event.preventDefault(); state.transform.scale = clamp(state.transform.scale * (event.deltaY > 0 ? .9 : 1.1), .45, 4.5); }, { passive: false });

  $('#toggle-ultimate')?.addEventListener('click', () => state.active ? deactivate() : activate());
  $('#toggle-map')?.addEventListener('click', deactivate);
  $('#uber-core')?.addEventListener('click', deactivate);
  $('#graph-back')?.addEventListener('click', goBack);
  $('#graph-reset')?.addEventListener('click', () => { state.transform = { x:0,y:0,scale:1 }; state.history.length = 0; loadLens(state.lens); });
  document.querySelectorAll('.graph-lens').forEach(button => button.addEventListener('click', () => { const lens = button.dataset.graphLens || 'brain'; state.history.length = 0; $('#graph-search').value = ''; loadLens(lens); }));
  let searchTimer = null;
  $('#graph-search')?.addEventListener('input', event => { clearTimeout(searchTimer); const q = event.target.value.trim(); searchTimer = setTimeout(() => { state.history.length = 0; q ? loadLens('all', q) : loadLens(state.lens); }, 380); });
  $('#graph-search')?.addEventListener('keydown', event => { if (event.key === 'Escape') { event.target.value=''; loadLens('brain'); } });
  $('#auth-form')?.addEventListener('submit', () => { const value = $('#owner-token')?.value.trim(); if (value) sessionStorage.uberbondGraphToken = value; setTimeout(async () => { await loadSummary(); activate(); }, 450); }, true);

  window.addEventListener('resize', () => { clearTimeout(window.__uberGraphResize); window.__uberGraphResize = setTimeout(resizeCanvas, 100); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.active && token()) loadSummary(); });

  resizeCanvas();
  state.animation = requestAnimationFrame(drawFrame);
  if (token()) setTimeout(async () => { await loadSummary(); activate(); }, 700);
  setInterval(() => { if (!document.hidden && token()) loadSummary(); }, 60000);
})();
