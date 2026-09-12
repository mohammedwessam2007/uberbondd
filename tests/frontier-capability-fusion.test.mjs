import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseReasoningEffort,supplierEligibility,compileFrontierSupplierPlan,compileFrontierBrain,PUBLIC_DONOR_MECHANISMS} from '../src/frontier-capability-fusion.mjs';

const supplier=(id,caps,extra={})=>({id,provider:'test',model:`m-${id}`,identityRevision:`r-${id}`,callabilityProven:true,pricingEvidenceRef:`p-${id}`,capabilityEvidenceRef:`c-${id}`,authorityEligible:true,capabilities:caps,reliability:.9,latencyMs:100,estimatedCostUsdPerTask:.1,lineage:id,...extra});
const elite=(id,extra={})=>({mechanismId:id,provenanceDigest:`prov-${id}`,rightsState:'ALLOWED',securityState:'PASSED',benchmarkReceipt:`bench-${id}`,incrementalUtility:2,inputContract:['x'],outputContract:['y'],missionFit:1,runtimeCostUsd:0,...extra});

test('effort escalates with risk and uncertainty',()=>{
 assert.equal(chooseReasoningEffort({risk:1,uncertainty:1,irreversibility:1,novelty:1}),'max');
 assert.equal(chooseReasoningEffort({risk:0,uncertainty:0}),'low');
});

test('unproven supplier is rejected fail-closed',()=>{
 const x=supplier('x',['reasoning']); x.callabilityProven=false;
 assert.equal(supplierEligibility(x).eligible,false);
 assert.ok(supplierEligibility(x).reasons.includes('CALLABILITY'));
});

test('verifier uses independent lineage when available',()=>{
 const plan=compileFrontierSupplierPlan({mission:'build',suppliers:[supplier('a',['reasoning','planning','verification']),supplier('b',['reasoning','verification'])]});
 const strategist=plan.lanes.find(x=>x.id==='strategist');
 const verifier=plan.lanes.find(x=>x.id==='verifier');
 assert.equal(strategist.status,'READY');
 assert.equal(verifier.status,'READY');
 assert.notEqual(strategist.supplier.lineage,verifier.supplier.lineage);
});

test('computer use and formal proof lanes are opt-in and evidence-gated',()=>{
 const base=[supplier('a',['reasoning','planning']),supplier('b',['reasoning','verification']),supplier('c',['computer-use']),supplier('d',['formal-proof'])];
 const plan=compileFrontierSupplierPlan({mission:'critical build',requirements:{computerUse:true,formalProof:true},suppliers:base,maxParallelLanes:8});
 assert.equal(plan.lanes.find(x=>x.id==='computer-operator').status,'READY');
 assert.equal(plan.lanes.find(x=>x.id==='proof-engine').status,'READY');
});

test('long-horizon plan adds memory and compaction and sovereign fallback',()=>{
 const plan=compileFrontierSupplierPlan({mission:'multi-day research',requirements:{longHorizon:true,persistentMemory:true},suppliers:[supplier('a',['reasoning','planning']),supplier('b',['reasoning','verification']),supplier('m',['memory','compaction'],{openOrSovereign:true})],maxParallelLanes:8});
 assert.ok(plan.mechanisms.includes('PERSISTENT_CHECKPOINT_MEMORY'));
 assert.ok(plan.mechanisms.includes('CONTEXT_COMPACTION'));
 assert.ok(plan.mechanisms.includes('SOVEREIGN_OPEN_FALLBACK'));
 assert.equal(plan.sovereignFallback.id,'m');
});

test('routing cannot widen authority',()=>{
 const plan=compileFrontierSupplierPlan({mission:'act',inheritedAuthority:'NONE',suppliers:[supplier('a',['reasoning','planning','verification'])]});
 assert.equal(plan.executionAuthority,'NONE');
 assert.match(plan.authorityLaw,/NEVER_WIDEN/);
});

test('frontier brain composes elite capability bundle with supplier plan',()=>{
 const brain=compileFrontierBrain({mission:'research',capabilityCandidates:[elite('search'),elite('verify')],modelSuppliers:[supplier('a',['reasoning','planning']),supplier('b',['reasoning','verification'])]});
 assert.equal(brain.capabilityBrain.selectedCount,2);
 assert.ok(brain.frontierPlan.readyLanes>=3);
 assert.deepEqual(brain.executionGraph.at(-1),'LEARN_SUPPLIER_OUTCOME');
});

test('public donors are mechanism references, not trusted suppliers',()=>{
 assert.ok(PUBLIC_DONOR_MECHANISMS.openai.includes('PARALLEL_MULTI_AGENT'));
 assert.ok(PUBLIC_DONOR_MECHANISMS.mistral.includes('FORMAL_PROOF_ESCALATION'));
 const plan=compileFrontierSupplierPlan({mission:'x',suppliers:[]});
 assert.equal(plan.readyLanes,0);
 assert.ok(plan.blockedLanes.includes('strategist'));
});
