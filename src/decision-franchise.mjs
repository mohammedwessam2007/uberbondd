import { canonicalSemanticJson, semanticHash, validateFinitePolicy, executeExactOpcode } from './semantic-closure-kernel.mjs';

const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>canonicalSemanticJson(a)===canonicalSemanticJson(b);

export function executeDecisionFranchise({record,trustPin,task,currentContext,now=Date.now(),semanticCanonicalizers={}}={}){
  const reasons=[];
  try{
    if(!plain(record)||record.kind!=='DECISION_FRANCHISE'||record.status!=='ACTIVE'||semanticHash(record)!==trustPin)throw new Error('trusted-active-franchise-required');
    const expiry=Date.parse(record.expiresAt);
    if(!Number.isFinite(expiry)||expiry<=now)throw new Error('franchise-expired');
    const spec=record.spec;
    if(!plain(spec)||spec.schemaVersion!=='uberbond.decision-franchise.spec.v1')throw new Error('franchise-spec-required');
    if(!plain(currentContext))throw new Error('current-franchise-context-required');
    if(record.crownRevision!==currentContext.crownRevision)throw new Error('franchise-crown-revision-drift');
    if(!same(record.sourceDependencies,currentContext.sourceHashes??{}))throw new Error('franchise-dependency-drift');
    if(!same(record.invalidators,currentContext.invalidators??{})||Object.values(currentContext.invalidators??{}).some(v=>v!==false))throw new Error('franchise-invalidator-fired-or-drifted');

    if(!plain(task)||typeof task.taskId!=='string'||!task.taskId||task.taskClass!==spec.taskClass)throw new Error('franchise-task-class-mismatch');
    if(task.qualityContractHash!==spec.qualityContractHash||task.sideEffectClass!=='NONE')throw new Error('franchise-quality-or-effect-mismatch');
    if(!plain(task.payload))throw new Error('typed-task-payload-required');

    const projected={};let semanticCanonicalizationCount=0;
    for(const key of spec.relevantKeys){
      if(!Object.hasOwn(task.payload,key))throw new Error('relevant-field-missing:'+key);
      const original=structuredClone(task.payload[key]), canonicalizer=semanticCanonicalizers?.[key];
      if(canonicalizer?.canonicalize){
        const normalized=canonicalizer.canonicalize(original,{currentContext});
        if(!normalized.ok)throw new Error('semantic-canonicalizer-refused:'+key+':'+(normalized.reasons??[]).join('|'));
        projected[key]=structuredClone(normalized.value);
        if(normalized.transformed)semanticCanonicalizationCount++;
      }else projected[key]=original;
    }
    validateFinitePolicy(spec.policy);
    const decision=executeExactOpcode('LOOKUP',[spec.policy.rows,projected]);
    return {
      ok:true,status:'DECISION_FRANCHISE_EXECUTED',decision,
      taskId:task.taskId,taskHash:semanticHash(task),projectedStateHash:semanticHash(projected),
      franchiseId:record.id,franchiseHash:semanticHash(record),proofClass:record.proofClass,
      semanticAuthority:'CERTIFIED_BOUNDED_POLICY',providerCallsPerformed:0,
      externalEffectAuthority:'NONE',semanticCanonicalizationCount,
      claimBoundary:'Only the admitted relevantKeys projection and exhaustive finite policy are authoritative; all other task fields are intentionally irrelevant under the certified franchise.'
    };
  }catch(error){reasons.push(String(error?.message||error));}
  return {ok:false,status:'FRANCHISE_PAGE_FAULT_TO_FRONTIER',reasons:[...new Set(reasons)],semanticAuthority:'NONE',providerCallsPerformed:0};
}

export function verifyDistinctFranchiseFanout({record,trustPin,tasks,currentContext,now=Date.now()}={}){
  if(!Array.isArray(tasks)||!tasks.length||tasks.length>100000)throw new Error('bounded-fanout-batch-required');
  const taskIds=new Set(),taskHashes=new Set(),states=new Set();
  for(const task of tasks){
    const out=executeDecisionFranchise({record,trustPin,task,currentContext,now});
    if(!out.ok)return {ok:false,status:'FANOUT_PROOF_REFUSED',failedTaskId:task?.taskId??null,reasons:out.reasons};
    if(taskIds.has(out.taskId)||taskHashes.has(out.taskHash))return {ok:false,status:'DISTINCT_CONSUMERS_REQUIRED'};
    taskIds.add(out.taskId);taskHashes.add(out.taskHash);states.add(out.projectedStateHash);
  }
  return {
    ok:true,status:'DISTINCT_DECISION_FRANCHISE_FANOUT_VERIFIED',
    consumerCount:tasks.length,uniqueFullTaskCount:taskHashes.size,uniqueProjectedStateCount:states.size,
    providerCallsPerformed:0,proofClass:record.proofClass,
    semanticAuthority:'CERTIFIED_BOUNDED_POLICY',
    claimBoundary:'This proves bounded deterministic service to the supplied distinct consumers, not future demand or unrestricted frontier quality.'
  };
}

export function modelDecisionFranchiseCompression({
  distinctConsumerCount,directOpusUnitMicrousd,actualAllInMicrousd,targetMultiplier=33333.333333333336
}={}){
  if(!Number.isSafeInteger(distinctConsumerCount)||distinctConsumerCount<1||
     !Number.isSafeInteger(directOpusUnitMicrousd)||directOpusUnitMicrousd<1||
     !Number.isSafeInteger(actualAllInMicrousd)||actualAllInMicrousd<1)throw new Error('positive-safe-economic-inputs-required');
  const referenceMicrousd=distinctConsumerCount*directOpusUnitMicrousd;
  if(!Number.isSafeInteger(referenceMicrousd))throw new Error('reference-cost-overflow');
  const multiplier=referenceMicrousd/actualAllInMicrousd;
  const consumersForTarget=Math.ceil(targetMultiplier*actualAllInMicrousd/directOpusUnitMicrousd);
  return {
    status:'DECISION_FRANCHISE_CAPACITY_MODEL_ONLY',
    distinctConsumerCount,directOpusUnitMicrousd,actualAllInMicrousd,
    directReferenceMicrousd:referenceMicrousd,multiplier,targetMultiplier,
    targetMet:multiplier>=targetMultiplier,consumersForTarget,
    millionDollarReferenceThresholdMet:referenceMicrousd>=1_000_000_000_000,
    claimBoundary:'Modeled capacity only. Does not claim these consumers executed, demand existed, or actual provider spend occurred.'
  };
}


export function compileDecisionFranchiseExecutor({record,trustPin,currentContext,now=Date.now(),semanticCanonicalizers={}}={}){
  const reasons=[];
  try{
    if(!plain(record)||record.kind!=='DECISION_FRANCHISE'||record.status!=='ACTIVE'||semanticHash(record)!==trustPin)throw new Error('trusted-active-franchise-required');
    const expiry=Date.parse(record.expiresAt);
    if(!Number.isFinite(expiry)||expiry<=now)throw new Error('franchise-expired');
    const spec=record.spec;
    if(!plain(spec)||spec.schemaVersion!=='uberbond.decision-franchise.spec.v1')throw new Error('franchise-spec-required');
    if(!plain(currentContext))throw new Error('current-franchise-context-required');
    if(record.crownRevision!==currentContext.crownRevision)throw new Error('franchise-crown-revision-drift');
    if(!same(record.sourceDependencies,currentContext.sourceHashes??{}))throw new Error('franchise-dependency-drift');
    if(!same(record.invalidators,currentContext.invalidators??{})||Object.values(currentContext.invalidators??{}).some(v=>v!==false))throw new Error('franchise-invalidator-fired-or-drifted');
    validateFinitePolicy(spec.policy);
    const rows=new Map(spec.policy.rows.map(row=>[canonicalSemanticJson(row.input),structuredClone(row.output)]));
    const franchiseHash=semanticHash(record);
    return {
      ok:true,status:'DECISION_FRANCHISE_EXECUTOR_COMPILED',franchiseHash,proofClass:record.proofClass,
      execute(task,{includeTaskHash=true}={}){
        try{
          if(!plain(task)||typeof task.taskId!=='string'||!task.taskId||task.taskClass!==spec.taskClass)throw new Error('franchise-task-class-mismatch');
          if(task.qualityContractHash!==spec.qualityContractHash||task.sideEffectClass!=='NONE')throw new Error('franchise-quality-or-effect-mismatch');
          if(!plain(task.payload))throw new Error('typed-task-payload-required');
          const projected={};let semanticCanonicalizationCount=0;
          for(const key of spec.relevantKeys){
            if(!Object.hasOwn(task.payload,key))throw new Error('relevant-field-missing:'+key);
            const original=structuredClone(task.payload[key]), canonicalizer=semanticCanonicalizers?.[key];
            if(canonicalizer?.canonicalize){
              const normalized=canonicalizer.canonicalize(original,{currentContext});
              if(!normalized.ok)throw new Error('semantic-canonicalizer-refused:'+key+':'+(normalized.reasons??[]).join('|'));
              projected[key]=structuredClone(normalized.value);
              if(normalized.transformed)semanticCanonicalizationCount++;
            }else projected[key]=original;
          }
          const key=canonicalSemanticJson(projected);
          if(!rows.has(key))throw new Error('out-of-domain-or-ambiguous-policy');
          const decision=structuredClone(rows.get(key));
          return {
            ok:true,status:'DECISION_FRANCHISE_EXECUTED',decision,taskId:task.taskId,
            taskHash:includeTaskHash?semanticHash(task):null,
            projectedStateHash:semanticHash(projected),franchiseId:record.id,franchiseHash,
            proofClass:record.proofClass,semanticAuthority:'CERTIFIED_BOUNDED_POLICY',
            providerCallsPerformed:0,externalEffectAuthority:'NONE',semanticCanonicalizationCount
          };
        }catch(error){
          return {ok:false,status:'FRANCHISE_PAGE_FAULT_TO_FRONTIER',reasons:[String(error?.message||error)],semanticAuthority:'NONE',providerCallsPerformed:0};
        }
      }
    };
  }catch(error){reasons.push(String(error?.message||error));}
  return {ok:false,status:'FRANCHISE_COMPILATION_REFUSED',reasons:[...new Set(reasons)],semanticAuthority:'NONE'};
}
