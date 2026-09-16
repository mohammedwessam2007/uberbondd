import crypto from 'node:crypto';
import { compileUberMindExchange } from './ubermind-cognitive-exchange.mjs';

export const UBER_SOCKET_WHOLE_BRAIN_ORCHESTRATOR_VERSION='uberbond.uber-socket-whole-brain-orchestrator.v1';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||min));

export function createUberSocketWholeBrainOrchestrator({runtime}={}){
  if(!runtime?.mesh||!runtime?.fabric||!runtime?.backplane) throw new TypeError('uber-socket-runtime-required');

  function discoverPeers({mission,limit=20}={}){
    const docs=runtime.fabric.retrieve({query:String(mission||''),limit:100,minScore:0});
    const ranked=[]; const seen=new Set();
    for(const doc of docs){
      if(seen.has(doc.peerId)) continue;
      seen.add(doc.peerId); ranked.push(doc.peerId);
      if(ranked.length>=clamp(limit,1,50)) break;
    }
    if(!ranked.length){
      for(const peer of runtime.mesh.listPeers()){
        ranked.push(peer.peerId);
        if(ranked.length>=clamp(limit,1,50)) break;
      }
    }
    return Object.freeze(ranked);
  }

  async function compileMission({mission,request=mission,stakes={},frontier={},councilSize=8,synthesizerPeer=null}={}){
    const objective=String(mission||request||'').trim();
    if(!objective) throw new Error('mission-required');
    const peers=discoverPeers({mission:objective,limit:Math.max(councilSize,12)});
    if(!peers.length) throw new Error('no-project-chat-peers');
    const monster=await runtime.fabric.compileMonsterPrompt({
      request:String(request||objective),
      peerIds:peers,
      councilSize:Math.min(peers.length,clamp(councilSize,1,20)),
      synthesizerPeer,
    });
    const missionId=`ubersocket:${crypto.randomUUID()}`;
    const exchange=compileUberMindExchange({
      mission:{
        missionId,
        taskId:`${missionId}:task`,
        objective:monster.prompt,
        taskClass:'project-mission',
        role:'planner',
        dataClass:'INTERNAL_NON_SECRET',
        requiredTags:['uber-socket','shared-context','project-mesh'],
        contextTokenBudget:32000,
        minCouncilSize:2,
        maxCouncilSize:Math.min(8,Math.max(2,peers.length)),
      },
      stakes:{consequence:0.35,uncertainty:0.75,reversibility:0.9,founderImportance:0.9,...stakes},
      frontier,
    });
    const cognitive=runtime.backplane.publishMonsterPrompt({
      promptId:missionId,
      summary:`Whole-brain mission compiled from ${peers.length} relevant project chats; UberMind selected ${exchange.topology?.reasoningTier||'UNKNOWN'} cognition.`,
      evidenceRefs:[...(monster.sharedDocIds||[]).map(id=>`uber-socket://doc/${id}`),...peers.map(id=>`uber-socket://peer/${id}`)],
    });
    return Object.freeze({
      ok:monster.ok===true&&exchange.ok===true,
      missionId,
      mission:objective,
      discoveredPeers:peers,
      monsterPrompt:monster.prompt,
      sharedDocIds:monster.sharedDocIds,
      uberMind:exchange,
      cognitive,
      externalEffectsAuthorized:false,
    });
  }

  return Object.freeze({discoverPeers,compileMission});
}
