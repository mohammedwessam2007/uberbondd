import test from 'node:test';
import assert from 'node:assert/strict';
import { runC21EvidenceDoctor } from '../scripts/c21-evidence-doctor.mjs';

test('C21 evidence doctor makes factory and ledger reachable without minting ASI evidence',()=>{
  const result=runC21EvidenceDoctor({candidateRevision:'test-revision'});
  assert.equal(result.ok,true);
  assert.equal(result.status,'C21_EVIDENCE_SOURCE_ACCOUNTING_READY');
  assert.equal(result.counts.required,20);
  assert.equal(result.counts.observedNonsynthetic,0);
  assert.equal(result.counts.missing,20);
  assert.equal(result.counts.missingCritical,7);
  assert.equal(result.asiStatus,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
  assert.equal(result.businessEffectAuthority,'NONE');
  assert.equal(result.externalEffectAuthority,'NONE');
});
