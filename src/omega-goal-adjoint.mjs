import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OMEGA_GOAL_ADJOINT_VERSION = 'uberbond.omega-goal-adjoint.v1';

const envelope = extra => ({ businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra });
const fail = (reasonCodes, extra = {}) => envelope({ ok: false, status: 'OMEGA_GOAL_ADJOINT_REFUSED', version: OMEGA_GOAL_ADJOINT_VERSION, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], ...extra });
const text = (value, max = 300) => { const out = String(value ?? '').trim(); return out && out.length <= max ? out : null; };
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function normalizeGraph(rawNodes) {
  if (!Array.isArray(rawNodes) || !rawNodes.length || rawNodes.length > 10000) return null;
  const rows = [];
  const ids = new Set();
  for (const raw of rawNodes) {
    const id = text(raw?.id, 120);
    const cost = Number(raw?.cost ?? 1);
    if (!id || ids.has(id) || !Number.isFinite(cost) || cost < 0) return null;
    ids.add(id);
    rows.push({ id, requires: Array.isArray(raw?.requires) ? [...new Set(raw.requires.map(String))].sort() : null, cost });
  }
  if (rows.some(row => !row.requires || row.requires.some(id => !ids.has(id) || id === row.id))) return null;
  const byId = new Map(rows.map(row => [row.id, row]));
  const color = new Map();
  const visit = id => {
    const state = color.get(id) || 0;
    if (state === 1) return false;
    if (state === 2) return true;
    color.set(id, 1);
    for (const dep of byId.get(id).requires) if (!visit(dep)) return false;
    color.set(id, 2);
    return true;
  };
  if ([...ids].some(id => !visit(id))) return null;
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

function ancestors(graph, terminalIds) {
  const byId = new Map(graph.map(row => [row.id, row]));
  const keep = new Set();
  const stack = [...terminalIds];
  while (stack.length) {
    const id = stack.pop();
    if (keep.has(id)) continue;
    keep.add(id);
    for (const dep of byId.get(id).requires) stack.push(dep);
  }
  return keep;
}

export function compileGoalAdjointSlice({ nodes = [], terminalIds = [], terminalContract = 'terminal-result' } = {}) {
  const graph = normalizeGraph(nodes);
  const terminals = Array.isArray(terminalIds) ? [...new Set(terminalIds.map(String))].sort() : [];
  const contract = text(terminalContract, 1000);
  if (!graph) return fail(['invalid-or-cyclic-dependency-graph']);
  const ids = new Set(graph.map(row => row.id));
  if (!terminals.length || terminals.some(id => !ids.has(id)) || !contract) return fail(['invalid-terminal-contract']);
  const keep = ancestors(graph, terminals);
  const retained = graph.filter(row => keep.has(row.id));
  const pruned = graph.filter(row => !keep.has(row.id));
  const baselineCost = graph.reduce((sum, row) => sum + row.cost, 0);
  const retainedCost = retained.reduce((sum, row) => sum + row.cost, 0);
  const core = {
    graphHash: digest(graph),
    terminalContractHash: digest({ terminals, contract }),
    terminalIds: terminals,
    retainedIds: retained.map(row => row.id),
    prunedIds: pruned.map(row => row.id)
  };
  return envelope({
    ok: true,
    status: 'OMEGA_GOAL_ADJOINT_COMPILED',
    version: OMEGA_GOAL_ADJOINT_VERSION,
    slice: {
      ...core,
      sliceHash: digest(core),
      baselineCost,
      retainedCost,
      deletedCost: baselineCost - retainedCost,
      deletedFraction: baselineCost > 0 ? (baselineCost - retainedCost) / baselineCost : 0,
      proofClass: 'EXACT_BACKWARD_REACHABILITY_ON_DECLARED_DEPENDENCY_GRAPH'
    },
    truthBoundary: 'Pruning is sound only relative to the declared dependency graph and terminal contract. Missing causal edges make the slice unsound; this compiler does not infer hidden causality.'
  });
}

export function verifyGoalAdjointSlice({ nodes = [], terminalIds = [], terminalContract = 'terminal-result', slice } = {}) {
  if (!slice?.sliceHash) return fail(['slice-required']);
  const rebuilt = compileGoalAdjointSlice({ nodes, terminalIds, terminalContract });
  if (!rebuilt.ok) return rebuilt;
  const valid = rebuilt.slice.sliceHash === slice.sliceHash && rebuilt.slice.graphHash === slice.graphHash && rebuilt.slice.terminalContractHash === slice.terminalContractHash;
  return envelope({
    ok: true,
    status: 'OMEGA_GOAL_ADJOINT_VERIFIED',
    version: OMEGA_GOAL_ADJOINT_VERSION,
    valid,
    expectedSliceHash: rebuilt.slice.sliceHash,
    observedSliceHash: slice.sliceHash
  });
}
