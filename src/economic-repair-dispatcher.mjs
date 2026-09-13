import crypto from 'node:crypto';
export const ECONOMIC_REPAIR_DISPATCH_VERSION='uberbond.economic-repair-dispatch.v1';
const h=v=>crypto.createHash('sha256').update(String(v??'')).digest('hex').slice(0,20);
const AUTO=new Set(['INTERNAL_SOLVABLE','PROVIDER_OR_RAIL','EVIDENCE_REQUIRED','UNKNOWN']);
const NEVER=new Set(['AUTHORITY_REQUIRED','PROHIBITED_OR_IMPOSSIBLE']);

export function compileEconomicRepairDispatch({autonomousResolutionTasks=[],ownerOnlyBlockers=[],maxJobs=8}={}){
  const jobs=[]; const refused=[];
  for(const task of Array.isArray(autonomousResolutionTasks)?autonomousResolutionTasks:[]){
    const cls=String(task?.class||'UNKNOWN');
    if(NEVER.has(cls)){refused.push({class:cls,reason:'non-autonomous-blocker'});continue;}
    if(!AUTO.has(cls)){refused.push({class:cls,reason:'unsupported-blocker-class'});continue;}
    const pathDigest=h(task.pathId); const stage=String(task.stage||'UNKNOWN');
    jobs.push({
      jobType:'universal.wealth.repair',
      singletonKey:`wealth-repair:${pathDigest}:${stage.toLowerCase()}`,
      payload:{pathDigest,stage,blockerClass:cls,actions:Array.isArray(task.actions)?task.actions.slice(0,6):[],substituteRailDigests:(Array.isArray(task.substituteRailIds)?task.substituteRailIds:[]).map(h)},
      authority:'NONE'
    });
  }
  for(const task of Array.isArray(ownerOnlyBlockers)?ownerOnlyBlockers:[]) refused.push({class:'AUTHORITY_REQUIRED',stage:String(task?.stage||'UNKNOWN'),reason:'founder-authority-required'});
  const selected=jobs.slice(0,Math.max(0,Math.floor(Number(maxJobs)||8)));
  return {version:ECONOMIC_REPAIR_DISPATCH_VERSION,status:selected.length?'REPAIR_JOBS_READY':'NO_AUTONOMOUS_REPAIR_JOBS',jobCount:selected.length,jobs:selected,refusedCount:refused.length,refused,externalEffectAuthority:'NONE',truthBoundary:'REPAIR_DISPATCH_MAY_ONLY_ATTACK_INTERNAL_PROVIDER_EVIDENCE_OR_UNKNOWN_BLOCKERS; AUTHORITY_AND_PROHIBITED_BLOCKERS_ARE_NEVER_AUTO_ATTACKED'};
}
