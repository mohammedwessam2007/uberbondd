import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFailureToPatchReflex,evaluateFailureReflexReplay } from '../src/failure-to-patch-reflex.mjs';

const BASE='a'.repeat(40);

test('missing verification becomes a bounded regeneration proposal with the omitted command',()=>{
 const r=compileFailureToPatchReflex({taskId:'t',baseRevision:BASE,reasonCodes:['candidate-required-verification-missing:node --test tests/x.test.mjs'],evidenceRefs:['test:x']});
 assert.equal(r.ok,true); assert.equal(r.status,'FAILURE_REFLEX_PROPOSAL_READY');
 assert.equal(r.recipeId,'restore-required-verification'); assert.equal(r.autoApply,false); assert.equal(r.autoMerge,false);
 assert.ok(r.proposal.requiredTests.includes('node --test tests/x.test.mjs'));
 assert.equal(r.proposal.constraints.maxFilesTouched,3); assert.equal(r.patchAuthority,'NONE');
});

test('stale-base failure regenerates rather than patching the wrong tree',()=>{
 const r=compileFailureToPatchReflex({taskId:'t',baseRevision:BASE,reasonCodes:['candidate-base-revision-mismatch']});
 assert.equal(r.recipeId,'rebind-exact-base'); assert.equal(r.repairMode,'REGENERATE_PROPOSAL');
 assert.match(r.proposal.rationale,/exact base/i);
});

test('authority drift is repaired by narrowing proposal authority, never widening it',()=>{
 const r=compileFailureToPatchReflex({taskId:'t',baseRevision:BASE,reasonCodes:['candidate-business-effect-authority-must-be-none']});
 assert.equal(r.recipeId,'narrow-consequence-authority');
 assert.equal(r.proposal.constraints.businessEffectAuthority,'NONE');
 assert.equal(r.externalEffectAuthority,'NONE');
});

test('unknown failures escalate instead of improvising a patch',()=>{
 const r=compileFailureToPatchReflex({taskId:'t',baseRevision:BASE,reasonCodes:['mystery-kernel-panic']});
 assert.equal(r.ok,true); assert.equal(r.status,'FAILURE_REFLEX_ESCALATION_REQUIRED');
 assert.equal(r.autoPatchEligible,false); assert.ok(r.unknownReasonCodes.includes('mystery-kernel-panic'));
});

test('mixed known recipes fail closed to escalation',()=>{
 const r=compileFailureToPatchReflex({taskId:'t',baseRevision:BASE,reasonCodes:['candidate-base-revision-mismatch','candidate-task-identity-mismatch']});
 assert.equal(r.status,'FAILURE_REFLEX_ESCALATION_REQUIRED');
 assert.ok(r.conflictingRecipeIds.length===2);
});

test('replay avoids frontier escalation on known signatures without false auto-proposals on unknowns',()=>{
 const r=evaluateFailureReflexReplay({cases:[
  {id:'a',reasonCodes:['candidate-base-revision-mismatch'],expectedRecipeId:'rebind-exact-base'},
  {id:'b',reasonCodes:['candidate-task-identity-mismatch'],expectedRecipeId:'rebind-task-identity'},
  {id:'c',reasonCodes:['candidate-business-effect-authority-must-be-none'],expectedRecipeId:'narrow-consequence-authority'},
  {id:'d',reasonCodes:['brand-new-failure'],expectedRecipeId:'ESCALATE'}
 ]});
 assert.equal(r.ok,true); assert.equal(r.knownPatternAccuracy,1); assert.equal(r.falseAutomaticProposalCount,0);
 assert.equal(r.frontierEscalationsAvoided,3); assert.equal(r.falsifierTriggered,false);
});

test('malformed exact base is refused',()=>{
 const r=compileFailureToPatchReflex({taskId:'t',baseRevision:'nope',reasonCodes:['candidate-base-revision-mismatch']});
 assert.equal(r.ok,false); assert.ok(r.reasonCodes.includes('task-id-and-exact-base-required'));
});
