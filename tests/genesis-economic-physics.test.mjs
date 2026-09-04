import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeAbundanceConsequence,
  analyzeFrictionConservation,
  buildTransactionCostAtlas,
  buildUniversalSurplusGraph,
  calculateBottleneckCentrality,
  compileBuyerMentalModel,
  compileSymbiosis,
  detectDemandPhaseChange,
  detectEconomicPhaseChange,
  detectHiddenComplements,
  detectInvisibleSubsidy,
  detectMarketBoundary,
  detectMarginMigration,
  detectPainToBudgetTransition,
  detectScarcityMigration,
  estimateConstraintShadowPrice,
  findEcosystemKeystones,
  generateCategoryCandidate,
  generateCategoryVocabulary,
  invertConstraint,
  mapCoordinationEntropy,
  mapIncentiveFractures,
  mapValueChainPhases,
  mineFrontierResidue,
  modelPreferenceFormation,
  modelProblemFormation,
  propagateZeroMarginalCostShockwave,
  rankNegativeResultArbitrage,
  scanTrustFriction,
  simulateMarketCreation,
  telescopeDeadweightLoss,
  telescopeNonConsumption,
  tomographValueLeakage
} from '../src/genesis-economic-physics.mjs';

test('deadweight loss and transaction-cost instruments preserve estimation boundaries', () => {
  const loss = telescopeDeadweightLoss({ transactions: [
    { id: 'a', willingnessToPay: 100, cost: 50, completed: true, frictionCost: 10 },
    { id: 'b', willingnessToPay: 120, cost: 60, completed: false, frictionCost: 5 }
  ] });
  assert.equal(loss.ok, true);
  assert.equal(loss.potentialSurplus, 110);
  assert.equal(loss.realizedSurplus, 40);
  assert.equal(loss.deadweightLoss, 70);
  assert.match(loss.claimBoundary, /NOT_WELFARE_OR_CAUSAL_PROOF/);
  const atlas = buildTransactionCostAtlas({ stages: [{ id: 'sales', moneyCost: 10, minutes: 20, failureProbability: .2, coordinationTouches: 2 }, { id: 'delivery', moneyCost: 5, minutes: 5, failureProbability: .05, coordinationTouches: 1 }] });
  assert.equal(atlas.ok, true);
  assert.equal(atlas.stages[0].id, 'sales');
});

test('trust, coordination and incentive instruments measure structure without inferring intent', () => {
  const trust = scanTrustFriction({ signals: [{ id: 'x', evidenceStrength: 20, reversibility: 20, reputation: 20, stakes: 90, ambiguity: 90 }] });
  assert.equal(trust.ok, true);
  assert.ok(trust.rows[0].friction > 50);
  const entropy = mapCoordinationEntropy({ actors: ['a','b','c'], handoffs: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'a', to: 'c' }] });
  assert.equal(entropy.ok, true);
  assert.ok(entropy.normalizedEntropy > 0);
  const fractures = mapIncentiveFractures({ actors: [{ id: 'sales', reward: 'book revenue', metric: 'signed', externalities: ['refund'] }, { id: 'support', reward: 'reduce refund', metric: 'retention', externalities: [] }] });
  assert.equal(fractures.ok, true);
  assert.ok(fractures.fractures.length > 0);
  assert.match(fractures.claimBoundary, /NOT_INTENT_ATTRIBUTION/);
});

test('margin, invisible subsidy and leakage instruments expose hidden economic drag', () => {
  const margin = detectMarginMigration({ periods: [{ id: 'p1', revenue: 100, variableCost: 40, providerCost: 10 }, { id: 'p2', revenue: 100, variableCost: 55, providerCost: 15 }] });
  assert.equal(margin.ok, true);
  assert.ok(margin.changes[0].marginDeltaPct < 0);
  const subsidy = detectInvisibleSubsidy({ components: [{ id: 'founder-labor', marketCost: 50, paidCost: 0, founderMinutes: 60, founderMinuteValue: 1 }] });
  assert.equal(subsidy.totalSubsidy, 110);
  const leakage = tomographValueLeakage({ stages: [{ id: 'demand', value: 100 }, { id: 'lead', value: 80 }, { id: 'payment', value: 30 }] });
  assert.equal(leakage.totalLeakage, 70);
});

test('market boundary and phase-change detectors refuse legal or causal overclaim', () => {
  const boundary = detectMarketBoundary({ buyers: ['b1','b2'], sellers: ['s1','s2'], edges: [{ buyer: 'b1', seller: 's1' }] });
  assert.equal(boundary.ok, true);
  assert.deepEqual(boundary.isolatedBuyers, ['b2']);
  assert.match(boundary.claimBoundary, /LEGAL_OR_COMPETITION/);
  const phase = detectEconomicPhaseChange({ series: [{ id: 'a', value: 10 }, { id: 'b', value: 10 }, { id: 'c', value: 30 }], threshold: .5, minWindow: 2 });
  assert.equal(phase.status, 'ECONOMIC_PHASE_CHANGE_DETECTED');
});

test('symbiosis, keystone and complement primitives remain structural hypotheses', () => {
  const sym = compileSymbiosis({ entities: [{ id: 'a', provides: ['leads'], needs: ['delivery'] }, { id: 'b', provides: ['delivery'], needs: ['leads'] }] });
  assert.equal(sym.pairs.length, 1);
  const key = findEcosystemKeystones({ nodes: ['a','b','c'], edges: [{ from: 'a', to: 'b' }, { from: 'c', to: 'b' }, { from: 'b', to: 'a' }] });
  assert.equal(key.ranked[0].id, 'b');
  const comp = detectHiddenComplements({ products: [{ id: 'a', enables: ['identity'], requires: [] }, { id: 'b', enables: [], requires: ['identity'] }] });
  assert.equal(comp.pairs.length, 1);
  assert.match(comp.claimBoundary, /NOT_BUNDLING_OR_CROSS_SELL_PROOF/);
});

test('category genesis and vocabulary create candidate language only', () => {
  const category = generateCategoryCandidate({ pain: 'cleared-payment uncertainty', mechanism: 'evidence reconciliation', buyer: 'agency operators', oldCategories: ['analytics'], evidenceRefs: ['evidence:fixture'] });
  assert.equal(category.ok, true);
  assert.equal(category.category.status, 'CANDIDATE');
  assert.match(category.claimBoundary, /NOT_ESTABLISHED_MARKET/);
  const vocab = generateCategoryVocabulary({ mechanisms: ['reconciliation'], buyers: ['agent operators'], outcomes: ['cleared profit'] });
  assert.equal(vocab.ok, true);
  assert.equal(vocab.candidates[0].status, 'CANDIDATE_LABEL');
});

test('frontier residue and negative-result arbitrage convert failure into learning without monetary claims', () => {
  const residue = mineFrontierResidue({ signals: [{ id: 'x', status: 'NEGATIVE', failedOutcome: 'buyer rejected offer', unexpectedCapabilities: ['cheap audit'], reusableArtifacts: ['diagnostic'] }] });
  assert.equal(residue.residue.length, 1);
  const negative = rankNegativeResultArbitrage({ negativeResults: [{ id: 'n1', replicationConfidence: 90, wastedCostAvoided: 100, crossDomainTransfer: 80, lesson: 'channel fails without proof' }] });
  assert.equal(negative.ok, true);
  assert.ok(negative.ranked[0].score > 0);
  assert.match(negative.claimBoundary, /NOT_MONETARY_PROOF/);
});

test('preference and buyer mental-model engines prohibit private psychology inference', () => {
  const preference = modelPreferenceFormation({ touches: [{ dimension: 'proof preference', preferenceDelta: 10, evidenceStrength: 80 }] });
  assert.equal(preference.ok, true);
  assert.match(preference.claimBoundary, /MUST_NOT_INFER_PRIVATE_PSYCHOLOGY/);
  const model = compileBuyerMentalModel({ beliefs: ['prefers provider receipts'], decisionRules: ['requires bounded scope'], proofPreferences: ['customer-origin evidence'], risks: ['lock-in'] });
  assert.equal(model.ok, true);
  assert.match(model.claimBoundary, /NOT_INFERRED_PRIVATE_PSYCHOLOGY/);
});

test('non-consumption, market creation and problem formation stay research hypotheses', () => {
  const nc = telescopeNonConsumption({ segments: [{ id: 's', population: 1000, needIntensity: 90, accessDifficulty: 80, currentAdoption: .1 }] });
  assert.ok(nc.ranked[0].nonConsumptionScore > 0);
  const sim = simulateMarketCreation({ segments: [{ id: 's', adoption: .1, needIntensity: 80 }], frictionReduction: 50, valueIncrease: 20 });
  assert.equal(sim.scenarios[0].evidenceClass, 'SYNTHETIC_SCENARIO');
  assert.match(sim.claimBoundary, /NOT_FORECAST_OR_DEMAND_PROOF/);
  const problems = modelProblemFormation({ signals: [{ problem: 'manual reconciliation', severity: 90, frequency: 80, workaroundCost: 100 }] });
  assert.equal(problems.problems[0].problem, 'manual reconciliation');
});

test('pain-to-budget and demand phase-change require real buyer/payment evidence before commercial truth', () => {
  const transition = detectPainToBudgetTransition({ observations: [{ id: 'x', pain: 90, workaroundCost: 90, budgetSignal: 80, authoritySignal: 75 }] });
  assert.equal(transition.transitions[0].state, 'BUDGET_RESEARCH_CANDIDATE');
  assert.match(transition.claimBoundary, /NOT_VERIFIED_BUDGET/);
  const demand = detectDemandPhaseChange({ observations: [{ id: 'a', independentBuyerSignals: 1, budgetSignals: 0, paidCommitments: 0 }, { id: 'b', independentBuyerSignals: 1, budgetSignals: 0, paidCommitments: 0 }, { id: 'c', independentBuyerSignals: 5, budgetSignals: 2, paidCommitments: 1 }] });
  assert.equal(demand.ok, true);
  assert.match(demand.claimBoundary, /REAL_INDEPENDENT_BUYER_AND_PAYMENT_EVIDENCE/);
});

test('surplus, friction conservation and constraint shadow price preserve boundary assumptions', () => {
  const graph = buildUniversalSurplusGraph({ nodes: ['buyer','seller'], edges: [{ from: 'buyer', to: 'seller', surplus: 50 }] });
  assert.equal(graph.capturedSurplus.seller, 50);
  const friction = analyzeFrictionConservation({ before: [{ id: 'sales', friction: 50 }, { id: 'delivery', friction: 20 }], after: [{ id: 'sales', friction: 20 }, { id: 'delivery', friction: 45 }] });
  assert.equal(friction.netChange, -5);
  const shadow = estimateConstraintShadowPrice({ baselineObjective: 100, relaxedObjective: 130, relaxationUnits: 3 });
  assert.equal(shadow.shadowPrice, 10);
  assert.match(shadow.claimBoundary, /NOT_MARKET_PRICE/);
});

test('bottleneck, scarcity and abundance engines separate graph/resource heuristics from causal claims', () => {
  const bottleneck = calculateBottleneckCentrality({ nodes: ['a','b','c'], edges: [{ from: 'a', to: 'b', weight: 10 }, { from: 'c', to: 'b', weight: 10 }], capacities: { a: 100, b: 5, c: 100 } });
  assert.equal(bottleneck.ranked[0].id, 'b');
  const scarcity = detectScarcityMigration({ periods: [{ id: 'p1', resources: { compute: 90, distribution: 20 } }, { id: 'p2', resources: { compute: 10, distribution: 95 } }] });
  assert.equal(scarcity.migrations.length, 1);
  const abundance = analyzeAbundanceConsequence({ before: { compute: 10 }, after: { compute: 100 } });
  assert.equal(abundance.changes[0].direction, 'MORE_ABUNDANT');
  assert.match(abundance.claimBoundary, /DOES_NOT_BY_ITSELF_IDENTIFY_ECONOMIC_CAUSAL_CONSEQUENCES/);
});

test('zero-marginal-cost shockwave and value-chain phase mapping remain mechanical models', () => {
  const shock = propagateZeroMarginalCostShockwave({ oldMarginalCost: 100, newMarginalCost: 0, dependencies: [{ id: 'research', costShare: .8 }, { id: 'delivery', costShare: .2 }] });
  assert.equal(shock.marginalCostReductionPct, 100);
  assert.equal(shock.affected[0].estimatedUnitCostReductionPct, 80);
  assert.match(shock.claimBoundary, /NOT_DEMAND_OR_MARGIN_PROOF/);
  const chain = mapValueChainPhases({ stages: [{ id: 'research', valueAdded: 100, cost: 20 }, { id: 'handoff', valueAdded: 10, cost: 30 }] });
  assert.equal(chain.stages[0].phase, 'VALUE_CREATION');
  assert.equal(chain.stages[1].phase, 'VALUE_DESTRUCTION');
});

test('constraint inversion creates a falsifiable counterfactual, not reality', () => {
  const result = invertConstraint({ constraint: 'inference is expensive', baseline: 'use scarce calls', opposite: 'inference cost approaches zero', risks: ['commoditization'] });
  assert.equal(result.ok, true);
  assert.equal(result.hypothesis.questions.length, 4);
  assert.match(result.claimBoundary, /COUNTERFACTUAL_SEARCH_NOT_REALITY/);
  assert.equal(result.businessEffectAuthority, 'NONE');
});
