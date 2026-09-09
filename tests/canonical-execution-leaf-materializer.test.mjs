import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeCanonicalExecutionLeaves } from '../src/canonical-execution-leaf-materializer.mjs';
const HEAD='a'.repeat(40);
const row=(id,state)=>({canonicalId:id,currentState:state,currentEvidence:{sourceModules:[],testModules:[]},sourceArtifacts:['artifacts/canon.json'],owningLane:'OMEGA-14'});
function coverage(rows){const byState={};for(const r of rows)byState[r.currentState]=(byState[r.currentState]||0)+1;return{ok:true,status:'COVERAGE_MATRIX_COMPILED',sourceCommit:HEAD,rows,counts:{rows:rows.length,byState}};}

test('materializes every canonical row with zero orphan and zero floating leaves',()=>{
 const rows=[row('x:spec','SPEC_ONLY'),row('x:partial','PARTIAL_CURRENT'),row('x:verified','VERIFIED_CURRENT'),row('x:external','EXTERNAL_BLOCKED'),row('x:owner','OWNER_BOUNDARY'),row('x:elapsed','ELAPSED_TIME_REQUIRED'),row('x:structural','STRUCTURAL_NOT_A_BUILD_TARGET'),row('x:unknown','UNKNOWN')];
 const out=materializeCanonicalExecutionLeaves({coverage:coverage(rows)});
 assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.counts.requirements,rows.length);assert.equal(out.counts.orphanRequirements,0);assert.equal(out.counts.floatingLeaves,0);
 assert.equal(out.requirements.length,rows.length);assert.equal(new Set(out.requirements.map(r=>r.id)).size,rows.length);
});

test('SPEC_ONLY becomes implementation plus dependent independent verification, not fake completion',()=>{
 const out=materializeCanonicalExecutionLeaves({coverage:coverage([row('x:spec','SPEC_ONLY')])});assert.equal(out.ok,true);
 assert.equal(out.leaves.length,2);const impl=out.leaves.find(l=>l.kind==='IMPLEMENTATION');const verify=out.leaves.find(l=>l.kind==='VERIFICATION');
 assert.deepEqual(impl.verifierLeafIds,[verify.leafId]);assert.deepEqual(verify.predecessors,[impl.leafId]);assert.match(out.truthBoundary,/DOES_NOT_PROVE/);
});

test('external owner and elapsed rows remain boundary work and never become implementation',()=>{
 const out=materializeCanonicalExecutionLeaves({coverage:coverage([row('x:e','EXTERNAL_BLOCKED'),row('x:o','OWNER_BOUNDARY'),row('x:t','ELAPSED_TIME_REQUIRED')])});assert.equal(out.ok,true);
 assert.ok(out.leaves.every(l=>l.kind==='BOUNDARY'));assert.ok(out.leaves.every(l=>l.authorityExplicitlyNotGranted.includes('PAYMENT_TRUTH')));
 assert.deepEqual(out.requirements.map(r=>r.disposition),['OWNED_EXTERNAL','OWNED_EXTERNAL','OWNED_ELAPSED']);
});

test('terminal structural and donor-like rows create classification verification, not duplicate build work',()=>{
 const out=materializeCanonicalExecutionLeaves({coverage:coverage([row('x:s','STRUCTURAL_NOT_A_BUILD_TARGET'),row('x:d','HISTORICAL_DONOR_PRESERVED')])});assert.equal(out.ok,true);
 assert.ok(out.leaves.every(l=>l.kind==='VERIFICATION'));assert.ok(out.leaves.every(l=>/correctly terminal/.test(l.implementationAcceptance)));
});

test('refuses absent or nonmaterialized canonical coverage',()=>{
 for(const c of [{},{ok:true,status:'COVERAGE_MATRIX_COMPILED',sourceCommit:HEAD,rows:[],counts:{rows:0}}]){const out=materializeCanonicalExecutionLeaves({coverage:c});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('materialized-canonical-coverage-required'));}
});

test('refuses coverage rows without canonical identity or measured state',()=>{
 const out=materializeCanonicalExecutionLeaves({coverage:coverage([{canonicalId:'x',sourceArtifacts:['a']}])});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('coverage-row-id-and-state-required'));
});

test('canonical wrapper still refuses forged row denominator',()=>{
 const c=coverage([row('x:a','PARTIAL_CURRENT')]);c.counts.rows=2;const out=materializeCanonicalExecutionLeaves({coverage:c});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('coverage-declared-row-count-must-match-materialized-rows'));
});

test('all generated leaves retain zero business-effect authority',()=>{
 const out=materializeCanonicalExecutionLeaves({coverage:coverage([row('x:a','SPEC_ONLY'),row('x:b','VERIFIED_CURRENT')])});assert.equal(out.ok,true);assert.equal(out.businessEffectAuthority,'NONE');assert.equal(out.externalEffectLedger.providerCalls,0);assert.ok(out.leaves.every(l=>l.authorityRequired.length===0));
});
