import { semanticHash } from './semantic-closure-kernel.mjs';
import { compileJevSharedStateTensor } from './jev-shared-state-tensor.mjs';

export const JEV_SCALED_PREFLIGHT_SCHEMA='uberbond.jev-exact-coalesced-preflight.v1';
const MAX_REQUESTS=16384;
const MAX_QUESTIONS_PER_REQUEST=4;
const MAX_ORIGINAL_QUESTIONS=65536;
const MAX_UNIQUE_QUESTIONS=16384;
const MAX_PROVIDER_PLANS=512;
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const refuse=(reason,extra={})=>({ok:false,status:'JEV_SCALED_PREFLIGHT_REFUSED',reason,
  providerCallsPerformed:0,paidSpendAuthorized:false,semanticAuthority:'NONE',
  crownSuppressionAuthority:'NONE',...extra});
function hashPlan(plan){
 return semanticHash({batchId:plan.batchId,atomMappings:plan.atomMappings,
  plans:plan.plans.map(p=>({batchId:p.batchId,uniqueRequestIds:p.uniqueRequestIds,
    compiledGroupIds:p.compiled.groups.map(g=>g.operationId)}))});
}
/**
 * Exact zero-inference coalescer for a large collection of PUBLIC Jev jobs.
 *
 * Distinct original questions, source versions, tenants, credentials and
 * privacy contracts never acquire equivalence merely by semantic similarity.
 * Every atomic question is first checked through the existing governed
 * compiler, which already enforces secrets, types, context and scope.
 *
 * This emits bounded executable SHARD PLANS. It never invokes the provider.
 * Each shard still requires the existing authorized executeDecisionTensor path.
 */
export function compileScaledJevPreflight({batchId,requests=[]}={}){
 if(typeof batchId!=='string'||!/^[-a-zA-Z0-9_.:/]{1,140}$/.test(batchId)||
    !Array.isArray(requests)||requests.length<1||requests.length>MAX_REQUESTS)
   return refuse('bounded-batch-required');
 const originalIds=new Set(),atoms=new Map();
 let originalQuestionCount=0;
 for(const row of requests){
   if(!isObj(row)||typeof row.requestId!=='string'||!/^[-a-zA-Z0-9_.:/]{1,140}$/.test(row.requestId)||
      originalIds.has(row.requestId))return refuse('original-request-identity-invalid-or-duplicate');
   originalIds.add(row.requestId);
   if(!isObj(row.questions)||!Object.keys(row.questions).length||
      Object.keys(row.questions).length>MAX_QUESTIONS_PER_REQUEST)
      return refuse('bounded-original-questions-required');
   if(row.scope?.dataClass!=='PUBLIC')
      return refuse('public-only-preflight');
   const check=compileJevSharedStateTensor({
     batchId:'scale-validate',requests:[row]
   });
   if(!check.ok)return refuse('governed-compiler-refused',{cause:check.reason});
   for(const [questionId,question] of Object.entries(row.questions)){
     originalQuestionCount++;
     if(originalQuestionCount>MAX_ORIGINAL_QUESTIONS)return refuse('original-questions-cap-exceeded');
     const digest=semanticHash({scope:row.scope,state:row.state,question});
     let atom=atoms.get(digest);
     if(!atom){
       if(atoms.size>=MAX_UNIQUE_QUESTIONS)return refuse('unique-questions-cap-exceeded');
       const representativeId='atom-'+String(atoms.size+1).padStart(5,'0');
       atom={representativeId,scope:structuredClone(row.scope),
         state:structuredClone(row.state),question:structuredClone(question),
         fanout:[]};
       atoms.set(digest,atom);
     }
     atom.fanout.push({requestId:row.requestId,questionId});
   }
 }
 const unique=[...atoms.values()];
 const plans=[],atomMappings=[];
 // Splitting uses the existing compiler as the FINAL authority. A shard that
 // would exceed 32 separate scope groups is bisected, never silently dropped.
 function compileSlice(slice){
   if(plans.length>=MAX_PROVIDER_PLANS)return false;
   const shardIndex=plans.length;
   const chunkBatchId='scale-'+semanticHash({batchId,shardIndex,ids:slice.map(x=>x.representativeId)}).slice(7,31);
   const shardRequests=slice.map(a=>({requestId:a.representativeId,
     scope:a.scope,state:a.state,questions:{v:a.question}}));
   const compiled=compileJevSharedStateTensor({batchId:chunkBatchId,requests:shardRequests});
   if(compiled.ok){
     plans.push({batchId:chunkBatchId,uniqueRequestIds:slice.map(x=>x.representativeId),
       requests:shardRequests,compiled});
     for(const item of slice){
       atomMappings.push({representativeId:item.representativeId,
         shardIndex,fanout:item.fanout});
     }
     return true;
   }
   if(slice.length===1)return false;
   const mid=Math.floor(slice.length/2);
   return compileSlice(slice.slice(0,mid))&&compileSlice(slice.slice(mid));
 }
 for(let i=0;i<unique.length;i+=256){
   if(!compileSlice(unique.slice(i,i+256)))return refuse('cannot-form-bounded-governed-shards');
 }
 if(plans.length>MAX_PROVIDER_PLANS)return refuse('provider-plan-cap-exceeded');
 const result={ok:true,schemaVersion:JEV_SCALED_PREFLIGHT_SCHEMA,
   status:'JEV_SCALED_EXACT_EQUIVALENCE_PLAN_ONLY',
   batchId,originalRequestCount:requests.length,originalQuestionCount,
   uniqueQuestionCount:unique.length,exactRedundanciesEliminated:originalQuestionCount-unique.length,
   requiredGovernedShardCount:plans.length,atomMappings,plans,
   observedSavingsUsd:null,observedNewQualityHoldouts:0,
   providerCallsPerformed:0,paidSpendAuthorized:false,
   semanticAuthority:'NONE',crownSuppressionAuthority:'NONE',
   truthBoundary:'Only cryptographically exact question+state+authority-scope reuse. Shard execution requires existing governed paid provider authorization and will still need external quality and billing evidence. 16,384 input requests are a capacity limit, not 16,384 observed real tasks or an economic multiplier.'};
 result.planDigest=hashPlan(result);
 return result;
}
/**
 * Restore original request/question identities from independently executed
 * governed shard results. Fail the WHOLE restore on any missing or uncertain
 * shard. Zero network calls. Returns only advisory answers; caller owns
 * actual ledger, invoice and separate quality certification.
 */
export function expandScaledJevAnswers({plan,shardResults=[]}={}){
 if(!plan?.ok||plan.schemaVersion!==JEV_SCALED_PREFLIGHT_SCHEMA||
    !Array.isArray(plan.plans)||!Array.isArray(plan.atomMappings)||
    !Array.isArray(shardResults)||plan.plans.length!==shardResults.length)
   return refuse('plan-and-exact-shard-results-required');
 try{if(hashPlan(plan)!==plan.planDigest)return refuse('preflight-mapping-integrity-failed');}
 catch{return refuse('preflight-mapping-integrity-failed');}
 const uniqueAnswerMap=new Map();
 for(let i=0;i<shardResults.length;i++){
   const shard=shardResults[i],expected=plan.plans[i];
   if(shard?.ok!==true||shard.status!=='JEV_TENSOR_ADVISORY_DECISIONS_OBSERVED'||
      !Array.isArray(shard.answers)||shard.answers.length!==expected.uniqueRequestIds.length)
     return refuse('missing-or-unverified-governed-shard',{shardIndex:i});
   const allowed=new Set(expected.uniqueRequestIds);
   for(const answer of shard.answers){
     if(!allowed.has(answer.requestId)||answer.questionId!=='v'||
        uniqueAnswerMap.has(answer.requestId)||!isObj(answer.answer)||
        answer.semanticAuthority!=='NONE')
       return refuse('invalid-governed-shard-answer',{shardIndex:i});
     uniqueAnswerMap.set(answer.requestId,answer.answer);
   }
 }
 const expanded=[],seen=new Set();
 for(const atom of plan.atomMappings){
   const answer=uniqueAnswerMap.get(atom.representativeId);
   if(!answer)return refuse('unique-answer-missing');
   for(const target of atom.fanout){
     const id=target.requestId+'\u0000'+target.questionId;
     if(seen.has(id))return refuse('duplicate-original-answer-identity');
     seen.add(id);
     expanded.push({requestId:target.requestId,questionId:target.questionId,
       answer:structuredClone(answer),semanticAuthority:'NONE'});
   }
 }
 if(expanded.length!==plan.originalQuestionCount||
    uniqueAnswerMap.size!==plan.uniqueQuestionCount)
   return refuse('fanout-count-not-conserved');
 return {ok:true,status:'JEV_SCALED_ADVISORY_FANOUT_COMPLETE',
   originalRequestCount:plan.originalRequestCount,
   restoredAnswerCount:expanded.length,
   uniqueProviderQuestionCount:plan.uniqueQuestionCount,
   shardCount:plan.plans.length,answers:expanded,
   newQualityEvidenceCount:0,measuredSavingsUsd:null,
   providerCallsPerformed:0,paidSpendAuthorized:false,
   semanticAuthority:'NONE',crownSuppressionAuthority:'NONE',
   truthBoundary:'Restoring validated advisory answers is not a provider inference, independent grade, invoice, or real economic savings proof.'};
}
