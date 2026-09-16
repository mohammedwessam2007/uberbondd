import { compileCognitiveEvent, routeCognitiveEvent, compileClosedLoopActivation } from './uberbond-cognitive-bus.mjs';
import { appendCognitiveJournalEvent } from './cognitive-event-journal.mjs';

export const UBER_SOCKET_COGNITIVE_BACKPLANE_VERSION='uberbond.uber-socket-cognitive-backplane.v1';

function compileAndRoute(input){
  const compiled=compileCognitiveEvent(input);
  if(!compiled.ok) return {ok:false,stage:'compile',compiled};
  const route=routeCognitiveEvent({compiledEvent:compiled});
  if(!route.ok) return {ok:false,stage:'route',compiled,route};
  return {ok:true,compiled,route,externalEffectsAuthorized:false};
}

export function createUberSocketCognitiveBackplane({journalPath=null}={}){
  const recent=[];

  function publish(input){
    const out=compileAndRoute(input);
    if(!out.ok) return out;
    let journal=null;
    if(journalPath) journal=appendCognitiveJournalEvent({journalPath,compiledEvent:out.compiled});
    recent.push(out.compiled);
    if(recent.length>1000) recent.splice(0,recent.length-1000);
    return Object.freeze({...out,journal});
  }

  function publishChatContent({peerId,docId,title='',summary='',evidenceRefs=[],observedAt=new Date()}={}){
    return publish({
      kind:'MEMORY_UPDATE',
      sourceNodeId:'context-spine',
      subjectType:'CHAT_CONTEXT',
      subjectId:`${peerId}:${docId}`,
      summary:`UberSocket ingested shared chat content from ${peerId}${title?` (${title})`:''}. ${summary||'Content is available to the shared project context fabric.'}`,
      evidenceRefs,
      payloadRef:`uber-socket://peer/${peerId}/doc/${docId}`,
      truthClass:'RESEARCH_ASSET',
      observedAt
    });
  }

  function publishPeerFinding({peerId,subjectId,summary,evidenceRefs=[],kind='DECISION_UPDATE',observedAt=new Date()}={}){
    return publish({kind,sourceNodeId:'world-brain',subjectType:'PEER_FINDING',subjectId:subjectId||peerId,summary,evidenceRefs,truthClass:'RESEARCH_ASSET',observedAt});
  }

  function publishCouncilResult({councilId,summary,evidenceRefs=[],observedAt=new Date()}={}){
    return publish({
      kind:'DECISION_UPDATE',sourceNodeId:'max-council',subjectType:'COUNCIL_RESULT',subjectId:councilId,
      summary,evidenceRefs,payloadRef:`uber-socket://council/${councilId}`,truthClass:'RESEARCH_ASSET',observedAt
    });
  }

  function publishContradiction({subjectId,summary,evidenceRefs=[],observedAt=new Date()}={}){
    return publish({kind:'CONTRADICTION',sourceNodeId:'world-brain',subjectType:'CROSS_CHAT_CONTRADICTION',subjectId,summary,evidenceRefs,truthClass:'RESEARCH_ASSET',observedAt});
  }

  function publishBlocker({subjectId,summary,evidenceRefs=[],observedAt=new Date()}={}){
    return publish({kind:'BLOCKER',sourceNodeId:'max-council',subjectType:'MISSION_BLOCKER',subjectId,summary,evidenceRefs,truthClass:'RESEARCH_ASSET',observedAt});
  }

  function publishMonsterPrompt({promptId,summary,evidenceRefs=[],observedAt=new Date()}={}){
    return publish({
      kind:'FEATURE_GENESIS',sourceNodeId:'world-brain',subjectType:'MONSTER_PROMPT',subjectId:promptId,
      summary,evidenceRefs,payloadRef:`uber-socket://monster/${promptId}`,truthClass:'RESEARCH_ASSET',observedAt
    });
  }

  function closeLoop(){
    return compileClosedLoopActivation({events:[...recent]});
  }

  return Object.freeze({publishChatContent,publishPeerFinding,publishCouncilResult,publishContradiction,publishBlocker,publishMonsterPrompt,closeLoop});
}
