import { compileFounderEconomicPulsePlan, evaluateFounderOutcomeMission } from './founder-outcome-mission.mjs';

export const FOUNDER_OUTCOME_RUNTIME_VERSION = 'uberbond.founder-outcome-runtime.v1';
const text=(v,max=500)=>String(v??'').trim().slice(0,max);
const asArray=v=>Array.isArray(v)?v:[];
const safeDetail=row=>row?.detail&&typeof row.detail==='object'&&!Array.isArray(row.detail)?row.detail:null;
const when=row=>Date.parse(row?.createdAt||safeDetail(row)?.observedAt||safeDetail(row)?.startedAt||0)||0;

export function hydrateFounderOutcomeMission(receipt={}) {
  if(!receipt||typeof receipt!=='object'||!text(receipt.missionId,200)||!receipt.startedAt||!receipt.deadlineAt)return null;
  return {
    ok:true,
    policyVersion:receipt.policyVersion||receipt.schemaVersion||'unknown',
    schemaVersion:receipt.schemaVersion||receipt.policyVersion||'unknown',
    status:'FOUNDER_OUTCOME_MISSION_ACTIVE',
    state:'ACTIVE',
    terminal:false,
    terminalResultAllowed:false,
    missionId:text(receipt.missionId,200),
    missionClass:receipt.missionClass||'ECONOMIC_OUTCOME',
    objectiveClass:receipt.objectiveClass||'MAXIMIZE_CLEARED_CONTRIBUTION_PROFIT',
    startedAt:receipt.startedAt,
    deadlineAt:receipt.deadlineAt,
    timezone:receipt.timezone||'Africa/Cairo',
    nominatedPaymentDestination:receipt.nominatedPaymentDestination||null,
    spendCeilingCents:receipt.spendCeilingCents??null,
    sourceRevision:receipt.sourceRevision||null,
    successMetric:receipt.successMetric||'PROVIDER_ORIGIN_CLEARED_CONTRIBUTION_PROFIT_BEFORE_DEADLINE'
  };
}

function latestRows(auditLog,type){return asArray(auditLog).filter(r=>r?.type===type&&safeDetail(r)).sort((a,b)=>when(a)-when(b));}
function latestByMission(rows){const out=new Map();for(const row of rows){const d=safeDetail(row);if(d?.missionId)out.set(String(d.missionId),d);}return out;}

export function readFounderOutcomeRuntimeTruth(auditLog=[]) {
  const starts=latestByMission(latestRows(auditLog,'founder_outcome_mission'));
  const states=latestByMission(latestRows(auditLog,'founder_outcome_mission_state'));
  const observations=latestByMission(latestRows(auditLog,'founder_outcome_payment_observation'));
  return {starts,states,observations};
}

function usablePaymentObservation(value,missionId){
  if(!value||value.missionId!==missionId)return null;
  const refs=asArray(value.evidenceRefs).map(String).filter(Boolean);
  if(!refs.length||!value.throughAt||!Number.isSafeInteger(Number(value.clearedContributionProfitCents)))return null;
  return {
    clearedContributionProfitCents:Number(value.clearedContributionProfitCents),
    providerOrigin:value.providerOrigin===true,
    reconciled:value.reconciled===true,
    independentVerification:value.independentVerification===true,
    evidenceClass:text(value.evidenceClass,80).toUpperCase(),
    throughAt:value.throughAt,
    evidenceRefs:refs,
    environment:text(value.environment,40)||null,
    testMode:value.testMode===true
  };
}

export async function superviseFounderOutcomeMissions({store,queue,cfg={},now=new Date()}={}){
  if(!store||typeof store.list!=='function'||typeof store.log!=='function')throw new Error('founder-outcome-runtime-store-required');
  if(!queue||typeof queue.enqueue!=='function')throw new Error('founder-outcome-runtime-queue-required');
  const audit=await store.list('auditLog');
  const truth=readFounderOutcomeRuntimeTruth(audit);
  const bucket=Math.floor(now.getTime()/60_000);
  const results=[];
  for(const [missionId,start] of truth.starts){
    const prior=truth.states.get(missionId);
    if(prior?.terminal===true||prior?.state==='TERMINAL'){results.push({missionId,status:'ALREADY_TERMINAL',jobsQueued:[]});continue;}
    const mission=hydrateFounderOutcomeMission(start); if(!mission){results.push({missionId,status:'INVALID_MISSION_RECEIPT',jobsQueued:[]});continue;}
    const paymentObservation=usablePaymentObservation(truth.observations.get(missionId),missionId);
    const state=evaluateFounderOutcomeMission({mission,now,paymentObservation});
    if(!state.ok){await store.log('founder_outcome_mission_state',{missionId,status:state.status,state:'REVIEW_REQUIRED',terminal:false,reasonCodes:state.reasonCodes||[],observedAt:now.toISOString()});results.push({missionId,status:state.status,jobsQueued:[]});continue;}
    if(state.terminal){
      await store.log('founder_outcome_mission_state',{missionId,status:state.status,state:'TERMINAL',terminal:true,terminalResultAllowed:true,clearedContributionProfitCents:state.clearedContributionProfitCents,paymentObservationThroughAt:state.paymentObservationThroughAt,providerEvidenceRefs:state.providerEvidenceRefs,observedAt:now.toISOString()});
      results.push({missionId,status:state.status,terminal:true,jobsQueued:[]}); continue;
    }
    const plan=compileFounderEconomicPulsePlan({mission,now,zeroMarginalDiscoveryConfigured:Boolean(cfg?.discovery?.enabled&&cfg?.discovery?.dryRun===false),outboundAuthorization:null,paymentReconciliationAvailable:true});
    const jobsQueued=[],jobFailures=[];
    for(const job of plan.jobs||[]){
      try{const receipt=await queue.enqueue(job.type,{...(job.payload||{}),missionId},{maxAttempts:job.type==='payment.reconciliation.tick'?5:3,dedupeKey:`founder-mission:${missionId}:${job.type}:${bucket}`});jobsQueued.push({type:job.type,jobId:receipt?.id||null,consequenceClass:job.consequenceClass});}
      catch(error){jobFailures.push({type:job.type,reason:text(error?.message||error,300)});}
    }
    const runtimeStatus=jobsQueued.length?'FOUNDER_OUTCOME_MISSION_CONTINUING':'FOUNDER_OUTCOME_MISSION_EXECUTION_BLOCKED';
    await store.log('founder_outcome_mission_state',{missionId,status:runtimeStatus,state:state.state,terminal:false,terminalResultAllowed:false,deadlineAt:mission.deadlineAt,missionWindowClosed:state.missionWindowClosed===true,jobsQueued:jobsQueued.map(j=>({type:j.type,jobId:j.jobId})),jobFailures,observedAt:now.toISOString(),truthBoundary:jobsQueued.length?'Jobs were durably queued; this is execution intent, not proof of provider effects, customers or money.':'The mission remains unresolved. Queue/runtime failure is a blocker, never a terminal zero.'});
    results.push({missionId,status:runtimeStatus,terminal:false,jobsQueued,jobFailures});
  }
  return {ok:true,policyVersion:FOUNDER_OUTCOME_RUNTIME_VERSION,status:truth.starts.size?'FOUNDER_OUTCOME_RUNTIME_SUPERVISED':'NO_DURABLE_FOUNDER_OUTCOME_MISSIONS',observedAt:now.toISOString(),missions:results};
}

export function createFounderOutcomeRuntimeHandlers({store,queue,cfg}={}){
  return {'founder.outcome.supervise':async payload=>superviseFounderOutcomeMissions({store,queue,cfg,now:payload?.now?new Date(payload.now):new Date()})};
}
