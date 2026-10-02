import crypto from 'node:crypto';
import { openCrownCheckpoint } from './crown-sealed-checkpoint.mjs';
import { verifyCrownProviderModel } from './crown-model-identity.mjs';
export const RESUME_KEY='infinite_opus_crown_resume_20261001_r2';
export const SOURCE_KEY='infinite_opus_crown_replacement_20261001_r1';
const hash=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export function validCrownResumeAuthority(a,now=Date.now()){
 return a?.operation==='resume-existing-sealed-general-crown-evaluation'&&
 a?.attemptKey===RESUME_KEY&&a?.sourceKey===SOURCE_KEY&&a?.maxIncrementalMicrousd===300000&&
 a?.maxTotalEvaluationMicrousd===450000&&a?.monthlyCapMicrousd===20000000&&
 a?.evidenceRef==='owner-approved-missing-crown-edges-r2'&&
 Number.isFinite(Date.parse(a.authorizedAt))&&Date.parse(a.authorizedAt)<=now&&
 Number.isFinite(Date.parse(a.expiresAt))&&Date.parse(a.expiresAt)>now;
}
export function recoverCrownResumeCheckpoint(state,{key}){
 if(state?.status!=='FAILED_NO_AUTOMATIC_RETRY'||
 state.reason!=='model-identity-drift:openai/gpt-6.1-sol-pro:openai/gpt-6.1-sol-pro-20260929'||
 Math.abs(state.newSpendUsd-.06503775)>1e-12)
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
 if(c.id!==ids[1]||!task||!answer||c.answerHash!==hash(answer)||c.promptHash!==hash(task.prompt)||
 c.rubricHash!==hash(task.rubric)||!verifyCrownProviderModel({requestedModel:c.model,observedModel:c.metaModel,provider:c.providerName}))
 throw Error('prior-answer-trust-pin-refused');
 return {tasks,answers:payload.answers,calls:payload.calls,taskCommitment:commitment,
 inheritedSpendUsd:state.newSpendUsd,custodianGenerationId:ids[0]};
}
