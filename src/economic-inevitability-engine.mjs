import crypto from 'node:crypto';

export const ECONOMIC_INEVITABILITY_VERSION='uberbond.economic-inevitability.v1';
export const ECONOMIC_STAGES=Object.freeze(['OPPORTUNITY','OFFER','DISTRIBUTION','PAYMENT','FULFILLMENT','ACCEPTANCE','RENEWAL','RECONCILIATION']);
export const STAGE_STATUSES=Object.freeze(['READY','BLOCKED_INTERNAL','BLOCKED_AUTHORITY','BLOCKED_EXTERNAL','BLOCKED_EVIDENCE','PROHIBITED','UNKNOWN']);

export const PUBLIC_SUCCESS_DONOR_ATOMS=Object.freeze([
  Object.freeze({id:'instant-self-serve-monetization',stages:['OFFER','PAYMENT'],sourceClass:'PUBLIC_SUCCESS_ANALOG',sourceRefs:['stripe:lovable','stripe:linear'],authority:'NONE'}),
  Object.freeze({id:'subscription-plus-usage-billing',stages:['PAYMENT','RENEWAL'],sourceClass:'PUBLIC_SUCCESS_ANALOG',sourceRefs:['stripe:lovable'],authority:'NONE'}),
  Object.freeze({id:'internal-tool-to-product',stages:['OPPORTUNITY','OFFER'],sourceClass:'PUBLIC_SUCCESS_ANALOG',sourceRefs:['acquire:growth-x'],authority:'NONE'}),
  Object.freeze({id:'programmatic-demand-capture',stages:['DISTRIBUTION'],sourceClass:'PUBLIC_SUCCESS_ANALOG',sourceRefs:['indiehackers:angel-match'],authority:'NONE'}),
  Object.freeze({id:'free-tool-flywheel',stages:['DISTRIBUTION'],sourceClass:'PUBLIC_SUCCESS_ANALOG',sourceRefs:['indiehackers:angel-match'],authority:'NONE'}),
  Object.freeze({id:'partner-affiliate-distribution',stages:['DISTRIBUTION'],sourceClass:'PUBLIC_SUCCESS_ANALOG',sourceRefs:['shopify:impact'],authority:'NONE'}),
  Object.freeze({id:'borrowed-marketplace-demand',stages:['DISTRIBUTION'],sourceClass:'PUBLIC_SUCCESS_ANALOG',sourceRefs:['stripe:marketplaces'],authority:'NONE'}),
  Object.freeze({id:'productized-fulfillment',stages:['FULFILLMENT','ACCEPTANCE'],sourceClass:'PUBLIC_SUCCESS_ANALOG',sourceRefs:['indiehackers:productized-service'],authority:'NONE'}),
  Object.freeze({id:'recurring-reengagement-referral',stages:['RENEWAL'],sourceClass:'PUBLIC_SUCCESS_ANALOG',sourceRefs:['indiehackers:productized-service'],authority:'NONE'}),
  Object.freeze({id:'asset-exit-optionality',stages:['RECONCILIATION'],sourceClass:'PUBLIC_SUCCESS_ANALOG',sourceRefs:['acquire:wisdomic','acquire:growth-x'],authority:'NONE'})
]);

const hash=value=>crypto.createHash('sha256').update(String(value??'')).digest('hex');
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):min));
const uniq=values=>[...new Set((Array.isArray(values)?values:[]).map(v=>String(v??'').trim()).filter(Boolean))];
const status=value=>STAGE_STATUSES.includes(String(value||'').toUpperCase())?String(value).toUpperCase():'UNKNOWN';

function normalizeStage(stage,input={}){
  const x=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  return {stage,status:status(x.status),railId:String(x.railId??'').trim()||null,evidenceRefs:uniq(x.evidenceRefs),substituteRailIds:uniq(x.substituteRailIds),confidence:clamp(x.confidence,0,1),note:String(x.note??'').trim().slice(0,300)||null};
}

function blockerClass(stageStatus){
  return ({BLOCKED_INTERNAL:'INTERNAL_SOLVABLE',BLOCKED_AUTHORITY:'AUTHORITY_REQUIRED',BLOCKED_EXTERNAL:'PROVIDER_OR_RAIL',BLOCKED_EVIDENCE:'EVIDENCE_REQUIRED',PROHIBITED:'PROHIBITED_OR_IMPOSSIBLE',UNKNOWN:'UNKNOWN'})[stageStatus]||null;
}

function resolutionFor(stage,stageStatus){
  if(stageStatus==='BLOCKED_INTERNAL') return [`repair-or-build-${stage.toLowerCase()}-path`,`benchmark-${stage.toLowerCase()}-substitutes`,`verify-${stage.toLowerCase()}-receipt`];
  if(stageStatus==='BLOCKED_EXTERNAL') return [`discover-independent-${stage.toLowerCase()}-rail`,`verify-live-callability`,`prefer-zero-lock-in-substitute`];
  if(stageStatus==='BLOCKED_EVIDENCE') return [`collect-observed-${stage.toLowerCase()}-evidence`,`run-smallest-reversible-canary`,`withhold-success-claim-until-observed`];
  if(stageStatus==='BLOCKED_AUTHORITY') return [`prepare-owner-authority-packet`,`find-lawful-zero-authority-substitute`,`do-not-circumvent-permission`];
  if(stageStatus==='UNKNOWN') return [`instrument-${stage.toLowerCase()}-truth`,`classify-before-retry`,`avoid-assuming-ready-or-failed`];
  if(stageStatus==='PROHIBITED') return ['kill-path','preserve-reason','search-lawful-mechanism-family'];
  return [];
}

export function compileEconomicExecutionPath(input={}){
  const stages=Object.fromEntries(ECONOMIC_STAGES.map(s=>[s,normalizeStage(s,input.stages?.[s])]));
  const blockers=[];
  for(const s of ECONOMIC_STAGES){const st=stages[s];if(st.status!=='READY') blockers.push({stage:s,status:st.status,class:blockerClass(st.status),resolution:resolutionFor(s,st.status),substituteRailIds:st.substituteRailIds});}
  const prohibited=blockers.some(b=>b.class==='PROHIBITED_OR_IMPOSSIBLE');
  const allReady=blockers.length===0;
  const observedClearedPayments=Math.max(0,Math.floor(Number(input.observedClearedPayments)||0));
  const acceptedDeliveries=Math.max(0,Math.floor(Number(input.acceptedDeliveries)||0));
  const recurringPayments=Math.max(0,Math.floor(Number(input.recurringPayments)||0));
  const evidenceQuality=clamp(input.evidenceQuality,0,1);
  const realized=observedClearedPayments>0&&acceptedDeliveries>0;
  const maturity=prohibited?'KILLED':realized&&recurringPayments>0?'RECURRING_OBSERVED':realized?'MONEY_LOOP_OBSERVED':allReady?'EXECUTABLE_UNPROVEN':'BLOCKED';
  return {id:String(input.id??'').trim()||`path_${hash(JSON.stringify(input)).slice(0,16)}`,mechanismFamily:String(input.mechanismFamily??'unknown').trim()||'unknown',independenceClass:String(input.independenceClass??input.mechanismFamily??'unknown').trim()||'unknown',stages,blockers,executable:allReady&&!prohibited,realized,maturity,observedClearedPayments,acceptedDeliveries,recurringPayments,evidenceQuality,successProbability:clamp(input.successProbability,0,1),expectedNetContribution:Number.isFinite(Number(input.expectedNetContribution))?Number(input.expectedNetContribution):0,founderMinutes:Math.max(0,Number(input.founderMinutes)||0),externalEffectAuthority:'NONE',truthBoundary:'EXECUTION_PATH_READINESS_IS_NOT_REVENUE; ONLY_OBSERVED_CLEARED_PAYMENT_AND_ACCEPTED_DELIVERY_ESTABLISH_A_REAL_MONEY_LOOP'};
}

function sharedRail(paths,stage){
  if(paths.length<2) return null;
  const ids=paths.map(p=>p.stages[stage]?.railId).filter(Boolean);
  if(ids.length!==paths.length) return null;
  return new Set(ids).size===1?ids[0]:null;
}

function donorMatches(blockedStages){const set=new Set(blockedStages);return PUBLIC_SUCCESS_DONOR_ATOMS.filter(atom=>atom.stages.some(s=>set.has(s))).map(atom=>atom.id);}

export function compileEconomicInevitabilityPlan({paths=[],policyClearedDonorDigests=[],minimumIndependentPaths=3}={}){
  const compiled=(Array.isArray(paths)?paths:[]).map(compileEconomicExecutionPath);
  const executable=compiled.filter(p=>p.executable);const realized=compiled.filter(p=>p.realized);const recurring=compiled.filter(p=>p.maturity==='RECURRING_OBSERVED');
  const singlePointFailures={distributionRail:sharedRail(executable,'DISTRIBUTION'),paymentRail:sharedRail(executable,'PAYMENT'),fulfillmentRail:sharedRail(executable,'FULFILLMENT')};
  const spofCount=Object.values(singlePointFailures).filter(Boolean).length;
  const independentClasses=new Set(executable.map(p=>p.independenceClass));const mechanismFamilies=new Set(executable.map(p=>p.mechanismFamily));
  const blockerCounts={};const stageBlockerCounts={};const autonomousResolutionTasks=[];const ownerOnlyBlockers=[];const killedPaths=[];
  for(const p of compiled){if(p.maturity==='KILLED') killedPaths.push(p.id);for(const b of p.blockers){blockerCounts[b.class]=(blockerCounts[b.class]||0)+1;stageBlockerCounts[b.stage]=(stageBlockerCounts[b.stage]||0)+1;const task={pathId:p.id,stage:b.stage,class:b.class,actions:b.resolution,substituteRailIds:b.substituteRailIds};if(b.class==='AUTHORITY_REQUIRED') ownerOnlyBlockers.push(task);else if(b.class!=='PROHIBITED_OR_IMPOSSIBLE') autonomousResolutionTasks.push(task);}}
  const blockedStages=Object.keys(stageBlockerCounts);const clearedDonorDigests=uniq(policyClearedDonorDigests).map(value=>hash(value).slice(0,24));
  const pathReadiness=compiled.length?compiled.reduce((sum,p)=>sum+(p.executable?1:Math.max(0,1-p.blockers.length/ECONOMIC_STAGES.length)),0)/compiled.length:0;
  const redundancy=Math.min(1,independentClasses.size/Math.max(1,minimumIndependentPaths))*(spofCount===0?1:0.5);const evidence=Math.min(1,(realized.length+recurring.length)/Math.max(1,minimumIndependentPaths));const unknownPenalty=Math.min(0.35,(blockerCounts.UNKNOWN||0)*0.03);
  const inevitabilityIndex=Math.round(100*Math.max(0,Math.min(1,0.35*pathReadiness+0.30*redundancy+0.35*evidence-unknownPenalty)));
  let overallStatus='THEORY_ONLY';if(executable.length>0) overallStatus='FRAGILE_EXECUTION_READY';if(executable.length>=minimumIndependentPaths&&independentClasses.size>=minimumIndependentPaths&&spofCount===0) overallStatus='MULTIPATH_EXECUTION_READY_UNPROVEN';if(realized.length>0&&overallStatus==='MULTIPATH_EXECUTION_READY_UNPROVEN') overallStatus='RESILIENT_MONEY_LOOP_OBSERVED';if(realized.length>=minimumIndependentPaths&&recurring.length>0&&spofCount===0) overallStatus='REPEATED_REDUNDANT_MONEY_LOOP_OBSERVED';
  const evidenceBacked=executable.filter(p=>p.evidenceQuality>0&&p.successProbability>0&&p.independenceClass);const uniqueByClass=new Map();for(const p of evidenceBacked){const prev=uniqueByClass.get(p.independenceClass);if(!prev||p.successProbability>prev.successProbability) uniqueByClass.set(p.independenceClass,p);}const boundedNightClearanceModel=uniqueByClass.size?1-[...uniqueByClass.values()].reduce((product,p)=>product*(1-p.successProbability*p.evidenceQuality),1):0;
  return {version:ECONOMIC_INEVITABILITY_VERSION,status:overallStatus,inevitabilityIndex,pathCount:compiled.length,executablePathCount:executable.length,realizedPathCount:realized.length,recurringPathCount:recurring.length,independentExecutionClassCount:independentClasses.size,executableMechanismFamilyCount:mechanismFamilies.size,blockerCounts,stageBlockerCounts,singlePointFailures,autonomousResolutionTasks,ownerOnlyBlockers,killedPathIds:killedPaths,donorAtomIds:donorMatches(blockedStages),policyClearedDonorDigests:clearedDonorDigests,boundedNightClearanceModel:Number(boundedNightClearanceModel.toFixed(6)),selectedExecutablePathIds:executable.sort((a,b)=>b.expectedNetContribution-a.expectedNetContribution).map(p=>p.id),externalEffectAuthority:'NONE',capitalDeploymentAuthority:'NONE',truthBoundary:'INEVITABILITY_INDEX_IS_A_RESILIENCE_AND_EVIDENCE_SCORE_NOT_A_GUARANTEE; DONOR_MECHANISMS_REQUIRE_UPSTREAM_POLICY_CLEARANCE; AUTHORITY_BLOCKS_MUST_NEVER_BE_BYPASSED; MONEY_IS_ONLY_REAL_AFTER_CLEARED_PAYMENT_AND_ACCEPTED_DELIVERY'};
}
