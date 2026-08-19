import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLabeledCandidates, classifyDatasetLabel, isCedarSubstitutionEligible, REAL_OPERATIONAL_SAMPLE_COUNT, HISTORICAL_OPERATIONAL_SAMPLE_COUNT } from '../src/omnia-v9/integrations/reality-shadow-dataset.mjs';
import { buildReplayScenarios } from '../src/omnia-v9/integrations/replay-scenarios.mjs';
import { runScenario } from '../src/omnia-v9/integrations/replay.mjs';
import { bindRealCedarAuthority } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';

test('classifyDatasetLabel marks only genuine forgery/tampering scenarios ADVERSARIAL, everything else SYNTHETIC', () => {
  assert.equal(classifyDatasetLabel('forged-signature-3'), 'ADVERSARIAL');
  assert.equal(classifyDatasetLabel('mutated-after-signing-0'), 'ADVERSARIAL');
  assert.equal(classifyDatasetLabel('evidence-tamper-5'), 'ADVERSARIAL');
  assert.equal(classifyDatasetLabel('inconsistent-evidence-1'), 'ADVERSARIAL');
  assert.equal(classifyDatasetLabel('authority-valid-0'), 'SYNTHETIC');
  assert.equal(classifyDatasetLabel('expiry-2'), 'SYNTHETIC');
  assert.equal(classifyDatasetLabel('tenant-mismatch-4'), 'SYNTHETIC');
});

test('real/historical operational sample counts are honestly zero in this environment, never inflated', () => {
  assert.equal(REAL_OPERATIONAL_SAMPLE_COUNT, 0);
  assert.equal(HISTORICAL_OPERATIONAL_SAMPLE_COUNT, 0);
});

test('buildLabeledCandidates preserves the full 188-scenario set and partitions it into exactly SYNTHETIC and ADVERSARIAL', () => {
  const candidates = buildLabeledCandidates({});
  assert.equal(candidates.length, 188);
  const byLabel = { SYNTHETIC: 0, ADVERSARIAL: 0 };
  for (const candidate of candidates) byLabel[candidate.datasetLabel] += 1;
  assert.equal(byLabel.SYNTHETIC, 162);
  assert.equal(byLabel.ADVERSARIAL, 26);
});

test('isCedarSubstitutionEligible excludes only policy and constitution categories', () => {
  assert.equal(isCedarSubstitutionEligible('policy'), false);
  assert.equal(isCedarSubstitutionEligible('constitution'), false);
  assert.equal(isCedarSubstitutionEligible('authority'), true);
  assert.equal(isCedarSubstitutionEligible('evidence-tampering'), true);
});

test('with a bound real Cedar authority, eligible candidates run through real Cedar and produce the exact same comparison category as the original stub replay', async () => {
  const realAuthority = await bindRealCedarAuthority();
  let realCedarInvocations = 0;
  const countingAuthority = {
    ...realAuthority,
    policyAuthorizer: (...args) => { realCedarInvocations += 1; return realAuthority.policyAuthorizer(...args); }
  };
  const original = buildReplayScenarios();
  const labeled = buildLabeledCandidates({ cedarAuthority: countingAuthority });
  assert.equal(labeled.length, original.length);

  let eligibleCount = 0;
  for (let i = 0; i < labeled.length; i += 1) {
    const candidate = labeled[i];
    const baseline = runScenario(original[i]);
    const underCedar = runScenario(candidate);
    assert.equal(underCedar.comparisonCategory, baseline.comparisonCategory,
      `scenario ${candidate.id}: real-Cedar substitution changed the decision from ${baseline.comparisonCategory} to ${underCedar.comparisonCategory}`);
    if (candidate.cedarEligible) eligibleCount += 1;
  }
  assert(eligibleCount > 150, 'expected the large majority of the 188 scenarios to be Cedar-substitution-eligible');
  assert(realCedarInvocations > 0, 'expected real Cedar to actually be invoked for at least the authority-valid happy-path scenarios');
});

test('regression: revocation scenarios genuinely exercise revocation (runScenario forwards revokedApprovalIds), never silently falling through to ALLOW', () => {
  const original = buildReplayScenarios();
  const revocationScenarios = original.filter(scenario => scenario.category === 'revocation');
  assert.equal(revocationScenarios.length, 8, 'the replay set is expected to carry exactly 8 revocation scenarios');
  for (const scenario of revocationScenarios) {
    const { admissionOptions } = scenario.build();
    assert(admissionOptions.revokedApprovalIds instanceof Set && admissionOptions.revokedApprovalIds.size > 0, `${scenario.id} must declare a non-empty revokedApprovalIds set`);
    const result = runScenario(scenario);
    assert.equal(result.comparisonCategory, 'V9_INCOMPLETE', `${scenario.id}: a revoked approval must never resolve to ALLOW -- runScenario must forward revokedApprovalIds to admitAction`);
  }
});
