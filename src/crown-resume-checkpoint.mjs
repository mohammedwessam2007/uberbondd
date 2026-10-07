import crypto from 'node:crypto';
import { openCrownCheckpoint } from './crown-sealed-checkpoint.mjs';
import { verifyCrownProviderModel } from './crown-model-identity.mjs';
export const RESUME_KEY='infinite_opus_crown_resume_20261001_r2';
export const SOURCE_KEY='infinite_opus_crown_replacement_20261001_r1';
export const INTERRUPTED_RESUME_KEY='infinite_opus_crown_resume_20261002_r3';
export const INTERRUPTED_GENERATION='gen-1790900587-TKEqsFrik1iupnf4Ljrd';
export function crownResumeKeys(a){
 return a?.attemptKey===INTERRUPTED_RESUME_KEY?{attemptKey:INTERRUPTED_RESUME_KEY,sourceKey:RESUME_KEY}:{attemptKey:RESUME_KEY,sourceKey:SOURCE_KEY};
}
const hash=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export function validCrownResumeAuthority(a,now=Date.now()){
 return a?.operation==='resume-existing-sealed-general-crown-evaluation'&&
 ((a?.attemptKey===RESUME_KEY&&a?.sourceKey===SOURCE_KEY&&a?.maxIncrementalMicrousd===300000&&a?.evidenceRef==='owner-approved-missing-crown-edges-r2')||
 (a?.attemptKey===INTERRUPTED_RESUME_KEY&&a?.sourceKey===RESUME_KEY&&Number.isSafeInteger(a?.maxIncrementalMicrousd)&&a.maxIncrementalMicrousd>0&&a.maxIncrementalMicrousd<=300000&&a?.maxRemainingPaidCalls===2&&a?.evidenceRef==='owner-approved-two-missing-crown-edges-r3'))&&
 a?.maxTotalEvaluationMicrousd===450000&&a?.monthlyCapMicrousd===20000000&&
 Number.isFinite(Date.parse(a.authorizedAt))&&Date.parse(a.authorizedAt)<=now&&
 Number.isFinite(Date.parse(a.expiresAt))&&Date.parse(a.expiresAt)>now;
}
// Prepare only the exact two missing edges. This function creates no authority
// and requires either an exact bill or a full-reserve UNKNOWN-charge quarantine before opening sealed payloads.
export function recoverInterruptedCrownCheckpoint(state,{key,originalState}){
 if(state?.status!=='FAILED_NO_AUTOMATIC_RETRY'||state.reason!=='generation-reconciliation-required:'+INTERRUPTED_GENERATION)
  throw Error('exact-interrupted-failure-required');
 const journal=state.generationJournal;
 const ids=['gen-1790900525-TFyAeL3TpSP6ZWMsspuj','gen-1790900555-jEUGzgL7rKDIKYiOft6V',INTERRUPTED_GENERATION];
 const bill=state.financialReconciliation;
 const quarantine=state.financialQuarantine;
 const third=Array.isArray(journal)?journal[2]:null;
 const exactBill=third?.status==='RECONCILED_BILL_ONLY_NO_RETAINED_ANSWER';
 const maxReserveQuarantine=third?.status==='UNKNOWN_CHARGE_MAX_RESERVE_QUARANTINED';
 if(!Array.isArray(journal)||journal.length!==3||journal.some((r,i)=>r.id!==ids[i])||
 !Number.isFinite(journal[0]?.costUsd)||journal[0].costUsd<0||!Number.isFinite(journal[1]?.costUsd)||journal[1].costUsd<0||
 !Number.isFinite(third?.reservedWorstCaseUsd)||third.reservedWorstCaseUsd<=0||
 !(exactBill||maxReserveQuarantine))throw Error('fully-reconciled-or-max-reserved-interrupted-billing-required');
 if(exactBill&&(
   !Number.isFinite(third.costUsd)||third.costUsd<0||third.costUsd>third.reservedWorstCaseUsd||
   bill?.id!==INTERRUPTED_GENERATION||bill?.status!==third.status||bill?.semanticAuthority!=='NONE'||
   bill.costUsd!==third.costUsd||bill.observedModel!==third.observedModel||bill.provider!==third.provider||
   !Number.isFinite(Date.parse(bill.reconciledAt))
 ))throw Error('fully-reconciled-interrupted-billing-required');
 if(maxReserveQuarantine&&(
   third.actualCostUsd!==null||third.conservativeLiabilityUsd!==third.reservedWorstCaseUsd||third.metadataHttpStatus!==404||third.semanticAuthority!=='NONE'||
   quarantine?.id!==INTERRUPTED_GENERATION||quarantine?.status!==third.status||quarantine?.actualCostUsd!==null||
   quarantine?.conservativeLiabilityUsd!==third.reservedWorstCaseUsd||quarantine?.metadataHttpStatus!==404||quarantine?.semanticAuthority!=='NONE'||
   quarantine?.reconciliationPolicy!=='RETAIN_MAX_PRECALL_RESERVE_UNTIL_PROVIDER_EVIDENCE_ARRIVES'||!Number.isFinite(Date.parse(quarantine.quarantinedAt))
 ))throw Error('max-reserve-quarantine-integrity-required');
 if(journal.slice(0,2).some(r=>r.status!=='PROVIDER_RECONCILED_PENDING_EVIDENCE')||Math.abs(journal[0].costUsd-.018610)>1e-12||Math.abs(journal[1].costUsd-.026936)>1e-12||
 journal.slice(0,2).some(r=>!verifyCrownProviderModel({requestedModel:r.model,observedModel:r.observedModel,provider:r.provider}))||
 (exactBill&&!verifyCrownProviderModel({requestedModel:third.model,observedModel:third.observedModel,provider:third.provider})))throw Error('interrupted-billing-identity-drift');
 const original=recoverCrownResumeCheckpoint(originalState,{key});
 const exactThirdCost=exactBill?third.costUsd:0;
 if(!Number.isFinite(state.newSpendUsd)||Math.abs(original.inheritedSpendUsd+journal[0].costUsd+journal[1].costUsd+exactThirdCost-state.newSpendUsd)>1e-12)
  throw Error('interrupted-spend-total-drift');
 const p=openCrownCheckpoint(state.sealedEvidence,{key,binding:RESUME_KEY+'|'+state.taskCommitment});
 if(!Array.isArray(p.tasks)||p.tasks.length!==2||p.calls?.length!==3||p.gradeDoc||original.calls[0].taskId!==p.tasks[0].id||original.calls[0].model!=='anthropic/claude-opus-5.5'||
 hash(p.tasks)!==hash(original.tasks)||state.taskCommitment!==original.taskCommitment||p.providerResponses?.[INTERRUPTED_GENERATION])throw Error('exact-three-answer-checkpoint-required');
 const expected=[original.calls[0],{id:ids[0],taskId:p.tasks[0].id,model:'openai/gpt-6.1-sol-pro',cost:journal[0].costUsd},{id:ids[1],taskId:p.tasks[1].id,model:'anthropic/claude-opus-5.5',cost:journal[1].costUsd}];
 for(const [i,c] of p.calls.entries()){
  const e=expected[i],t=p.tasks.find(t=>t.id===c.taskId),answer=p.answers?.[c.taskId+'|'+c.model];
  if(c.id!==e.id||c.taskId!==e.taskId||c.model!==e.model||c.cost!==e.cost||!t||typeof answer!=='string'||!answer||
  c.answerHash!==hash(answer)||c.promptHash!==hash(t.prompt)||c.rubricHash!==hash(t.rubric)||!verifyCrownProviderModel({requestedModel:c.model,observedModel:c.metaModel,provider:c.providerName})||
  (i===0&&hash(c)!==hash(original.calls[0])))throw Error('interrupted-answer-trust-pin-refused');
 }
 if(Object.keys(p.answers??{}).length!==3)throw Error('unexpected-interrupted-answer');
 return {...p,taskCommitment:state.taskCommitment,inheritedSpendUsd:state.newSpendUsd,uncertainChargeLiabilityUsd:maxReserveQuarantine?third.reservedWorstCaseUsd:0,
  custodianGenerationId:original.custodianGenerationId,priorBillingRows:[...originalState.generationJournal,...journal],maximumRemainingPaidCalls:2};
}
export function recoverCrownResumeCheckpoint(state,{key}){
 if(state?.status!=='FAILED_NO_AUTOMATIC_RETRY'||
 state.reason!=='model-identity-drift:openai/gpt-6.1-sol-pro:openai/gpt-6.1-sol-pro-20260929'||
 !Number.isFinite(state.newSpendUsd)||Math.abs(state.newSpendUsd-.06503775)>1e-12)
 throw Error('exact-paid-failure-required');
 const journal=state.generationJournal;
 if(!Array.isArray(journal)||journal.length!==3||journal.some(x=>!Number.isFinite(x.costUsd)||x.costUsd<0)||
 Math.abs(journal.reduce((s,x)=>s+x.costUsd,0)-state.newSpendUsd)>1e-12)
 throw Error('fully-reconciled-prior-billing-required');
 const ids=['gen-1790892485-fQko2TrlRCNPUJ3SD9EO','gen-1790892512-UbTWrlnGj57GXlT32paI','gen-1790892555-BOCiTbz8qFX9HAnXIRR3'];
 if(journal.some((r,i)=>r.id!==ids[i]))throw Error('exact-prior-generations-required');
 const payload=openCrownCheckpoint(state.sealedEvidence,{key,binding:SOURCE_KEY+'|'+state.taskCommitment});
 const tasks=payload.tasks;
 if(!Array.isArray(tasks)||tasks.length!==2||payload.calls?.length!==1)throw Error('exact-partial-checkpoint-required');
 const commitment=hash(tasks.map(t=>({id:t.id,promptHash:hash(t.prompt),rubricHash:hash(t.rubric),mustNotHash:hash(t.must_not??[])})));
 if(commitment!==state.taskCommitment)throw Error('sealed-task-commitment-drift');
 const c=payload.calls[0],answer=payload.answers?.[c.taskId+'|'+c.model],task=tasks.find(t=>t.id===c.taskId);
 if(c.id!==ids[1]||c.cost!==journal[1].costUsd||!task||!answer||c.answerHash!==hash(answer)||c.promptHash!==hash(task.prompt)||
 c.rubricHash!==hash(task.rubric)||!verifyCrownProviderModel({requestedModel:c.model,observedModel:c.metaModel,provider:c.providerName}))
 throw Error('prior-answer-trust-pin-refused');
 return {tasks,answers:payload.answers,calls:payload.calls,taskCommitment:commitment,
 inheritedSpendUsd:state.newSpendUsd,custodianGenerationId:ids[0]};
}
