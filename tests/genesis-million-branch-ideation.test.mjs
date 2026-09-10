import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MILLION_BRANCH_DOMAIN_COUNT,
  MILLION_BRANCH_GENERATOR_COUNT,
  MILLION_BRANCH_OPERATOR_COUNT,
  buildIdeationActivationPlan,
  buildMillionBranchIdeationGenome,
  projectIdeationBranching,
  validateMillionBranchIdeationGenome
} from '../src/million-branch-ideation-genome.mjs';

test('million-branch genome materializes exactly 20 x 50 = 1000 unique generators', () => {
  const health = validateMillionBranchIdeationGenome();
  assert.equal(health.ok, true, JSON.stringify(health.reasonCodes));
  assert.equal(health.domainCount, MILLION_BRANCH_DOMAIN_COUNT);
  assert.equal(health.operatorCount, MILLION_BRANCH_OPERATOR_COUNT);
  assert.equal(health.generatorCount, MILLION_BRANCH_GENERATOR_COUNT);
  const generators = buildMillionBranchIdeationGenome();
  assert.equal(generators.length, 1000);
  assert.equal(new Set(generators.map(item => item.key)).size, 1000);
  assert.equal(new Set(generators.map(item => item.prompt.toLowerCase())).size, 1000);
  assert.deepEqual(generators.map(item => item.id), Array.from({ length: 1000 }, (_, index) => index + 1));
});

test('activation is deterministic, bounded and never creates external authority', () => {
  const input = {
    context: 'A new neuroengineering interface makes silent intent sensing cheaper.',
    affectedDomains: ['neuroengineering'],
    maxGenerators: 12,
    candidateBudgetPerGenerator: 50,
    seed: 'frontier-signal-42'
  };
  const first = buildIdeationActivationPlan(input);
  const second = buildIdeationActivationPlan(input);
  assert.equal(first.ok, true);
  assert.deepEqual(first.selectedGenerators, second.selectedGenerators);
  assert.equal(first.selectedGeneratorCount, 12);
  assert.equal(first.selectedFirstGenerationCapacity, 600);
  assert.equal(first.wholeGenomeFirstGenerationCapacity, 50000);
  assert.ok(first.selectedGenerators.every(item => item.domainId === 'neuroengineering-human-ai-symbiosis'));
  assert.equal(first.businessEffectAuthority, 'NONE');
  assert.equal(first.externalEffectAuthority, 'NONE');
  assert.equal(first.externalEffectLedger.providerCalls, 0);
  assert.match(first.claimBoundary, /HYPOTHESES_NOT_FACTS/);
});

test('activation fails closed on unbounded generation requests', () => {
  const invalid = buildIdeationActivationPlan({ context: 'test', maxGenerators: 1000, candidateBudgetPerGenerator: 1000 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.businessEffectAuthority, 'NONE');
  assert.equal(invalid.externalEffectAuthority, 'NONE');
  assert.ok(invalid.reasonCodes.includes('bounded-max-generators-required'));
  assert.ok(invalid.reasonCodes.includes('bounded-candidate-budget-required'));
});

test('branch projection exposes search-space arithmetic without pretending branches were executed', () => {
  const projection = projectIdeationBranching({ activeGenerators: 1000, candidatesPerGenerator: 50, survivorPercent: 10, descendantsPerSurvivor: 20, generations: 2 });
  assert.equal(projection.ok, true);
  assert.deepEqual(projection.generationCounts, [50000, 100000]);
  assert.equal(projection.totalCandidateNodes, 150000);
  assert.match(projection.claimBoundary, /NOT_EXECUTED_IDEAS_OR_DISCOVERIES/);
});
