import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeSandwichBlueprintRevision, admitSandwichBlueprintRevision } from '../src/sandwich-blueprint-evolution.mjs';

const HEAD='a'.repeat(40);
const target={
 targetId:'descendant',targetRevision:'r1',statement:'Stronger descendant.',authority:'CANONICAL_REPOSITORY',
 invariants:['capability never creates authority','reality evidence outranks simulation'],
 nodes:[
  {id:'truth',label:'Truth',state:'VERIFIED_CURRENT',foldClass:'INTERNAL_SOURCE',requires:[],evidenceRefs:['receipt://truth'],executionRequirementIds:['req-truth'],leverage:2,effort:1,uncertainty:0},
  {id:'hard-gap',label:'Hard unsolved gap',state:'MISSING',foldClass:'INTERNAL_RESEARCH',requires:['truth'],evidenceRefs:[],executionRequirementIds:['req-hard'],leverage:5,effort:2,uncertainty:.5}
 ]
};

test('stronger system may add newly discovered structure without pretending coverage improved',()=>{
 const out=proposeSandwichBlueprintRevision({currentSourceCommit:HEAD,currentTarget:target,newRevision:'r2',addNodes:[
  {id:'new-dimension',label:'Previously invisible dimension',state:'UNKNOWN',foldClass:'INTERNAL_RESEARCH',requires:['truth'],evidenceRefs:[],executionRequirementIds:['req-new'],leverage:3,effort:1,uncertainty:1}
 ],discoveryEvidenceRefs:['receipt://surprise'],independentlyVerified:true});
 assert.equal(out.ok,true);assert.deepEqual(out.addedIds,['new-dimension']);
 assert.ok(out.candidateSandwich.filling.gaps.some(row=>row.id==='new-dimension'));
 assert.match(out.mutationBoundary,/DOES_NOT_ADOPT_THE_TARGET/);
});

test('blueprint cannot erase an unsolved gap without explicit independently verified invalidation',()=>{
 const refused=proposeSandwichBlueprintRevision({currentSourceCommit:HEAD,currentTarget:target,newRevision:'r2',removeNodes:[{id:'hard-gap',reason:'TARGET_INVALIDATED',evidenceRefs:['receipt://invalid']}],discoveryEvidenceRefs:['receipt://invalid'],independentlyVerified:false});
 assert.equal(refused.ok,false);assert.ok(refused.reasonCodes.includes('independent-verification-required-for-blueprint-removal'));
 const admittedProposal=proposeSandwichBlueprintRevision({currentSourceCommit:HEAD,currentTarget:target,newRevision:'r2',removeNodes:[{id:'hard-gap',reason:'TARGET_INVALIDATED',evidenceRefs:['receipt://invalid']}],discoveryEvidenceRefs:['receipt://invalid'],independentlyVerified:true});
 assert.equal(admittedProposal.ok,true);assert.deepEqual(admittedProposal.removedIds,['hard-gap']);
});

test('canonical target revision still needs canonical promotion to be admitted',()=>{
 const proposal=proposeSandwichBlueprintRevision({currentSourceCommit:HEAD,currentTarget:target,newRevision:'r2',addNodes:[
  {id:'new-gap',label:'New gap',state:'UNKNOWN',foldClass:'INTERNAL_RESEARCH',requires:['truth'],evidenceRefs:[],executionRequirementIds:['req-new'],leverage:2,effort:1,uncertainty:1}
 ],discoveryEvidenceRefs:['receipt://new'],independentlyVerified:true});
 const refused=admitSandwichBlueprintRevision({proposal,adoptionAuthority:'FOUNDER_EXPLICIT_PRIVATE_ADOPTION',evidenceRefs:['receipt://review'],independentlyVerified:true});
 assert.equal(refused.ok,false);assert.ok(refused.reasonCodes.includes('canonical-repository-promotion-required'));
 const ok=admitSandwichBlueprintRevision({proposal,adoptionAuthority:'CANONICAL_REPOSITORY_PROMOTION',evidenceRefs:['receipt://review'],independentlyVerified:true});
 assert.equal(ok.ok,true);assert.equal(ok.nextRequiredAction,'RECOMPILE_SANDWICH_FROM_EXACT_CURRENT_SOURCE_AND_ADMITTED_TARGET');
});

test('existing invariants cannot silently disappear',()=>{
 const weakened={...target,invariants:['capability never creates authority']};
 const out=proposeSandwichBlueprintRevision({currentSourceCommit:HEAD,currentTarget:target,newRevision:'r2',statement:weakened.statement,addNodes:[],discoveryEvidenceRefs:['receipt://x'],independentlyVerified:true});
 assert.equal(out.ok,true,'no mutation API changed invariants; current target invariants remain preserved');
 assert.deepEqual(out.candidateTarget.invariants,target.invariants);
});
