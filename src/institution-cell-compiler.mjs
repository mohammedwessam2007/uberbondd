import crypto from 'node:crypto';

export const INSTITUTION_CELL_COMPILER_VERSION='uberbond.institution-cell-compiler.v1';
export const INSTITUTION_EXECUTOR_CLASSES=Object.freeze(['DETERMINISTIC_CODE','SKILL','AGENT','HUMAN_GATE']);
const CLASS_RANK=Object.freeze({DETERMINISTIC_CODE:0,SKILL:1,AGENT:2,HUMAN_GATE:3});
const text=(v,n=500)=>{const s=String(v??'').trim();return s&&s.length<=n?s:null;};
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(v=>text(v,160)).filter(Boolean))].sort();
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const num=(v,fallback=Infinity)=>Number.isFinite(Number(v))?Number(v):fallback;
const fail=(codes,extra={})=>({ok:false,status:'INSTITUTION_CELL_REFUSED',reasonCodes:[...new Set(codes.filter(Boolean))],externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',...extra});

export function compileInstitutionCell({task={},candidates=[]}={}){
  const taskClass=text(task.taskClass,200),required=uniq(task.requiredCapabilities),humanOnly=task.humanOnly===true;
  const maxLatency=num(task.maxLatencyMs),maxCost=num(task.maxCostUsd),maxFounderMinutes=num(task.maxFounderMinutes);
  const reasons=[];
  if(!taskClass)reasons.push('task-class-required');
  if(!required.length)reasons.push('required-capabilities-required');
  if(reasons.length)return fail(reasons);

  const evaluated=[];
  for(const raw of Array.isArray(candidates)?candidates:[]){
    const id=text(raw?.id,200),executorClass=text(raw?.executorClass,80)?.toUpperCase();
    if(!id||!INSTITUTION_EXECUTOR_CLASSES.includes(executorClass))continue;
    const capabilities=uniq(raw.capabilities),evidenceRefs=uniq(raw.evidenceRefs),authority=text(raw.authority,80)||'NONE';
    const missing=required.filter(cap=>!capabilities.includes(cap));
    const latency=num(raw.latencyMs),cost=num(raw.costUsd),founderMinutes=num(raw.founderMinutes);
    const evidenceReady=evidenceRefs.length>0&&raw.verified===true;
    const withinBudget=latency<=maxLatency&&cost<=maxCost&&founderMinutes<=maxFounderMinutes;
    const classAllowed=humanOnly?executorClass==='HUMAN_GATE':executorClass!=='HUMAN_GATE';
    const authorityAllowed=authority==='NONE'||authority==='LOCAL_PREPARATION'||(executorClass==='HUMAN_GATE'&&authority==='FOUNDER_REQUIRED');
    const sufficient=missing.length===0&&evidenceReady&&withinBudget&&classAllowed&&authorityAllowed;
    evaluated.push({id,executorClass,capabilities,evidenceRefs,authority,missingCapabilities:missing,latencyMs:latency,costUsd:cost,founderMinutes,sufficient,withinBudget,evidenceReady,classAllowed,authorityAllowed});
  }
  const sufficient=evaluated.filter(row=>row.sufficient);
  if(!sufficient.length){
    return fail([humanOnly?'verified-human-gate-required':'no-sufficient-executor-candidate'],{taskClass,evaluated});
  }
  sufficient.sort((a,b)=>CLASS_RANK[a.executorClass]-CLASS_RANK[b.executorClass]||a.founderMinutes-b.founderMinutes||a.costUsd-b.costUsd||a.latencyMs-b.latencyMs||a.id.localeCompare(b.id));
  const winner=sufficient[0];
  const cell={schemaVersion:INSTITUTION_CELL_COMPILER_VERSION,taskClass,requiredCapabilities:required,humanOnly,executor:{id:winner.id,executorClass:winner.executorClass,evidenceRefs:winner.evidenceRefs,authority:winner.authority},selectionLaw:'MINIMUM_SUFFICIENT_VERIFIED_EXECUTOR__DETERMINISTIC_CODE_BEFORE_SKILL_BEFORE_AGENT__HUMAN_ONLY_WHEN_TASK_REQUIRES_HUMAN_GATE',evaluatedCandidateCount:evaluated.length,sufficientCandidateCount:sufficient.length};
  cell.cellDigest=`sha256:${hash(cell)}`;
  return{ok:true,status:'INSTITUTION_CELL_COMPILED',cell,evaluated,externalEffectAuthority:'NONE',businessEffectAuthority:'NONE'};
}
