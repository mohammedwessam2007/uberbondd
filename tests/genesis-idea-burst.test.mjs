import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGenesisIdeaBurst } from '../src/genesis-idea-burst.mjs';
import { buildIdeationActivationPlan } from '../src/million-branch-ideation-genome.mjs';

const signal={
  id:'mimo-v2.6-2026-09-22',
  summary:'Xiaomi released MiMo V2.6 Pro and Flash with tool use, long context and open RL task environments.',
  evidenceRefs:['https://mimo.mi.com/docs/en-US/news/latest/v2-6']
};
const affectedDomains=['Cognition & Reasoning','Software Agents & Intelligence','Science & Discovery'];
const activation=buildIdeationActivationPlan({context:signal.summary,affectedDomains,maxGenerators:12,candidateBudgetPerGenerator:50,seed:signal.id});
const selectedKey=activation.selectedGenerators[0].key;

function candidate(generatorKey,id='genesis-candidate-test-0001'){
  return {
    id,title:'Test candidate',
    hypothesis:'A new routing primitive could reduce expensive frontier calls.',
    mechanism:'Compile repeated model decisions into a typed cheap execution path.',
    falsifier:'No reduction in frontier calls or accepted-task cost across a held-out task set.',
    nextProbe:'Run a shadow benchmark against the existing router.',
    generatorKey,
    moonshotAffinity:['founder-moonshot-0226','founder-moonshot-0890'],
    substrateNeeds:['JEV','LOCAL_COMPUTE','FRONTIER_REVIEW'],
    novelty:.7,leverage:.8,testability:.9,reversibility:.95
  };
}

test('compiles an evidence-bound burst from one of the exact selected generators',()=>{
  const probe=compileGenesisIdeaBurst({signal,affectedDomains,candidates:[candidate(selectedKey)]});
  assert.equal(probe.ok,true);
  assert.equal(probe.status,'GENESIS_IDEA_BURST_READY');
  assert.equal(probe.materializedCandidateCount,1);
  assert.equal(probe.activation.selectedGeneratorCount,12);
  assert.equal(probe.activation.selectedFirstGenerationCapacity,600);
  assert.equal(probe.externalEffectAuthority,'NONE');
});

test('refuses a candidate that is not descended from an activated generator',()=>{
  const notSelected='wealth-business-capital::1000x-scaling';
  assert.equal(activation.selectedGenerators.some(g=>g.key===notSelected),false);
  const r=compileGenesisIdeaBurst({signal,affectedDomains,candidates:[candidate(notSelected)]});
  assert.equal(r.ok,false);
  assert.ok(r.reasonCodes.includes('candidate-must-bind-selected-generator'));
});

test('refuses signal-free imagination masquerading as evidence-bound generation',()=>{
  const r=compileGenesisIdeaBurst({signal:{id:'x',summary:'x',evidenceRefs:[]},affectedDomains,candidates:[candidate(selectedKey)]});
  assert.equal(r.ok,false);
  assert.ok(r.reasonCodes.includes('signal-evidence-required'));
});

test('cannot turn ideas into execution authority',()=>{
  const r=compileGenesisIdeaBurst({signal,affectedDomains,candidates:[candidate(selectedKey)]});
  assert.equal(r.ok,true);
  assert.equal(r.candidates[0].executionAuthority,'NONE');
  assert.equal(r.externalEffectLedger.providerCalls,0);
  assert.match(r.truthBoundary,/HYPOTHESES/);
});
