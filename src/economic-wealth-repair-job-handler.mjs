import { planWallbreakerCycle } from './wallbreaker.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const ECONOMIC_WEALTH_REPAIR_JOB_VERSION='uberbond.economic-wealth-repair-job.v1';
const ALLOWED=new Set(['INTERNAL_SOLVABLE','PROVIDER_OR_RAIL','EVIDENCE_REQUIRED','UNKNOWN']);
const text=(v,max=500)=>String(v??'').trim().slice(0,max);
const cloneZero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);

function spec(type,payload,suffix,priority=80){return{type,payload,maxAttempts:3,priority,dedupeSuffix:suffix};}

export function compileEconomicRepairDispatch(mission={},now=new Date()){
  const blockerClass=text(mission?.blockerClass,80).toUpperCase();
  if(!ALLOWED.has(blockerClass)) return {ok:false,status:'ECONOMIC_REPAIR_NOT_DISPATCHABLE',reasonCodes:['repairable-blocker-class-required'],jobs:[],externalEffectLedger:cloneZero()};
  const id=text(mission?.id,140)||'repair';
  const evidenceRefs=Array.isArray(mission?.problem?.evidenceRefs)?mission.problem.evidenceRefs:[];
  const date=now.toISOString();
  const jobs=[];
  if(blockerClass==='INTERNAL_SOLVABLE'){
    jobs.push(spec('prometheus.upgrade.propose',{problem:text(mission?.problem?.objective,1000)||`Resolve internal economic blocker ${id}`,evidenceRefs,acceptanceCriteria:Array.isArray(mission?.problem?.successCriteria)?mission.problem.successCriteria:['resolution is verified'],rollbackPlan:'restore the previous verified state if acceptance criteria fail',date},'upgrade-proposal',95));
  }else if(blockerClass==='PROVIDER_OR_RAIL'){
    jobs.push(spec('prometheus.capability_genome.plan',{},'capability-plan',85));
    jobs.push(spec('research.batch',{limit:25,objective:`Research independent alternatives for ${text(mission?.stage,80)||'economic'} dependency`},'alternative-research',80));
    jobs.push(spec('prometheus.commercial.tournament',{limit:20,date},'rerank',75));
  }else if(blockerClass==='EVIDENCE_REQUIRED'){
    jobs.push(spec('research.batch',{limit:25,objective:`Gather observed evidence for ${text(mission?.stage,80)||'economic'} readiness`},'evidence-research',85));
    jobs.push(spec('prometheus.commercial.catalog',{date},'catalog-refresh',75));
    jobs.push(spec('prometheus.commercial.tournament',{limit:20,date},'evidence-rerank',75));
  }else{
    jobs.push(spec('prometheus.capability_gap.recompute',{},'gap-recompute',85));
    jobs.push(spec('research.batch',{limit:15,objective:`Classify unresolved ${text(mission?.stage,80)||'economic'} dependency`},'classification-research',80));
  }
  return {ok:true,status:'ECONOMIC_REPAIR_DISPATCH_READY',missionId:id,blockerClass,jobs,externalEffectLedger:cloneZero()};
}

export function compileEconomicSaturationDispatch(request={},now=new Date()){
  const id=text(request?.id,140)||'saturation';
  const date=now.toISOString();
  const reason=text(request?.reason,240)||'expand-independent-economic-paths';
  return {ok:true,status:'ECONOMIC_SATURATION_DISPATCH_READY',requestId:id,jobs:[
    spec('research.batch',{limit:50,objective:`Research materially independent economic paths: ${reason}`},'research',80),
    spec('discovery.run',{mode:'economic-saturation',reason},'discovery',80),
    spec('prometheus.commercial.catalog',{date},'catalog',75),
    spec('prometheus.commercial.tournament',{limit:30,date},'tournament',75),
    spec('prometheus.capability_genome.plan',{},'capability-plan',70),
    spec('prometheus.capability_gap.recompute',{},'gap-recompute',70)
  ],externalEffectLedger:cloneZero()};
}

async function enqueueDispatch({dispatch,enqueueJob,kind,now}){
  const queued=[];const failures=[];
  if(typeof enqueueJob!=='function') return {queued,failures:[{type:kind,reason:'durable-enqueue-function-required'}]};
  const bucket=Math.floor(now.getTime()/1_800_000);
  for(const job of dispatch.jobs){
    try{const result=await enqueueJob(job.type,job.payload||{},{maxAttempts:job.maxAttempts,priority:job.priority,dedupeKey:`${kind}:${dispatch.missionId||dispatch.requestId}:${job.dedupeSuffix}:${bucket}`});queued.push({type:job.type,jobId:result?.id||null});}
    catch(error){failures.push({type:job.type,reason:text(error?.message,300)||'enqueue-failed'});}
  }
  return{queued,failures};
}

export async function runEconomicWealthRepairJob({mission,enqueueJob=null,store=null,now=new Date()}={}){
  const dispatch=compileEconomicRepairDispatch(mission,now);
  if(!dispatch.ok) return {...dispatch,businessEffectAuthority:'NONE'};
  const wallbreaker=planWallbreakerCycle({problem:mission.problem,failures:[mission.failure],candidates:Array.isArray(mission.candidateCountermoves)?mission.candidateCountermoves:[]});
  const{queued,failures}=await enqueueDispatch({dispatch,enqueueJob,kind:'economic-repair',now});
  const receipt={ok:true,version:ECONOMIC_WEALTH_REPAIR_JOB_VERSION,status:queued.length?'ECONOMIC_REPAIR_PREPARATION_QUEUED':'ECONOMIC_REPAIR_PREPARATION_NOT_QUEUED',missionId:dispatch.missionId,blockerClass:dispatch.blockerClass,wallbreakerStatus:wallbreaker?.status||null,wallbreakerReceiptId:wallbreaker?.wallbreakerReceiptId||null,selectedCountermoveSignature:wallbreaker?.selected?.candidate?.signature||null,queuedJobTypes:queued.map(x=>x.type),queuedJobCount:queued.length,enqueueFailureCount:failures.length,externalEffectLedger:cloneZero(),businessEffectAuthority:'NONE',capitalDeploymentAuthority:'NONE'};
  if(store&&typeof store.log==='function') await store.log('economic_wealth_repair',receipt);
  return receipt;
}

export async function runEconomicWealthSaturationJob({request,enqueueJob=null,store=null,now=new Date()}={}){
  const dispatch=compileEconomicSaturationDispatch(request,now);
  const{queued,failures}=await enqueueDispatch({dispatch,enqueueJob,kind:'economic-saturate',now});
  const receipt={ok:true,version:ECONOMIC_WEALTH_REPAIR_JOB_VERSION,status:queued.length?'ECONOMIC_SATURATION_PREPARATION_QUEUED':'ECONOMIC_SATURATION_PREPARATION_NOT_QUEUED',requestId:dispatch.requestId,queuedJobTypes:queued.map(x=>x.type),queuedJobCount:queued.length,enqueueFailureCount:failures.length,externalEffectLedger:cloneZero(),businessEffectAuthority:'NONE',capitalDeploymentAuthority:'NONE'};
  if(store&&typeof store.log==='function') await store.log('economic_wealth_saturation',receipt);
  return receipt;
}
