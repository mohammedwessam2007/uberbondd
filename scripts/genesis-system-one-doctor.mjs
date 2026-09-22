#!/usr/bin/env node
import { compileGenesisSystemOneCritique } from '../src/genesis-system-one-critic.mjs';
const job={
 kind:'CANDIDATE_CRITIQUE',max_cost_microusd:0,
 prompt:{candidate:{
  candidateId:'genesis-candidate-doctor-system-one',title:'Doctor candidate',
  hypothesis:'A deterministic prefilter can cheaply falsify weak ideas.',mechanism:'Apply a fixed hostile critique contract.',
  falsifier:'The prefilter cannot identify meaningful failure modes.',nextProbe:'Run hostile fixtures.',
  moonshotAffinity:['founder-moonshot-0890'],substrateNeeds:['JEV_SYSTEM_ONE']
 }}
};
const r=compileGenesisSystemOneCritique({job});
console.log(JSON.stringify({ok:r.ok,status:r.status,provider:r.provider,model:r.model,costMicrousd:r.costMicrousd,counterexampleCount:r.result?.strongestCounterexamples?.length||0,promotionAuthority:r.promotionAuthority,truthBoundary:r.truthBoundary},null,2));
if(!r.ok) process.exitCode=1;
