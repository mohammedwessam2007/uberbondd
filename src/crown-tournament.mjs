import crypto from 'node:crypto';
const hash=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ROLES=Object.freeze(['GENERAL_CROWN','CODING_CROWN','RESEARCH_CROWN','AUTOMATION_TERMINAL_CROWN','LONG_CONTEXT_CROWN','MULTIMODAL_CROWN','FORMAL_MATH_CROWN','CHEAP_STRONG_WORKER','ULTRA_CHEAP_WORKER']);
export function compileCrownTournament({candidateSnapshotHash,hiddenTasks=[],candidates=[],budgetAuthorizationRef=null}={}){
 if(!/^sha256:[0-9a-f]{64}$/.test(String(candidateSnapshotHash||''))||!Array.isArray(hiddenTasks)||hiddenTasks.length<1||!Array.isArray(candidates)||candidates.length<2)return{ok:false,status:'TOURNAMENT_INPUT_REFUSED'};
 const tasks=hiddenTasks.map(t=>({taskId:t.taskId,role:t.role,qualityDimensions:[...(t.qualityDimensions??[])],sealedExpectedRef:t.sealedExpectedRef??null}));
 const taskIds=new Set(tasks.map(t=>t.taskId)),models=new Set(candidates.map(c=>c.model));
 if(taskIds.size!==tasks.length||models.size!==candidates.length||tasks.some(t=>!ROLES.includes(t.role)||!t.taskId||!t.qualityDimensions.length)||candidates.some(c=>!c?.model||!Array.isArray(c.roles)||!c.roles.length||c.roles.some(r=>!ROLES.includes(r))))return{ok:false,status:'TOURNAMENT_TASK_OR_CANDIDATE_CONTRACT_REFUSED'};
 const plan={schemaVersion:'uberbond.crown-tournament.v1',candidateSnapshotHash,tasks,candidates:candidates.map(c=>({model:c.model,roles:[...c.roles]})),budgetAuthorizationRef,blindEvaluation:true,pairedRequiredRegressionTolerance:0,brandLoyalty:false,publicBenchmarkAuthority:'NONE',evaluationHarness:'src/apex-sealed-tournament.mjs',zeroLossHarness:'src/canonical-zero-loss-certificate.mjs',freshTaskCustodian:'docs/experiments/FRONTIER_VM_FRESH_TASK_CUSTODIAN_2026-09-29.md'};
 return{ok:true,status:budgetAuthorizationRef?'TOURNAMENT_READY_AUTHORIZED':'TOURNAMENT_READY_AWAITING_PAID_AUTHORIZATION',plan:{...plan,planHash:hash(plan)}};
}
export function adjudicateCrownTournament({plan,observations=[]}={}){
 if(!plan?.planHash||hash(Object.fromEntries(Object.entries(plan).filter(([k])=>k!=='planHash')))!==plan.planHash)return{ok:false,status:'TOURNAMENT_PLAN_INTEGRITY_FAILED'};
 const byRole={},taskById=new Map(plan.tasks.map(t=>[t.taskId,t])),candidateByModel=new Map(plan.candidates.map(c=>[c.model,c])),seen=new Set(),accepted=[];
 for(const o of observations){
  const task=taskById.get(o?.taskId),candidate=candidateByModel.get(o?.model),pair=String(o?.model)+':'+String(o?.taskId);
  if(!task||!candidate||!candidate.roles.includes(task.role)||task.role!==o.role||seen.has(pair)||o.hiddenTask!==true||o.providerBillObserved!==true||o.modelIdentityVerified!==true||o.requiredRegressions!==0||typeof o.sealedTrialRef!=='string'||!o.sealedTrialRef||o.canonicalZeroLossCertified!==true||!Number.isFinite(o.qualityScore)||!Number.isFinite(o.costUsd))continue;
  seen.add(pair);accepted.push(o);
 }
 for(const role of ROLES){
  const requiredTasks=plan.tasks.filter(t=>t.role===role).map(t=>t.taskId);if(requiredTasks.length<2)continue;
  const models=plan.candidates.filter(c=>c.roles.includes(role)).map(c=>c.model),ranked=[];
  for(const model of models){
   const rows=accepted.filter(o=>o.role===role&&o.model===model),covered=new Set(rows.map(r=>r.taskId));
   if(!requiredTasks.every(t=>covered.has(t)))continue;
   ranked.push({model,n:rows.length,meanQuality:rows.reduce((s,r)=>s+r.qualityScore,0)/rows.length,totalCostUsd:rows.reduce((s,r)=>s+r.costUsd,0)});
  }
  ranked.sort((a,b)=>b.meanQuality-a.meanQuality||a.totalCostUsd-b.totalCostUsd||a.model.localeCompare(b.model));
  if(ranked.length>=2)byRole[role]={candidate:ranked[0].model,evidenceTasks:ranked[0].n,meanQuality:ranked[0].meanQuality,totalCostUsd:ranked[0].totalCostUsd,requiredTaskCoverage:requiredTasks.length};
 }
 return{ok:true,status:Object.keys(byRole).length?'TASK_CLASS_CROWN_CANDIDATE_EVIDENCE_READY':'NO_ROLE_HAS_SUFFICIENT_EVIDENCE',roles:byRole,semanticAuthority:'NONE',promotionRequiresExistingSealedTournamentAndCrownAdmission:true};
}
