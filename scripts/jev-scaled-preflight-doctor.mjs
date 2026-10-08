import { compileScaledJevPreflight } from '../src/jev-scaled-preflight.mjs';
export function runJevScaledPreflightDoctor(){
 const hash='a'.repeat(64);
 const scope={tenantId:'synthetic',credentialScopeId:'no-real-key',
  dataClass:'PUBLIC',qualityContractHash:hash,sourceDigest:hash,
  freshnessClass:'IMMUTABLE',sideEffectClass:'NONE'};
 const shared={scope,state:{kind:'static-public-fixture',source:'synthetic-only'},
  questions:{decision:{type:'noul',instructions:'Is the synthetic statement novel?'}}};
 const requests=Array.from({length:512},(_,i)=>({...shared,requestId:'consumer-'+i}));
 const p=compileScaledJevPreflight({batchId:'startup-scale-doctor',requests});
 const pass=p.ok===true&&p.originalRequestCount===512&&
  p.originalQuestionCount===512&&p.uniqueQuestionCount===1&&
  p.exactRedundanciesEliminated===511&&p.requiredGovernedShardCount===1&&
  p.providerCallsPerformed===0&&p.paidSpendAuthorized===false;
 return {schemaVersion:'uberbond.jev-scaled-preflight-doctor.v1',ok:pass,
  status:pass?'JEV_SCALED_EXACT_PREFLIGHT_READY':'JEV_SCALED_EXACT_PREFLIGHT_UNVERIFIED',
  syntheticOriginalConsumers:512,compiledUniqueQuestions:p.uniqueQuestionCount??null,
  compiledBoundedPlans:p.requiredGovernedShardCount??null,
  maximumSupportedOriginalRequests:16384,
  providerCallsPerformed:0,actualSpendUsd:0,
  realWorkloadMultiplier:null,global33333xVerified:false,
  semanticAuthority:'NONE',crownSuppressionAuthority:'NONE',
  truthBoundary:'Only deterministic preflight and authorization-preserving identity fanout of identical PUBLIC fixture questions. No external provider calls, revenue, new independent quality samples, or measured economic multiplier.'};
}
