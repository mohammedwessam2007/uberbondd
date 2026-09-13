import test from 'node:test';
import assert from 'node:assert/strict';
import {selectMinimaxRegretStrategy} from '../src/robust-minimax-strategy.mjs';

const scenarios=[{id:'boom',status:'ESTIMATED',evidenceRefs:['e:boom']},{id:'flat',status:'ESTIMATED',evidenceRefs:['e:flat']},{id:'crash',status:'ESTIMATED',evidenceRefs:['e:crash']}];

test('selects the strategy with minimum worst-case regret across intervals',()=>{
  const out=selectMinimaxRegretStrategy({scenarios,strategies:[
    {id:'aggressive',outcomes:{boom:{low:90,high:110},flat:{low:10,high:30},crash:{low:-80,high:-40}},cost:5},
    {id:'balanced',outcomes:{boom:{low:60,high:80},flat:{low:45,high:60},crash:{low:20,high:35}},cost:3},
    {id:'defensive',outcomes:{boom:{low:25,high:45},flat:{low:40,high:55},crash:{low:35,high:50}},cost:1}
  ]});
  assert.equal(out.ok,true);
  assert.equal(out.winner.id,'balanced');
  assert.equal(out.externalEffectAuthority,'NONE');
  assert.match(out.basisDigest,/^sha256:[0-9a-f]{64}$/);
});

test('refuses missing scenario outcomes instead of inventing them',()=>{
  const out=selectMinimaxRegretStrategy({scenarios,strategies:[{id:'x',outcomes:{boom:1,flat:2}}]});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('valid-outcome-interval-required:x:crash'));
});

test('interval uncertainty is treated adversarially rather than as a midpoint',()=>{
  const out=selectMinimaxRegretStrategy({scenarios:[{id:'s'}],strategies:[
    {id:'wide',outcomes:{s:{low:-100,high:1000}}},
    {id:'narrow',outcomes:{s:{low:10,high:20}}}
  ]});
  assert.equal(out.ok,true);
  assert.equal(out.winner.id,'narrow');
  const wide=out.evaluated.find(row=>row.id==='wide');
  assert.equal(wide.maxRegret,1100);
});

test('does not manufacture probabilities or guaranteed outcomes',()=>{
  const out=selectMinimaxRegretStrategy({scenarios:[{id:'s',status:'ESTIMATED'}],strategies:[{id:'a',outcomes:{s:1}}]});
  assert.equal(out.ok,true);
  assert.match(out.truthBoundary,/NOT_A_PROBABILITY_OR_OUTCOME_GUARANTEE/);
  assert.equal('probability' in out.winner,false);
});
