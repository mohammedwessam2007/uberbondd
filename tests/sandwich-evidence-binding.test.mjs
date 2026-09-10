import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { compileEvidenceBoundSandwich } from '../src/sandwich-evidence-binding.mjs';

const HEAD='a'.repeat(40);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const target={targetId:'descendant',targetRevision:'r1',statement:'Synthetic target.',authority:'CANONICAL_REPOSITORY',invariants:['capability never creates authority'],nodes:[
 {id:'truth',label:'Exact source truth',state:'VERIFIED_CURRENT',foldClass:'INTERNAL_SOURCE',requires:[],evidenceRefs:['evidence:truth'],executionRequirementIds:['req-truth'],leverage:2,effort:1,uncertainty:0},
 {id:'next',label:'Next fold',state:'MISSING',foldClass:'INTERNAL_SOURCE',requires:['truth'],evidenceRefs:[],executionRequirementIds:['req-next'],leverage:5,effort:1,uncertainty:.2}
]};
const record=(overrides={})=>({id:'evidence:truth',kind:'SOURCE_TEST',observedAt:'2026-09-10T19:00:00Z',evidenceDigest:hash('truth'),sourceCommit:HEAD,independentlyVerified:true,revoked:false,...overrides});

test('authoritative Sandwich lower slice binds verified-current source node to exact-head independent evidence',()=>{
 const out=compileEvidenceBoundSandwich({currentSourceCommit:HEAD,target,evidenceRegistry:[record()]});
 assert.equal(out.ok,true);assert.equal(out.status,'SANDWICH_EVIDENCE_BOUND');assert.equal(out.bindings.length,1);assert.equal(out.sandwich.nextFold.id,'next');
 assert.match(out.authorityBoundary,/ONLY_EVIDENCE_BOUND_SANDWICHES/);
});

test('pretty evidence ref without registry proof cannot mint verified current',()=>{
 const out=compileEvidenceBoundSandwich({currentSourceCommit:HEAD,target,evidenceRegistry:[]});
 assert.equal(out.ok,false);assert.ok(out.reasonCodes.some(code=>code.includes('evidence-ref-not-independently-bound')));
});

test('source evidence from stale commit is refused',()=>{
 const out=compileEvidenceBoundSandwich({currentSourceCommit:HEAD,target,evidenceRegistry:[record({sourceCommit:'b'.repeat(40)})]});
 assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('source-evidence-must-bind-exact-current-commit'));
});

test('wrong evidence class cannot prove physical or source claims',()=>{
 const physical={...target,nodes:[{...target.nodes[0],foldClass:'OWNED_PHYSICAL_HOST'},target.nodes[1]]};
 const out=compileEvidenceBoundSandwich({currentSourceCommit:HEAD,target:physical,evidenceRegistry:[record()]});
 assert.equal(out.ok,false);assert.ok(out.reasonCodes.some(code=>code.includes('evidence-kind-does-not-prove-fold-class')));
});

test('revoked or self-attested evidence is refused',()=>{
 const revoked=compileEvidenceBoundSandwich({currentSourceCommit:HEAD,target,evidenceRegistry:[record({revoked:true})]});assert.equal(revoked.ok,false);
 const self=compileEvidenceBoundSandwich({currentSourceCommit:HEAD,target,evidenceRegistry:[record({independentlyVerified:false})]});assert.equal(self.ok,false);
});
