import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditEvidenceSet,
  modelEcology,
  immuneVerdict
} from '../src/epistemic-immune-system.mjs';

test('correlated citations do not count as independent evidence', () => {
  const audit = auditEvidenceSet({
    claim: 'X improves Y',
    evidence: [
      { ref: 'paper:a', lineage: 'dataset:shared', direction: 'SUPPORTS', counterevidenceSearched: true },
      { ref: 'paper:b', lineage: 'dataset:shared', direction: 'SUPPORTS', counterevidenceSearched: true }
    ],
    selectionProcessDeclared: true
  });
  assert.equal(audit.ok, true);
  assert.equal(audit.independentUsableLineages, 1);
  assert.ok(audit.risks.includes('CORRELATED_SOURCES'));
  assert.ok(audit.risks.includes('CONSENSUS_MASQUERADING_AS_INDEPENDENCE'));
});

test('explicit leakage hindsight and known benchmark exposure are quarantined', () => {
  const audit = auditEvidenceSet({
    claim: 'Model performs on hidden benchmark',
    evidence: [
      { ref: 'eval:clean', lineage: 'eval:1', direction: 'SUPPORTS', counterevidenceSearched: true },
      { ref: 'eval:leak', lineage: 'eval:2', direction: 'SUPPORTS', trainingContamination: true },
      { ref: 'eval:after', lineage: 'eval:3', direction: 'SUPPORTS', selectedAfterOutcome: true },
      { ref: 'eval:known', lineage: 'eval:4', direction: 'SUPPORTS', benchmarkKnownToModel: true }
    ],
    selectionProcessDeclared: true
  });
  assert.equal(audit.ok, true);
  assert.equal(audit.status, 'EPISTEMIC_REVIEW_REQUIRED');
  assert.deepEqual(new Set(audit.quarantinedEvidenceIds).size, 3);
  assert.ok(audit.risks.includes('DATA_LEAKAGE'));
  assert.ok(audit.risks.includes('HINDSIGHT_BIAS'));
  assert.ok(audit.risks.includes('BENCHMARK_GAMING'));
});

test('frequency claim without base rate keeps base-rate neglect visible', () => {
  const audit = auditEvidenceSet({
    claim: 'This class usually succeeds',
    claimKind: 'FREQUENCY',
    evidence: [{ ref: 'case:1', lineage: 'case-family:1', direction: 'SUPPORTS', counterevidenceSearched: true }],
    selectionProcessDeclared: true
  });
  assert.equal(audit.ok, true);
  assert.ok(audit.risks.includes('BASE_RATE_NEGLECT'));
});

test('model ecology counts shared failure lineage instead of model names', () => {
  const ecology = modelEcology([
    { id: 'm1', provider: 'A', lineage: 'shared-corpus-family', position: 'SUPPORTS' },
    { id: 'm2', provider: 'B', lineage: 'shared-corpus-family', position: 'SUPPORTS' },
    { id: 'm3', provider: 'C', lineage: 'independent-family', position: 'OPPOSES' }
  ]);
  assert.equal(ecology.ok, true);
  assert.equal(ecology.modelCount, 3);
  assert.equal(ecology.providerCount, 3);
  assert.equal(ecology.independentFailureLineages, 2);
  assert.equal(ecology.apparentDiversityInflation, 1);
});

test('different model names from one lineage do not become epistemic biodiversity', () => {
  const ecology = modelEcology([
    { id: 'm1', provider: 'A', lineage: 'one-family' },
    { id: 'm2', provider: 'A', lineage: 'one-family' },
    { id: 'm3', provider: 'B', lineage: 'one-family' }
  ]);
  assert.equal(ecology.independentFailureLineages, 1);
  assert.match(ecology.epistemicBiodiversity, /^LOW__/);
});

test('immune verdict requires rebuild when evidence is contaminated', () => {
  const audit = auditEvidenceSet({
    claim: 'X',
    evidence: [
      { ref: 'e:1', lineage: 'l:1', direction: 'SUPPORTS', trainingContamination: true }
    ],
    selectionProcessDeclared: true
  });
  const verdict = immuneVerdict({ audit });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.status, 'CONCLUSION_REQUIRES_REBUILD_OR_INDEPENDENT_EVIDENCE');
  assert.equal(verdict.businessEffectAuthority, 'NONE');
});

test('live counterevidence cannot disappear from a conclusion that proceeds', () => {
  const audit = auditEvidenceSet({
    claim: 'X',
    evidence: [
      { ref: 'e:1', lineage: 'l:1', direction: 'SUPPORTS', counterevidenceSearched: true },
      { ref: 'e:2', lineage: 'l:2', direction: 'OPPOSES', counterevidenceSearched: true }
    ],
    selectionProcessDeclared: true
  });
  const verdict = immuneVerdict({ audit });
  assert.equal(verdict.status, 'CONCLUSION_MUST_PRESERVE_LIVE_COUNTEREVIDENCE');
  assert.equal(verdict.businessEffectAuthority, 'NONE');
});
