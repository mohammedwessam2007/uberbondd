import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseSyntheticJourney } from '../../src/overnight/journey/diagnosis.mjs';
import { EFFECT_STATES, ZERO_EXTERNAL_EFFECTS } from '../../src/effect-ledgers.mjs';
import { diagnostic, observation, TEST_DATE } from './fixtures.mjs';

test('diagnosis produces evidence-bound findings without claiming business impact', () => {
  const result = diagnostic({ statusByType: { CRM_RECEIPT: 'FAIL' } });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ACTIONABLE_FINDINGS_PRESENT');
  assert.ok(result.findings.length >= 1);
  for (const finding of result.findings) {
    assert.equal(finding.statement.relation, 'DERIVED');
    assert.ok(finding.statement.evidenceRefs.length >= 2);
    assert.equal(finding.scope, 'THIS_SYNTHETIC_RUN_ONLY');
    assert.equal(finding.customerImpact.status, 'NOT_MEASURED');
    assert.equal(finding.customerImpact.revenueImpact, 'NOT_MEASURED');
    assert.equal(finding.customerImpact.conversionImpact, 'NOT_MEASURED');
  }
  assert.equal(result.evidenceBoundary.customerStatus, 'UNVERIFIED');
  assert.equal(result.evidenceBoundary.revenueOutcome, 'NOT_MEASURED');
  assert.deepEqual(result.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
  assert.equal(result.effectState, EFFECT_STATES.ZERO_EFFECT);
});

test('a fully passing run reports only what it observed and does not manufacture an opportunity', () => {
  const result = diagnostic();
  assert.equal(result.ok, true);
  assert.equal(result.status, 'NO_FAILURE_OBSERVED_IN_THIS_RUN');
  assert.deepEqual(result.findings, []);
  assert.match(result.summary.statement, /No failed or incomplete step was observed/);
});

test('inferences and predictions remain separately typed internal hypotheses', () => {
  const result = diagnostic({
    statusByType: { CRM_RECEIPT: 'FAIL' },
    reasoning: {
      inferences: [{
        statement: 'The handoff may be delayed or unavailable.',
        evidenceRefs: ['witness:crm_receipt'],
        inferenceBasis: 'failed CRM receipt in the synthetic run',
        confidence: 0.4
      }],
      predictions: [{
        statement: 'The break could reduce future conversion if it exists in production.',
        evidenceRefs: ['witness:crm_receipt'],
        modelRef: 'model:journey-risk:v1',
        confidence: 0.2
      }]
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.internalInferences[0].relation, 'INFERRED');
  assert.equal(result.internalPredictions[0].relation, 'PREDICTED');
  assert.equal(result.internalPredictions[0].externallyClaimable, false);
  assert.equal(result.findings.every(finding => finding.statement.relation === 'DERIVED'), true);
});

test('invalid reasoning cannot smuggle a prediction without a model reference', () => {
  const observed = observation({ statusByType: { CRM_RECEIPT: 'FAIL' } });
  const result = diagnoseSyntheticJourney({
    observation: observed,
    reasoning: { predictions: [{ statement: 'Revenue will fall.', evidenceRefs: ['witness:crm_receipt'] }] },
    date: TEST_DATE
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.some(code => code.includes('prediction-model-required')));
});

test('diagnosis refuses a tampered or non-zero observation receipt', () => {
  const observed = observation({ statusByType: { CRM_RECEIPT: 'FAIL' } });
  const tampered = { ...observed, externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS, messages: 1 } };
  const result = diagnoseSyntheticJourney({ observation: tampered, date: TEST_DATE });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('diagnostic-requires-proven-zero-effect'));
});

