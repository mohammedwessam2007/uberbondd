import { compileJevSharedStateTensor } from '../src/jev-shared-state-tensor.mjs';

export const JEV_TENSOR_DOCTOR_SCHEMA='uberbond.jev-tensor-startup-doctor.v1';

export function runJevTensorStartupDoctor(){
  const digest='a'.repeat(64);
  const scope={tenantId:'synthetic',credentialScopeId:'no-real-key',
    dataClass:'PUBLIC',qualityContractHash:digest,sourceDigest:digest,
    freshnessClass:'IMMUTABLE',sideEffectClass:'NONE'};
  const requests=Array.from({length:200},(_,i)=>({
    requestId:'synthetic-'+i,
    state:{kind:'synthetic-shared-state',source:'fixture-only'},
    scope,questions:{check:{type:'noul',instructions:'Does this synthetic statement satisfy the fixed test rubric?'}}
  }));
  const compiled=compileJevSharedStateTensor({batchId:'startup-doctor-synthetic',requests});
  const ok=compiled.ok===true&&compiled.groupCount===1&&
    compiled.originalQuestionCount===200&&compiled.uniqueQuestionCount===1&&
    compiled.exactQuestionDedupCount===199&&
    compiled.groups[0].mapping.length===200&&
    compiled.groups[0].scope.dataClass==='PUBLIC'&&
    compiled.spendAuthorized===false&&compiled.providerCallsPerformed===0&&
    compiled.crownSuppressionAuthority==='NONE';
  return {schemaVersion:JEV_TENSOR_DOCTOR_SCHEMA,ok,
    status:ok?'JEV_TENSOR_SYNTHETIC_COMPILER_READY':'JEV_TENSOR_COMPILER_PROOF_INCOMPLETE',
    checkedSyntheticConsumers:200,compiledUniqueQuestions:compiled.uniqueQuestionCount??null,
    compiledGroups:compiled.groupCount??null,
    providerInferenceCallsPerformed:0,actualCostUsd:0,externalEffectAuthority:'NONE',
    generalFrontierEquivalenceProven:false,
    observedReferenceSavingsUsd:null,
    truthBoundary:'Only synthetic, deterministic 200-to-1 exact-question compilation; no Jev inference, end-to-end quality, provider callability, observed baseline, or real economic savings are proven.'};
}
