import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSandwichMethod, buildSandwichFoldMission } from '../src/sandwich-method.mjs';
import { compileSandwichAgentTask } from '../src/sandwich-agent-task.mjs';

const HEAD='a'.repeat(40);
const target={
  targetId:'synthetic-descendant',targetRevision:'r1',statement:'Synthetic stronger descendant.',authority:'CANONICAL_REPOSITORY',
  invariants:['capability never creates authority'],
  nodes:[
    {id:'truth',label:'Exact truth',state:'VERIFIED_CURRENT',foldClass:'INTERNAL_SOURCE',requires:[],evidenceRefs:['receipt://truth'],executionRequirementIds:['req-truth'],leverage:2,effort:1,uncertainty:0},
    {id:'next',label:'Build persistent failure memory',state:'MISSING',foldClass:'INTERNAL_SOURCE',requires:['truth'],evidenceRefs:[],executionRequirementIds:['req-next'],leverage:8,effort:1,uncertainty:.2}
  ]
};

test('selected Sandwich fold compiles into one bounded canonical local-preparation agent task',()=>{
  const sandwich=compileSandwichMethod({currentSourceCommit:HEAD,target});
  const mission=buildSandwichFoldMission({sandwich});
  const out=compileSandwichAgentTask({sandwich,foldMission:mission,date:new Date('2026-09-10T00:00:00Z')});
  assert.equal(out.ok,true);assert.equal(out.status,'SANDWICH_AGENT_TASK_READY');
  assert.equal(out.sourceCommit,HEAD);assert.equal(out.gapId,'next');
  assert.equal(out.task.originAgent,'uberbond-sandwich-controller');
  assert.equal(out.task.consequenceClass,'LOCAL_PREPARATION');
  assert.ok(out.task.constraints.includes('sandwich-fold-mode'));
  assert.ok(out.task.constraints.includes('external-effect-authority:none'));
  assert.ok(out.task.forbiddenActions.includes('merge'));
  assert.ok(out.task.forbiddenActions.includes('self-attest-completion'));
  assert.match(out.executionBoundary,/CREATES_NO_DISPATCH_VERIFICATION_PROMOTION_MERGE_SIGNING_DEPLOYMENT_OR_EXTERNAL_AUTHORITY/);
});

test('tampered mission cannot compile',()=>{
  const sandwich=compileSandwichMethod({currentSourceCommit:HEAD,target});
  const mission=buildSandwichFoldMission({sandwich});
  const tampered={...mission,mission:{...mission.mission,gapId:'different'}};
  const out=compileSandwichAgentTask({sandwich,foldMission:tampered});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('mission-gap-mismatch'));
});
