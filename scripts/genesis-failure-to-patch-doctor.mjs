#!/usr/bin/env node
import { compileFailureToPatchReflex,evaluateFailureReflexReplay } from '../src/failure-to-patch-reflex.mjs';
import { decideSelfMaintainerContinuation } from '../src/self-maintainer-continuation-policy.mjs';

const base='a'.repeat(40);
const direct=compileFailureToPatchReflex({
  taskId:'doctor-task',baseRevision:base,relayStatus:'CANDIDATE_REJECTED',
  reasonCodes:['candidate-required-verification-missing:node --test tests/doctor.test.mjs'],
  evidenceRefs:['test:doctor']
});
const policy=decideSelfMaintainerContinuation({
  taskId:'doctor-task',baseRevision:base,relayStatus:'CANDIDATE_REJECTED',
  reasonCodes:['candidate-required-verification-missing:node --test tests/doctor.test.mjs'],
  evidenceRefs:['test:doctor']
});
const replay=evaluateFailureReflexReplay({cases:[
  {id:'known-a',reasonCodes:['candidate-base-revision-mismatch'],expectedRecipeId:'rebind-exact-base'},
  {id:'known-b',reasonCodes:['candidate-task-identity-mismatch'],expectedRecipeId:'rebind-task-identity'},
  {id:'unknown',reasonCodes:['novel-doctor-failure'],expectedRecipeId:'ESCALATE'}
]});
const ok=direct.ok&&direct.status==='FAILURE_REFLEX_PROPOSAL_READY'
  &&policy.failureReflexStatus==='FAILURE_REFLEX_PROPOSAL_READY'
  &&replay.ok&&replay.knownPatternAccuracy===1&&replay.falseAutomaticProposalCount===0;
console.log(JSON.stringify({
  ok,status:ok?'FAILURE_TO_PATCH_REFLEX_HEALTHY':'FAILURE_TO_PATCH_REFLEX_INVALID',
  recipeId:direct.recipeId,
  continuationStatus:policy.status,
  continuationReflexStatus:policy.failureReflexStatus,
  replayKnownPatternAccuracy:replay.knownPatternAccuracy,
  replayFalseAutomaticProposalCount:replay.falseAutomaticProposalCount,
  autoApply:direct.autoApply,
  autoMerge:direct.autoMerge,
  patchAuthority:direct.patchAuthority,
  truthBoundary:direct.truthBoundary
},null,2));
if(!ok) process.exitCode=1;
