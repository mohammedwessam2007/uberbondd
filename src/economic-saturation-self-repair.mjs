import crypto from 'node:crypto';

export const ECONOMIC_SATURATION_SELF_REPAIR_VERSION = 'uberbond.economic-saturation-self-repair.v1';

const REPAIRABLE_CLASSES = new Set(['INTERNAL_SOLVABLE','PROVIDER_OR_RAIL','EVIDENCE_REQUIRED','UNKNOWN']);
const HARD_STOP_CLASSES = new Set(['AUTHORITY_REQUIRED','PROHIBITED_OR_IMPOSSIBLE']);
const FAILURE_CLASS_BY_BLOCKER = Object.freeze({
  INTERNAL_SOLVABLE:'IMPLEMENTATION_DEFECT',
  PROVIDER_OR_RAIL:'PROVIDER_FAILURE',
  EVIDENCE_REQUIRED:'MISSING_EVIDENCE',
  UNKNOWN:'UNKNOWN'
});

const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):min));
const integer=(v,fallback,min=0,max=10000)=>{
  const n=Math.floor(Number(v));
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
};
const text=(v,max=240)=>String(v??'').trim().slice(0,max);
const uniq=values=>[...new Set((Array.isArray(values)?values:[]).map(v=>text(v)).filter(Boolean))];
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function routeFingerprint(raw={}){
  const stages=raw?.stages&&typeof raw.stages==='object'?raw.stages:{};
  return {
    mechanismFamily:text(raw.mechanismFamily)||'unknown',
    independenceClass:text(raw.independenceClass||raw.mechanismFamily)||'unknown',
    buyerPoolId:text(raw.buyerPoolId)||null,
    channelId:text(raw.channelId||stages?.DISTRIBUTION?.railId)||null,
    paymentRailId:text(raw.paymentRailId||stages?.PAYMENT?.railId)||null,
    fulfillmentModeId:text(raw.fulfillmentModeId||stages?.FULFILLMENT?.railId)||null,
    geographyId:text(raw.geographyId)||null,
    monetizationFamily:text(raw.monetizationFamily)||null
  };
}

function correlationKey(fp){
  return [fp.independenceClass,fp.mechanismFamily,fp.buyerPoolId,fp.channelId,fp.paymentRailId,fp.fulfillmentModeId,fp.geographyId,fp.monetizationFamily].map(x=>x||'∅').join('|');
}

function repairMission(task,index){
  const blockerClass=text(task?.class,80).toUpperCase();
  if(!REPAIRABLE_CLASSES.has(blockerClass)) return null;
  const stage=text(task?.stage,80).toUpperCase()||'UNKNOWN';
  const actions=uniq(task?.actions);
  const pathId=text(task?.pathId,160)||`path-${index+1}`;
  const failureClass=FAILURE_CLASS_BY_BLOCKER[blockerClass]||'UNKNOWN';
  const missionCore={pathId,stage,blockerClass,failureClass,actions};
  return {
    id:`econ-repair-${hash(missionCore).slice(0,20)}`,
    type:'ECONOMIC_WEALTH_REPAIR',
    pathId,
    stage,
    blockerClass,
    failureClass,
    problem:{
      objective:`Remove the ${stage.toLowerCase()} blocker for economic path ${pathId} without widening authority`,
      successCriteria:[
        `${stage} becomes READY with an evidence reference`,
        'no founder-reserved authority is bypassed',
        'no capital is deployed without separate authorization',
        'the repaired path is recompiled through the economic inevitability engine'
      ],
      hardConstraints:[
        'external-effect-authority-remains-none-in-repair-compiler',
        'no-owner-authority-bypass',
        'no-prohibited-or-impossible-path-revival',
        'no-simulated-dollar-counts-as-payment-evidence'
      ],
      unknowns:blockerClass==='UNKNOWN'?[`${stage} blocker root cause is not classified`]:[],
      evidenceRefs:uniq(task?.evidenceRefs),
      maxSpendCents:0,
      maxFounderMinutes:0,
      riskBudget:3
    },
    failure:{
      failureClass,
      candidateId:pathId,
      missingEvidence:blockerClass==='EVIDENCE_REQUIRED',
      providerUnavailable:blockerClass==='PROVIDER_OR_RAIL',
      implementationError:blockerClass==='INTERNAL_SOLVABLE',
      evidenceRefs:uniq(task?.evidenceRefs)
    },
    candidateCountermoves:(actions.length?actions:['classify-root-cause','generate-materially-different-countermove']).map((action,i)=>({
      id:`counter-${i+1}`,
      family:`${stage.toLowerCase()}-${blockerClass.toLowerCase()}`,
      mechanism:action,
      reversible:true,
      successProbability:0,
      expectedContributionCents:0,
      costCents:0,
      founderMinutes:0,
      risk:1,
      evidenceStrength:0,
      novelty:2,
      robustness:1,
      evidenceRefs:[]
    })),
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    capitalDeploymentAuthority:'NONE'
  };
}

export function compileEconomicSaturationPlan({
  inevitability={},
  executionPaths=[],
  targetNightClearanceProbability=0.995,
  minimumIndependentPaths=8,
  minimumMechanismFamilies=6,
  maxRepairMissions=12,
  maxReplacementRequests=24
}={}){
  const target=clamp(targetNightClearanceProbability,0.5,0.999999);
  const minPaths=integer(minimumIndependentPaths,8,2,128);
  const minFamilies=integer(minimumMechanismFamilies,6,2,128);
  const repairLimit=integer(maxRepairMissions,12,1,128);
  const replacementLimit=integer(maxReplacementRequests,24,1,256);
  const raws=Array.isArray(executionPaths)?executionPaths:[];
  const fingerprints=raws.map(routeFingerprint);
  const uniqueCorrelationKeys=new Set(fingerprints.map(correlationKey));
  const independentClasses=new Set(fingerprints.map(x=>x.independenceClass).filter(x=>x&&x!=='unknown'));
  const mechanismFamilies=new Set(fingerprints.map(x=>x.mechanismFamily).filter(x=>x&&x!=='unknown'));
  const clearance=clamp(inevitability?.boundedNightClearanceModel,0,1);
  const executableCount=integer(inevitability?.executablePathCount,0,0,100000);
  const realizedCount=integer(inevitability?.realizedPathCount,0,0,100000);
  const recurringCount=integer(inevitability?.recurringPathCount,0,0,100000);
  const spofs=inevitability?.singlePointFailures&&typeof inevitability.singlePointFailures==='object'?inevitability.singlePointFailures:{};
  const blockerCounts=inevitability?.blockerCounts&&typeof inevitability.blockerCounts==='object'?inevitability.blockerCounts:{};
  const ownerOnly=Array.isArray(inevitability?.ownerOnlyBlockers)?inevitability.ownerOnlyBlockers:[];
  const autonomous=Array.isArray(inevitability?.autonomousResolutionTasks)?inevitability.autonomousResolutionTasks:[];
  const hardStops=[...ownerOnly,...autonomous.filter(x=>HARD_STOP_CLASSES.has(text(x?.class,80).toUpperCase()))];
  const repairMissions=autonomous.map(repairMission).filter(Boolean).slice(0,repairLimit);

  const deficits=[];
  if(executableCount<minPaths) deficits.push({type:'EXECUTABLE_PATH_DEFICIT',current:executableCount,target:minPaths});
  if(independentClasses.size<minPaths) deficits.push({type:'INDEPENDENCE_CLASS_DEFICIT',current:independentClasses.size,target:minPaths});
  if(mechanismFamilies.size<minFamilies) deficits.push({type:'MECHANISM_FAMILY_DEFICIT',current:mechanismFamilies.size,target:minFamilies});
  if(clearance<target) deficits.push({type:'NIGHT_CLEARANCE_DEFICIT',current:clearance,target});
  for(const [name,value] of Object.entries(spofs)) if(value) deficits.push({type:'SINGLE_POINT_OF_FAILURE',stage:name,railId:text(value,160)});
  if(Number(blockerCounts.UNKNOWN||0)>0) deficits.push({type:'UNKNOWN_BLOCKER_DEFICIT',count:Number(blockerCounts.UNKNOWN||0)});

  const replacementRequests=[];
  const pushReplacement=(reason,stage=null)=>{
    if(replacementRequests.length>=replacementLimit) return;
    const core={reason,stage,index:replacementRequests.length};
    replacementRequests.push({
      id:`replacement-${hash(core).slice(0,18)}`,
      reason,
      stage,
      mustDifferFrom:{
        independenceClasses:[...independentClasses],
        mechanismFamilies:[...mechanismFamilies],
        correlationFingerprints:[...uniqueCorrelationKeys].slice(0,64)
      },
      requiredProperties:[
        'lawful-and-policy-cleared',
        'bounded-reversible-canary',
        'distinct-buyer-or-channel-or-payment-or-fulfillment-dependency',
        'no-founder-authority-assumed',
        'cleared-payment-and-accepted-delivery-required-for-money-claim'
      ],
      externalEffectAuthority:'NONE',
      capitalDeploymentAuthority:'NONE'
    });
  };
  for(const deficit of deficits){
    if(deficit.type==='SINGLE_POINT_OF_FAILURE') pushReplacement(`break-${deficit.stage}-single-point-of-failure`,deficit.stage);
    else if(['EXECUTABLE_PATH_DEFICIT','INDEPENDENCE_CLASS_DEFICIT','MECHANISM_FAMILY_DEFICIT','NIGHT_CLEARANCE_DEFICIT'].includes(deficit.type)) pushReplacement(deficit.type.toLowerCase());
  }
  while(replacementRequests.length<replacementLimit && (independentClasses.size+replacementRequests.length)<minPaths){
    pushReplacement('expand-materially-independent-path-portfolio');
  }

  const noSpof=Object.values(spofs).filter(Boolean).length===0;
  const structuralSaturation=executableCount>=minPaths&&independentClasses.size>=minPaths&&mechanismFamilies.size>=minFamilies&&noSpof;
  const probabilisticSaturation=clearance>=target;
  let status='SATURATION_REQUIRED';
  if(structuralSaturation&&probabilisticSaturation) status='OVERDETERMINED_UNPROVEN';
  if(status==='OVERDETERMINED_UNPROVEN'&&realizedCount>0) status='OVERDETERMINED_MONEY_LOOP_OBSERVED';
  if(structuralSaturation&&probabilisticSaturation&&realizedCount>=minPaths&&recurringCount>0) status='REPEATED_OVERDETERMINED_MONEY_LOOP_OBSERVED';

  return {
    version:ECONOMIC_SATURATION_SELF_REPAIR_VERSION,
    status,
    targetNightClearanceProbability:target,
    modeledNightClearanceProbability:clearance,
    modeledAllPathsFailProbability:Number((1-clearance).toFixed(9)),
    minimumIndependentPaths:minPaths,
    minimumMechanismFamilies:minFamilies,
    executablePathCount:executableCount,
    observedIndependentClassCount:independentClasses.size,
    observedMechanismFamilyCount:mechanismFamilies.size,
    uniqueCorrelationFingerprintCount:uniqueCorrelationKeys.size,
    structuralSaturation,
    probabilisticSaturation,
    deficits,
    repairMissions,
    replacementRequests,
    hardStopCount:hardStops.length,
    ownerOnlyBlockerCount:ownerOnly.length,
    hardStops:hardStops.map(x=>({pathId:text(x?.pathId,160)||null,stage:text(x?.stage,80)||null,class:text(x?.class,80)||null})),
    externalEffectAuthority:'NONE',
    capitalDeploymentAuthority:'NONE',
    truthBoundary:'OVERDETERMINATION_REDUCES_MODELED_FAILURE_PROBABILITY_BUT_NEVER_GUARANTEES_PROFIT; AUTHORITY_AND_PROHIBITED_BLOCKERS_ARE_HARD_STOPS; REPAIR_AND_REPLACEMENT_REQUESTS_ARE_ZERO-EFFECT_CONTRACTS_UNTIL_SEPARATELY_AUTHORIZED_EXECUTORS_RUN_THEM; ONLY_CLEARED_PAYMENT_PLUS_ACCEPTED_DELIVERY_IS_MONEY'
  };
}

export function compileEconomicRepairQueuePlan({saturationPlan,maxJobs=8}={}){
  const plan=saturationPlan&&typeof saturationPlan==='object'?saturationPlan:{};
  const limit=integer(maxJobs,8,1,64);
  const jobs=[];
  for(const mission of Array.isArray(plan.repairMissions)?plan.repairMissions:[]){
    if(jobs.length>=limit) break;
    if(!REPAIRABLE_CLASSES.has(text(mission?.blockerClass,80).toUpperCase())) continue;
    jobs.push({
      type:'economic.wealth.repair',
      payload:{mission},
      maxAttempts:3,
      priority:90,
      dedupeKey:`economic-repair:${text(mission.id,120)}`
    });
  }
  for(const request of Array.isArray(plan.replacementRequests)?plan.replacementRequests:[]){
    if(jobs.length>=limit) break;
    jobs.push({
      type:'economic.wealth.saturate',
      payload:{request},
      maxAttempts:3,
      priority:80,
      dedupeKey:`economic-saturate:${text(request.id,120)}`
    });
  }
  return {
    version:ECONOMIC_SATURATION_SELF_REPAIR_VERSION,
    jobs,
    externalEffectAuthority:'NONE',
    capitalDeploymentAuthority:'NONE',
    truthBoundary:'QUEUE_PLAN_CONTAINS_ONLY_BOUNDED_ZERO_EFFECT_REPAIR_OR_SATURATION_CONTRACTS; IT_NEVER_BYPASSES_OWNER_AUTHORITY_OR_EXECUTES_MARKET_ACTIONS'
  };
}
