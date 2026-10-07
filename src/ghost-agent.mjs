import { semanticHash } from './semantic-closure-kernel.mjs';
import { executeDecisionFranchise } from './decision-franchise.mjs';

const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:/-]{1,240}$/.test(v);

export function compileGhostAgentFromFranchise({
  record,trustPin,eventType,payloadField='payload',compiledAt=new Date().toISOString()
}={}){
  if(!plain(record)||record.kind!=='DECISION_FRANCHISE'||record.status!=='ACTIVE'||semanticHash(record)!==trustPin)throw new Error('trusted-active-franchise-required');
  if(!id(eventType)||!id(payloadField)||!Number.isFinite(Date.parse(compiledAt)))throw new Error('ghost-event-contract-required');
  if(record.spec?.sideEffectClass!=='NONE')throw new Error('ghost-agent-side-effects-forbidden');
  const ghost={
    schemaVersion:'uberbond.ghost-agent.v1',
    eventType,payloadField,
    franchiseRecord:structuredClone(record),franchiseTrustPin:trustPin,
    taskClass:record.spec.taskClass,qualityContractHash:record.spec.qualityContractHash,
    relevantKeys:structuredClone(record.spec.relevantKeys),
    compiledAt,
    providerCallsRequired:0,
    idleInferenceRequired:false,
    externalEffectAuthority:'NONE'
  };
  ghost.ghostHash=semanticHash({...ghost,ghostHash:undefined});
  return ghost;
}

export function executeGhostAgent({ghost,event,currentContext,now=Date.now(),semanticCanonicalizers={}}={}){
  try{
    if(ghost?.schemaVersion!=='uberbond.ghost-agent.v1'||ghost.ghostHash!==semanticHash({...ghost,ghostHash:undefined}))throw new Error('untampered-ghost-agent-required');
    if(!plain(event)||!id(event.eventId)||!id(event.type))throw new Error('typed-event-required');
    if(event.type!==ghost.eventType)return {
      ok:true,status:'GHOST_AGENT_SLEEP',eventId:event.eventId,
      providerCallsPerformed:0,inferenceUsd:0,decision:null,
      semanticAuthority:'NONE',externalEffectAuthority:'NONE'
    };
    const payload=event[ghost.payloadField];
    if(!plain(payload))throw new Error('ghost-event-payload-required');
    const task={
      taskId:'ghost:'+event.eventId,
      taskClass:ghost.taskClass,
      qualityContractHash:ghost.qualityContractHash,
      sideEffectClass:'NONE',
      payload:structuredClone(payload)
    };
    const result=executeDecisionFranchise({
      record:ghost.franchiseRecord,trustPin:ghost.franchiseTrustPin,
      task,currentContext,now,semanticCanonicalizers
    });
    if(!result.ok)return {
      ok:false,status:'GHOST_AGENT_DECOMPILE_TO_FRONTIER',
      eventId:event.eventId,reasons:result.reasons,
      providerCallsPerformed:0,inferenceUsd:0,
      semanticAuthority:'NONE',externalEffectAuthority:'NONE',
      decompileRequired:true
    };
    return {
      ok:true,status:'GHOST_AGENT_EXECUTED',
      eventId:event.eventId,eventHash:semanticHash(event),
      decision:structuredClone(result.decision),
      franchiseId:result.franchiseId,franchiseHash:result.franchiseHash,
      proofClass:result.proofClass,
      providerCallsPerformed:0,inferenceUsd:0,
      semanticAuthority:'CERTIFIED_BOUNDED_POLICY',
      externalEffectAuthority:'NONE',
      decompileRequired:false
    };
  }catch(error){
    return {
      ok:false,status:'GHOST_AGENT_DECOMPILE_TO_FRONTIER',
      reasons:[String(error?.message||error)],
      providerCallsPerformed:0,inferenceUsd:0,
      semanticAuthority:'NONE',externalEffectAuthority:'NONE',
      decompileRequired:true
    };
  }
}

export function verifyGhostAgentBatch({ghost,events,currentContext,now=Date.now(),semanticCanonicalizers={}}={}){
  if(!Array.isArray(events)||events.length>100000)throw new Error('bounded-ghost-event-batch-required');
  const ids=new Set();let executed=0,slept=0,decompiled=0;
  for(const event of events){
    if(!event?.eventId||ids.has(event.eventId))throw new Error('distinct-event-ids-required');
    ids.add(event.eventId);
    const out=executeGhostAgent({ghost,event,currentContext,now,semanticCanonicalizers});
    if(out.status==='GHOST_AGENT_EXECUTED')executed++;
    else if(out.status==='GHOST_AGENT_SLEEP')slept++;
    else decompiled++;
  }
  return {
    ok:decompiled===0,status:decompiled?'GHOST_BATCH_REQUIRES_FRONTIER':'GHOST_BATCH_VERIFIED',
    eventCount:events.length,executed,slept,decompiled,
    providerCallsPerformed:0,idleInferenceUsd:0,
    semanticAuthority:executed?'CERTIFIED_BOUNDED_POLICY':'NONE',
    claimBoundary:'Ghost Agents are deterministic event shells around already-certified Decision Franchises. They create no new semantic authority.'
  };
}
