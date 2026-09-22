import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdeationActivationPlan } from '../src/million-branch-ideation-genome.mjs';
import { compileGenesisBurstRegistry } from '../src/genesis-burst-registry.mjs';

function payload(signalId,summary,domains,candidateId){
  const activation=buildIdeationActivationPlan({context:summary,affectedDomains:domains,maxGenerators:12,candidateBudgetPerGenerator:50,seed:signalId});
  return {
    signal:{id:signalId,summary,evidenceRefs:[`evidence:${signalId}`]},
    affectedDomains:domains,
    activationPolicy:{maxGenerators:12,candidateBudgetPerGenerator:50},
    activatedGeneratorKeys:activation.selectedGenerators.map(x=>x.key),
    materializedCandidateCount:1,
    candidates:[{
      id:candidateId,title:'Candidate',hypothesis:'A testable hypothesis.',mechanism:'A bounded mechanism.',falsifier:'A falsifier.',nextProbe:'A probe.',
      generatorKey:activation.selectedGenerators[0].key,
      moonshotAffinity:['founder-moonshot-0890'],
      substrateNeeds:['JEV_SYSTEM_ONE'],
      novelty:.8,leverage:.8,testability:.9,reversibility:.95
    }]
  };
}

test('registry validates multiple independent evidence-bound bursts and accumulates capacity',()=>{
  const one=payload('signal-one','Signal one changed software agents.',['Software Agents & Intelligence'],'genesis-candidate-one-0001');
  const two=payload('signal-two','Signal two changed energy substrates.',['Substrates Energy & Environment'],'genesis-candidate-two-0001');
  const r=compileGenesisBurstRegistry({bursts:[
    {burstId:'genesis-burst-one',artifactRef:'artifact:one',payload:one},
    {burstId:'genesis-burst-two',artifactRef:'artifact:two',payload:two}
  ]});
  assert.equal(r.ok,true);
  assert.equal(r.burstCount,2);
  assert.equal(r.totalMaterializedCandidates,2);
  assert.equal(r.totalSelectedFirstGenerationCapacity,1200);
  assert.equal(r.externalEffectAuthority,'NONE');
});

test('registry rejects candidate identity collisions across bursts',()=>{
  const one=payload('signal-one','Signal one changed software agents.',['Software Agents & Intelligence'],'genesis-candidate-shared-0001');
  const two=payload('signal-two','Signal two changed energy substrates.',['Substrates Energy & Environment'],'genesis-candidate-shared-0001');
  const r=compileGenesisBurstRegistry({bursts:[
    {burstId:'genesis-burst-one',artifactRef:'artifact:one',payload:one},
    {burstId:'genesis-burst-two',artifactRef:'artifact:two',payload:two}
  ]});
  assert.equal(r.ok,false);
  assert.ok(r.reasonCodes.includes('candidate-id-collision-across-bursts'));
});

test('registry rejects falsified declared generator lineage',()=>{
  const one=payload('signal-one','Signal one changed software agents.',['Software Agents & Intelligence'],'genesis-candidate-one-0001');
  one.activatedGeneratorKeys=['fake::generator'];
  const r=compileGenesisBurstRegistry({bursts:[{burstId:'genesis-burst-one',artifactRef:'artifact:one',payload:one}]});
  assert.equal(r.ok,false);
  assert.ok(r.reasonCodes.includes('declared-generator-lineage-mismatch'));
});
