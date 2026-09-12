import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalMechanismIdentity,sameMechanism} from '../src/capability-mechanism-identity.mjs';
import {scoreSource,rankSources,discoverSourceCandidatesFromLinks} from '../src/source-genesis.mjs';
import {buildEliteReserve,ELITE_CAPABILITY_RESERVE_TARGET} from '../src/elite-capability-reserve.mjs';
import {buildCapabilitySourceAtlas,CAPABILITY_OBJECT_TARGET} from '../src/capability-source-atlas.mjs';
import {compileMissionBrain} from '../src/mission-brain-compiler.mjs';
import {buildAlwaysOnSensoriumPlan} from '../src/adaptive-source-ceiling-governor.mjs';

test('mechanism identity ignores ordering noise',()=>{
 const a={intent:'Retrieve Memory',inputContract:['query','time'],outputContract:['evidence'],mechanism:['graph','dense'],operatingConditions:{language:['en','ar']}};
 const b={intent:'retrieve memory',inputContract:['time','query'],outputContract:['evidence'],mechanism:['dense','graph'],operatingConditions:{language:['ar','en']}};
 assert.equal(sameMechanism(a,b),true);
 assert.equal(canonicalMechanismIdentity(a).mechanismId,canonicalMechanismIdentity(b).mechanismId);
});

test('source genesis rewards useful low-burden sources',()=>{
 const ranked=rankSources([{sourceId:'slow',uniqueUsefulDiscoveries:10,northStarGain:1,freshnessValue:1,apiCostUsd:20},{sourceId:'fast',uniqueUsefulDiscoveries:10,northStarGain:1,freshnessValue:1,apiCostUsd:0}]);
 assert.equal(ranked[0].sourceId,'fast');
 assert.ok(scoreSource({uniqueUsefulDiscoveries:2,northStarGain:2,freshnessValue:1})>0);
});

test('source genesis recursively discovers source ecosystems from outbound links',()=>{
 const discovered=discoverSourceCandidatesFromLinks(['https://lab.example/a','https://lab.example/b','https://new.example/x','not-a-url']);
 assert.deepEqual(discovered.map(x=>x.sourceId),['lab.example','new.example']);
 assert.ok(discovered[0].score>discovered[1].score);
});

test('elite reserve counts mechanisms not duplicate suppliers',()=>{
 const base={mechanismId:'mechanism:abc',provenanceDigest:'p',benchmarkReceipt:'b',incrementalUtility:1,inputContract:['x'],outputContract:['y']};
 const reserve=buildEliteReserve([base,{...base,incrementalUtility:2,supplier:'better'}]);
 assert.equal(reserve.distinctMechanisms,1);
 assert.equal(reserve.elite[0].incrementalUtility,2);
 assert.equal(reserve.target,ELITE_CAPABILITY_RESERVE_TARGET);
});

test('source atlas preserves billion-object target and broad coverage',()=>{
 const atlas=buildCapabilitySourceAtlas();
 assert.equal(atlas.objectTarget,CAPABILITY_OBJECT_TARGET);
 assert.ok(atlas.sourceFamilyCount>=45);
 assert.ok(atlas.sourceFamilies.includes('software-heritage'));
 assert.ok(atlas.sourceFamilies.includes('formal-proof-ecosystems'));
 assert.ok(atlas.sourceFamilies.includes('robotics-simulation'));
});

test('adaptive sensorium includes the full source atlas',()=>{
 const plan=buildAlwaysOnSensoriumPlan();
 assert.ok(plan.sourceFamilyCount>=45);
 const ids=new Set(plan.lanes.map(x=>x.sourceId));
 for(const id of ['github','bluesky','software-heritage','commoncrawl','formal-proof-ecosystems','scientific-databases']) assert.ok(ids.has(id));
});

test('mission compiler prefers higher mission-adjusted utility and avoids conflicts',()=>{
 const base={provenanceDigest:'p',benchmarkReceipt:'b',incrementalUtility:2,inputContract:['x'],outputContract:['y'],runtimeCostUsd:0};
 const result=compileMissionBrain({mission:'research',maxCapabilities:2,candidates:[{...base,mechanismId:'a',missionFit:1,conflicts:['b']},{...base,mechanismId:'b',missionFit:0.5},{...base,mechanismId:'c',missionFit:0.8}]});
 assert.deepEqual(result.selected.map(x=>x.mechanismId),['a','c']);
});
