import crypto from 'node:crypto';
import { reachableNodes } from './uberbond-cognitive-graph.mjs';

export const CONNECTOME_AUTOPOIESIS_VERSION = 'uberbond.connectome-autopoiesis.v1';

const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  customerMessages:0,
  providerCalls:0,
  spendCents:0,
  deployments:0,
  dnsChanges:0,
  credentialChanges:0,
  paymentMutations:0,
  productionMutations:0
});

export const CONNECTOME_SYNERGY_CONTRACTS = Object.freeze([
  ['avengers','temporal-foundry'],
  ['temporal-foundry','avengers'],
  ['max-council','temporal-foundry'],
  ['temporal-foundry','max-council'],
  ['avengers','timeline-topology'],
  ['timeline-topology','avengers'],
  ['max-council','timeline-topology'],
  ['timeline-topology','max-council'],
  ['temporal-foundry','timeline-topology'],
  ['timeline-topology','sandwich'],
  ['sandwich','avengers'],
  ['sandwich','max-council'],
  ['sandwich','self-maintainer'],
  ['connectome-autopoiesis','genesis'],
  ['connectome-autopoiesis','capability-genome'],
  ['connectome-autopoiesis','avengers'],
  ['connectome-autopoiesis','max-council'],
  ['connectome-autopoiesis','temporal-foundry'],
  ['connectome-autopoiesis','timeline-topology'],
  ['connectome-autopoiesis','sandwich'],
  ['connectome-autopoiesis','economic-memory']
].map(([from,to])=>Object.freeze({from,to,maxDistance:1})));

const text=(value,max=1000)=>{const out=String(value??'').trim();return out&&out.length<=max?out:null;};
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO_EXTERNAL_EFFECTS},...extra});
const fail=(reasonCodes,extra={})=>envelope({ok:false,status:'CONNECTOME_AUTOPOIESIS_REFUSED',version:CONNECTOME_AUTOPOIESIS_VERSION,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],...extra});

function adjacency(graph){
  const map=new Map(graph.nodes.map(node=>[node.id,[]]));
  for(const edge of graph.edges||[]){if(map.has(edge.from))map.get(edge.from).push(edge.to);}
  return map;
}

export function shortestConnectomePath({graph,from,to,maxDepth=32}={}){
  if(!graph?.ok||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))return null;
  const source=text(from,120)?.toLowerCase();
  const target=text(to,120)?.toLowerCase();
  if(!source||!target||!graph.nodes.some(n=>n.id===source)||!graph.nodes.some(n=>n.id===target))return null;
  if(source===target)return[source];
  const adj=adjacency(graph);const seen=new Set([source]);const queue=[[source]];
  while(queue.length){
    const path=queue.shift();
    if(path.length-1>=maxDepth)continue;
    for(const next of adj.get(path.at(-1))||[]){
      if(seen.has(next))continue;
      const candidate=[...path,next];
      if(next===target)return candidate;
      seen.add(next);queue.push(candidate);
    }
  }
  return null;
}

function directEdge(graph,from,to){return(graph.edges||[]).find(edge=>edge.from===from&&edge.to===to)||null;}

export function auditUberBondConnectome({graph,synergyContracts=CONNECTOME_SYNERGY_CONTRACTS}={}){
  if(!graph?.ok||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))return fail(['valid-cognitive-graph-required']);
  const nodeIds=new Set(graph.nodes.map(node=>node.id));
  const gaps=[];
  for(const contract of synergyContracts){
    const from=text(contract?.from,120)?.toLowerCase();const to=text(contract?.to,120)?.toLowerCase();
    const maxDistance=Number.isInteger(contract?.maxDistance)?Math.max(1,contract.maxDistance):1;
    if(!from||!to||!nodeIds.has(from)||!nodeIds.has(to)){gaps.push({kind:'MISSING_ORGAN',from,to,maxDistance});continue;}
    const path=shortestConnectomePath({graph,from,to});
    const distance=path?path.length-1:null;
    if(distance===null||distance>maxDistance)gaps.push({kind:distance===null?'DISCONNECTED_SYNERGY':'INDIRECT_SYNERGY',from,to,maxDistance,currentDistance:distance,path});
  }
  const worldReach=new Set(reachableNodes({graph,startNodeId:'world-sensing'}));
  const structural=[];
  for(const node of graph.nodes){
    if(!worldReach.has(node.id))structural.push({kind:'UNREACHABLE_FROM_WORLD',nodeId:node.id});
    const toLearning=new Set(reachableNodes({graph,startNodeId:node.id}));
    if(!toLearning.has('economic-memory'))structural.push({kind:'NO_LEARNING_RETURN',nodeId:node.id});
  }
  const core={graphDigest:graph.graphDigest||digest({nodes:graph.nodes,edges:graph.edges}),synergyGapCount:gaps.length,structuralGapCount:structural.length,gaps,structural};
  return envelope({
    ok:true,
    status:gaps.length||structural.length?'CONNECTOME_INTEGRATION_DEBT':'CONNECTOME_SYNERGY_CONTRACTS_SATISFIED',
    version:CONNECTOME_AUTOPOIESIS_VERSION,
    ...core,
    auditDigest:digest(core),
    truthBoundary:'CONNECTIVITY_IS_INFORMATION_AND_CONTEXT_REACHABILITY_ONLY__AN_EDGE_DOES_NOT_PROVE_USEFUL_REASONING_OR_CREATE_EXECUTION_AUTHORITY'
  });
}

export function compileConnectomeAutopoiesis({graph,evidenceRefs=[]}={}){
  const audit=auditUberBondConnectome({graph});
  if(!audit.ok)return audit;
  if(audit.status==='CONNECTOME_SYNERGY_CONTRACTS_SATISFIED')return envelope({ok:true,status:'CONNECTOME_NO_FEATURE_REQUIRED',version:CONNECTOME_AUTOPOIESIS_VERSION,audit,featureCandidate:null,eventInput:null});
  const refs=[...new Set((Array.isArray(evidenceRefs)?evidenceRefs:[]).map(v=>text(v,1000)).filter(Boolean))];
  refs.push(`connectome-audit://${audit.auditDigest}`);
  const gap=audit.gaps[0]||audit.structural[0];
  let from='connectome-autopoiesis';let to='max-council';
  if(gap?.from&&gap?.to){from=gap.from;to=gap.to;}
  else if(gap?.nodeId){to=gap.nodeId;}
  const requirementName=`Connectome bridge ${from} -> ${to}`;
  const featureCandidate={
    requirementName,
    foldClass:'INTERNAL_SOURCE',
    producerNodeId:from,
    consumerNodeId:to,
    relation:'FEEDS',
    evidenceRefs:refs,
    acceptanceEvidence:[
      `SOURCE: canonical cognitive graph contains a typed information path for ${from} -> ${to}`,
      'TEST: connectome audit closes the targeted gap without creating orphan nodes, cycles of authority, or external effects'
    ],
    rationale:`Connectome Autopoiesis observed ${gap?.kind||'integration debt'} and proposes one bounded bridge hypothesis. The bridge is not self-authorized and must pass normal Sandwich, verification and promotion authority.`
  };
  const eventInput={
    kind:'CONNECTOME_GAP',
    sourceNodeId:'connectome-autopoiesis',
    subjectType:'INTEGRATION_FEATURE_CANDIDATE',
    subjectId:digest(featureCandidate).slice(0,32),
    summary:`Connectome integration debt: ${gap?.kind||'gap'} ${from} -> ${to}. Investigate one bounded bridge before adding unrelated architecture.`,
    evidenceRefs:refs,
    truthClass:'RESEARCH_ASSET'
  };
  return envelope({
    ok:true,
    status:'CONNECTOME_FEATURE_HYPOTHESIS_READY',
    version:CONNECTOME_AUTOPOIESIS_VERSION,
    audit,
    featureCandidate,
    eventInput,
    law:'NEW_FEATURES_MUST_JOIN_THE_LIVING_CONNECTOME__ISOLATED_CAPABILITY_IS_INCOMPLETE_CAPABILITY',
    admissionBoundary:'THIS_IS_A_FEATURE_HYPOTHESIS_ONLY__IT_CANNOT_EDIT_SOURCE_ADMIT_ITS_OWN_REQUIREMENT_OR_EXPAND_AUTHORITY'
  });
}
