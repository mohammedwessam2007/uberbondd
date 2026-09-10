import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileSandwichMethod,
  buildSandwichFoldMission,
  buildCanonicalLeafHandoff,
  admitSandwichFoldResult,
  compareSandwichStates
} from '../src/sandwich-method.mjs';

const HEAD='a'.repeat(40);
const target=(authority='CANONICAL_REPOSITORY')=>({
  targetId:'stronger-uberbond',targetRevision:'r1',statement:'A stronger verified successor',authority,
  invariants:['capability never creates authority','reality evidence outranks simulation'],
  nodes:[
    {id:'truth',label:'Exact current truth',state:'VERIFIED_CURRENT',foldClass:'INTERNAL_SOURCE',requires:[],evidenceRefs:['receipt://truth'],executionRequirementIds:['req-truth'],leverage:5,effort:1,uncertainty:0},
    {id:'memory',label:'Persistent failure memory',state:'MISSING',foldClass:'INTERNAL_SOURCE',requires:['truth'],evidenceRefs:[],executionRequirementIds:['req-memory'],leverage:8,effort:2,uncertainty:.2},
    {id:'research',label:'Discover a better representation',state:'UNKNOWN',foldClass:'INTERNAL_RESEARCH',requires:['truth'],evidenceRefs:[],executionRequirementIds:['req-research'],leverage:10,effort:3,uncertainty:.9},
    {id:'physical',label:'Prove owned physical host',state:'MISSING',foldClass:'OWNED_PHYSICAL_HOST',requires:['memory'],evidenceRefs:[],executionRequirementIds:['req-physical'],leverage:20,effort:4,uncertainty:.2}
  ]
});

test('sandwich selects highest-leverage dependency-satisfied internal fold',()=>{
 const s=compileSandwichMethod({currentSourceCommit:HEAD,target:target()});
 assert.equal(s.ok,true);assert.equal(s.status,'SANDWICH_FOLD_READY');
 assert.equal(s.nextFold.id,'memory');
 assert.equal(s.filling.gapCount,3);
 assert.equal(s.blockedFrontier.length,0,'physical waits on memory and is not frontier yet');
 assert.match(s.coverageBoundary,/NOT_GLOBAL_UBERBOND_COMPLETENESS/);
});

test('hypothetical descendant cannot authorize implementation',()=>{
 const s=compileSandwichMethod({currentSourceCommit:HEAD,target:target('HYPOTHETICAL_ONLY')});
 assert.equal(s.ok,true);assert.equal(s.status,'SANDWICH_PROPOSAL_ONLY');assert.equal(s.nextFold,null);
});

test('verified current node without evidence is refused',()=>{
 const bad=target();bad.nodes[0].evidenceRefs=[];
 const s=compileSandwichMethod({currentSourceCommit:HEAD,target:bad});
 assert.equal(s.ok,false);assert.ok(s.reasonCodes.includes('valid-gap-nodes-required'));
});

test('cycles are refused',()=>{
 const bad=target();bad.nodes[0].state='MISSING';bad.nodes[0].evidenceRefs=[];bad.nodes[0].requires=['physical'];
 const s=compileSandwichMethod({currentSourceCommit:HEAD,target:bad});
 assert.equal(s.ok,false);assert.ok(s.reasonCodes.includes('dependency-cycle-refused'));
});

test('fold mission requires independent verification and forbids self attestation',()=>{
 const s=compileSandwichMethod({currentSourceCommit:HEAD,target:target()});
 const m=buildSandwichFoldMission({sandwich:s});
 assert.equal(m.ok,true);assert.ok(m.mission.requiredEvidence.includes('INDEPENDENT_VERIFIER_RESULT'));
 assert.ok(m.mission.prohibitedShortcuts.includes('SELF_ATTESTED_COMPLETION'));
});

test('canonical leaf handoff binds exact head and maps requirement ids without stealing execution authority',()=>{
 const s=compileSandwichMethod({currentSourceCommit:HEAD,target:target()});
 const graph={ok:true,sourceCommit:HEAD,leaves:[{leafId:'leaf-1',requirementIds:['req-memory']},{leafId:'leaf-2',requirementIds:['other']}]};
 const h=buildCanonicalLeafHandoff({sandwich:s,executionGraph:graph});
 assert.equal(h.ok,true);assert.deepEqual(h.candidateLeafIds,['leaf-1']);assert.match(h.handoffBoundary,/EXISTING_EXECUTION_LEAF_CONTINUATION/);
 const stale=buildCanonicalLeafHandoff({sandwich:s,executionGraph:{...graph,sourceCommit:'b'.repeat(40)}});assert.equal(stale.ok,false);
});

test('progress cannot be self-attested',()=>{
 const s=compileSandwichMethod({currentSourceCommit:HEAD,target:target()});
 const rejected=admitSandwichFoldResult({sandwich:s,result:{gapId:s.nextFold.id,outcome:'VERIFIED',evidenceRefs:['receipt://x'],independentlyVerified:false}});
 assert.equal(rejected.ok,false);assert.ok(rejected.reasonCodes.includes('independent-evidence-required-for-progress-claim'));
 const admitted=admitSandwichFoldResult({sandwich:s,result:{gapId:s.nextFold.id,outcome:'VERIFIED',evidenceRefs:['receipt://x'],independentlyVerified:true}});
 assert.equal(admitted.ok,true);assert.equal(admitted.nextRequiredAction,'RECOMPUTE_DESCENDANT_FROM_NEW_EXACT_CURRENT_STATE');
});

test('discovering more missing structure can count as epistemic progress',()=>{
 const before=compileSandwichMethod({currentSourceCommit:HEAD,target:target()});
 const t2=target();t2.targetRevision='r2';t2.nodes.push({id:'new-gap',label:'Previously unseen requirement',state:'UNKNOWN',foldClass:'INTERNAL_RESEARCH',requires:['truth'],evidenceRefs:[],executionRequirementIds:['req-new'],leverage:2,effort:1,uncertainty:1});
 const after=compileSandwichMethod({currentSourceCommit:HEAD,target:t2});
 const c=compareSandwichStates({before,after});
 assert.equal(c.ok,true);assert.deepEqual(c.newlyVisibleGapIds,['new-gap']);assert.equal(c.interpretation,'NEGATIVE_IMAGE_BECAME_MORE_INFORMATIVE');
});
