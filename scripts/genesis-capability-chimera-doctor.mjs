#!/usr/bin/env node
import { searchCapabilityChimeras, evaluateCapabilityChimeraTournament } from '../src/capability-chimera-compiler.mjs';

const cap=(id,atoms)=>({
  id,capabilityAtoms:atoms.map(x=>({id:x})),dependencies:[],knownConflicts:[],compatibilityEdges:[],
  contextCost:{tokens:0},monetaryCost:{cents:0},permissions:[],sideEffects:['NONE']
});
const eligible=(capability,score)=>({capability,score,admission:{ok:true,decision:'ELIGIBLE'}});
const retrieval={ok:true,status:'PROGRESSIVE_RETRIEVAL_COMPLETE',results:[
  eligible(cap('doctor.ab',['a','b']),1),
  eligible(cap('doctor.a',['a']),.8),
  eligible(cap('doctor.b',['b']),.8)
]};
const search=searchCapabilityChimeras({requiredAtomIds:['a','b'],retrieval,maxCandidates:4});
const metrics={taskSuccess:.8,quality:.8,reliability:.8,latencyMs:1000,tokenCost:100,monetaryCostCents:5,founderInterventions:1};
const tournament=search.ok?evaluateCapabilityChimeraTournament({
  composition:search.primary,taskClass:'doctor',modelId:'doctor-model',holdoutId:'doctor-private',
  incumbent:metrics,chimera:{...metrics,taskSuccess:.9,quality:.9,reliability:.9,monetaryCostCents:4},
  leakChecks:[{passed:true}],securityPassed:true,benchmarkObservedAt:'2026-09-22T20:00:00.000Z',now:new Date('2026-09-22T21:00:00.000Z')
}):null;
const ok=search.ok&&search.candidateCount>=2&&tournament?.status==='CAPABILITY_CHIMERA_SUPPORTED'&&tournament?.promotionAuthority==='NONE';
console.log(JSON.stringify({
  ok,status:ok?'CAPABILITY_CHIMERA_DOCTOR_HEALTHY':'CAPABILITY_CHIMERA_DOCTOR_INVALID',
  candidateCount:search.candidateCount||0,
  primarySelectedIds:search.primary?.selectedIds||[],
  tournamentStatus:tournament?.status||null,
  promotionAuthority:tournament?.promotionAuthority||'NONE',
  truthBoundary:tournament?.truthBoundary||search.truthBoundary||null
},null,2));
if(!ok) process.exitCode=1;
