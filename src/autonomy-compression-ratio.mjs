import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const AUTONOMY_COMPRESSION_RATIO_VERSION='uberbond.autonomy-compression-ratio.v1';
export const AUTONOMY_LAYERS=Object.freeze([
  'DETERMINISTIC','JEV_SYSTEM_ONE','LOCAL_MODEL','CHEAP_CLOUD','FRONTIER_MODEL'
]);
const COMPILED_LAYERS=new Set(['DETERMINISTIC','JEV_SYSTEM_ONE','LOCAL_MODEL']);
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
const unit=v=>Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1?Number(v):null;
const nonneg=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;
const txt=(v,m=240)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};

function normalizeTasks(tasks){
  const reasons=[];
  if(!Array.isArray(tasks)||tasks.length<1||tasks.length>10000) return {ok:false,reasons:['bounded-task-population-required']};
  const ids=new Set();
  const rows=[];
  for(const raw of tasks){
    const taskId=txt(raw?.taskId),layer=txt(raw?.layer,80)?.toUpperCase();
    const quality=unit(raw?.quality),frontierTokens=nonneg(raw?.frontierTokens),hidden=nonneg(raw?.hiddenFrontierInterventions),defects=nonneg(raw?.defects);
    const accepted=raw?.accepted===true;
    if(!taskId||ids.has(taskId)) reasons.push('unique-task-id-required');
    if(!AUTONOMY_LAYERS.includes(layer)) reasons.push('known-autonomy-layer-required');
    if(quality===null||frontierTokens===null||hidden===null||defects===null) reasons.push('bounded-task-metrics-required');
    if(reasons.length) break;
    ids.add(taskId);
    rows.push({taskId,layer,quality,frontierTokens,hiddenFrontierInterventions:hidden,defects,accepted});
  }
  return reasons.length?{ok:false,reasons:[...new Set(reasons)]}:{ok:true,rows};
}

export function compileAutonomyCompressionMeasurement({tasks=[]}={}){
  const normalized=normalizeTasks(tasks);
  if(!normalized.ok) return envelope({ok:false,status:'AUTONOMY_COMPRESSION_MEASUREMENT_BLOCKED',reasonCodes:normalized.reasons});
  const rows=normalized.rows;
  const accepted=rows.filter(r=>r.accepted);
  const acceptedQualityWork=accepted.reduce((s,r)=>s+r.quality,0);
  if(acceptedQualityWork<=0) return envelope({ok:false,status:'AUTONOMY_COMPRESSION_MEASUREMENT_BLOCKED',reasonCodes:['positive-accepted-quality-work-required']});
  const compiledQualityWork=accepted.filter(r=>COMPILED_LAYERS.has(r.layer)).reduce((s,r)=>s+r.quality,0);
  const frontierQualityWork=accepted.filter(r=>r.layer==='FRONTIER_MODEL').reduce((s,r)=>s+r.quality,0);
  const frontierTokens=rows.reduce((s,r)=>s+r.frontierTokens,0);
  const hiddenFrontierInterventions=rows.reduce((s,r)=>s+r.hiddenFrontierInterventions,0);
  const defects=rows.reduce((s,r)=>s+r.defects,0);
  const taskCount=rows.length;
  const acceptedCount=accepted.length;
  return envelope({
    ok:true,
    status:'AUTONOMY_COMPRESSION_MEASURED',
    version:AUTONOMY_COMPRESSION_RATIO_VERSION,
    taskCount,
    acceptedCount,
    acceptanceRate:acceptedCount/taskCount,
    acceptedQualityWork,
    compiledQualityWork,
    frontierQualityWork,
    autonomyCompressionRatio:compiledQualityWork/acceptedQualityWork,
    frontierQualityShare:frontierQualityWork/acceptedQualityWork,
    frontierTokens,
    frontierTokensPerAcceptedQualityUnit:frontierTokens/acceptedQualityWork,
    hiddenFrontierInterventions,
    hiddenFrontierInterventionsPerTask:hiddenFrontierInterventions/taskCount,
    defects,
    defectsPerTask:defects/taskCount,
    layerAcceptedQuality:Object.fromEntries(AUTONOMY_LAYERS.map(layer=>[
      layer,accepted.filter(r=>r.layer===layer).reduce((s,r)=>s+r.quality,0)
    ])),
    truthBoundary:'THIS_METRIC_MEASURES_DECLARED_TASK_OUTCOMES_AND_RESOURCE_USE__A_HIGHER_RATIO_IS_NOT_AN_IMPROVEMENT_IF_DEFECTS_HIDDEN_FRONTIER_WORK_OR_ACCEPTANCE_DEGRADE.'
  });
}

function samePopulation(a,b){
  const x=[...a].sort(),y=[...b].sort();
  return x.length===y.length&&x.every((id,i)=>id===y[i]);
}

export function compareAutonomyCompressionReplay({baselineTasks=[],currentTasks=[],maxAcceptanceDrop=0,maxDefectRateIncrease=0,maxHiddenInterventionRateIncrease=0}={}){
  const thresholds=[maxAcceptanceDrop,maxDefectRateIncrease,maxHiddenInterventionRateIncrease].map(unit);
  if(thresholds.some(v=>v===null)) return envelope({ok:false,status:'AUTONOMY_COMPRESSION_REPLAY_BLOCKED',reasonCodes:['comparison-thresholds-must-be-zero-to-one']});
  const bNorm=normalizeTasks(baselineTasks),cNorm=normalizeTasks(currentTasks);
  if(!bNorm.ok||!cNorm.ok) return envelope({ok:false,status:'AUTONOMY_COMPRESSION_REPLAY_BLOCKED',reasonCodes:[...(bNorm.reasons||[]),...(cNorm.reasons||[])]});
  const bIds=bNorm.rows.map(r=>r.taskId),cIds=cNorm.rows.map(r=>r.taskId);
  if(!samePopulation(bIds,cIds)) return envelope({ok:false,status:'AUTONOMY_COMPRESSION_REPLAY_BLOCKED',reasonCodes:['same-declared-task-population-required']});
  const baseline=compileAutonomyCompressionMeasurement({tasks:bNorm.rows});
  const current=compileAutonomyCompressionMeasurement({tasks:cNorm.rows});
  if(!baseline.ok||!current.ok) return envelope({ok:false,status:'AUTONOMY_COMPRESSION_REPLAY_BLOCKED',reasonCodes:['both-arms-must-be-measurable']});

  const compressionDelta=current.autonomyCompressionRatio-baseline.autonomyCompressionRatio;
  const frontierTokenIntensityDelta=current.frontierTokensPerAcceptedQualityUnit-baseline.frontierTokensPerAcceptedQualityUnit;
  const acceptanceDelta=current.acceptanceRate-baseline.acceptanceRate;
  const defectRateDelta=current.defectsPerTask-baseline.defectsPerTask;
  const hiddenRateDelta=current.hiddenFrontierInterventionsPerTask-baseline.hiddenFrontierInterventionsPerTask;
  const qualityDelta=current.acceptedQualityWork-baseline.acceptedQualityWork;

  const compressionRose=compressionDelta>0;
  const frontierIntensityFell=frontierTokenIntensityDelta<0;
  const acceptanceSafe=acceptanceDelta>=-thresholds[0];
  const defectsSafe=defectRateDelta<=thresholds[1];
  const hiddenSafe=hiddenRateDelta<=thresholds[2];
  const qualitySafe=qualityDelta>=0;
  const gamingRisk=compressionRose&&(!defectsSafe||!hiddenSafe||!acceptanceSafe||!qualitySafe);
  const supported=compressionRose&&frontierIntensityFell&&acceptanceSafe&&defectsSafe&&hiddenSafe&&qualitySafe;

  return envelope({
    ok:true,
    status:supported?'AUTONOMY_COMPRESSION_IMPROVEMENT_SUPPORTED':gamingRisk?'AUTONOMY_COMPRESSION_GAMING_RISK':'AUTONOMY_COMPRESSION_NOT_IMPROVED',
    version:AUTONOMY_COMPRESSION_RATIO_VERSION,
    baseline,
    current,
    deltas:{compressionDelta,frontierTokenIntensityDelta,acceptanceDelta,defectRateDelta,hiddenRateDelta,acceptedQualityWorkDelta:qualityDelta},
    gates:{compressionRose,frontierIntensityFell,acceptanceSafe,defectsSafe,hiddenFrontierSafe:hiddenSafe,acceptedQualitySafe:qualitySafe},
    falsifierTriggered:gamingRisk,
    hypothesisSupported:supported,
    law:'COMPRESSION_CREDIT_REQUIRES_SAME_TASK_POPULATION_AND_CANNOT_BE_EARNED_BY_MORE_DEFECTS_HIDDEN_FRONTIER_INTERVENTION_ACCEPTANCE_LOSS_OR_QUALITY_LOSS.',
    truthBoundary:'SUPPORTED_MEANS_THIS_FIXED_REPLAY_PASSED_THE_DECLARED_FALSIFIER__IT_DOES_NOT_PROVE_GENERAL_AUTONOMY_OR_REPLACE_REAL_WORLD_VALIDATION.'
  });
}
