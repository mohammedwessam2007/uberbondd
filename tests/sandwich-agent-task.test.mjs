import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { compileSandwichMethod, buildSandwichFoldMission } from '../src/sandwich-method.mjs';
import { compileEvidenceBoundSandwich } from '../src/sandwich-evidence-binding.mjs';
import { compileSandwichAgentTask } from '../src/sandwich-agent-task.mjs';

const HEAD='a'.repeat(40);
const target={
  targetId:'synthetic-descendant',targetRevision:'r1',statement:'Synthetic stronger descendant.',authority:'CANONICAL_REPOSITORY',
  invariants:['capability never creates authority'],
  nodes:[
    {id:'truth',label:'Exact truth',state:'VERIFIED_CURRENT',foldClass:'INTERNAL_SOURCE',requires:[],evidenceRefs:['evidence:truth'],executionRequirementIds:['req-truth'],leverage:2,effort:1,uncertainty:0},
    {id:'next',label:'Build persistent failure memory',state:'MISSING',foldClass:'INTERNAL_SOURCE',requires:['truth'],evidenceRefs:[],executionRequirementIds:['req-next'],leverage:8,effort:1,uncertainty:.2}
  ]
};
const evidence=[{id:'evidence:truth',kind:'SOURCE_TEST',observedAt:'2026-09-10T00:00:00Z',evidenceDigest:crypto.createHash('sha256').update('truth').digest('hex'),sourceCommit:HEAD,independentlyVerified:true,revoked:false}];

test('selected evidence-bound Sandwich fold compiles into one bounded canonical local-preparation agent task',()=>{
  const bound=compileEvidenceBoundSandwich({currentSourceCommit:HEAD,target,evidenceRegistry:evidence});
  const sandwich=bound.sandwich;
  const mission=buildSandwichFoldMission({sandwich});
  const out=compileSandwichAgentTask({evidenceBoundSandwich:bound,foldMission:mission,date:new Date('2026-09-10T00:00:00Z')});
  assert.equal(out.ok,true);assert.equal(out.status,'SANDWICH_AGENT_TASK_READY');
  assert.equal(out.sourceCommit,HEAD);assert.equal(out.gapId,'next');
  assert.equal(out.evidenceBindingDigest,bound.evidenceBindingDigest);
  assert.equal(out.task.originAgent,'uberbond-sandwich-controller');
  assert.equal(out.task.consequenceClass,'LOCAL_PREPARATION');
  assert.ok(out.task.constraints.includes('sandwich-fold-mode'));
  assert.ok(out.task.constraints.includes('external-effect-authority:none'));
  assert.ok(out.task.constraints.some(item=>item.startsWith('sandwich-evidence-binding:')));
  assert.ok(out.task.forbiddenActions.includes('merge'));
  assert.ok(out.task.forbiddenActions.includes('self-attest-completion'));
  assert.match(out.executionBoundary,/ONLY_AN_INDEPENDENTLY_EVIDENCE_BOUND_SANDWICH/);
});

test('structural Sandwich without independent evidence binding cannot compile a worker task',()=>{
  const sandwich=compileSandwichMethod({currentSourceCommit:HEAD,target});
  const mission=buildSandwichFoldMission({sandwich});
  const out=compileSandwichAgentTask({evidenceBoundSandwich:{ok:false,sandwich},foldMission:mission});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('independently-evidence-bound-sandwich-required'));
});

test('tampered mission cannot compile',()=>{
  const bound=compileEvidenceBoundSandwich({currentSourceCommit:HEAD,target,evidenceRegistry:evidence});
  const mission=buildSandwichFoldMission({sandwich:bound.sandwich});
  const tampered={...mission,mission:{...mission.mission,gapId:'different'}};
  const out=compileSandwichAgentTask({evidenceBoundSandwich:bound,foldMission:tampered});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('mission-gap-mismatch'));
});
