import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_COGNITION_EXCHANGE_VERSION='uberbond.genesis-cognition-exchange.v1';
export const GENESIS_COGNITION_JOB_KINDS=Object.freeze([
  'CANDIDATE_CRITIQUE','COUNTEREXAMPLE_SEARCH','EXPERIMENT_DESIGN','IMPLEMENTATION_DESIGN','SYNTHESIS'
]);
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
const text=(v,m=4000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const list=(v,n=64,m=1000)=>Array.isArray(v)&&v.length<=n?[...new Set(v.map(x=>text(x,m)).filter(Boolean))]:null;
const integer=(v,min=0,max=1e9)=>Number.isSafeInteger(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null;
const unit=v=>Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=1?Number(v):null;

function validCandidateId(v){return /^genesis-candidate-[a-z0-9-]+$/.test(String(v||''));}
function validSupplierId(v){return /^supplier:[a-z0-9][a-z0-9._-]{1,119}$/.test(String(v||''));}

export function compileGenesisCognitionJob({
  candidate,
  kind='CANDIDATE_CRITIQUE',
  maxInputTokens=12000,
  maxOutputTokens=4000,
  maxCostMicrousd=0,
  allowedSupplierClasses=['LOCAL','DETERMINISTIC'],
  requiredCapabilities=['STRUCTURED_JSON']
}={}){
  const reasons=[];
  const candidateId=text(candidate?.candidateId||candidate?.id,240);
  const title=text(candidate?.title,500);
  const hypothesis=text(candidate?.hypothesis,8000);
  const mechanism=text(candidate?.mechanism,8000);
  const falsifier=text(candidate?.falsifier,6000);
  const nextProbe=text(candidate?.nextProbe||candidate?.next_probe,6000);
  const moonshotAffinity=list(candidate?.moonshotAffinity||candidate?.moonshot_affinity,32,120);
  const substrateNeeds=list(candidate?.substrateNeeds||candidate?.substrate_needs,32,120);
  const inputCap=integer(maxInputTokens,256,200000);
  const outputCap=integer(maxOutputTokens,128,32000);
  const costCap=integer(maxCostMicrousd,0,100000000);
  const suppliers=list(allowedSupplierClasses,16,80)?.map(x=>x.toUpperCase());
  const capabilities=list(requiredCapabilities,32,120)?.map(x=>x.toUpperCase());

  if(!candidateId||!validCandidateId(candidateId)) reasons.push('valid-candidate-id-required');
  if(!title||!hypothesis||!mechanism||!falsifier||!nextProbe) reasons.push('complete-candidate-required');
  if(!GENESIS_COGNITION_JOB_KINDS.includes(String(kind).toUpperCase())) reasons.push('known-job-kind-required');
  if(!moonshotAffinity?.length||moonshotAffinity.some(x=>!/^founder-moonshot-\d{4}$/.test(x))) reasons.push('valid-moonshot-affinity-required');
  if(!substrateNeeds?.length) reasons.push('substrate-needs-required');
  if(inputCap===null||outputCap===null||costCap===null) reasons.push('bounded-budget-required');
  if(!suppliers?.length||!capabilities?.length) reasons.push('supplier-and-capability-policy-required');
  if(reasons.length) return envelope({ok:false,status:'GENESIS_COGNITION_JOB_BLOCKED',reasonCodes:[...new Set(reasons)]});

  const normalizedKind=String(kind).toUpperCase();
  return envelope({
    ok:true,
    status:'GENESIS_COGNITION_JOB_READY',
    version:GENESIS_COGNITION_EXCHANGE_VERSION,
    candidateId,
    kind:normalizedKind,
    prompt:{
      system:'Act as a bounded research worker. Return only the requested structured JSON. Treat the candidate as a hypothesis, not truth. Do not claim external effects, implementation, market proof, or scientific proof.',
      candidate:{candidateId,title,hypothesis,mechanism,falsifier,nextProbe,moonshotAffinity,substrateNeeds},
      task:{
        kind:normalizedKind,
        requiredOutput:{
          thesis:'string',
          strongestCounterexamples:['string'],
          falsifierRefinement:'string',
          minimumExperiment:{objective:'string',procedure:['string'],successCriterion:'string',failureCriterion:'string'},
          implementationSketch:{internalOnly:true,steps:['string'],dependencies:['string'],risks:['string']},
          confidence:'number 0..1',
          unresolved:['string']
        }
      }
    },
    requirements:{
      allowedSupplierClasses:suppliers,
      requiredCapabilities:capabilities,
      maxInputTokens:inputCap,
      maxOutputTokens:outputCap,
      maxCostMicrousd:costCap,
      externalEffectAuthority:'NONE'
    },
    executionAuthority:'NONE',
    truthBoundary:'A_COGNITION_JOB_REQUESTS_ANALYSIS_ONLY__IT_DOES_NOT_AUTHORIZE_PROVIDER_SPEND_ABOVE_ITS_CAP_OR_ANY_EXTERNAL_EFFECT.'
  });
}

export function admitGenesisCognitionSupplier({supplier}={}){
  const reasons=[];
  const supplierId=text(supplier?.supplierId,120);
  const supplierClass=text(supplier?.supplierClass,40)?.toUpperCase();
  const provider=text(supplier?.provider,120);
  const model=text(supplier?.model,240);
  const capabilities=list(supplier?.capabilities,64,120)?.map(x=>x.toUpperCase());
  const measuredCost=integer(supplier?.maxObservedCostMicrousdPerJob??0,0,100000000);
  const callable=supplier?.callable===true;
  const evidenceRefs=list(supplier?.evidenceRefs,32,1000);
  if(!supplierId||!validSupplierId(supplierId)) reasons.push('valid-supplier-id-required');
  if(!['DETERMINISTIC','LOCAL','CHEAP_CLOUD','FRONTIER'].includes(supplierClass)) reasons.push('known-supplier-class-required');
  if(!provider||!model) reasons.push('provider-and-model-required');
  if(!capabilities?.length) reasons.push('capabilities-required');
  if(measuredCost===null) reasons.push('bounded-cost-required');
  if(callable&&!evidenceRefs?.length) reasons.push('callability-evidence-required');
  if(reasons.length) return envelope({ok:false,status:'GENESIS_COGNITION_SUPPLIER_BLOCKED',reasonCodes:[...new Set(reasons)]});
  return envelope({ok:true,status:callable?'GENESIS_COGNITION_SUPPLIER_CALLABLE':'GENESIS_COGNITION_SUPPLIER_UNPROVEN',supplier:{supplierId,supplierClass,provider,model,capabilities,maxObservedCostMicrousdPerJob:measuredCost,callable,evidenceRefs:evidenceRefs||[]}});
}

export function selectGenesisCognitionSupplier({job,suppliers=[]}={}){
  if(!job?.ok||job.status!=='GENESIS_COGNITION_JOB_READY') return envelope({ok:false,status:'GENESIS_COGNITION_ROUTE_BLOCKED',reasonCodes:['valid-job-required']});
  const admitted=suppliers.map(s=>admitGenesisCognitionSupplier({supplier:s})).filter(r=>r.ok&&r.supplier.callable).map(r=>r.supplier);
  const allowed=new Set(job.requirements.allowedSupplierClasses);
  const required=new Set(job.requirements.requiredCapabilities);
  const eligible=admitted.filter(s=>allowed.has(s.supplierClass)
    && s.maxObservedCostMicrousdPerJob<=job.requirements.maxCostMicrousd
    && [...required].every(c=>s.capabilities.includes(c)));
  const order={DETERMINISTIC:0,LOCAL:1,CHEAP_CLOUD:2,FRONTIER:3};
  eligible.sort((a,b)=>order[a.supplierClass]-order[b.supplierClass]
    || a.maxObservedCostMicrousdPerJob-b.maxObservedCostMicrousdPerJob
    || a.supplierId.localeCompare(b.supplierId));
  if(!eligible.length) return envelope({ok:false,status:'GENESIS_COGNITION_NO_ELIGIBLE_SUPPLIER',reasonCodes:['no-callable-supplier-within-authorized-cost-and-capability-envelope']});
  return envelope({ok:true,status:'GENESIS_COGNITION_SUPPLIER_SELECTED',selected:eligible[0],alternates:eligible.slice(1),law:'SELECT_CHEAPEST_SUFFICIENT_PROVEN_LAYER_WITHIN_EXPLICIT_COST_AND_CAPABILITY_BOUNDS.'});
}

export function validateGenesisCognitionReceipt({job,receipt}={}){
  const reasons=[];
  if(!job?.ok||job.status!=='GENESIS_COGNITION_JOB_READY') reasons.push('valid-job-required');
  const supplierId=text(receipt?.supplierId,120);
  const provider=text(receipt?.provider,120);
  const model=text(receipt?.model,240);
  const inputTokens=integer(receipt?.inputTokens,0,200000);
  const outputTokens=integer(receipt?.outputTokens,0,32000);
  const costMicrousd=integer(receipt?.costMicrousd,0,100000000);
  const latencyMs=integer(receipt?.latencyMs,0,3600000);
  const result=receipt?.result;
  if(!supplierId||!validSupplierId(supplierId)||!provider||!model) reasons.push('supplier-provider-model-provenance-required');
  if(inputTokens===null||outputTokens===null||costMicrousd===null||latencyMs===null) reasons.push('bounded-usage-receipt-required');
  if(job?.requirements){
    if(inputTokens>job.requirements.maxInputTokens) reasons.push('input-token-cap-exceeded');
    if(outputTokens>job.requirements.maxOutputTokens) reasons.push('output-token-cap-exceeded');
    if(costMicrousd>job.requirements.maxCostMicrousd) reasons.push('cost-cap-exceeded');
  }
  if(!result||typeof result!=='object'||Array.isArray(result)) reasons.push('structured-result-required');
  const thesis=text(result?.thesis,6000);
  const counterexamples=list(result?.strongestCounterexamples,16,2000);
  const refinement=text(result?.falsifierRefinement,6000);
  const experiment=result?.minimumExperiment;
  const sketch=result?.implementationSketch;
  const confidence=unit(result?.confidence);
  const unresolved=list(result?.unresolved,32,1000);
  if(!thesis||!counterexamples?.length||!refinement||confidence===null||!unresolved) reasons.push('complete-cognition-result-required');
  if(!experiment||typeof experiment!=='object'||Array.isArray(experiment)
    ||!text(experiment.objective,3000)||!list(experiment.procedure,32,1500)?.length
    ||!text(experiment.successCriterion,3000)||!text(experiment.failureCriterion,3000)) reasons.push('minimum-experiment-required');
  if(!sketch||typeof sketch!=='object'||Array.isArray(sketch)||sketch.internalOnly!==true
    ||!list(sketch.steps,32,1500)?.length||!list(sketch.dependencies,32,1000)||!list(sketch.risks,32,1000)) reasons.push('internal-implementation-sketch-required');
  if(reasons.length) return envelope({ok:false,status:'GENESIS_COGNITION_RECEIPT_REJECTED',reasonCodes:[...new Set(reasons)]});
  return envelope({
    ok:true,status:'GENESIS_COGNITION_RECEIPT_ACCEPTED',candidateId:job.candidateId,kind:job.kind,
    provenance:{supplierId,provider,model,inputTokens,outputTokens,costMicrousd,latencyMs},
    result:{thesis,strongestCounterexamples:counterexamples,falsifierRefinement:refinement,minimumExperiment:experiment,implementationSketch:sketch,confidence,unresolved},
    promotionAuthority:'NONE',
    truthBoundary:'MODEL_ANALYSIS_IS_RESEARCH_EVIDENCE_ONLY__ACCEPTANCE_OF_THIS_RECEIPT_DOES_NOT_PROVE_THE_CANDIDATE_OR_AUTHORIZE_IMPLEMENTATION_EXTERNAL_EFFECTS_OR_FURTHER_SPEND.'
  });
}
