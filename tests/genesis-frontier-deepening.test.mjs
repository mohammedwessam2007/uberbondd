import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateCounterfactualCivilization, formRealityTheories, assessCausalWitness } from '../src/genesis-scientist-deepening.mjs';
import { coevolveEvaluatorEcology, generateFutureRivals, evolveGenesisPolicies } from '../src/genesis-evolution-deepening.mjs';
import { inventBoundedLanguage, compileEconomicDsl, compileCompanyGenomeLanguage } from '../src/genesis-ontology-deepening.mjs';

function zeroAuthority(result) {
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.equal(result.businessEffectAuthority, 'NONE');
}

test('counterfactual civilization executes bounded multi-step dynamics and remains synthetic', () => {
  const result = simulateCounterfactualCivilization({ initialState: { compute: 1, output: 0 }, rules: [{ source: 'compute', target: 'output', coefficient: 2 }], steps: 3, interventions: { 2: { compute: 2 } } });
  assert.equal(result.ok, true); assert.equal(result.timeline.length, 4); assert.equal(result.timeline.at(-1).state.output, 8); assert.equal(result.evidenceClass, 'SYNTHETIC_COUNTERFACTUAL'); zeroAuthority(result);
});

test('reality theory formation requires evidence-backed observations', () => {
  const bad = formRealityTheories({ observations: [{ id: 'o1', summary: 'x' }], candidateMechanisms: [{ id: 'm1', statement: 'x', predicts: ['o1'] }] });
  assert.equal(bad.ok, false);
  const good = formRealityTheories({ observations: [{ id: 'o1', summary: 'conversion rose', evidenceRefs: ['evidence:trial-1'] }], candidateMechanisms: [{ id: 'm1', statement: 'lower friction increases conversion', predicts: ['o1'] }] });
  assert.equal(good.ok, true); assert.deepEqual(good.theories[0].coveredObservationIds, ['o1']); zeroAuthority(good);
});

test('causal witness distinguishes stronger designs without claiming automatic causality', () => {
  const result = assessCausalWitness({ cause: 'offer', effect: 'conversion', temporalOrder: true, alternativeExplanations: [], intervention: { design: 'RANDOMIZED', controlGroup: true, preRegistered: true }, evidenceRefs: ['experiment:ab-1'] });
  assert.equal(result.ok, true); assert.equal(result.witnessClass, 'STRONG_DESIGN_WITNESS'); assert.match(result.claimBoundary, /NOT_AUTOMATIC_CAUSAL_PROOF/); zeroAuthority(result);
});

test('evaluator ecology co-evolves for multiple rounds without promotion authority', () => {
  const result = coevolveEvaluatorEcology({ hypotheses: [{ id: 'a', targetRank: 0, features: { evidence: 10, novelty: 1 } }, { id: 'b', targetRank: 1, features: { evidence: 1, novelty: 10 } }], evaluators: [{ id: 'e1', weights: { evidence: 0.8, novelty: 0.2 } }, { id: 'e2', weights: { evidence: 0.2, novelty: 0.8 } }], rounds: 4 });
  assert.equal(result.ok, true); assert.equal(result.history.length, 4); assert.equal(result.promotionAuthority, 'NONE'); zeroAuthority(result);
});

test('future rival generator emits explicit architecture challengers only', () => {
  const result = generateFutureRivals({ baseline: { router: 'current' }, changedPrimitives: [{ id: 'local-model' }], assumptions: [{ id: 'cloud-required', statement: 'cloud model required' }] });
  assert.equal(result.ok, true); assert.equal(result.rivals.length, 1); assert.equal(result.rivals[0].architecture.status, 'SYNTHETIC_RIVAL_BLUEPRINT'); assert.equal(result.implementationAuthority, 'NONE'); zeroAuthority(result);
});

test('GENESIS policy population evolves over multiple generations but cannot self-promote', () => {
  const result = evolveGenesisPolicies({ seedPolicies: [{ id: 'p1', weights: { value: 0.5, risk: -0.5 } }], benchmarkCases: [{ winnerId: 'a', candidates: [{ id: 'a', features: { value: 10, risk: 1 } }, { id: 'b', features: { value: 1, risk: 10 } }] }], generations: 5 });
  assert.equal(result.ok, true); assert.equal(result.generations.length, 5); assert.equal(result.promotionAuthority, 'NONE'); zeroAuthority(result);
});

test('language invention creates collision-safe bounded grammar without code execution', () => {
  const result = inventBoundedLanguage({ namespace: 'econ', concepts: [{ id: 'buyer' }, { id: 'buyer!' }, { id: 'value' }], relations: [{ from: 'buyer', relation: 'SEEKS', to: 'value' }] });
  assert.equal(result.ok, true); assert.equal(new Set(result.symbols.map(row => row.token)).size, result.symbols.length); assert.equal(result.executionAuthority, 'NONE'); zeroAuthority(result);
});

test('economic DSL compiles explicit entities flows constraints and objectives', () => {
  const result = compileEconomicDsl({ entities: [{ id: 'buyer', kind: 'ACTOR' }, { id: 'cash', kind: 'RESOURCE' }, { id: 'outcome', kind: 'OUTCOME' }], flows: [{ from: 'buyer', to: 'outcome', resource: 'cash', rate: 10 }], constraints: [{ id: 'c1', expression: 'cash >= 0', evidenceRefs: ['evidence:budget'] }], objectives: [{ id: 'o1', metric: 'outcome', direction: 'MAXIMIZE', weight: 1 }] });
  assert.equal(result.ok, true); assert.equal(result.ast.flows.length, 1); assert.equal(result.ast.objectives.length, 1); zeroAuthority(result);
});

test('company genome language validates full company semantics and reports missing capability dependencies', () => {
  const result = compileCompanyGenomeLanguage({ company: { id: 'x', buyer: 'agency', problem: 'leakage', mechanism: 'audit', value: 'recovered revenue', distribution: 'partner', revenue: 'retainer', delivery: 'evidence packet', capabilities: ['audit'], dependencies: [{ from: 'audit', to: 'reconcile', kind: 'REQUIRES' }] } });
  assert.equal(result.ok, true); assert.equal(result.status, 'COMPANY_GENOME_COMPILED_WITH_GAPS'); assert.equal(result.ast.unresolvedDependencies.length, 1); zeroAuthority(result);
});

test('all deepening compilers fail closed on malformed or unbounded inputs', () => {
  assert.equal(simulateCounterfactualCivilization({ steps: 0 }).ok, false);
  assert.equal(coevolveEvaluatorEcology({ rounds: 0 }).ok, false);
  assert.equal(inventBoundedLanguage({ concepts: [] }).ok, false);
  assert.equal(compileEconomicDsl({ entities: [] }).ok, false);
  assert.equal(compileCompanyGenomeLanguage({ company: {} }).ok, false);
});
