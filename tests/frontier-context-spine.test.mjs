import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextPlan, assessContextPressure } from '../src/frontier-context-spine.mjs';

const constitution={id:'constitution',kind:'CONSTITUTION',contentRef:'canon:root',tags:['core'],dependencies:[],estimatedTokens:100,priority:100,immutable:true};

test('Context Spine refuses task context that omits the constitution',()=>{
  const out=buildContextPlan({taskId:'x',requiredTags:['task'],artifacts:[{id:'state',kind:'STATE',contentRef:'state:x',tags:['task'],dependencies:[],estimatedTokens:10}],tokenBudget:1000});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('constitution-artifact-required'));
});

test('Context Spine refuses an admitted artifact whose dependency cannot be resolved',()=>{
  const out=buildContextPlan({taskId:'x',requiredTags:['core'],artifacts:[{...constitution,dependencies:['missing']}],tokenBudget:1000});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('dependency-would-be-omitted'));
});

test('Context Spine checkpoint recovery pressure chooses minimum-context continuation at critical load',()=>{
  const out=assessContextPressure({usedTokens:95,tokenBudget:100,checkpointAvailable:true});
  assert.equal(out.ok,true);assert.equal(out.state,'CRITICAL');assert.equal(out.action,'CHECKPOINT_AND_RETRIEVE_MINIMUM_NEXT_CONTEXT');
});
