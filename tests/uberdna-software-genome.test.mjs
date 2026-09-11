import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberDnaSoftwareGenome, evaluateSoftwareMutation } from '../src/uberdna-software-genome.mjs';

let cached=null;
function genome(){cached ||= compileUberDnaSoftwareGenome({root:process.cwd(),sourceRevision:'TEST_HEAD'});return cached;}

test('UberDNA compiles the living repository genotype from the canonical Feature Genome',()=>{
  const r=genome();assert.equal(r.ok,true,JSON.stringify(r.reasonCodes));assert.ok(r.genotype.repositoryArtifactCount>0);assert.ok(r.genotype.sourceDependencyEdgeCount>0);assert.equal(r.businessEffectAuthority,'NONE');
});

test('UberDNA refuses mutation promotion without sandbox adversarial verifier and rollback evidence',()=>{
  const r=evaluateSoftwareMutation({genotypeResult:genome(),changedPaths:['src/example.mjs']});
  assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('verified-sandbox-evidence-required'));assert.ok(r.reasonCodes.includes('independent-verifier-required'));assert.equal(r.promotionAuthority,'NONE');
});

test('UberDNA does not grant promotion authority even after mutation evidence is complete',()=>{
  const r=evaluateSoftwareMutation({
    genotypeResult:genome(),changedPaths:['src/example.mjs'],
    sandboxReceipt:{ok:true,status:'VERIFIED_ISOLATED',evidenceRef:'receipt:sandbox:1'},
    adversarialEvidenceRefs:['test:hostile:1'],independentVerifierRef:'receipt:verifier:1',rollbackRef:'receipt:rollback:1'
  });
  assert.equal(r.ok,true);assert.equal(r.status,'UBERDNA_MUTATION_EVIDENCE_READY');assert.equal(r.promotionAuthority,'NONE');assert.equal(r.candidate.promotionAuthority,'SEPARATE_TRUSTED_PROMOTER_REQUIRED');
});
