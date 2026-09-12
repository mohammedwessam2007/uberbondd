import test from 'node:test';
import assert from 'node:assert/strict';
import {BILLION_CAPABILITY_OBJECT_TARGET,GITHUB_REPOSITORY_DISCOVERY_HORIZON,buildBillionCapabilityUniversePlan,summarizeHarvestProgress} from '../src/billion-capability-universe.mjs';

test('billion capability universe targets one billion measured capability objects',()=>{
 const plan=buildBillionCapabilityUniversePlan();
 assert.equal(plan.objectTarget,1_000_000_000);
 assert.equal(plan.repositoryHorizon,1_000_000);
 assert.ok(plan.objectClassCount>=20);
 assert.match(plan.compressionLaw,/1B_CAPABILITY_OBJECTS/);
});

test('logical target cannot masquerade as measured completion',()=>{
 const progress=summarizeHarvestProgress({measuredObjects:999_999_999,measuredRepositories:1_000_000});
 assert.equal(progress.objectTargetSatisfied,false);
 assert.equal(progress.status,'BILLION_CAPABILITY_UNIVERSE_HARVESTING');
 assert.equal(BILLION_CAPABILITY_OBJECT_TARGET,1_000_000_000);
 assert.equal(GITHUB_REPOSITORY_DISCOVERY_HORIZON,1_000_000);
});

test('completion requires measured billion-scale receipts',()=>{
 const progress=summarizeHarvestProgress({measuredObjects:1_000_000_000,measuredRepositories:1_000_000});
 assert.equal(progress.objectTargetSatisfied,true);
 assert.equal(progress.repositoryHorizonSatisfied,true);
 assert.equal(progress.status,'BILLION_CAPABILITY_UNIVERSE_MEASURED');
});
