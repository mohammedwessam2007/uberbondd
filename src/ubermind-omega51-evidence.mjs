// Omega51: pure, bounded, zero-network retrieval and OWN-INFRASTRUCTURE resilience checks.
// Neither function attempts exploitation, profiling, external scanning, or model inference.
const normalize = s => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ').trim();
export function selectOmega51(mission, index, {maxChars=650}={}) {
  if (typeof mission !== 'string' || !mission.trim() || mission.length > 3200) throw new TypeError('BOUNDED_MISSION_REQUIRED');
  if (index?.schema !== 'ubermind.omega51.technical-dna.v1' || !Array.isArray(index.dimensions) || index.dimensions.length !== 8) throw new TypeError('OMEGA51_INDEX_REQUIRED');
  const hay = ` ${normalize(mission)} `;
  const hits = index.dimensions.map(d => ({id:d.id, count:d.terms.filter(t => hay.includes(` ${normalize(t)} `)).length}))
    .filter(d => d.count > 0).sort((a,b)=>b.count-a.count || a.id.localeCompare(b.id));
  if (!hits.length) return null;
  const result = {schema:'ubermind.omega51.pointer.v1', atoms:hits.slice(0,3).map(x=>x.id),
    source:index.sourcebook, redTeam:'hypothesis; strongest counterexample; repair; measurable acceptance',
    status:'RESEARCH_ONLY', authority:'NO_EXTERNAL_EFFECTS'};
  if (JSON.stringify(result).length > maxChars) throw new RangeError('OMEGA51_PACKET_BUDGET');
  return result;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/;
/** Identify SINGLE POINTS OF FAILURE in resources the owner explicitly controls. */
export function auditOwnedDependencyGraph(graph) {
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.entrypoints)) throw new TypeError('OWN_GRAPH_REQUIRED');
  if (graph.nodes.length === 0 || graph.nodes.length > 80 || graph.edges.length > 200 || graph.entrypoints.length === 0 || graph.entrypoints.length > 16) throw new RangeError('GRAPH_BOUNDS');
  const ids = new Set();
  for (const n of graph.nodes) {
    if (!n || !ID.test(n.id) || n.owned !== true || typeof n.critical !== 'boolean' || ids.has(n.id)) throw new TypeError('INVALID_OR_UNOWNED_NODE');
    ids.add(n.id);
  }
  const entries = new Set();
  for (const id of graph.entrypoints) {
    if (!ids.has(id) || entries.has(id)) throw new TypeError('INVALID_ENTRYPOINT');
    entries.add(id);
  }
  const map = new Map([...ids].map(id=>[id,[]]));
  const seenEdges = new Set();
  for(const e of graph.edges) {
    if (!e || !ids.has(e.from) || !ids.has(e.to) || e.from===e.to) throw new TypeError('INVALID_EDGE');
    const key=`${e.from}\u0000${e.to}`;
    if(seenEdges.has(key)) throw new TypeError('DUPLICATE_EDGE');
    seenEdges.add(key); map.get(e.from).push(e.to);
  }
  const visit=(excluded)=>{
    const got=new Set([...entries].filter(x=>x!==excluded)),queue=[...got];
    for(let i=0;i<queue.length;i++)for(const next of map.get(queue[i]))if(next!==excluded&&!got.has(next)){got.add(next);queue.push(next)}
    return got;
  };
  const baseline=visit(null);
  const critical=graph.nodes.filter(n=>n.critical).map(n=>n.id);
  const disconnectedAtBaseline=critical.filter(x=>!baseline.has(x));
  const singlePoints=[];
  for(const node of graph.nodes){
    if(entries.has(node.id) || !baseline.has(node.id))continue;
    const after=visit(node.id);
    // A removed critical node is itself unavailable. Count *other* dependent critical nodes only.
    const lost=critical.filter(id=>id!==node.id && baseline.has(id) && !after.has(id));
    if(lost.length)singlePoints.push({resource:node.id,dependentCriticalServices:lost.length});
  }
  singlePoints.sort((a,b)=>b.dependentCriticalServices-a.dependentCriticalServices||a.resource.localeCompare(b.resource));
  return {schema:'ubermind.omega51.owned-resilience.v1',scope:'OWNED_RESOURCES_ONLY',
    nodes:ids.size,edges:seenEdges.size,criticalServices:critical.length,
    baselineUnreachableCritical:disconnectedAtBaseline.length,
    singlePoints,coverage:'STRUCTURAL_ONLY__NOT_A_PENETRATION_TEST',effects:'NONE'};
}

/** A bounded *completeness* gate for strategic review, not a truth/approval verdict. */
export function assessStrategicReviewContract(record) {
  if (!record || typeof record!=='object' || Array.isArray(record)) throw new TypeError('STRATEGY_RECORD_REQUIRED');
  const present=s=>typeof s==='string'&&s.trim().length>=8&&s.length<=6000;
  const missing=[];
  for(const field of ['objective','proposal','strongestCounterexample','repairOrFallback','residualUncertainty']) {
    if(!present(record[field])) missing.push(field);
  }
  if(!Array.isArray(record.evidencePointers) || record.evidencePointers.length<1 || record.evidencePointers.length>12 ||
    record.evidencePointers.some(p=>!present(p))) missing.push('evidencePointers');
  if(!Array.isArray(record.acceptanceCriteria) || record.acceptanceCriteria.length<1 || record.acceptanceCriteria.length>12 ||
    record.acceptanceCriteria.some(p=>!present(p))) missing.push('acceptanceCriteria');
  if(record.authority!=='NONE' && record.authority!=='OWNER_REVIEW_REQUIRED')missing.push('authority');
  return {schema:'ubermind.omega51.strategy-contract.v1',complete:missing.length===0,
    missing,verdict:missing.length?'REPAIR_REQUIRED':'REVIEWABLE_NOT_ACCEPTED',
    independentVerification:'NOT_PERFORMED',effects:'NONE'};
}
