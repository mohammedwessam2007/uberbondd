// Zero-spend recovery: expose only bounded metadata, never sealed payloads or secrets.
const allowed = new Set(['status','schemaVersion','version','month','monthlyCapMicrousd','callId','taskId','model','requestedModel','observedModel','provider','providerName','providerIdentity','generationId','providerCallId','id','actualMicrousd','reservedMicrousd','worstCaseMicrousd','costUsd','newSpendUsd','startedAt','updatedAt','createdAt','settledAt','timestamp','taskCommitment','hiddenTaskCount','receiptHash','snapshotHash','answerHash','promptHash','rubricHash','kind','observedAt','providerRequestId','receiptRef']);
const atom = value => typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean' || value === null || typeof value === 'string' && value.length <= 240 && /^[a-zA-Z0-9_.:/+ -]*$/.test(value) && !/(?:sk-|Bearer|password|secret|token=)/i.test(value);
function metadata(value, depth=0) {
  if(depth>7)return {omitted:true};
  if(Array.isArray(value)) return value.slice(0,64).map(v=>metadata(v,depth+1));
  if(!value || typeof value!=='object')return undefined;
  const out={};
  for(const [k,v] of Object.entries(value)){
    if(allowed.has(k)&&atom(v))out[k]=v;
    else if(['ledger','archivedLedgers','calls','lastGeneration','generationJournal','pendingGeneration','oldUncertainTournament','receipts'].includes(k)&&v&&typeof v==='object'){
      out[k]=k==='archivedLedgers'?Object.fromEntries(Object.entries(v).filter(([m])=>/^2026-\d{2}$/.test(m)).map(([m,l])=>[m,metadata(l,depth+1)])):metadata(v,depth+1);
    }
  }
  return out;
}
export async function readCrownRecoveryMetadata(store){
  const settings=await store.transaction(async tx=>await tx.getSettings());
  const states={};
  for(const [key,state] of Object.entries(settings)){
    if(key==='infiniteOpusRuntimeV1'||/^infinite_opus_crown_autofinish_20261001_v[1-7]$/.test(key)){
      states[key]={fields:Object.keys(state??{}).filter(k=>/^[a-zA-Z0-9_]{1,80}$/.test(k)),metadata:metadata(state)};
    }
  }
  const inventory=Object.entries(settings).filter(([key])=>/crown|sealed|tournament/i.test(key)&&/^[a-zA-Z0-9_.:-]{1,160}$/.test(key)&&!/(secret|password|token|api.?key)/i.test(key)).slice(0,100).map(([key,state])=>({
    key,fields:state&&typeof state==='object'?Object.keys(state).filter(k=>/^[a-zA-Z0-9_]{1,80}$/.test(k)).slice(0,80):[],
    encryptedCheckpointPresent:state?.sealedEvidence?.schemaVersion==='uberbond.sealed-crown-checkpoint.v1',
    privateEvidencePointerPresent:typeof state?.privateEvidenceRef==='string',
    metadata:metadata(state)
  }));
  return {status:'READ_ONLY_CROWN_RECOVERY',providerCallsPerformed:0,sealedPayloadsExposed:false,states,inventory};
}
