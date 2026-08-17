import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileBusinessGenome, scoreOpportunity, rankOpportunities, nextPromotionStage,
  incrementalBuildDistance, logOpportunityEvaluation, TOURNAMENT_CRITERIA_LIST,
  OPPORTUNITY_REGISTRY_POLICY_VERSION, PROMOTION_LADDER_STAGES
} from '../src/opportunity-registry.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

function verified(value) { return { value, claimType: 'VERIFIED_FACT' }; }
function hypothesis(value) { return { value, claimType: 'HYPOTHESIS' }; }

function strongCandidate(overrides = {}) {
  return {
    id: 'cand-strong', name: 'Agent Readiness Audit', category: 'agentic-commerce',
    timeToCashDays: verified(1), recurringTrigger: verified(true), retention: verified(85),
    grossMargin: verified(90), automationPotential: verified(95), founderBurden: verified(10),
    acquisition: verified('proven'), partnerLeverage: verified('moderate'), dataAsset: verified('some'),
    platformDependency: verified('low'), capital: verified('none'), moat: verified('moderate'),
    aiResilience: verified('resilient'), scale: verified('global'), acquisitionValue: verified('medium'),
    founderOwnershipRetainedPercent: verified(100),
    ...overrides
  };
}

test('malformed candidate (missing id) is denied cleanly, never throws', () => {
  const result = scoreOpportunity({ candidate: { name: 'no id' }, date: monday });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'malformed-input-candidate');
});

test('null candidate is denied cleanly', () => {
  const result = scoreOpportunity({ candidate: null, date: monday });
  assert.equal(result.ok, false);
});

test('a fully evidenced candidate scores high with high confidence', () => {
  const result = scoreOpportunity({ candidate: strongCandidate(), date: monday });
  assert.equal(result.ok, true);
  assert.ok(result.compositeScore > 70, `expected >70, got ${result.compositeScore}`);
  assert.ok(result.confidence > 0.8, `expected >0.8, got ${result.confidence}`);
  assert.equal(result.dataSufficiency, 'STRONG');
  assert.equal(result.missingCriteria.length, 0);
  assert.equal(result.policyVersion, OPPORTUNITY_REGISTRY_POLICY_VERSION);
});

test('a bare candidate with only an id scores zero, not a fabricated neutral guess', () => {
  const result = scoreOpportunity({ candidate: { id: 'empty' }, date: monday });
  assert.equal(result.compositeScore, 0);
  assert.equal(result.dataSufficiency, 'INSUFFICIENT');
  assert.equal(result.missingCriteria.length, TOURNAMENT_CRITERIA_LIST.length);
});

test('untagged (bare primitive) values are treated as UNRESOLVED and depress confidence', () => {
  const bareValues = strongCandidate();
  for (const key of Object.keys(bareValues)) {
    if (typeof bareValues[key] === 'object' && bareValues[key] !== null && 'value' in bareValues[key]) {
      bareValues[key] = bareValues[key].value;
    }
  }
  const tagged = scoreOpportunity({ candidate: strongCandidate(), date: monday });
  const untagged = scoreOpportunity({ candidate: bareValues, date: monday });
  assert.equal(tagged.compositeScore, untagged.compositeScore, 'composite score must not depend on evidence tagging');
  assert.ok(untagged.confidence < tagged.confidence, 'untagged evidence must reduce confidence');
});

test('weak-evidence (HYPOTHESIS) claims never count as strong evidence for confidence', () => {
  const weak = strongCandidate();
  for (const key of Object.keys(weak)) {
    if (typeof weak[key] === 'object' && weak[key] !== null && 'claimType' in weak[key]) weak[key].claimType = 'HYPOTHESIS';
  }
  const result = scoreOpportunity({ candidate: weak, date: monday });
  assert.equal(result.confidence, 0);
});

test('enum fields are matched case-insensitively', () => {
  const candidate = strongCandidate({ moat: verified('STRONG') });
  const result = scoreOpportunity({ candidate, date: monday });
  assert.equal(result.breakdown.defensibility.score, 100);
});

test('an unrecognized enum value is reported as missing, not guessed', () => {
  const candidate = strongCandidate({ moat: verified('unheard-of-value') });
  const result = scoreOpportunity({ candidate, date: monday });
  assert.equal(result.breakdown.defensibility.score, null);
  assert.ok(result.missingCriteria.includes('defensibility'));
});

test('founderBurden is inverted into founderFreedom', () => {
  const lowBurden = scoreOpportunity({ candidate: strongCandidate({ founderBurden: verified(5) }), date: monday });
  const highBurden = scoreOpportunity({ candidate: strongCandidate({ founderBurden: verified(95) }), date: monday });
  assert.ok(lowBurden.breakdown.founderFreedom.score > highBurden.breakdown.founderFreedom.score);
});

test('recurringTrigger present with no retention data still contributes a conservative fallback, not a fabricated high score', () => {
  const candidate = strongCandidate({ retention: undefined });
  const result = scoreOpportunity({ candidate, date: monday });
  assert.equal(result.breakdown.recurringRevenue.score, 40);
});

test('retention present with no recurringTrigger is discounted by half', () => {
  const candidate = strongCandidate({ recurringTrigger: undefined, retention: verified(80) });
  const result = scoreOpportunity({ candidate, date: monday });
  assert.equal(result.breakdown.recurringRevenue.score, 40);
});

test('neither recurringTrigger nor retention leaves the criterion genuinely missing', () => {
  const candidate = strongCandidate({ recurringTrigger: undefined, retention: undefined });
  const result = scoreOpportunity({ candidate, date: monday });
  assert.equal(result.breakdown.recurringRevenue.score, null);
  assert.ok(result.missingCriteria.includes('recurringRevenue'));
});

test('candidates missing more than half the criteria are flagged INSUFFICIENT', () => {
  const candidate = { id: 'sparse', timeToCashDays: verified(2), grossMargin: verified(80) };
  const result = scoreOpportunity({ candidate, date: monday });
  assert.equal(result.dataSufficiency, 'INSUFFICIENT');
});

test('rankOpportunities orders strongest evidence and highest score first, deterministically', () => {
  const weak = strongCandidate({ id: 'cand-weak', grossMargin: verified(20), automationPotential: verified(20) });
  const strong = strongCandidate({ id: 'cand-strong-2' });
  const results = rankOpportunities([weak, strong], { date: monday });
  assert.equal(results[0].id, 'cand-strong-2');
  assert.equal(results[1].id, 'cand-weak');
});

test('rankOpportunities breaks exact ties by id ascending', () => {
  const a = strongCandidate({ id: 'b-candidate' });
  const b = strongCandidate({ id: 'a-candidate' });
  const results = rankOpportunities([a, b], { date: monday });
  assert.equal(results[0].id, 'a-candidate');
  assert.equal(results[1].id, 'b-candidate');
});

test('rankOpportunities silently drops malformed candidates rather than throwing', () => {
  const results = rankOpportunities([{ name: 'no id' }, strongCandidate()], { date: monday });
  assert.equal(results.length, 1);
});

test('the promotion ladder cannot skip a stage', () => {
  const result = nextPromotionStage('DISCOVERED', { gatePassed: true });
  assert.equal(result.stage, 'EVIDENCED');
  assert.equal(result.advanced, true);
});

test('the promotion ladder does not advance without an explicit gate pass', () => {
  const result = nextPromotionStage('DISCOVERED', { gatePassed: false });
  assert.equal(result.stage, 'DISCOVERED');
  assert.equal(result.advanced, false);
});

test('the promotion ladder rejects an unknown stage name', () => {
  const result = nextPromotionStage('MADE_UP_STAGE', { gatePassed: true });
  assert.equal(result.ok, false);
});

test('PROMOTED is a terminal stage', () => {
  const result = nextPromotionStage('PROMOTED', { gatePassed: true });
  assert.equal(result.stage, 'PROMOTED');
  assert.equal(result.advanced, false);
  assert.equal(result.reason, 'already-terminal');
});

test('every declared promotion stage round-trips through nextPromotionStage without throwing', () => {
  for (const stage of PROMOTION_LADDER_STAGES) {
    assert.doesNotThrow(() => nextPromotionStage(stage, { gatePassed: true }));
  }
});

test('incrementalBuildDistance is zero when every required capability already exists', () => {
  const result = incrementalBuildDistance(['evidence-capture', 'scoring'], ['evidence-capture', 'scoring', 'payments']);
  assert.equal(result.distance, 0);
  assert.deepEqual(result.missing, []);
});

test('incrementalBuildDistance is one when nothing required already exists', () => {
  const result = incrementalBuildDistance(['brand-new-thing'], ['evidence-capture']);
  assert.equal(result.distance, 1);
});

test('incrementalBuildDistance with no required capabilities is trivially zero', () => {
  const result = incrementalBuildDistance([], ['evidence-capture']);
  assert.equal(result.distance, 0);
});

test('compileBusinessGenome reports completeness honestly for a partial candidate', () => {
  const genome = compileBusinessGenome({ id: 'partial', buyer: verified('SMB clinics'), price: verified(49) });
  assert.equal(genome.ok, true);
  assert.ok(genome.completeness > 0 && genome.completeness < 100);
});

test('compileBusinessGenome denies malformed input cleanly', () => {
  const genome = compileBusinessGenome({ name: 'no id' });
  assert.equal(genome.ok, false);
});

test('logOpportunityEvaluation never throws on a malformed store', async () => {
  const result = scoreOpportunity({ candidate: strongCandidate(), date: monday });
  const outcome = await logOpportunityEvaluation(null, result);
  assert.equal(outcome, null);
});

test('logOpportunityEvaluation writes through the existing auditLog writer, not a parallel store', async () => {
  const calls = [];
  const store = { log: async (type, detail) => { calls.push({ type, detail }); return { id: 'log-1' }; } };
  const result = scoreOpportunity({ candidate: strongCandidate(), date: monday });
  await logOpportunityEvaluation(store, result);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'opportunity_evaluation');
  assert.equal(calls[0].detail.id, 'cand-strong');
});

test('logOpportunityEvaluation does not log a failed scoring result', async () => {
  const calls = [];
  const store = { log: async (type, detail) => { calls.push({ type, detail }); } };
  await logOpportunityEvaluation(store, { ok: false, reason: 'malformed-input-candidate' });
  assert.equal(calls.length, 0);
});

test('the same reference date produces a byte-identical score for identical input', () => {
  const a = scoreOpportunity({ candidate: strongCandidate(), date: monday });
  const b = scoreOpportunity({ candidate: strongCandidate(), date: monday });
  assert.deepEqual(a, b);
});

test('custom weights are honored and still normalize the composite score', () => {
  const weights = Object.fromEntries(TOURNAMENT_CRITERIA_LIST.map(key => [key, key === 'grossMargin' ? 1 : 0]));
  const highMargin = scoreOpportunity({ candidate: strongCandidate({ grossMargin: verified(100) }), weights, date: monday });
  const lowMargin = scoreOpportunity({ candidate: strongCandidate({ grossMargin: verified(0) }), weights, date: monday });
  assert.ok(highMargin.compositeScore > lowMargin.compositeScore);
});

test('the module never performs I/O of its own (pure, deterministic, no network/file calls)', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../src/opportunity-registry.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile|writeFile/);
});
