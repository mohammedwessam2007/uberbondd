import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyEvidenceReferenceIntegrity } from '../src/evidence-reference-integrity.mjs';
const HEAD='a'.repeat(40);
function fixture(){
 const coverage={sourceCommit:HEAD,rows:[
  {canonicalId:'R1',currentState:'ENFORCED_BY_CODE',currentEvidence:{sourceModules:['src/a.mjs'],testModules:['tests/a.test.mjs']},sourceArtifacts:['artifacts/canon.json']},
  {canonicalId:'R2',currentState:'EXTERNAL_BLOCKED',currentEvidence:{sourceModules:[],testModules:[]},sourceArtifacts:['artifacts/canon.json']}
 ]};
 const requirements=[
  {id:'R1',canonicalSource:'artifacts/canon.json',statusEvidenceRef:'coverage:R1:ENFORCED_BY_CODE',executionLeafIds:['L1']},
  {id:'R2',canonicalSource:'artifacts/canon.json',statusEvidenceRef:'coverage:R2:EXTERNAL_BLOCKED',executionLeafIds:['L2']}
 ];
 const leaves=[
  {leafId:'L1',exactScope:['src/a.mjs','tests/a.test.mjs','artifacts/canon.json'],inputEvidence:['coverage:R1:ENFORCED_BY_CODE']},
  {leafId:'L2',exactScope:['artifacts/canon.json'],inputEvidence:['coverage:R2:EXTERNAL_BLOCKED']}
 ];
 return {coverage,leafGraph:{requirements,leaves},trackedPaths:['src/a.mjs','tests/a.test.mjs','artifacts/canon.json']};
}
test('accepts exact repository-backed evidence references',()=>{const out=verifyEvidenceReferenceIntegrity(fixture());assert.equal(out.ok,true);assert.match(out.referenceDigest,/^[a-f0-9]{64}$/);});
test('rejects missing source module path',()=>{const x=fixture();x.trackedPaths=x.trackedPaths.filter(p=>p!=='src/a.mjs');const out=verifyEvidenceReferenceIntegrity(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.some(r=>r.startsWith('missing-source-module-reference:R1:src/a.mjs')));});
test('rejects test reference that is not a test path',()=>{const x=fixture();x.coverage.rows[0].currentEvidence.testModules=['src/not-test.mjs'];x.trackedPaths.push('src/not-test.mjs');const out=verifyEvidenceReferenceIntegrity(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.some(r=>r.startsWith('test-module-reference-has-wrong-class:R1')));});
test('rejects internal row with no repository evidence reference',()=>{const x=fixture();x.coverage.rows[0].currentEvidence={sourceModules:[],testModules:[]};x.coverage.rows[0].sourceArtifacts=[];const out=verifyEvidenceReferenceIntegrity(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('internal-coverage-row-needs-repository-evidence-reference:R1'));});
test('boundary row may remain externally evidenced while canonical source still resolves',()=>{const x=fixture();x.coverage.rows[1].sourceArtifacts=[];x.leafGraph.requirements[1].canonicalSource='artifacts/canon.json';x.leafGraph.leaves[1].exactScope=[];const out=verifyEvidenceReferenceIntegrity(x);assert.equal(out.ok,true);});
test('rejects requirement status evidence detached from current coverage state',()=>{const x=fixture();x.leafGraph.requirements[0].statusEvidenceRef='coverage:R1:SPEC_ONLY';const out=verifyEvidenceReferenceIntegrity(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('requirement-status-evidence-detached-from-coverage:R1'));});
test('rejects leaf coverage input detached from owning requirement state',()=>{const x=fixture();x.leafGraph.leaves[0].inputEvidence=['coverage:R1:SPEC_ONLY'];const out=verifyEvidenceReferenceIntegrity(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('leaf-input-evidence-detached-from-coverage:L1'));});
test('rejects missing exact-scope path even when coverage pointer resolves',()=>{const x=fixture();x.leafGraph.leaves[0].exactScope.push('src/ghost.mjs');const out=verifyEvidenceReferenceIntegrity(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('missing-leaf-exact-scope:L1:src/ghost.mjs'));});
