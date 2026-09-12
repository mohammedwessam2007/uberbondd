import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShortReferenceSurfaces, compileTerminalCoverage } from '../scripts/sovereign-coverage-terminal-closure.mjs';
import { verifyCoverageStateEvidenceIntegrity } from '../src/coverage-state-evidence-integrity.mjs';

const emptyEvidence=()=>({sourceModules:[],testModules:[],reachability:null,matchStrength:'NO_DISTINCTIVE_TOKENS',matchScope:'NONE',matchedPhrase:null,boundary:'FILE_AND_TEST_PRESENCE_IS_INTERNAL_EVIDENCE_NOT_PROOF_OF_BEHAVIOUR_OR_EXTERNAL_OUTCOME'});
const matrix=rows=>({ok:true,counts:{byState:{UNKNOWN:rows.filter(r=>r.currentState==='UNKNOWN').length,REFERENCE_ONLY_BY_CANON:0}},rows});

test('only short no-evidence reference surfaces normalize to canon references',()=>{
  const input=matrix([
    {canonicalId:'total-brain:tgi',class:'REFERENCE_SURFACE',currentState:'UNKNOWN',currentEvidence:emptyEvidence()},
    {canonicalId:'generic:x',class:'CONCEPT',currentState:'UNKNOWN',currentEvidence:emptyEvidence()},
    {canonicalId:'reference:implemented',class:'REFERENCE_SURFACE',currentState:'UNKNOWN',currentEvidence:{...emptyEvidence(),sourceModules:['src/x.mjs'],matchStrength:'EXACT_SLUG',matchScope:'WHOLE_NAME'}}
  ]);
  const out=normalizeShortReferenceSurfaces(input);
  assert.equal(out.rows[0].currentState,'REFERENCE_ONLY_BY_CANON');
  assert.equal(out.rows[1].currentState,'UNKNOWN');
  assert.equal(out.rows[2].currentState,'UNKNOWN');
  assert.equal(out.counts.byState.UNKNOWN,2);
  assert.equal(out.counts.byState.REFERENCE_ONLY_BY_CANON,1);
});

test('independent integrity refuses reference-only state on non-reference or implementation evidence',()=>{
  const wrongClass=verifyCoverageStateEvidenceIntegrity({rows:[{canonicalId:'x',class:'CONCEPT',currentState:'REFERENCE_ONLY_BY_CANON',currentEvidence:emptyEvidence()}]});
  assert.equal(wrongClass.ok,false);
  assert.ok(wrongClass.reasonCodes.includes('reference-only-state-requires-reference-surface-class'));
  const fakeEvidence=verifyCoverageStateEvidenceIntegrity({rows:[{canonicalId:'x',class:'REFERENCE_SURFACE',currentState:'REFERENCE_ONLY_BY_CANON',currentEvidence:{...emptyEvidence(),sourceModules:['src/x.mjs']}}]});
  assert.equal(fakeEvidence.ok,false);
  assert.ok(fakeEvidence.reasonCodes.includes('reference-only-state-must-not-claim-implementation-evidence'));
});

test('exact canonical terminal coverage leaves no short reference surface UNKNOWN',()=>{
  const out=compileTerminalCoverage();
  assert.equal(out.ok,true);
  const tgi=out.rows.find(row=>row.canonicalId==='total-brain:tgi');
  const mlx=out.rows.find(row=>row.canonicalId==='total-brain:mlx-lm');
  assert.equal(tgi?.currentState,'REFERENCE_ONLY_BY_CANON');
  assert.equal(mlx?.currentState,'REFERENCE_ONLY_BY_CANON');
  assert.equal(out.counts.byState.UNKNOWN,0);
  assert.equal(out.stateEvidenceIntegrity,'COVERAGE_STATES_INDEPENDENTLY_BOUND_TO_EVIDENCE');
});
