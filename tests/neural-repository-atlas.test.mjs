import test from 'node:test';
import assert from 'node:assert/strict';
import {compileNeuralAtlasPlan,buildNeuralRepositoryTournament,scoreNeuralRepository,NEURAL_REPOSITORY_TARGET} from '../src/neural-repository-atlas.mjs';

test('plan spans broad neural families and targets one million',()=>{
 const plan=compileNeuralAtlasPlan();
 assert.equal(plan.ok,true);
 assert.equal(plan.target,1_000_000);
 assert.ok(plan.familyCount>=30);
 assert.ok(plan.queryCount>=1000);
 assert.match(plan.law,/1000000/);
 assert.match(plan.law,/50000/);
 assert.match(plan.refinementLaw,/1000/);
});

test('default star bands do not overlap within a seed',()=>{
 const plan=compileNeuralAtlasPlan();
 const rows=plan.queries.filter(q=>q.family==='models'&&q.seed==='topic:llm');
 assert.deepEqual(rows.map(q=>q.starBand),[[0,2],[3,9],[10,49],[50,199],[200,999],[1000,4999],[5000,null]]);
 assert.equal(new Set(rows.map(q=>q.query)).size,7);
});

test('candidate selection dedupes identities',()=>{
 const out=buildNeuralRepositoryTournament({repositories:[
  {full_name:'x/a',html_url:'https://github.com/x/a',stargazers_count:10},
  {full_name:'X/A',html_url:'https://github.com/X/A',stargazers_count:100}
 ],target:1_000_000});
 assert.equal(out.manifest.distinctCandidates,1);
 assert.equal(out.selected[0].stars,100);
});

test('private repositories never enter atlas',()=>{
 const out=buildNeuralRepositoryTournament({repositories:[{full_name:'x/private',private:true,stargazers_count:1_000_000}],target:1});
 assert.equal(out.selected.length,0);
});

test('atlas cannot claim one million before observing one million distinct candidates',()=>{
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
