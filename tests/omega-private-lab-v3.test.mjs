import test from 'node:test';
import assert from 'node:assert/strict';
import { solveProblem } from '../src/omega-private-lab-core.mjs';
import { trainCalibratedMetaCrystal, selectCalibratedPolicy, evaluateCalibratedTransfer } from '../src/omega-policy-meta-learner-v3.mjs';
import { independentlyVerifyCsp } from '../src/omega-independent-csp-verifier.mjs';
import { generateTrainingSuite, generateSuite } from '../src/omega-private-benchmark-generators.mjs';

function equalityTask(i=0){
  const ids=['root','u','v','w','x','y','z','q'];
  const ordered=[...ids.slice((i%3)),...ids.slice(0,(i%3))];
  return {id:`eq-${i}`,domain:'UNSEEN_EQUALITY',variables:ordered.map(id=>({id,domain:[0,1,2,3]})),constraints:ids.slice(1).map(id=>({type:'eq',vars:['root',id]})),givens:{root:i%4}};
}

test('v3 abstains on an unseen equality-only algebra instead of repeating v2 catastrophic transfer', () => {
  const trained=trainCalibratedMetaCrystal({sourceTasks:generateTrainingSuite(),policyBudget:5000});
  assert.equal(trained.ok,true);
  const choice=selectCalibratedPolicy({crystal:trained.crystal,targetTask:equalityTask(1)});
  assert.equal(choice.ok,true);
  assert.equal(choice.abstained,true);
  assert.equal(choice.selectedPolicy,'INPUT_ORDER');
  assert.ok(choice.ood.violations.some(v=>v.includes('unseen-constraint-type:eq')));
  const batch=Array.from({length:20},(_,i)=>equalityTask(i));
  const evaluated=evaluateCalibratedTransfer({crystal:trained.crystal,targetTasks:batch});
  assert.equal(evaluated.ok,true);
  assert.equal(evaluated.receipt.abstentions,20);
  assert.equal(evaluated.receipt.worsenedTasks,0);
  assert.equal(evaluated.receipt.executionWork,evaluated.receipt.coldWork);
  assert.equal(evaluated.receipt.catastrophicNegativeTransferPrevented,true);
});

test('v3 still transfers on structurally supported unseen named domains', () => {
  const trained=trainCalibratedMetaCrystal({sourceTasks:generateTrainingSuite(),policyBudget:5000});
  const tasks=generateSuite(424242,{perFamily:3,domainPrefix:'FRESH'});
  const evaluated=evaluateCalibratedTransfer({crystal:trained.crystal,targetTasks:tasks});
  assert.equal(evaluated.ok,true);
  assert.ok(evaluated.receipt.transfers>0);
  assert.ok(evaluated.receipt.executionWork<evaluated.receipt.coldWork);
  assert.equal(evaluated.receipt.worsenedTasks,0);
});

test('implementation-separated verifier independently accepts a valid solution and rejects corruption', () => {
  const task=generateSuite(1234,{perFamily:1,domainPrefix:'VERIFY'})[0];
  const solved=solveProblem({problem:task,policy:'HIGH_DEGREE'});
  assert.equal(solved.ok,true);
  const verdict=independentlyVerifyCsp({problem:task,assignment:solved.solution});
  assert.equal(verdict.ok,true);
  assert.equal(verdict.valid,true);
  assert.ok(verdict.workUnits>0);
  const broken={...solved.solution};
  const [a,b]=task.constraints.find(c=>c.type==='neq').vars;
  broken[b]=broken[a];
  const rejected=independentlyVerifyCsp({problem:task,assignment:broken});
  assert.equal(rejected.valid,false);
});
