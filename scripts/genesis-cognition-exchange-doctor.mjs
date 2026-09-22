#!/usr/bin/env node
import {
  compileGenesisCognitionJob,
  selectGenesisCognitionSupplier,
  validateGenesisCognitionReceipt
} from '../src/genesis-cognition-exchange.mjs';

const candidate={
  id:'genesis-candidate-doctor-0001',
  title:'Doctor candidate',
  hypothesis:'A bounded cognition exchange can route research analysis without granting authority.',
  mechanism:'Typed jobs admit only proven suppliers inside explicit class, capability and cost bounds.',
  falsifier:'An unproven or over-budget supplier can receive work or a receipt can self-promote.',
  nextProbe:'Run the hostile contract suite.',
  moonshotAffinity:['founder-moonshot-0890'],
  substrateNeeds:['JEV_SYSTEM_ONE']
};
const job=compileGenesisCognitionJob({candidate});
const supplier={
  supplierId:'supplier:doctor-local',supplierClass:'LOCAL',provider:'fixture',model:'fixture-model',
  capabilities:['STRUCTURED_JSON'],maxObservedCostMicrousdPerJob:0,callable:true,evidenceRefs:['doctor:callability']
};
const route=selectGenesisCognitionSupplier({job,suppliers:[supplier]});
const receipt=validateGenesisCognitionReceipt({
  job,
  receipt:{
    supplierId:supplier.supplierId,provider:supplier.provider,model:supplier.model,
    inputTokens:100,outputTokens:100,costMicrousd:0,latencyMs:1,
    result:{
      thesis:'The contract is internally testable.',
      strongestCounterexamples:['A forged supplier receipt.'],
      falsifierRefinement:'Reject unproven, over-budget or malformed suppliers and receipts.',
      minimumExperiment:{objective:'Exercise contract gates.',procedure:['Run tests.'],successCriterion:'All hostile gates pass.',failureCriterion:'Any hostile input is admitted.'},
      implementationSketch:{internalOnly:true,steps:['Compile job.','Route supplier.','Validate receipt.'],dependencies:[],risks:['Fixture is not runtime proof.']},
      confidence:.9,unresolved:[]
    }
  }
});
const ok=job.ok&&route.ok&&receipt.ok&&receipt.promotionAuthority==='NONE';
console.log(JSON.stringify({
  ok,
  status:ok?'GENESIS_COGNITION_EXCHANGE_HEALTHY':'GENESIS_COGNITION_EXCHANGE_INVALID',
  zeroSpendDefault:job?.requirements?.maxCostMicrousd===0,
  selectedSupplier:route?.selected?.supplierId||null,
  receiptStatus:receipt?.status||null,
  promotionAuthority:receipt?.promotionAuthority||null,
  truthBoundary:receipt?.truthBoundary||job?.truthBoundary||null
},null,2));
if(!ok) process.exitCode=1;
