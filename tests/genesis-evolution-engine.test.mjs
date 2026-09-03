import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { THREAD_OPPORTUNITY_UNIVERSE } from '../src/thread-opportunity-universe.mjs';
import {
  buildAntiUberBondChallenges,
  buildArtificialSerendipity,
  buildFounderFreedomDerivative,
  buildFutureOptionPortfolio,
  buildGenesisEvolutionCycle,
  buildGenesisImplementationLedger,
  buildImpossibleTaskLedger,
  buildRedQueenEvaluatorTournament,
  buildSurpriseScore,
  detectWorldDiscontinuity,
  scoreCapabilityMultiplication
} from '../src/genesis-evolution-engine.mjs';

const canonUrl = new URL('../docs/PERPETUAL_FRONTIER_GENESIS_CANON.md', import.meta.url);

test('artificial serendipity generates deterministic cross-category hypotheses from the real opportunity universe', () => {
  const a = buildArtificialSerendipity({ opportunities: THREAD_OPPORTUNITY_UNIVERSE, seed: 'frontier-x', maxPairs: 12 });
  const b = buildArtificialSerendipity({ opportunities: THREAD_OPPORTUNITY_UNIVERSE, seed: 'frontier-x', maxPairs: 12 });
  assert.equal(a.ok, true);
  assert.equal(a.hypotheses.length, 12);
  assert.deepEqual(a.hypotheses, b.hypotheses);
  for (const hypothesis of a.hypotheses) {
    assert.equal(hypothesis.status, 'SYNTHETIC_HYPOTHESIS');
    assert.notEqual(hypothesis.parentCategories[0], hypothesis.parentCategories[1]);
    assert.equal(hypothesis.evidenceStatus, 'UNPROVEN_RECOMBINATION');
  }
  assert.equal(a.businessEffectAuthority, 'NONE');
});

test('surprise score rewards distance but never converts novelty into proof', () => {
  const known = ['autonomous email outreach workflow', 'crm monitoring subscription'];
  const familiar = buildSurpriseScore({ signal: { summary: 'autonomous email outreach workflow', changedPrimitives: ['email automation'] }, knownConcepts: known });
  const distant = buildSurpriseScore({ signal: { summary: 'new photonic inference primitive', changedPrimitives: ['photonic inference'] }, knownConcepts: known });
  assert.equal(familiar.ok, true);
  assert.equal(distant.ok, true);
  assert.ok(distant.score > familiar.score);
  assert.match(distant.claimBoundary, /NOT_TRUTH_OR_ECONOMIC_PROOF/);
});

test('world discontinuity detects large metric changes without claiming causality', () => {
  const result = detectWorldDiscontinuity({ priorMetrics: { costPerTask: 100, reliability: 55 }, currentMetrics: { costPerTask: 25, reliability: 92 } });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'WORLD_DISCONTINUITY_DETECTED');
  assert.ok(result.discontinuities.some(item => item.key === 'costPerTask'));
  assert.match(result.claimBoundary, /CAUSAL_AND_SOURCE_REVIEW/);
});

test('capability multiplication is bounded against real opportunity population', () => {
  const result = scoreCapabilityMultiplication({ primitive: 'autonomous monitoring workflow api', domains: ['reliability', 'automation'], opportunities: THREAD_OPPORTUNITY_UNIVERSE });
  assert.equal(result.ok, true);
  assert.equal(result.totalOpportunityCount, THREAD_OPPORTUNITY_UNIVERSE.length);
  assert.ok(result.touchedOpportunityCount > 0);
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.match(result.claimBoundary, /NOT_VALUE_PROOF/);
});

test('impossible task ledger reopens research only when explicit unlock condition changes', () => {
  const tasks = [
    { id: 'agent-browser', objective: 'complete long workflows', blockers: ['runtime unreliable'], unlockConditions: ['reliable-long-horizon-tool-use'] },
    { id: 'other', objective: 'regulated action', blockers: ['legal'], unlockConditions: ['law-changed'] }
  ];
  const result = buildImpossibleTaskLedger({ tasks, changedConditions: ['reliable-long-horizon-tool-use'] });
  assert.equal(result.ok, true);
  assert.equal(result.revalidationQueue.length, 1);
  assert.equal(result.revalidationQueue[0].id, 'agent-browser');
  assert.equal(result.revalidationQueue[0].promotionAuthority, 'NONE');
  assert.match(result.claimBoundary, /RESEARCH_ONLY/);
});

test('future option portfolio spends only research attention and preserves curiosity budget', () => {
  const serendipity = buildArtificialSerendipity({ opportunities: THREAD_OPPORTUNITY_UNIVERSE.slice(0, 40), seed: 'x', maxPairs: 8 });
  const result = buildFutureOptionPortfolio({ hypotheses: serendipity.hypotheses, maxOptions: 4, curiosityBudget: 0.25 });
  assert.equal(result.ok, true);
  assert.equal(result.options.length, 4);
  assert.equal(result.curiosityBudget, 0.25);
  assert.match(result.claimBoundary, /NOT_SPEND_OR_MARKET_AUTHORITY/);
});

test('Anti-UberBond produces falsifiable counter-theories instead of replacement authority', () => {
  const result = buildAntiUberBondChallenges({ assumptions: ['frontier model must be cloud hosted'], changedPrimitives: ['capable local open model'] });
  assert.equal(result.ok, true);
  assert.equal(result.challenges.length, 1);
  assert.match(result.challenges[0].counterTheory, /Assume the opposite/);
  assert.equal(result.challenges[0].authority, 'RESEARCH_AND_FALSIFICATION_ONLY');
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('Red Queen evaluator species preserve disagreement rather than hiding it', () => {
  const hypotheses = [
    { hypothesisId: 'novel', noveltyDistance: 0.98, mechanismSketch: 'unproven experimental frontier research' },
    { hypothesisId: 'safe', noveltyDistance: 0.2, mechanismSketch: 'bounded evidence audit recurring monitoring automation receipt' }
  ];
  const result = buildRedQueenEvaluatorTournament({ hypotheses });
  assert.equal(result.ok, true);
  assert.equal(result.profiles.length, 5);
  assert.equal(result.ballots.length, 5);
  assert.match(result.claimBoundary, /NOT_EXTERNAL_PROOF/);
});

test('founder freedom derivative rewards measured founder minutes saved and preserves its claim boundary', () => {
  const result = buildFounderFreedomDerivative({ founderMinutesBefore: 100, founderMinutesAfter: 20, reversibility: 80, optionality: 90, lockInRisk: 10, recurringLeverage: 70 });
  assert.equal(result.ok, true);
  assert.equal(result.minutesSaved, 80);
  assert.ok(result.score > 0);
  assert.match(result.claimBoundary, /NOT_GUARANTEED_LIFE_OUTCOME/);
});

test('full GENESIS evolution cycle composes the real search population without business effects', () => {
  const result = buildGenesisEvolutionCycle({
    signal: { summary: 'reliable long-horizon local agent runtime', changedPrimitives: ['reliable-long-horizon-tool-use', 'cheap-local-inference'], domains: ['AGENT_RUNTIME', 'AI_MODELS'] },
    opportunities: THREAD_OPPORTUNITY_UNIVERSE,
    priorMetrics: { costPerTask: 100, reliability: 50 },
    currentMetrics: { costPerTask: 20, reliability: 95 },
    impossibleTasks: [{ id: 'long-agent', objective: 'run durable workflows', blockers: ['reliability'], unlockConditions: ['reliable-long-horizon-tool-use'] }],
    assumptions: ['frontier cognition requires expensive hosted models'],
    maxSerendipityPairs: 10,
    curiosityBudget: 0.2
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'GENESIS_EVOLUTION_CYCLE_READY');
  assert.ok(result.serendipity.hypotheses.length > 0);
  assert.equal(result.impossible.revalidationQueue.length, 1);
  assert.ok(result.implementedIdeaIds.includes(2));
  assert.ok(result.implementedIdeaIds.includes(175));
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.match(result.executionRule, /EXTERNAL_PROOF_GATES/);
});

test('275-item implementation ledger distinguishes source/test presence from runtime proof', async () => {
  const markdown = await readFile(canonUrl, 'utf8');
  const result = buildGenesisImplementationLedger({
    canonicalMarkdown: markdown,
    sourcePaths: ['src/genesis-evolution-engine.mjs'],
    testPaths: ['tests/genesis-evolution-engine.test.mjs'],
    runtimeReceiptPaths: []
  });
  assert.equal(result.ok, true);
  assert.equal(result.ideaCount, 275);
  assert.equal(result.counts.RUNTIME_RECEIPT_PRESENT || 0, 0);
  assert.ok((result.counts.SOURCE_AND_TEST_PRESENT || 0) >= 20);
  assert.equal(result.entries.find(item => item.id === 2).status, 'SOURCE_AND_TEST_PRESENT');
  assert.equal(result.entries.find(item => item.id === 275).status, 'CANON_ONLY');
  assert.match(result.truthBoundary, /NOT_TEST_PASS_OR_RUNTIME_SUCCESS/);
});
