import { compileMissionBrain } from './mission-brain-compiler.mjs';

const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const s = v => String(v ?? '').trim();
const uniq = values => [...new Set(values.filter(Boolean))];

export const FRONTIER_CAPABILITY_FUSION_VERSION = 'uberbond.frontier-capability-fusion.v1';

export const FRONTIER_MECHANISMS = Object.freeze([
  'DYNAMIC_REASONING_EFFORT',
  'PARALLEL_MULTI_AGENT',
  'PROGRAMMATIC_TOOL_LOOP',
  'PERSISTENT_CHECKPOINT_MEMORY',
  'CONTEXT_COMPACTION',
  'PROACTIVE_SELF_CHECK',
  'EXTERNAL_TEST_ORACLE',
  'NATIVE_COMPUTER_USE',
  'MULTIMODAL_WORLD_UNDERSTANDING',
  'FORMAL_PROOF_ESCALATION',
  'SOVEREIGN_OPEN_FALLBACK',
  'ALWAYS_ON_PROACTIVE_LOOP',
  'SUPPLIER_TOURNAMENT',
  'INDEPENDENT_VERIFIER_LINEAGE'
]);

export const PUBLIC_DONOR_MECHANISMS = Object.freeze({
  openai: Object.freeze(['DYNAMIC_REASONING_EFFORT','PARALLEL_MULTI_AGENT','PROGRAMMATIC_TOOL_LOOP','NATIVE_COMPUTER_USE','SUPPLIER_TOURNAMENT']),
  anthropic: Object.freeze(['PERSISTENT_CHECKPOINT_MEMORY','CONTEXT_COMPACTION','PROACTIVE_SELF_CHECK','EXTERNAL_TEST_ORACLE','PARALLEL_MULTI_AGENT']),
  google: Object.freeze(['NATIVE_COMPUTER_USE','MULTIMODAL_WORLD_UNDERSTANDING','ALWAYS_ON_PROACTIVE_LOOP','PROGRAMMATIC_TOOL_LOOP']),
  meta: Object.freeze(['MULTIMODAL_WORLD_UNDERSTANDING','PARALLEL_MULTI_AGENT','PROGRAMMATIC_TOOL_LOOP']),
  mistral: Object.freeze(['SOVEREIGN_OPEN_FALLBACK','FORMAL_PROOF_ESCALATION','MULTIMODAL_WORLD_UNDERSTANDING'])
});

export function chooseReasoningEffort({risk=0,uncertainty=0,irreversibility=0,novelty=0,costPressure=0}={}) {
  const pressure = Math.max(0,Math.min(1,(n(risk)+n(uncertainty)+n(irreversibility)+n(novelty))/4));
  const budgetDrag = Math.max(0,Math.min(1,n(costPressure)));
  const adjusted = pressure - budgetDrag * 0.2;
  if (adjusted >= 0.8) return 'max';
  if (adjusted >= 0.58) return 'high';
  if (adjusted >= 0.3) return 'medium';
  return 'low';
}

export function supplierEligibility(supplier={}) {
  const reasons=[];
  if(!s(supplier.id)) reasons.push('SUPPLIER_ID');
  if(!s(supplier.provider)) reasons.push('PROVIDER');
  if(!s(supplier.model)) reasons.push('MODEL_IDENTITY');
  if(supplier.callabilityProven!==true) reasons.push('CALLABILITY');
  if(!s(supplier.identityRevision)) reasons.push('REVISION');
  if(!s(supplier.pricingEvidenceRef)) reasons.push('PRICING_EVIDENCE');
  if(!s(supplier.capabilityEvidenceRef)) reasons.push('CAPABILITY_EVIDENCE');
  if(supplier.authorityEligible===false) reasons.push('AUTHORITY');
  if(!Array.isArray(supplier.capabilities)||supplier.capabilities.length===0) reasons.push('CAPABILITIES');
  return {eligible:reasons.length===0,reasons};
}

function supplierScore(supplier, required=[]) {
  const caps=new Set(supplier.capabilities||[]);
  const coverage=required.length===0?1:required.filter(x=>caps.has(x)).length/required.length;
  const reliability=Math.max(0,Math.min(1,n(supplier.reliability)));
  const latencyPenalty=Math.log1p(Math.max(0,n(supplier.latencyMs)))/20;
  const costPenalty=Math.log1p(Math.max(0,n(supplier.estimatedCostUsdPerTask)))*0.4;
  return coverage*5 + reliability*2 - latencyPenalty - costPenalty;
}

function pickSupplier(suppliers, required, excludedLineage=null) {
  const eligible=suppliers
    .filter(x=>supplierEligibility(x).eligible)
    .filter(x=>required.every(cap=>(x.capabilities||[]).includes(cap)))
    .filter(x=>!excludedLineage || s(x.lineage)!==excludedLineage)
    .sort((a,b)=>supplierScore(b,required)-supplierScore(a,required));
  return eligible[0]||null;
}

function lane(id,purpose,required,optional=false){return {id,purpose,requiredCapabilities:required,optional};}

export function compileFrontierSupplierPlan({mission,requirements={},suppliers=[],maxParallelLanes=6,inheritedAuthority='NONE'}={}) {
  if(!s(mission)) throw new Error('mission required');
  const effort=chooseReasoningEffort(requirements);
  const lanes=[
    lane('strategist','decompose mission, surface assumptions, choose route',['reasoning','planning']),
    lane('builder','produce the primary work product',['reasoning']),
    lane('verifier','independently falsify and verify the work',['reasoning','verification'])
  ];
  if(requirements.tools) lanes.push(lane('tool-operator','run bounded programmatic tool loops',['tool-use']));
  if(requirements.computerUse) lanes.push(lane('computer-operator','operate graphical/browser environments',['computer-use']));
  if(requirements.multimodal) lanes.push(lane('multimodal-observer','inspect non-text evidence',['multimodal']));
  if(requirements.formalProof) lanes.push(lane('proof-engine','formally verify suitable critical claims',['formal-proof']));
  if(requirements.longHorizon||requirements.persistentMemory) lanes.push(lane('memory-keeper','checkpoint and compact state',['memory','compaction']));

  const selected=[];
  const capped=lanes.slice(0,Math.max(3,Math.floor(n(maxParallelLanes)||6)));
  let primaryLineage=null;
  for(const spec of capped){
    const supplier=pickSupplier(suppliers,spec.requiredCapabilities,spec.id==='verifier'?primaryLineage:null);
    if(!supplier){
      selected.push({...spec,status:spec.optional?'SKIPPED_OPTIONAL':'BLOCKED_NO_PROVEN_SUPPLIER',supplier:null});
      continue;
    }
    if(spec.id==='builder'||spec.id==='strategist') primaryLineage=primaryLineage||s(supplier.lineage);
    selected.push({...spec,status:'READY',supplier:{id:supplier.id,provider:supplier.provider,model:supplier.model,identityRevision:supplier.identityRevision,lineage:supplier.lineage||null,score:supplierScore(supplier,spec.requiredCapabilities)}});
  }

  const openFallback=suppliers
    .filter(x=>supplierEligibility(x).eligible)
    .filter(x=>x.openOrSovereign===true)
    .sort((a,b)=>supplierScore(b,[])-supplierScore(a,[]))[0]||null;
  const mechanisms=['DYNAMIC_REASONING_EFFORT','PARALLEL_MULTI_AGENT','SUPPLIER_TOURNAMENT','PROACTIVE_SELF_CHECK','EXTERNAL_TEST_ORACLE','INDEPENDENT_VERIFIER_LINEAGE'];
  if(requirements.tools) mechanisms.push('PROGRAMMATIC_TOOL_LOOP');
  if(requirements.computerUse) mechanisms.push('NATIVE_COMPUTER_USE');
  if(requirements.multimodal) mechanisms.push('MULTIMODAL_WORLD_UNDERSTANDING');
  if(requirements.longHorizon||requirements.persistentMemory) mechanisms.push('PERSISTENT_CHECKPOINT_MEMORY','CONTEXT_COMPACTION');
  if(requirements.formalProof) mechanisms.push('FORMAL_PROOF_ESCALATION');
  if(requirements.proactive) mechanisms.push('ALWAYS_ON_PROACTIVE_LOOP');
  if(openFallback) mechanisms.push('SOVEREIGN_OPEN_FALLBACK');

  return {
    version:FRONTIER_CAPABILITY_FUSION_VERSION,
    mission,
    reasoningEffort:effort,
    mechanisms:uniq(mechanisms),
    lanes:selected,
    readyLanes:selected.filter(x=>x.status==='READY').length,
    blockedLanes:selected.filter(x=>x.status.startsWith('BLOCKED')).map(x=>x.id),
    sovereignFallback:openFallback?{id:openFallback.id,provider:openFallback.provider,model:openFallback.model,identityRevision:openFallback.identityRevision}:null,
    executionAuthority:inheritedAuthority,
    authorityLaw:'CAPABILITY_AND_ROUTING_NEVER_WIDEN_AUTHORITY',
    truthBoundary:'PUBLIC_FRONTIER_MECHANISMS_ARE_DONORS; ONLY_PROVEN_CALLABLE_SUPPLIERS_MAY_BE_ROUTED; PLAN_IS_NOT_EXECUTION'
  };
}

export function compileFrontierBrain({mission,capabilityCandidates=[],modelSuppliers=[],requirements={},maxCapabilities=16,maxRuntimeCostUsd=Infinity,maxParallelLanes=6,inheritedAuthority='NONE'}={}){
  const capabilityBrain=compileMissionBrain({mission,candidates:capabilityCandidates,maxCapabilities,maxRuntimeCostUsd});
  const frontierPlan=compileFrontierSupplierPlan({mission,requirements,suppliers:modelSuppliers,maxParallelLanes,inheritedAuthority});
  return {
    version:FRONTIER_CAPABILITY_FUSION_VERSION,
    mission,
    capabilityBrain,
    frontierPlan,
    executionGraph:['DECOMPOSE','PARALLEL_EXECUTE','CHECKPOINT_AND_COMPACT','SELF_CHECK','INDEPENDENT_VERIFY','RECONCILE','LEARN_SUPPLIER_OUTCOME'],
    law:'MINIMUM_SUFFICIENT_PROVEN_CAPABILITY_BUNDLE_PLUS_CHEAPEST_SUFFICIENT_PROVEN_COGNITIVE_SUPPLIERS'
  };
}
