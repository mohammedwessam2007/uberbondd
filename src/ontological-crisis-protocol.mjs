// Ontological Crisis Protocol.
//
// When a foundational assumption fails, the dangerous behavior is to repair the
// sentence that named it while leaving every downstream forecast and
// recommendation alive. This module traces dependency contamination and emits a
// rebuild plan. It never rewrites history, human values, choices, or authority.
export const ONTOLOGICAL_CRISIS_PROTOCOL_VERSION = 'uberbond.ontological-crisis-protocol.v1';

export const CRISIS_NODE_TYPES = Object.freeze([
  'ONTOLOGY', 'ASSUMPTION', 'OBSERVATION', 'BELIEF', 'MODEL', 'PREDICTION',
  'VALUE', 'RECOMMENDATION', 'CHOICE', 'AUTHORITY', 'ACTION', 'OUTCOME'
]);

const REBUILDABLE = new Set(['ONTOLOGY', 'ASSUMPTION', 'OBSERVATION', 'BELIEF', 'MODEL', 'PREDICTION', 'RECOMMENDATION']);
const HUMAN_BOUNDARY = new Set(['VALUE', 'CHOICE', 'AUTHORITY']);
const HISTORICAL = new Set(['ACTION', 'OUTCOME']);
const text = (value, max = 300) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'ONTOLOGICAL_CRISIS_REFUSED',
  reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

function normalize(nodes) {
  const rows = (Array.isArray(nodes) ? nodes : []).map(row => ({
    id: text(row?.id, 160),
    type: text(row?.type, 80)?.toUpperCase(),
    dependsOn: [...new Set((Array.isArray(row?.dependsOn) ? row.dependsOn : []).map(value => text(value, 160)).filter(Boolean))],
    evidenceRef: text(row?.evidenceRef, 300),
    label: text(row?.label, 300)
  }));
  return rows;
}

function graphValidation(rows) {
  const reasons = [];
  if (!rows.length) reasons.push('dependency-nodes-required');
  if (rows.some(row => !row.id || !CRISIS_NODE_TYPES.includes(row.type))) reasons.push('every-node-needs-id-and-known-type');
  const ids = rows.map(row => row.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) reasons.push('duplicate-node-id');
  const idSet = new Set(ids);
  for (const row of rows) {
    for (const dep of row.dependsOn) if (!idSet.has(dep)) reasons.push(`dangling-dependency:${row.id}->${dep}`);
  }
  if (reasons.length) return { ok: false, reasons };

  const byId = new Map(rows.map(row => [row.id, row]));
  const visiting = new Set();
  const visited = new Set();
  const cycle = [];
  function visit(id, path = []) {
    if (visited.has(id) || cycle.length) return;
    if (visiting.has(id)) {
      const start = path.indexOf(id);
      cycle.push(...path.slice(start), id);
      return;
    }
    visiting.add(id);
    const row = byId.get(id);
    for (const dep of row.dependsOn) visit(dep, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const row of rows) visit(row.id, []);
  if (cycle.length) reasons.push(`dependency-cycle:${cycle.join('>')}`);
  return { ok: reasons.length === 0, reasons, byId };
}

/**
 * Trace all downstream conclusions contaminated by failed foundational nodes.
 *
 * Only ONTOLOGY, ASSUMPTION, OBSERVATION, BELIEF and MODEL may be declared
 * failed roots here. A human value is not a proposition UberBond gets to mark
 * false, and a past action/outcome is history rather than a stale model.
 */
export function traceOntologicalCrisis({ nodes = [], failedIds = [], crisisRef = null } = {}) {
  const rows = normalize(nodes);
  const validation = graphValidation(rows);
  if (!validation.ok) return fail(validation.reasons);
  const roots = [...new Set((Array.isArray(failedIds) ? failedIds : []).map(value => text(value, 160)).filter(Boolean))];
  if (!roots.length) return fail(['failed-root-required']);
  const byId = validation.byId;
  const reasons = [];
  for (const id of roots) {
    const row = byId.get(id);
    if (!row) reasons.push(`unknown-failed-root:${id}`);
    else if (!new Set(['ONTOLOGY', 'ASSUMPTION', 'OBSERVATION', 'BELIEF', 'MODEL']).has(row.type)) reasons.push(`failed-root-type-not-system-invalidatable:${row.type}`);
  }
  if (reasons.length) return fail(reasons);

  const children = new Map(rows.map(row => [row.id, []]));
  for (const row of rows) for (const dep of row.dependsOn) children.get(dep).push(row.id);
  const contaminated = new Set(roots);
  const queue = [...roots];
  while (queue.length) {
    const id = queue.shift();
    for (const child of children.get(id) || []) {
      if (contaminated.has(child)) continue;
      contaminated.add(child);
      queue.push(child);
    }
  }

  const dispositions = rows.map(row => {
    if (!contaminated.has(row.id)) return { id: row.id, type: row.type, disposition: 'UNAFFECTED' };
    if (HUMAN_BOUNDARY.has(row.type)) {
      return { id: row.id, type: row.type, disposition: 'FOUNDER_REVIEW_REQUIRED__NOT_INVALIDATED' };
    }
    if (HISTORICAL.has(row.type)) {
      return { id: row.id, type: row.type, disposition: 'HISTORICAL_FACT_PRESERVED__INTERPRETATION_REVIEW_REQUIRED' };
    }
    return { id: row.id, type: row.type, disposition: 'INVALIDATED__REBUILD_REQUIRED' };
  });

  const invalidated = dispositions.filter(row => row.disposition === 'INVALIDATED__REBUILD_REQUIRED').map(row => row.id);
  const reviewRequired = dispositions.filter(row => /REVIEW_REQUIRED/.test(row.disposition)).map(row => row.id);
  return {
    ok: true,
    status: 'ONTOLOGICAL_CRISIS_TRACED',
    crisisRef: text(crisisRef, 300),
    failedRoots: roots,
    contaminated: [...contaminated],
    invalidated,
    reviewRequired,
    unaffected: dispositions.filter(row => row.disposition === 'UNAFFECTED').map(row => row.id),
    dispositions,
    businessEffectAuthority: 'NONE',
    truthBoundary: 'INVALIDATING_A_MODEL_DOES_NOT_INVALIDATE_HUMAN_VALUES_OR_REWRITE_ACTIONS_AND_OUTCOMES_THAT_ALREADY_HAPPENED'
  };
}

/**
 * Produce a dependency-respecting rebuild sequence for invalidated system
 * claims. Failed roots come first; recommendations come last. Human-boundary and
 * historical nodes never enter the automatic rebuild list.
 */
export function compileOntologyRebuild({ nodes = [], crisis } = {}) {
  if (!crisis?.ok || crisis.status !== 'ONTOLOGICAL_CRISIS_TRACED') return fail(['valid-traced-crisis-required']);
  const rows = normalize(nodes);
  const validation = graphValidation(rows);
  if (!validation.ok) return fail(validation.reasons);
  const invalidSet = new Set(crisis.invalidated || []);
  const byId = validation.byId;
  const ordered = [];
  const visited = new Set();
  function visit(id) {
    if (visited.has(id) || !invalidSet.has(id)) return;
    visited.add(id);
    for (const dep of byId.get(id)?.dependsOn || []) visit(dep);
    ordered.push(id);
  }
  for (const id of invalidSet) visit(id);

  const steps = ordered
    .map(id => byId.get(id))
    .filter(row => row && REBUILDABLE.has(row.type))
    .map(row => ({
      id: row.id,
      type: row.type,
      operation: row.type === 'OBSERVATION' ? 'REOBSERVE' : row.type === 'PREDICTION' ? 'REFORCAST' : row.type === 'RECOMMENDATION' ? 'RERECOMMEND' : 'REBUILD',
      dependsOn: row.dependsOn.filter(dep => invalidSet.has(dep))
    }));

  return {
    ok: true,
    status: 'ONTOLOGY_REBUILD_PLAN_READY',
    steps,
    founderReviewRequired: (crisis.reviewRequired || []).length > 0,
    reviewRequired: crisis.reviewRequired || [],
    businessEffectAuthority: 'NONE',
    truthBoundary: 'A_REBUILD_PLAN_RECOMPUTES_SYSTEM_CLAIMS_ONLY__IT_DOES_NOT_REWRITE_HUMAN_VALUES_CHOICE_AUTHORITY_ACTION_OR_OUTCOME'
  };
}
