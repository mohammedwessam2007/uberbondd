import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { selectMinimumCapabilityBundle, evaluateBenchmark } from './capability-genome-runtime.mjs';

export const CAPABILITY_CHIMERA_COMPILER_VERSION='uberbond.capability-chimera-compiler.v1';

const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const text=(v,m=500)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const list=(v,n=128,m=240)=>Array.isArray(v)&&v.length<=n?[...new Set(v.map(x=>text(x,m)).filter(Boolean))]:null;
const boundedInt=(v,min,max)=>Number.isSafeInteger(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null;
const finite=v=>Number.isFinite(Number(v))?Number(v):null;

function validRetrieval(retrieval){
  return retrieval?.ok===true
    && retrieval?.status==='PROGRESSIVE_RETRIEVAL_COMPLETE'
    && Array.isArray(retrieval?.results)
    && retrieval.results.length>0
    && retrieval.results.length<=500;
}
function eligibleResult(row){
  return Boolean(row?.capability?.id)
    && Array.isArray(row.capability.capabilityAtoms)
    && Array.isArray(row.capability.dependencies)
    && Array.isArray(row.capability.knownConflicts)
    && Array.isArray(row.capability.compatibilityEdges)
    && row?.admission?.ok===true
    && row?.admission?.decision==='ELIGIBLE';
}
function conflictsBetween(a,b){
  const aid=String(a?.id||''),bid=String(b?.id||'');
  if(!aid||!bid) return null;
  if((a.knownConflicts||[]).map(String).includes(bid)) return `${aid}:conflicts:${bid}`;
  if((b.knownConflicts||[]).map(String).includes(aid)) return `${bid}:conflicts:${aid}`;
  if((a.compatibilityEdges||[]).some(e=>e?.type==='CONFLICTS_WITH'&&String(e.target)===bid)) return `${aid}:edge-conflicts:${bid}`;
  if((b.compatibilityEdges||[]).some(e=>e?.type==='CONFLICTS_WITH'&&String(e.target)===aid)) return `${bid}:edge-conflicts:${aid}`;
  return null;
}
function pairwiseConflictReasons(capabilities){
  const reasons=[];
  for(let i=0;i<capabilities.length;i++) for(let j=i+1;j<capabilities.length;j++){
    const reason=conflictsBetween(capabilities[i],capabilities[j]);
    if(reason) reasons.push(reason);
  }
  return [...new Set(reasons)].sort();
}
function compositionFromBundle({bundle,results,excludedIds=[]}){
  if(!bundle?.ok||bundle.status!=='MINIMUM_SUFFICIENT_BUNDLE_SELECTED') return null;
  const byId=new Map(results.map(r=>[String(r.capability.id),r.capability]));
  const capabilities=bundle.selected.map(x=>byId.get(String(x.id))).filter(Boolean);
  if(capabilities.length!==bundle.selected.length) return null;
  const conflicts=pairwiseConflictReasons(capabilities);
  if(conflicts.length) return {ok:false,reasonCodes:['pairwise-conflict-detected'],conflicts};
  const selectedIds=bundle.selected.map(x=>String(x.id));
  const totalBurden=bundle.selected.reduce((s,x)=>s+(finite(x.burden)||0),0);
  const totalUtility=bundle.selected.reduce((s,x)=>s+(finite(x.utility)||0),0);
  const permissionUnion=[...new Set(capabilities.flatMap(c=>Array.isArray(c.permissions)?c.permissions.map(String):[]))].sort();
  const sideEffectUnion=[...new Set(capabilities.flatMap(c=>Array.isArray(c.sideEffects)?c.sideEffects.map(String):[]))].sort();
  const compositionCore={selectedIds,requiredAtomIds:[...new Set(bundle.selected.flatMap(x=>x.covers.map(String)))].sort(),excludedIds:[...excludedIds].sort(),bundleDigest:bundle.bundleDigest};
  return {
    ok:true,
    status:'CHIMERA_COMPOSITION_READY',
    compositionId:`chimera:${digest(compositionCore).slice(0,40)}`,
    selected:bundle.selected,
    selectedIds,
    bundleDigest:bundle.bundleDigest,
    totalBurden,
    totalUtility,
    permissionUnion,
    sideEffectUnion,
    excludedIds:[...excludedIds].sort(),
    executionAuthority:'NONE'
  };
}

export function searchCapabilityChimeras({
  requiredAtomIds=[],
  retrieval,
  maxBundleSize=12,
  maxCandidates=8
}={}){
  const atoms=list(requiredAtomIds,128,200);
  const bundleCap=boundedInt(maxBundleSize,1,24);
  const candidateCap=boundedInt(maxCandidates,1,32);
  const reasons=[];
  if(!atoms?.length) reasons.push('required-capability-atoms-required');
  if(!validRetrieval(retrieval)) reasons.push('valid-progressive-retrieval-required');
  if(bundleCap===null||candidateCap===null) reasons.push('bounded-search-limits-required');
  if(retrieval?.results?.some(r=>!eligibleResult(r))) reasons.push('all-retrieval-results-must-be-admitted-eligible');
  if(reasons.length) return envelope({ok:false,status:'CAPABILITY_CHIMERA_SEARCH_BLOCKED',reasonCodes:[...new Set(reasons)]});

  const results=retrieval.results;
  const compositions=[];
  const seenBundles=new Set();
  const refusals=[];
  const attempt=(activeResults,excludedIds=[])=>{
    const bundle=selectMinimumCapabilityBundle({requiredAtomIds:atoms,retrievalResults:activeResults,maxBundleSize:bundleCap});
    if(!bundle.ok){
      refusals.push({excludedIds:[...excludedIds],status:bundle.status,uncoveredAtomIds:bundle.uncoveredAtomIds||[],reasons:bundle.reasons||[]});
      return null;
    }
    const composition=compositionFromBundle({bundle,results:activeResults,excludedIds});
    if(!composition?.ok){
      refusals.push({excludedIds:[...excludedIds],status:'CHIMERA_COMPOSITION_REFUSED',reasonCodes:composition?.reasonCodes||['composition-invalid'],conflicts:composition?.conflicts||[]});
      return null;
    }
    const key=composition.selectedIds.slice().sort().join('|');
    if(seenBundles.has(key)) return null;
    seenBundles.add(key);
    compositions.push(composition);
    return composition;
  };

  const primary=attempt(results,[]);
  const primaryIds=primary?.selectedIds||[];
  for(const id of primaryIds){
    if(compositions.length>=candidateCap) break;
    attempt(results.filter(r=>String(r.capability.id)!==id),[id]);
  }
  if(compositions.length<candidateCap&&primaryIds.length>1){
    for(let i=0;i<primaryIds.length;i++) for(let j=i+1;j<primaryIds.length;j++){
      if(compositions.length>=candidateCap) break;
      const excluded=[primaryIds[i],primaryIds[j]];
      attempt(results.filter(r=>!excluded.includes(String(r.capability.id))),excluded);
    }
  }

  compositions.sort((a,b)=>a.totalBurden-b.totalBurden||b.totalUtility-a.totalUtility||a.compositionId.localeCompare(b.compositionId));
  if(!compositions.length) return envelope({
    ok:false,status:'CAPABILITY_CHIMERA_NO_SAFE_COMPOSITION',
    reasonCodes:['no-complete-compatible-dependency-safe-composition'],
    refusals
  });
  return envelope({
    ok:true,
    status:'CAPABILITY_CHIMERA_SEARCH_READY',
    version:CAPABILITY_CHIMERA_COMPILER_VERSION,
    requiredAtomIds:atoms,
    candidateCount:compositions.length,
    candidates:compositions,
    primary:compositions[0],
    refusals,
    searchDigest:digest(compositions.map(c=>({compositionId:c.compositionId,selectedIds:c.selectedIds,totalBurden:c.totalBurden,totalUtility:c.totalUtility}))),
    executionAuthority:'NONE',
    truthBoundary:'SEARCH_OUTPUTS_ARE_ADMITTED_COMPOSITION_CANDIDATES__THEY_DO_NOT_PROVE_RUNTIME_RELIABILITY_ECONOMIC_VALUE_OR_EXECUTION_AUTHORITY.'
  });
}

export function evaluateCapabilityChimeraTournament({
  composition,
  taskClass,
  modelId,
  holdoutId,
  incumbent={},
  chimera={},
  leakChecks=[],
  securityPassed=false,
  benchmarkObservedAt,
  maxAgeDays=90,
  now=new Date()
}={}){
  const reasons=[];
  if(!composition?.ok||composition.status!=='CHIMERA_COMPOSITION_READY'||!text(composition.compositionId,120)) reasons.push('valid-chimera-composition-required');
  if(!text(taskClass,240)||!text(modelId,240)||!text(holdoutId,240)) reasons.push('benchmark-identity-required');
  const incumbentCost=finite(incumbent?.monetaryCostCents),chimeraCost=finite(chimera?.monetaryCostCents);
  if(incumbentCost===null||chimeraCost===null||incumbentCost<0||chimeraCost<0) reasons.push('non-negative-incumbent-and-chimera-cost-required');
  if(reasons.length) return envelope({ok:false,status:'CAPABILITY_CHIMERA_TOURNAMENT_BLOCKED',reasonCodes:[...new Set(reasons)]});

  const benchmark=evaluateBenchmark({
    capabilityId:composition.compositionId,
    modelId,taskClass,
    baseline:incumbent,
    candidate:chimera,
    holdoutId,
    leakChecks,
    securityPassed,
    benchmarkObservedAt,
    maxAgeDays,
    now
  });
  const costNonRegressing=chimeraCost<=incumbentCost;
  const benchmarkEligible=benchmark?.status==='BENCHMARK_ELIGIBLE';
  const supported=benchmarkEligible&&costNonRegressing;
  const benchmarkFailureReasons=benchmarkEligible?[]:[
    ...(benchmark?.record?.reasonCodes||[]),
    ...(benchmark?.record?.nonRegressing===false?['benchmark-non-regression-failed']:[])
  ];
  const falsifierReasons=[
    ...benchmarkFailureReasons,
    ...(!costNonRegressing?['chimera-more-expensive-than-incumbent']:[])
  ];
  return envelope({
    ok:true,
    status:supported?'CAPABILITY_CHIMERA_SUPPORTED':'CAPABILITY_CHIMERA_FALSIFIER_TRIGGERED',
    version:CAPABILITY_CHIMERA_COMPILER_VERSION,
    compositionId:composition.compositionId,
    selectedIds:composition.selectedIds,
    benchmark,
    costComparison:{incumbentCostCents:incumbentCost,chimeraCostCents:chimeraCost,costNonRegressing},
    hypothesisSupported:supported,
    falsifierTriggered:!supported,
    falsifierReasonCodes:[...new Set(falsifierReasons)],
    promotionAuthority:'NONE',
    truthBoundary:'A_SUPPORTED_HELD_OUT_BENCHMARK_IS_NOT_COMMERCIAL_PROOF_AND_DOES_NOT_AUTHORIZE_ACTIVATION__REAL_USAGE_AND_OUTCOME_EVIDENCE_REMAIN_SEPARATE.'
  });
}
