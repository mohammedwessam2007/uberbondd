const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const dash = value => value === null || value === undefined || value === '' ? '—' : value;
const short = (value, length = 12) => value ? String(value).slice(0, length) : '—';
let token = localStorage.revenueEngineToken || localStorage.nightshiftToken || '';
let state = null;
let mapMode = 'cognitive';
let refreshTimer = null;

function clockTick() {
  $('#clock').textContent = new Intl.DateTimeFormat(undefined, { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(new Date());
}
setInterval(clockTick, 1000); clockTick();

async function api(path) {
  const response = await fetch(path, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  const body = await response.json().catch(() => ({ status: 'INVALID_RESPONSE' }));
  if (!response.ok) {
    const error = new Error(body?.reasonCodes?.join(', ') || body?.error || body?.status || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return body;
}
function setConnection(mode, label) {
  const dot = $('#connection-dot');
  dot.className = `connection-dot ${mode}`;
  $('#connection-label').textContent = label;
}
function authOpen(message = '') {
  $('#auth-modal').classList.add('open');
  $('#auth-modal').setAttribute('aria-hidden', 'false');
  $('#owner-token').value = token;
  $('#auth-error').textContent = message;
  setTimeout(() => $('#owner-token').focus(), 40);
}
function authClose() {
  $('#auth-modal').classList.remove('open');
  $('#auth-modal').setAttribute('aria-hidden', 'true');
  $('#auth-error').textContent = '';
}
function tone(value) {
  const text = String(value || '').toUpperCase();
  if (/READY|PASS|AVAILABLE|FRESH|OBSERVED|VERIFIED|ONLINE|NONE/.test(text) && !/UNAVAILABLE|UNVERIFIED/.test(text)) return 'good';
  if (/INVALID|FAILED|ERROR|BLOCKED|DEGRADED|UNREADABLE/.test(text)) return 'bad';
  return 'warn';
}
function metric(label, value, valueTone = '') {
  return `<div class="metric-row"><span>${esc(label)}</span><b class="${esc(valueTone)}">${esc(dash(value))}</b></div>`;
}
function renderFeatureMetrics(data) {
  const genome = data.receipts?.featureGenome?.summary;
  const atlas = data.receipts?.featureAtomAtlas?.summary;
  const synaptic = data.receipts?.synapticMap?.summary;
  const rows = genome ? [
    metric('repository artifacts', genome.repositoryArtifactCount),
    metric('dependency edges', genome.sourceDependencyEdgeCount),
    metric('feature atoms', atlas?.atomCount),
    metric('activation gates', genome.activationGateCount),
    metric('GENESIS ideas', genome.genesisIdeaCount ?? atlas?.classCounts?.genesisIdeas),
    metric('synaptic nodes', synaptic?.nodeCount),
    metric('synaptic edges', synaptic?.edgeCount)
  ] : [metric('Feature Genome', data.receipts?.featureGenome?.state || 'UNAVAILABLE', tone(data.receipts?.featureGenome?.state))];
  $('#feature-metrics').innerHTML = rows.join('');
}
function renderGenesis(data) {
  const ledger = data.genesisImplementationLedger;
  const evolution = data.receipts?.genesisEvolution;
  const reactivation = data.receipts?.genesisReactivation;
  const maturity = ledger?.maturityCounts || data.receipts?.featureAtomAtlas?.summary?.genesisMaturityCounts || {};
  const implementation = ledger?.implementationStatusCounts || data.receipts?.featureAtomAtlas?.summary?.genesisImplementationStatusCounts || {};
  const rows = [
    metric('indexed ideas', ledger?.ideaCount ?? data.receipts?.featureGenome?.summary?.genesisIdeaCount),
    metric('runtime receipts', maturity.OBSERVED_INTERNAL_RUNTIME_RECEIPT),
    metric('source + test', maturity.SOURCE_AND_TEST_PRESENT),
    metric('implemented primitives', implementation.IMPLEMENTED_PRIMITIVE),
    metric('partial primitives', implementation.PARTIAL_PRIMITIVE),
    metric('evolution receipt', evolution?.state || 'UNAVAILABLE', tone(evolution?.state)),
    metric('reactivation receipt', reactivation?.state || 'UNAVAILABLE', tone(reactivation?.state))
  ];
  $('#genesis-metrics').innerHTML = rows.join('');
}
function renderModels(data) {
  const registry = data.frontierModelRegistry;
  const doctor = data.receipts?.frontierModels?.summary;
  if (!registry?.candidates?.length) {
    $('#model-roster').innerHTML = '<div class="empty-state">Frontier model registry unavailable.</div>';
    return;
  }
  const callable = Number(doctor?.callableCandidateCount || 0);
  $('#model-roster').innerHTML = registry.candidates.map(model => `
    <div class="model-card">
      <span class="model-orb"></span>
      <div><b>${esc(model.label || model.id || 'candidate')}</b><small>${esc(model.provider || 'provider unknown')} · ${esc(model.model || 'catalog candidate')}</small></div>
      <span class="model-state">${callable > 0 ? 'CHECK DOCTOR' : 'NO CALL PROOF'}</span>
    </div>`).join('');
}
function renderCompute(data) {
  const receipt = data.receipts?.computeSovereignty;
  const summary = receipt?.summary;
  $('#compute-panel').innerHTML = [
    metric('receipt', receipt?.state || 'UNAVAILABLE', tone(receipt?.state)),
    metric('freshness', receipt?.freshness || 'UNKNOWN', tone(receipt?.freshness)),
    metric('doctor status', summary?.status),
    metric('effect authority', summary?.businessEffectAuthority || 'NONE', 'good')
  ].join('');
}
function renderMaintainer(data) {
  const receipt = data.receipts?.selfMaintainer;
  const summary = receipt?.summary;
  $('#maintainer-panel').innerHTML = [
    metric('receipt', receipt?.state || 'UNAVAILABLE', tone(receipt?.state)),
    metric('freshness', receipt?.freshness || 'UNKNOWN', tone(receipt?.freshness)),
    metric('status', summary?.status),
    metric('business authority', summary?.businessEffectAuthority || 'NONE', 'good')
  ].join('');
}
function renderActivity(data) {
  const items = Object.values(data.receipts || {}).sort((a, b) => {
    const score = item => item.state === 'AVAILABLE' ? 0 : item.state === 'INVALID' ? 1 : 2;
    return score(a) - score(b) || String(a.label).localeCompare(String(b.label));
  });
  $('#activity-feed').innerHTML = items.map(item => {
    const freshness = item.freshness && item.freshness !== 'UNKNOWN' ? ` · ${item.freshness}` : '';
    const stamp = item.timestamp ? new Date(item.timestamp).toLocaleString() : 'no producer timestamp';
    return `<div class="activity-item"><span class="activity-beacon ${esc(String(item.state).toLowerCase())}"></span><div><b>${esc(item.label)}</b><small>${esc(stamp)}${esc(freshness)}</small></div><span class="activity-state">${esc(item.state)}</span></div>`;
  }).join('') || '<div class="empty-state">No receipt definitions returned.</div>';
}
function truthClass(value) {
  const text = String(value || '').toUpperCase();
  if (text === 'VERIFIED_CURRENT') return 'verified';
  if (text === 'DRAFT_BRANCH') return 'draft';
  if (text === 'HISTORICAL_DONOR') return 'donor';
  return 'goal';
}
function nodeLabel(node) {
  return node.label || node.name || node.id || 'unknown';
}
function graphDataset(data) {
  if (mapMode === 'synaptic' && data.synapticPreview?.nodes?.length) {
    const nodes = data.synapticPreview.nodes.slice(0, 84).map(node => ({ ...node, truthClass: node.truthClass || 'VERIFIED_CURRENT' }));
    const ids = new Set(nodes.map(node => node.id));
    const edges = (data.synapticPreview.edges || []).filter(edge => ids.has(edge.from) && ids.has(edge.to)).slice(0, 220);
    return { nodes, edges, totalNodes: data.synapticPreview.nodeCount, totalEdges: data.synapticPreview.edgeCount, synaptic: true };
  }
  const graph = data.cognitive?.graph || {};
  return { nodes: graph.nodes || [], edges: graph.edges || [], totalNodes: graph.nodeCount || 0, totalEdges: graph.edgeCount || 0, synaptic: false };
}
function computePositions(nodes, width, height, synaptic) {
  const cx = width / 2, cy = height / 2;
  const positions = new Map();
  const count = nodes.length;
  if (!count) return positions;
  const rings = synaptic ? [0.34, 0.43, 0.49] : [0.31, 0.41, 0.48];
  const capacities = synaptic ? [24, 28, 40] : [9, 10, 10];
  let cursor = 0;
  rings.forEach((ratio, ringIndex) => {
    const remaining = count - cursor;
    const take = Math.min(capacities[ringIndex], remaining);
    if (take <= 0) return;
    const rx = Math.max(110, width * ratio);
    const ry = Math.max(105, height * ratio * .82);
    for (let i = 0; i < take; i += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i / take) + ringIndex * .16;
      const node = nodes[cursor + i];
      positions.set(node.id, { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
    }
    cursor += take;
  });
  return positions;
}
function drawLines(dataset, positions, width, height) {
  const svg = $('#graph-lines');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = dataset.edges.map((edge, index) => {
    const a = positions.get(edge.from), b = positions.get(edge.to);
    if (!a || !b) return '';
    const hot = /FEEDBACK|LEARNS|PROMOTES|RECOMBINES|PROVES/.test(String(edge.type || '')) || index % 11 === 0;
    return `<path class="graph-line ${hot ? 'hot' : ''}" d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${((a.x+b.x)/2).toFixed(1)} ${(((a.y+b.y)/2)-18).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}"></path>`;
  }).join('');
}
function renderGraph(data) {
  const stage = $('#graph-stage');
  const dataset = graphDataset(data);
  const rect = stage.getBoundingClientRect();
  const width = Math.max(320, rect.width), height = Math.max(480, rect.height);
  const positions = computePositions(dataset.nodes, width, height, dataset.synaptic);
  stage.classList.toggle('synaptic', dataset.synaptic);
  $('#graph-nodes').innerHTML = dataset.nodes.map(node => {
    const pos = positions.get(node.id) || { x: width / 2, y: height / 2 };
    const cls = truthClass(node.truthClass);
    const label = nodeLabel(node);
    return `<button class="organ-node ${cls}" type="button" data-node="${esc(node.id)}" style="left:${(pos.x/width*100).toFixed(3)}%;top:${(pos.y/height*100).toFixed(3)}%"><b>${esc(label)}</b><small>${esc(node.kind || node.nodeClass || node.id)}</small></button>`;
  }).join('');
  drawLines(dataset, positions, width, height);
  document.querySelectorAll('.organ-node').forEach(button => button.addEventListener('click', () => openNode(button.dataset.node, dataset)));
  $('#organ-count').textContent = dash(dataset.totalNodes);
  $('#relation-count').textContent = dash(dataset.totalEdges);
  $('#synapse-count').textContent = dash(data.synapticPreview?.edgeCount);
  $('#toggle-map').textContent = dataset.synaptic ? 'COGNITIVE MAP' : 'SYNAPTIC PREVIEW';
  $('#toggle-map').disabled = !data.synapticPreview?.nodes?.length;
}
function openNode(id, dataset) {
  const node = dataset.nodes.find(item => item.id === id);
  if (!node) return;
  const links = dataset.edges.filter(edge => edge.from === id || edge.to === id).slice(0, 40);
  $('#drawer-title').textContent = nodeLabel(node);
  $('#drawer-kind').textContent = node.kind || node.nodeClass || node.id;
  $('#drawer-truth').textContent = node.truthClass || (dataset.synaptic ? 'SYNAPTIC FEATURE' : 'UNCLASSIFIED');
  $('#drawer-links').innerHTML = links.length ? links.map(edge => `<div class="drawer-link">${esc(edge.from === id ? '→' : '←')} ${esc(edge.type || 'RELATION')} · ${esc(edge.from === id ? edge.to : edge.from)}</div>`).join('') : '<div class="empty-state">No visible relations in this preview.</div>';
  $('#node-drawer').classList.add('open');
  $('#node-drawer').setAttribute('aria-hidden', 'false');
}
function closeNode() {
  $('#node-drawer').classList.remove('open');
  $('#node-drawer').setAttribute('aria-hidden', 'true');
}
function render(data) {
  state = data;
  setConnection('live', 'OWNER LINK LIVE');
  $('#truth-state').textContent = data.truthState || 'UNKNOWN';
  $('#core-status').textContent = data.truthState || 'UNKNOWN';
  const obs = data.observability || {};
  $('#receipt-observed').textContent = dash(obs.observedReceiptCount);
  $('#receipt-unavailable').textContent = dash(obs.unavailableReceiptCount);
  $('#receipt-stale').textContent = dash(obs.staleReceiptCount);
  $('#receipt-invalid').textContent = dash(obs.invalidReceiptCount);
  renderFeatureMetrics(data);
  renderGenesis(data);
  renderModels(data);
  renderCompute(data);
  renderMaintainer(data);
  renderActivity(data);
  renderGraph(data);
  $('#truth-copy').textContent = data.truthBoundary || 'No truth boundary returned.';
  $('#runtime-platform').textContent = dash(data.runtime?.platform);
  $('#runtime-env').textContent = dash(data.runtime?.environment);
  $('#runtime-commit').textContent = short(data.runtime?.sourceCommit, 10);
}
async function load() {
  setConnection('', 'SYNCING');
  try {
    const data = await api('/api/command-center');
    render(data);
    authClose();
  } catch (error) {
    setConnection('error', error.status === 401 ? 'OWNER KEY REQUIRED' : 'LINK DEGRADED');
    $('#core-status').textContent = error.status === 401 ? 'LOCKED' : 'UNAVAILABLE';
    if (error.status === 401) authOpen('Enter the same ADMIN_TOKEN used by the existing UberBond admin console.');
    else $('#truth-state').textContent = 'UNAVAILABLE';
  }
}
function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { if (!document.hidden) load(); }, 30000);
}

$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  token = $('#owner-token').value.trim();
  if (!token) { $('#auth-error').textContent = 'Owner token required.'; return; }
  localStorage.revenueEngineToken = token;
  await load();
});
$('#open-auth').addEventListener('click', () => authOpen());
$('#refresh').addEventListener('click', load);
$('#toggle-map').addEventListener('click', () => {
  mapMode = mapMode === 'cognitive' ? 'synaptic' : 'cognitive';
  if (state) renderGraph(state);
});
$('#uber-core').addEventListener('click', () => { mapMode = 'cognitive'; if (state) renderGraph(state); });
$('#close-drawer').addEventListener('click', closeNode);
window.addEventListener('resize', () => { clearTimeout(window.__uberResize); window.__uberResize = setTimeout(() => state && renderGraph(state), 120); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });

if (!token) authOpen();
load();
scheduleRefresh();
