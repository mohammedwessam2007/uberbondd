import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessMachineEconomyReadiness,
  buildCounterfactualWorlds,
  buildFutureCalibrationLedger,
  buildPredictionSociety,
  buildSyntheticFutureMemories,
  compileCausalEconomicGenome,
  compileEconomicScientistProtocol,
  compileInstitutionGenome,
  evaluateTheoryAgainstObservations,
  evolveSearchPolicies,
  guardMetaObjective
} from '../src/genesis-scientist.mjs';

test('causal economic genome rejects cycles and keeps causal claims provisional', () => {
  const cycle = compileCausalEconomicGenome({
    variables: [{ id: 'a', role: 'DECISION' }, { id: 'b', role: 'OUTCOME' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
    evidenceRefs: ['evidence:test']
  });
  assert.equal(cycle.ok, false);
  assert.ok(cycle.reasonCodes.includes('causal-graph-cycle-prohibited'));
  const result = compileCausalEconomicGenome({
    variables: [{ id: 'price', role: 'DECISION' }, { id: 'conversion', role: 'MEDIATOR' }, { id: 'cleared-profit', role: 'OUTCOME' }],
    edges: [{ from: 'price', to: 'conversion', sign: 'NEGATIVE' }, { from: 'conversion', to: 'cleared-profit', sign: 'POSITIVE' }],
    evidenceRefs: ['evidence:pilot-1']
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.genome.topologicalOrder, ['price', 'conversion', 'cleared-profit']);
  assert.match(result.claimBoundary, /NOT_CAUSAL_PROOF/);
});

test('counterfactual world engine creates bounded synthetic worlds only', () => {
  const result = buildCounterfactualWorlds({ axes: { modelCost: ['high','low'], buyerType: ['human','agent'], regulation: ['strict','open'] }, maxWorlds: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.worlds.length, 5);
  assert.ok(result.worlds.every(world => world.evidenceClass === 'SYNTHETIC_COUNTERFACTUAL'));
  assert.match(result.claimBoundary, /NOT_FORECAST_OR_REALITY/);
});

test('automated economic scientist protocol can be contradicted by observed evidence', () => {
  const protocol = compileEconomicScientistProtocol({
    theory: 'Lower task cost increases cleared contribution profit when demand and acceptance remain constant.',
    predictions: ['prediction A', 'prediction B'],
    falsifiers: ['cleared contribution falls after cost reduction'],
    observations: ['provider cost receipt', 'cleared payment receipt'],
    interventions: ['route one bounded task to lower-cost supplier']
  });
  assert.equal(protocol.ok, true);
  const evaluation = evaluateTheoryAgainstObservations({ protocol: protocol.protocol, results: [
    { predictionId: 'prediction_1', outcome: 'SUPPORTED', evidenceRefs: ['outcome:a'] },
    { predictionId: 'prediction_2', outcome: 'CONTRADICTED', evidenceRefs: ['outcome:b'] }
  ] });
  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.decision, 'REVISE_OR_REJECT');
  assert.equal(evaluation.contradicted, 1);
});

test('prediction society rewards lower Brier error without turning consensus into fact', () => {
  const forecasts = [
    { forecasterId: 'a', eventId: 'x', probability: 0.9 },
    { forecasterId: 'b', eventId: 'x', probability: 0.55 },
    { forecasterId: 'a', eventId: 'y', probability: 0.1 },
    { forecasterId: 'b', eventId: 'y', probability: 0.4 }
  ];
  const result = buildPredictionSociety({ forecasts, outcomes: { x: 1, y: 0 } });
  assert.equal(result.ok, true);
  assert.equal(result.scoreboard[0].forecasterId, 'a');
  assert.match(result.claimBoundary, /NOT_EXTERNAL_FACT/);
  const calibration = buildFutureCalibrationLedger({ predictions: forecasts, outcomes: { x: 1, y: 0 } });
  assert.equal(calibration.ok, true);
  assert.equal(calibration.calibration[0].forecasterId, 'a');
});

test('search policy evolution mutates the best offline policy but cannot self-promote', () => {
  const result = evolveSearchPolicies({
    policies: [
      { id: 'balanced', weights: { evidence: 0.5, upside: 0.5 } },
      { id: 'hype', weights: { evidence: 0.1, upside: 0.9 } }
    ],
    benchmarkCases: [
      { winnerId: 'safe', candidates: [{ id: 'safe', features: { evidence: 95, upside: 60 } }, { id: 'hype', features: { evidence: 20, upside: 100 } }] },
      { winnerId: 'safe2', candidates: [{ id: 'safe2', features: { evidence: 90, upside: 70 } }, { id: 'hype2', features: { evidence: 30, upside: 100 } }] }
    ],
    mutationStep: 0.1,
    maxChildren: 6
  });
  assert.equal(result.ok, true);
  assert.ok(result.children.length > 0);
  assert.equal(result.promotionAuthority, 'NONE');
  assert.match(result.claimBoundary, /DOES_NOT_SELF_PROMOTE/);
});

test('synthetic future memory is permanently marked synthetic and prohibited as history', () => {
  const worlds = buildCounterfactualWorlds({ axes: { compute: ['abundant'], buyers: ['agents'] } }).worlds;
  const result = buildSyntheticFutureMemories({ worlds, hypotheses: [{ hypothesisId: 'h1' }], horizon: '2030' });
  assert.equal(result.ok, true);
  assert.equal(result.memories[0].evidenceClass, 'SYNTHETIC_COUNTERFACTUAL');
  assert.equal(result.memories[0].prohibitedUse, 'PRESENT_TENSE_FACT_OR_REVENUE_PROOF');
});

test('institution genome is a design object and cannot manufacture authority', () => {
  const result = compileInstitutionGenome({
    identity: 'machine-market-cell',
    rights: ['read public market data'],
    consent: ['counterparty consent required'],
    delegation: ['attenuation only'],
    decisions: ['bounded ranking'],
    settlement: ['provider-origin settlement evidence'],
    revocation: ['recursive revocation']
  });
  assert.equal(result.ok, true);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.match(result.claimBoundary, /NOT_LEGAL_ENTITY_OR_AUTHORITY/);
});

test('machine economy readiness fails closed on weak settlement/dispute layers', () => {
  const weak = assessMachineEconomyReadiness({ identity: 90, authorization: 90, contract: 80, settlement: 40, dispute: 30, acceptance: 80, audit: 90 });
  assert.equal(weak.ok, true);
  assert.equal(weak.status, 'MACHINE_ECONOMY_NOT_READY');
  assert.ok(weak.blockers.includes('settlement'));
  assert.equal(weak.promotionAuthority, 'NONE');
  const strong = assessMachineEconomyReadiness({ identity: 90, authorization: 90, contract: 85, settlement: 85, dispute: 80, acceptance: 90, audit: 95 });
  assert.equal(strong.status, 'MACHINE_ECONOMY_RESEARCH_READY');
  assert.match(strong.claimBoundary, /DOES_NOT_CREATE/);
});

test('meta-objective guardian blocks silent north-star mutation', () => {
  const baseline = {
    economicNorthStar: 'risk-adjusted cleared contribution profit / founder minute',
    authorityLaw: 'capability never creates authority',
    truthLaw: 'external truth requires external evidence',
    founderFreedomLaw: 'reduce founder compulsion'
  };
  const mutated = { ...baseline, economicNorthStar: 'maximize raw revenue at any cost' };
  const result = guardMetaObjective({ baseline, candidate: mutated });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'META_OBJECTIVE_MUTATION_BLOCKED');
  assert.equal(result.decision, 'DENY_SELF_MUTATION');
  assert.equal(result.businessEffectAuthority, 'NONE');
});
