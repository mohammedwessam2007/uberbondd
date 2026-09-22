import test from 'node:test';
import assert from 'node:assert/strict';
import {
 compileGenesisCognitionJob,admitGenesisCognitionSupplier,selectGenesisCognitionSupplier,validateGenesisCognitionReceipt
} from '../src/genesis-cognition-exchange.mjs';

const candidate={
 id:'genesis-candidate-20260922-0001',title:'Capability Gap Closure Compiler',
 hypothesis:'A typed compiler can reduce expensive frontier calls.',mechanism:'Compile repeated decisions downward.',
 falsifier:'No quality-adjusted frontier displacement occurs.',nextProbe:'Run a held-out replay.',
 moonshotAffinity:['founder-moonshot-0460','founder-moonshot-0890'],substrateNeeds:['JEV_SYSTEM_ONE','LOCAL_COMPUTE']
};
const result={
 thesis:'The candidate is plausible only if the compiler preserves task acceptance.',
 strongestCounterexamples:['Hidden frontier calls can fake displacement.','Easy-task selection can inflate the metric.'],
 falsifierRefinement:'Use the same held-out task population and count hidden intervention.',
 minimumExperiment:{objective:'Measure displacement.',procedure:['Freeze task set.','Run baseline.','Run compiled route.'],successCriterion:'Lower frontier intensity without quality loss.',failureCriterion:'Any quality loss or hidden intervention increase.'},
 implementationSketch:{internalOnly:true,steps:['Compile typed route.','Replay held-out tasks.'],dependencies:['task receipts'],risks:['benchmark gaming']},
 confidence:.72,unresolved:['Real task distribution may differ.']
};

test('zero-spend default job admits only zero-cost suppliers',()=>{
 const job=compileGenesisCognitionJob({candidate});
 assert.equal(job.ok,true); assert.equal(job.requirements.maxCostMicrousd,0);
 const route=selectGenesisCognitionSupplier({job,suppliers:[
  {supplierId:'supplier:local-1',supplierClass:'LOCAL',provider:'ollama',model:'qwen',capabilities:['STRUCTURED_JSON'],maxObservedCostMicrousdPerJob:0,callable:true,evidenceRefs:['receipt:local']},
  {supplierId:'supplier:cloud-1',supplierClass:'CHEAP_CLOUD',provider:'cloud',model:'m',capabilities:['STRUCTURED_JSON'],maxObservedCostMicrousdPerJob:2,callable:true,evidenceRefs:['receipt:cloud']}
 ]});
 assert.equal(route.ok,true); assert.equal(route.selected.supplierId,'supplier:local-1');
});

test('unproven supplier cannot receive work',()=>{
 const job=compileGenesisCognitionJob({candidate});
 const route=selectGenesisCognitionSupplier({job,suppliers:[
  {supplierId:'supplier:local-1',supplierClass:'LOCAL',provider:'ollama',model:'qwen',capabilities:['STRUCTURED_JSON'],maxObservedCostMicrousdPerJob:0,callable:false,evidenceRefs:[]}
 ]});
 assert.equal(route.ok,false); assert.equal(route.status,'GENESIS_COGNITION_NO_ELIGIBLE_SUPPLIER');
});

test('supplier marked callable without evidence is refused',()=>{
 const r=admitGenesisCognitionSupplier({supplier:{supplierId:'supplier:x',supplierClass:'FRONTIER',provider:'openai',model:'x',capabilities:['STRUCTURED_JSON'],maxObservedCostMicrousdPerJob:1,callable:true,evidenceRefs:[]}});
 assert.equal(r.ok,false); assert.ok(r.reasonCodes.includes('callability-evidence-required'));
});

test('receipt cannot exceed job spend cap',()=>{
 const job=compileGenesisCognitionJob({candidate,maxCostMicrousd:0});
 const r=validateGenesisCognitionReceipt({job,receipt:{supplierId:'supplier:cloud',provider:'cloud',model:'m',inputTokens:1000,outputTokens:500,costMicrousd:1,latencyMs:20,result}});
 assert.equal(r.ok,false); assert.ok(r.reasonCodes.includes('cost-cap-exceeded'));
});

test('well-formed zero-cost local receipt is accepted as research evidence only',()=>{
 const job=compileGenesisCognitionJob({candidate});
 const r=validateGenesisCognitionReceipt({job,receipt:{supplierId:'supplier:local',provider:'ollama',model:'qwen',inputTokens:1000,outputTokens:500,costMicrousd:0,latencyMs:2000,result}});
 assert.equal(r.ok,true); assert.equal(r.promotionAuthority,'NONE'); assert.match(r.truthBoundary,/RESEARCH_EVIDENCE_ONLY/);
});

test('free job cannot silently use frontier class when class is not authorized',()=>{
 const job=compileGenesisCognitionJob({candidate});
 const route=selectGenesisCognitionSupplier({job,suppliers:[
  {supplierId:'supplier:frontier',supplierClass:'FRONTIER',provider:'openai',model:'gpt',capabilities:['STRUCTURED_JSON'],maxObservedCostMicrousdPerJob:0,callable:true,evidenceRefs:['receipt:test']}
 ]});
 assert.equal(route.ok,false);
});
