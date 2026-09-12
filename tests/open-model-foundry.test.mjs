import test from 'node:test';
import assert from 'node:assert/strict';
import { rankModelCandidates, planModelTournament } from '../src/open-model-foundry.mjs';

const supply=(overrides={})=>({id:'local-a',provider:'local',model:'model-a',revision:'rev-1',supplyType:'LOCAL_RUNTIME',state:'APPROVED',license:'APACHE-2.0',weightsAvailable:true,taskClasses:['text-generation'],modalities:['TEXT'],toolCapabilities:[],contextTokens:8192,benchmarkScore:0.9,benchmarkObservedAt:'2026-09-10T00:00:00Z',reliabilityScore:0.95,inputCostPerMillionUsd:0,outputCostPerMillionUsd:0,infrastructureCostPerHourUsd:0,minimumVramGb:8,runtimeCostKnown:true,permissionEligible:true,evidenceRefs:['bench:test'],...overrides});

test('Open Model Foundry refuses stale benchmark evidence during model selection',()=>{
  const out=rankModelCandidates({candidates:[supply({benchmarkObservedAt:'2025-01-01T00:00:00Z'})],taskClass:'text-generation',now:'2026-09-11T00:00:00Z',benchmarkMaxAgeDays:30});
  assert.equal(out.ok,true);assert.equal(out.selected,null);assert.ok(out.rejected[0].reasonCodes.includes('benchmark-stale-or-future'));
});

test('Open Model Foundry ranks current permission-eligible model evidence without execution authority',()=>{
  const out=rankModelCandidates({candidates:[supply()],taskClass:'text-generation',now:'2026-09-11T00:00:00Z'});assert.equal(out.ok,true);assert.equal(out.selected.id,'local-a');assert.equal(out.executionAuthority,'NONE');
});

test('Open Model Foundry recovery tournament measures recovery success but never self-promotes',()=>{
  const out=planModelTournament({baseline:supply(),candidates:[supply({id:'local-b',model:'model-b',revision:'rev-2'})],taskClass:'text-generation',holdoutId:'holdout-1'});
  assert.equal(out.ok,true);assert.ok(out.tournament.measures.includes('recovery-success'));assert.equal(out.promotionAuthority,'NONE');
});
