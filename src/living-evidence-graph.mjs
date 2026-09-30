import { semanticHash, impactedSemanticNodes } from './semantic-closure-kernel.mjs';

const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:/-]{1,240}$/.test(v);
const PROOF_CLASSES=new Set(['E0','E1','E2','E3','E4','CURRENT_CROWN']);

export function createLivingEvidenceGraph({nodes,roots,qualityContractHash,crownRevision,createdAt=new Date().toISOString()}={}){
  if(!Array.isArray(nodes)||!nodes.length||nodes.length>100000||!Array.isArray(roots)||!roots.length)throw new Error('bounded-evidence-graph-required');
  if(!digest(qualityContractHash)||!id(crownRevision)||!Number.isFinite(Date.parse(createdAt)))throw new Error('graph-quality-crown-time-required');
  const ids=new Set();
  for(const node of nodes){
    if(!plain(node)||!id(node.id)||ids.has(node.id)||!Array.isArray(node.dependencies)||!digest(node.contentHash)||!PROOF_CLASSES.has(node.proofClass)||typeof node.proofRef!=='string'||!node.proofRef)throw new Error('valid-unique-evidence-node-required');
    ids.add(node.id);
    if(node.kind==='SOURCE'){
      if(!id(node.sourceKey)||!digest(node.sourceHash)||node.dependencies.length)throw new Error('source-node-contract-required');
    }else if(!['DERIVED','CLAIM'].includes(node.kind))throw new Error('known-evidence-node-kind-required');
  }
  for(const node of nodes)for(const dep of node.dependencies)if(!ids.has(dep))throw new Error('evidence-dependency-missing');
  if(new Set(roots).size!==roots.length||roots.some(r=>!ids.has(r)))throw new Error('known-unique-roots-required');
  const byId=new Map(nodes.map(n=>[n.id,n])),visiting=new Set(),done=new Set();
  function visit(nodeId){
    if(done.has(nodeId))return;
    if(visiting.has(nodeId))throw new Error('evidence-graph-cycle');
    visiting.add(nodeId);
    for(const dep of byId.get(nodeId).dependencies)visit(dep);
    visiting.delete(nodeId);done.add(nodeId);
  }
  for(const node of nodes)visit(node.id);
  impactedSemanticNodes(nodes,[]);
  const graph={schemaVersion:'uberbond.living-evidence-graph.v1',qualityContractHash,crownRevision,createdAt,nodes:structuredClone(nodes),roots:structuredClone(roots)};
  graph.graphHash=semanticHash({...graph,graphHash:undefined});
  return graph;
}

export function planLivingEvidenceDelta({graph,currentSourceHashes,currentCrownRevision=graph?.crownRevision}={}){
  if(graph?.schemaVersion!=='uberbond.living-evidence-graph.v1'||graph.graphHash!==semanticHash({...graph,graphHash:undefined}))throw new Error('current-untampered-evidence-graph-required');
  if(!plain(currentSourceHashes))throw new Error('current-source-hashes-required');
  const sourceNodes=graph.nodes.filter(n=>n.kind==='SOURCE');
  const changed=[];
  for(const node of sourceNodes){
    const current=currentSourceHashes[node.sourceKey];
    if(!digest(current))throw new Error('complete-current-source-state-required:'+node.sourceKey);
    if(current!==node.sourceHash)changed.push(node.id);
  }
  const crownChanged=currentCrownRevision!==graph.crownRevision;
  const affected=crownChanged?graph.nodes.map(n=>n.id):impactedSemanticNodes(graph.nodes,changed).affectedIds;
  const affectedSet=new Set(affected);
  const reusable=graph.nodes.filter(n=>!affectedSet.has(n.id)).map(n=>n.id);
  return {
    status:'LIVING_EVIDENCE_DELTA_PLANNED',
    graphHash:graph.graphHash,changedSourceIds:changed,affectedIds:affected,reusableIds:reusable,
    totalNodes:graph.nodes.length,recomputeFraction:graph.nodes.length?affected.length/graph.nodes.length:0,
    reuseFraction:graph.nodes.length?reusable.length/graph.nodes.length:0,
    crownSuccessionInvalidatedAll:crownChanged,
    semanticAuthority:'EXACT_DEPENDENCY_INVALIDATION_ONLY',
    claimBoundary:'Unchanged nodes are reusable only because their exact dependencies, source hashes, quality contract and Crown revision remain unchanged.'
  };
}

export function applyLivingEvidenceDelta({graph,plan,currentSourceHashes,replacements,currentCrownRevision=graph?.crownRevision,appliedAt=new Date().toISOString()}={}){
  if(plan?.graphHash!==graph?.graphHash||!Array.isArray(replacements)||!Number.isFinite(Date.parse(appliedAt)))throw new Error('bound-delta-plan-and-replacements-required');
  const replacementMap=new Map(replacements.map(r=>[r.id,r]));
  if(replacementMap.size!==replacements.length||replacementMap.size!==plan.affectedIds.length||plan.affectedIds.some(id=>!replacementMap.has(id)))throw new Error('complete-exact-affected-replacements-required');
  const oldById=new Map(graph.nodes.map(n=>[n.id,n]));
  const nextNodes=graph.nodes.map(old=>{
    if(!replacementMap.has(old.id))return structuredClone(old);
    const next=structuredClone(replacementMap.get(old.id));
    if(next.id!==old.id||next.kind!==old.kind||!Array.isArray(next.dependencies)||JSON.stringify(next.dependencies)!==JSON.stringify(old.dependencies)||!digest(next.contentHash)||!PROOF_CLASSES.has(next.proofClass)||typeof next.proofRef!=='string'||!next.proofRef)throw new Error('replacement-structure-or-proof-invalid');
    if(next.kind==='SOURCE'){
      if(next.sourceKey!==old.sourceKey||next.sourceHash!==currentSourceHashes[next.sourceKey])throw new Error('replacement-source-hash-not-current');
    }
    return next;
  });
  return createLivingEvidenceGraph({nodes:nextNodes,roots:graph.roots,qualityContractHash:graph.qualityContractHash,crownRevision:currentCrownRevision,createdAt:appliedAt});
}

export function modelLivingEvidenceDeltaCompression({
  directOpusUsd=0.85,changedSourceTokens,deltaWorkerOutputTokens=100,crownResidualInputTokens=500,crownOutputTokens=6,
  workerInputUsdPerMillion=.13,workerOutputUsdPerMillion=.52,crownInputUsdPerMillion=4,crownOutputUsdPerMillion=20
}={}){
  for(const n of [directOpusUsd,changedSourceTokens,deltaWorkerOutputTokens,crownResidualInputTokens,crownOutputTokens,workerInputUsdPerMillion,workerOutputUsdPerMillion,crownInputUsdPerMillion,crownOutputUsdPerMillion])if(!Number.isFinite(Number(n))||Number(n)<0)throw new Error('nonnegative-model-inputs-required');
  const workerUsd=changedSourceTokens*workerInputUsdPerMillion/1e6+deltaWorkerOutputTokens*workerOutputUsdPerMillion/1e6;
  const crownUsd=crownResidualInputTokens*crownInputUsdPerMillion/1e6+crownOutputTokens*crownOutputUsdPerMillion/1e6;
  const uberMindUsd=workerUsd+crownUsd;
  return {
    status:'LIVING_EVIDENCE_DELTA_CAPACITY_MODEL_ONLY',directOpusUsd,uberMindUsd,
    multiplier:uberMindUsd>0?directOpusUsd/uberMindUsd:null,workerUsd,crownUsd,
    claimBoundary:'Modeled update workload only. Counts unchanged evidence as reusable only when exact graph invalidation proves it unaffected; changed semantics still require current proof/Crown authority.'
  };
}
