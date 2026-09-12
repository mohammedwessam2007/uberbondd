import test from 'node:test';
import assert from 'node:assert/strict';
import {compileNeuralAtlasPlan,buildNeuralRepositoryTournament,scoreNeuralRepository,NEURAL_REPOSITORY_TARGET} from '../src/neural-repository-atlas.mjs';

test('plan spans broad neural families and targets 50k',()=>{
 const plan=compileNeuralAtlasPlan();
 assert.equal(plan.ok,true);
 assert.equal(plan.target,50_000);
 assert.ok(plan.familyCount>=18);
 assert.ok(plan.queryCount>=400);
 assert.match(plan.law,/50000/);
});

test('candidate selection dedupes identities',()=>{
 const out=buildNeuralRepositoryTournament({repositories:[
  {full_name:'x/a',html_url:'https://github.com/x/a',stargazers_count:10},
  {full_name:'X/A',html_url:'https://github.com/X/A',stargazers_count:100}
 ],target:50_000});
 assert.equal(out.manifest.distinctCandidates,1);
 assert.equal(out.selected[0].stars,100);
});

test('private repositories never enter atlas',()=>{
 const out=buildNeuralRepositoryTournament({repositories:[{full_name:'x/private',private:true,stargazers_count:1_000_000}],target:1});
 assert.equal(out.selected.length,0);
});

test('atlas cannot claim 50k before observing 50k distinct candidates',()=>{
 const out=buildNeuralRepositoryTournament({repositories:[{full_name:'x/a',stargazers_count:1}],target:NEURAL_REPOSITORY_TARGET});
 assert.equal(out.manifest.targetSatisfied,false);
 assert.equal(out.status,'NEURAL_ATLAS_MORE_DISCOVERY_REQUIRED');
});

test('archived repository is strongly penalized',()=>{
 const live=scoreNeuralRepository({stargazers_count:1000,archived:false});
 const dead=scoreNeuralRepository({stargazers_count:1000,archived:true});
 assert.ok(live>dead);
});

test('selection remains discovery-only with no promotion authority',()=>{
 const out=buildNeuralRepositoryTournament({repositories:[{full_name:'x/a',stargazers_count:999}],target:1});
 assert.equal(out.selected[0].promotionAuthority,'NONE');
 assert.match(out.manifest.truthBoundary,/NOT_IMPORTED/);
});
