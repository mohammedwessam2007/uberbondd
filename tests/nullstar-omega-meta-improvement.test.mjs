import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SYMPTOM_KINDS,
  EPISODE_EVIDENCE_CLASSES,
  evaluateSelectionEpisode,
  metaImprovementVerdict
} from '../src/nullstar-omega-meta-improvement.mjs';

const episode = (overrides = {}) => evaluateSelectionEpisode({
  generation: 'G0',
  successorGeneration: 'G1',
  bottleneckId: 'BN-EVAL-SATURATED',
  symptomKind: SYMPTOM_KINDS.INSTRUMENT_SATURATED,
  beforeVector: { reasoning: 1, calibration: 1, robustness: 1, selfDiagnosis: 1 },
  afterVector: { reasoning: 1, calibration: 1, robustness: 1, selfDiagnosis: 1, mathematics: 1, crossDomain: 1 },
  ...overrides
});

test('an unknown symptom kind is refused rather than guessed', () => {
  const result = episode({ symptomKind: 'FEELS_STUCK' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('known-symptom-kind-required'));
});

test('widening a saturated instrument does not resolve saturation', () => {
  const result = episode();
  assert.equal(result.status, 'MOVED_ELSEWHERE');
  assert.equal(result.beforeSpread, 0);
  assert.equal(result.afterSpread, 0);
  assert.equal(result.afterCoverage, 6);
  assert.match(result.why, /not the same as the instrument separating/);
});

test('saturation resolves only when the measured scores separate', () => {
  const result = episode({
    afterVector: { reasoning: 1, calibration: 0.4, robustness: 1, selfDiagnosis: 0.7 }
  });
  assert.equal(result.status, 'SYMPTOM_RESOLVED');
  assert.ok(result.afterSpread > 0);
});

test('a symptom that neither resolved nor shifted anything is persistence', () => {
  const result = episode({
    afterVector: { reasoning: 1, calibration: 1, robustness: 1, selfDiagnosis: 1 }
  });
  assert.equal(result.status, 'SYMPTOM_PERSISTED');
});

test('coverage symptoms resolve on coverage, not on separation', () => {
  const grew = episode({
    symptomKind: SYMPTOM_KINDS.COVERAGE_INSUFFICIENT
  });
  assert.equal(grew.status, 'SYMPTOM_RESOLVED');

  const flat = episode({
    symptomKind: SYMPTOM_KINDS.COVERAGE_INSUFFICIENT,
    afterVector: { reasoning: 1, calibration: 0.2, robustness: 1, selfDiagnosis: 1 }
  });
  assert.equal(flat.status, 'MOVED_ELSEWHERE');
});

test('a successor that measured nothing leaves the symptom untested', () => {
  const result = episode({ afterVector: { reasoning: null, calibration: null } });
  assert.equal(result.status, 'SYMPTOM_UNTESTED');
});

test('one episode never establishes meta-improvement', () => {
  const verdict = metaImprovementVerdict([episode()]);
  assert.equal(verdict.status, 'META_IMPROVEMENT_NOT_ESTABLISHED');
  assert.equal(verdict.reason, 'fewer-than-two-completed-selection-episodes');
});

test('every symptom persisting is a working verdict about a process that is not', () => {
  const persisted = episode({ afterVector: { reasoning: 1, calibration: 1, robustness: 1, selfDiagnosis: 1 } });
  const verdict = metaImprovementVerdict([persisted, { ...persisted, generation: 'G1', successorGeneration: 'G2' }]);
  assert.equal(verdict.status, 'IMPROVEMENT_PROCESS_NOT_WORKING');
  assert.equal(verdict.persisted, 2);
  assert.equal(verdict.resolved, 0);
});

test('retrospective resolutions cannot establish a working process', () => {
  const resolvedRow = episode({
    afterVector: { reasoning: 1, calibration: 0.3, robustness: 0.8, selfDiagnosis: 1 },
    evidenceClass: EPISODE_EVIDENCE_CLASSES.RETROSPECTIVE_RECONSTRUCTION
  });
  const verdict = metaImprovementVerdict([resolvedRow, { ...resolvedRow, generation: 'G1', successorGeneration: 'G2' }]);
  assert.equal(verdict.status, 'META_IMPROVEMENT_NOT_ESTABLISHED');
  assert.equal(verdict.resolved, 2);
  assert.match(verdict.reason, /prospective/);
});

test('two prospective resolutions establish a working process', () => {
  const resolvedRow = episode({
    afterVector: { reasoning: 1, calibration: 0.3, robustness: 0.8, selfDiagnosis: 1 },
    evidenceClass: EPISODE_EVIDENCE_CLASSES.PROSPECTIVE
  });
  const verdict = metaImprovementVerdict([resolvedRow, { ...resolvedRow, generation: 'G1', successorGeneration: 'G2' }]);
  assert.equal(verdict.status, 'IMPROVEMENT_PROCESS_WORKING');
  assert.equal(verdict.prospectiveEpisodes, 2);
});

test('a mix where persistence outweighs resolution does not pass even when prospective', () => {
  const resolvedRow = episode({
    afterVector: { reasoning: 1, calibration: 0.3, robustness: 0.8, selfDiagnosis: 1 },
    evidenceClass: EPISODE_EVIDENCE_CLASSES.PROSPECTIVE
  });
  const persistedRow = episode({
    afterVector: { reasoning: 1, calibration: 1, robustness: 1, selfDiagnosis: 1 },
    evidenceClass: EPISODE_EVIDENCE_CLASSES.PROSPECTIVE
  });
  const verdict = metaImprovementVerdict([resolvedRow, persistedRow, { ...persistedRow, generation: 'G1' }]);
  assert.equal(verdict.status, 'META_IMPROVEMENT_NOT_ESTABLISHED');
  assert.equal(verdict.persisted, 2);
  assert.equal(verdict.resolved, 1);
});

test('movement in an unnamed dimension does not rescue an unresolved symptom', () => {
  // The live case: G4->G5 held coverage flat, so the named symptom did not
  // resolve, but a later generation recomputed one of its own scores and the
  // mean moved. That made the episode MOVED_ELSEWHERE, and before this rule the
  // verdict climbed back to working on that bookkeeping change alone.
  const resolvedRow = episode({
    afterVector: { reasoning: 1, calibration: 0.3, robustness: 0.8, selfDiagnosis: 1 },
    evidenceClass: EPISODE_EVIDENCE_CLASSES.PROSPECTIVE
  });
  const movedElsewhere = episode({
    symptomKind: SYMPTOM_KINDS.COVERAGE_INSUFFICIENT,
    beforeVector: { reasoning: 1, calibration: 1, robustness: 1, selfDiagnosis: 1 },
    afterVector: { reasoning: 1, calibration: 1, robustness: 1, selfDiagnosis: 0.5 },
    evidenceClass: EPISODE_EVIDENCE_CLASSES.PROSPECTIVE
  });
  assert.equal(movedElsewhere.status, 'MOVED_ELSEWHERE');

  const verdict = metaImprovementVerdict([
    resolvedRow,
    { ...resolvedRow, generation: 'G1' },
    movedElsewhere,
    { ...movedElsewhere, generation: 'G3' }
  ]);
  assert.equal(verdict.status, 'META_IMPROVEMENT_NOT_ESTABLISHED');
  assert.equal(verdict.resolved, 2);
  assert.equal(verdict.unresolved, 2);
  assert.match(verdict.reason, /non-resolutions/);
});

test('resolutions must outnumber every non-resolution, not just persistences', () => {
  const resolvedRow = episode({
    afterVector: { reasoning: 1, calibration: 0.3, robustness: 0.8, selfDiagnosis: 1 },
    evidenceClass: EPISODE_EVIDENCE_CLASSES.PROSPECTIVE
  });
  const three = metaImprovementVerdict([
    resolvedRow,
    { ...resolvedRow, generation: 'G1' },
    { ...resolvedRow, generation: 'G2' },
    episode({
      symptomKind: SYMPTOM_KINDS.COVERAGE_INSUFFICIENT,
      beforeVector: { a: 1, b: 1 },
      afterVector: { a: 1, b: 0.5 },
      evidenceClass: EPISODE_EVIDENCE_CLASSES.PROSPECTIVE
    })
  ]);
  assert.equal(three.status, 'IMPROVEMENT_PROCESS_WORKING');
  assert.equal(three.resolved, 3);
  assert.equal(three.unresolved, 1);
});
