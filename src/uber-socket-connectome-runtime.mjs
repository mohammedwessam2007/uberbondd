import crypto from 'node:crypto';
import { compileUberBondCognitiveGraph, cognitiveGraphIntegrity, reachableNodes } from './uberbond-cognitive-graph.mjs';

export const UBER_SOCKET_CONNECTOME_RUNTIME_VERSION='uberbond.uber-socket-connectome-runtime.v1';

const TOKENS=s=>new Set(String(s||'').toLowerCase().match(/[a-z0-9_-]{3,}/g)||[]);
const SCORE=(mission,node)=>{
  const q=TOKENS(mission); const h=TOKENS(`${node.id} ${node.kind} ${node.label}`);
  let n=0; for(const t of q) if(h.has(t)) n++;
  return n;
};

export function createUberSocketConnectomeRuntime({runtime}={}){
  if(!runtime?.mesh||!runtime?.fabric||!runtime?.backplane||!runtime?.wholeBrain) throw new TypeError('whole-brain-uber-socket-runtime-required');

  function doctor(){
    const graph=compileUberBondCognitiveGraph();
    const integrity=cognitiveGraphIntegrity(graph);
    const inbound=new Map(graph.nodes.map(n=>[n.id,0]));
    const outbound=new Map(graph.nodes.map(n=>[n.id,0]));
    for(const e of graph.edges){ inbound.set(e.to,(inbound.get(e.to)||0)+1); outbound.set(e.from,(outbound.get(e.from)||0)+1); }
    const structurallyIsolated=graph.nodes.filter(n=>(inbound.get(n.id)||0)===0&&(outbound.get(n.id)||0)===0).map(n=>n.id);
    const roots=['context-spine','world-brain','agent-mesh','max-council'];
    const reachableFromRoots=new Set();
    for(const root of roots) for(const id of reachableNodes({graph,startNodeId:root,maxDepth:128})) reachableFromRoots.add(id);
    const notReachableFromCore=graph.nodes.filter(n=>!reachableFromRoots.has(n.id)&&!['world-sensing','truth-evidence'].includes(n.id)).map(n=>n.id);
    return Object.freeze({
      ok:integrity.ok===true&&structurallyIsolated.length===0,
      state:integrity.ok===true&&structurallyIsolated.length===0?'CONNECTOME_STRUCTURALLY_CONNECTED':'CONNECTOME_GAPS_FOUND',
      graphDigest:graph.graphDigest,
      nodeCount:graph.nodes.length,
      edgeCount:graph.edges.length,
      structurallyIsolated:Object.freeze(structurallyIsolated),
      notReachableFromCore:Object.freeze(notReachableFromCore),
      nodes:Object.freeze(graph.nodes.map(n=>Object.freeze({...n,inbound:inbound.get(n.id)||0,outbound:outbound.get(n.id)||0}))),
      externalEffectsAuthorized:false,
    });
  }

  function discoverOrgans({mission,limit=16}={}){
    const graph=compileUberBondCognitiveGraph();
    const ranked=graph.nodes.map(node=>({node,score:SCORE(mission,node)})).sort((a,b)=>b.score-a.score||a.node.id.localeCompare(b.node.id));
    const positives=ranked.filter(x=>x.score>0);
    const selected=(positives.length?positives:ranked.filter(x=>['context-spine','world-brain','agent-mesh','avengers','max-council','wallbreaker','economic-memory'].includes(x.node.id))).slice(0,Math.max(1,Math.min(32,Number(limit)||16)));
    return Object.freeze(selected.map(x=>Object.freeze({...x.node,relevance:x.score})));
  }

  async function compileMissionFanout({mission,request=mission,stakes={},frontier={},councilSize=8,synthesizerPeer=null,organLimit=16}={}){
    const objective=String(mission||request||'').trim();
    if(!objective) throw new Error('mission-required');
    const whole=await runtime.wholeBrain.compileMission({mission:objective,request,stakes,frontier,councilSize,synthesizerPeer});
    const organs=discoverOrgans({mission:objective,limit:organLimit});
    const peers=whole.discoveredPeers||[];
    const packets=organs.map((organ,index)=>Object.freeze({
      packetId:`ubconnect_${crypto.createHash('sha256').update(`${whole.missionId}:${organ.id}:${index}`).digest('hex').slice(0,24)}`,
      missionId:whole.missionId,
      targetNodeId:organ.id,
      targetKind:organ.kind,
      targetLabel:organ.label,
      objective:whole.monsterPrompt,
      sourcePeers:Object.freeze([...peers]),
      sharedDocIds:Object.freeze([...(whole.sharedDocIds||[])]),
      consequenceAuthority:'NONE',
      businessEffectAuthority:'NONE',
      externalEffectsAuthorized:false,
    }));
    return Object.freeze({
      ok:whole.ok===true,
      state:'CONNECTOME_MISSION_FANOUT_COMPILED',
      missionId:whole.missionId,
      mission:objective,
      wholeBrain:whole,
      organs:Object.freeze(organs),
      packets:Object.freeze(packets),
      doctor:doctor(),
      externalEffectsAuthorized:false,
    });
  }

  return Object.freeze({doctor,discoverOrgans,compileMissionFanout});
}
