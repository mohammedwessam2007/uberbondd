import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBER_SOVEREIGN_STACK_VERSION='uberbond.uber-sovereign-stack.v1.1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);

/**
 * Canonical first-party surfaces. An Uber* name means UberBond owns the policy,
 * contract and truth boundary. It does not mean UberBond manufactured every CPU,
 * network, model or payment rail beneath that surface.
 */
export const UBER_SOVEREIGN_LAYERS=Object.freeze([
  {id:'UBERMESH',role:'provider-independent private networking',kind:'SOVEREIGN_CORE',stateful:false,runtimeProof:true,sourceRefs:['ops/sovereign/configure-founder-console-ubermesh.sh','tests/sovereign-ubermesh.test.mjs']},
  {id:'UBERCLOUD',role:'portable multi-cell compute/runtime/storage control plane',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/ubercloud-sovereign-fabric.mjs','tests/ubercloud-sovereign-fabric.test.mjs']},
  {id:'UBERCEL',role:'first-party signed deployment build release rollback and host-failover control plane',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/ubercel-deployment-control-plane.mjs','ops/sovereign/sovereign-release-courier.mjs','src/provider-neutral-runtime-acceptance.mjs']},
  {id:'UBERGRAPH',role:'provenance-bound semantic relational causal reality graph',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:false,sourceRefs:['src/knowledge-labyrinth-ubergraph.mjs','src/life-knowledge-graph.mjs']},
  {id:'UBERMIND',role:'minimum-useful mission cognition exchange',kind:'SOVEREIGN_CORE',stateful:false,runtimeProof:true,sourceRefs:['src/ubermind-cognitive-exchange.mjs','src/frontier-cognitive-fabric.mjs']},
  {id:'UBERDNA',role:'machine-readable software genotype and mutation evidence',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:false,sourceRefs:['src/uberdna-software-genome.mjs','src/uberbond-feature-genome.mjs']},
  {id:'UBERMEMORY',role:'lifetime context virtualization with evidence boundaries',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/lifetime-context-memory.mjs','src/frontier-context-spine.mjs']},
  {id:'UBERVAULT',role:'founder-private records and deletion closure',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/personal-civilization-core.mjs']},
  {id:'UBERRUNTIME',role:'owned resident execution and signed-release continuity',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['scripts/sovereign-founder-console-server.mjs','ops/sovereign/bootstrap-founder-node.sh']},
  {id:'UBERCONTROL',role:'founder-owned authority and control surface',kind:'SOVEREIGN_CORE',stateful:false,runtimeProof:true,sourceRefs:['api/sovereign-control.mjs','scripts/sovereign-founder-console-server.mjs']},
  {id:'UBERAGENTS',role:'bounded agent orchestration and autonomy',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/agent-autonomy-loop.mjs','src/avengers-execution-guard.mjs']},
  {id:'UBERMODELS',role:'replaceable model supply and reasoning topology',kind:'SUPPLIER_ABSTRACTION',stateful:false,runtimeProof:true,sourceRefs:['src/frontier-cognitive-fabric.mjs','src/agent-model-router.mjs']},
  {id:'UBERRESEARCH',role:'world sensing unknown-unknown search and frontier assimilation',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/perpetual-frontier-genesis.mjs']},
  {id:'UBERECONOMY',role:'founder-minute-aware resource and intervention metabolism',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:false,sourceRefs:['src/economic-metabolism.mjs','src/economic-feedback-allocator.mjs']},
  {id:'UBERPAY',role:'provider-neutral payment truth and reconciliation',kind:'SUPPLIER_ABSTRACTION',stateful:true,runtimeProof:true,sourceRefs:['src/payments.mjs','src/payment-renewal-truth.mjs']},
  {id:'UBERMAIL',role:'governed messaging and deliverability abstraction',kind:'SUPPLIER_ABSTRACTION',stateful:true,runtimeProof:true,sourceRefs:['src/pipeline.mjs','src/deliverability-guard.mjs']},
  {id:'UBERDELIVERY',role:'acceptance-bound fulfillment and evidence delivery',kind:'SOVEREIGN_CORE',stateful:true,runtimeProof:true,sourceRefs:['src/service-fulfillment.mjs']}
]);

const cleanEvidence=(raw={})=>({sourceVerified:raw.sourceVerified===true,testsPassed:raw.testsPassed===true,controlOwned:raw.controlOwned===true,providerReplaceable:raw.providerReplaceable===true,stateExportable:raw.stateExportable===true,authorityRoot:String(raw.authorityRoot||'').trim().toUpperCase(),runtimeObserved:raw.runtimeObserved===true,evidenceRefs:[...new Set((Array.isArray(raw.evidenceRefs)?raw.evidenceRefs:[]).map(v=>String(v||'').trim()).filter(Boolean))]});

/** Truthfully separates source sovereignty, architecture independence and runtime proof. */
export function compileUberSovereignStack({layerEvidence={}}={}){
  const rows=UBER_SOVEREIGN_LAYERS.map(layer=>{
    const evidence=cleanEvidence(layerEvidence[layer.id]);
    const sourceReady=evidence.sourceVerified&&evidence.testsPassed&&evidence.evidenceRefs.length>0;
    const independenceReady=sourceReady&&evidence.controlOwned&&evidence.providerReplaceable&&evidence.authorityRoot==='UBERBOND'&&(!layer.stateful||evidence.stateExportable);
    const runtimeReady=independenceReady&&(!layer.runtimeProof||evidence.runtimeObserved);
    const reasonCodes=[];
    if(!evidence.sourceVerified)reasonCodes.push('source-verification-required');
    if(!evidence.testsPassed)reasonCodes.push('test-evidence-required');
    if(!evidence.evidenceRefs.length)reasonCodes.push('evidence-ref-required');
    if(!evidence.controlOwned)reasonCodes.push('owner-control-required');
    if(!evidence.providerReplaceable)reasonCodes.push('provider-replaceability-required');
    if(evidence.authorityRoot!=='UBERBOND')reasonCodes.push('uberbond-authority-root-required');
    if(layer.stateful&&!evidence.stateExportable)reasonCodes.push('state-exportability-required');
    if(layer.runtimeProof&&!evidence.runtimeObserved)reasonCodes.push('runtime-observation-required');
    return {...layer,evidence,sourceReady,independenceReady,runtimeReady,reasonCodes};
  });
  const sourceBlockers=rows.filter(row=>!row.sourceReady).map(row=>row.id);
  const independenceBlockers=rows.filter(row=>!row.independenceReady).map(row=>row.id);
  const runtimeBlockers=rows.filter(row=>!row.runtimeReady).map(row=>row.id);
  const sourceReady=sourceBlockers.length===0,independenceReady=independenceBlockers.length===0,runtimeReady=runtimeBlockers.length===0;
  const status=runtimeReady?'UBER_SOVEREIGN_STACK_RUNTIME_READY':independenceReady?'UBER_SOVEREIGN_STACK_INDEPENDENCE_READY':sourceReady?'UBER_SOVEREIGN_STACK_SOURCE_READY':'UBER_SOVEREIGN_STACK_INCOMPLETE';
  return {ok:sourceReady,status,layers:rows,counts:{total:rows.length,sourceReady:rows.filter(r=>r.sourceReady).length,independenceReady:rows.filter(r=>r.independenceReady).length,runtimeReady:rows.filter(r=>r.runtimeReady).length},sourceBlockers,independenceBlockers,runtimeBlockers,sovereigntyLaw:'UBERBOND_OWNS_IDENTITY_AUTHORITY_POLICY_MEMORY_EXPORT_AND_RECOVERY; EXTERNAL_PROVIDERS_ARE_REPLACEABLE_SUPPLIERS_AND_NEVER_AUTHORITY_ROOTS',namingLaw:'UBER_PREFIX_DENOTES_A_FIRST_PARTY_CONTROL_OR_TRUTH_SURFACE_NOT_A_CLAIM_THAT_UBERBOND_PHYSICALLY_MANUFACTURES_EVERY_UNDERLYING_RESOURCE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero()};
}
