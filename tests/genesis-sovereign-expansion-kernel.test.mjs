import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SOVEREIGN_EXPANSION_LENSES,
  buildExpansionEnvelope,
  buildMissingUberBondLedger,
  buildMysteryPreservationContract,
  buildTheoryEcology,
  rankBottleneckGradient,
  scorePossibilityDerivative,
  validateSovereignExpansionKernel
} from '../src/sovereign-expansion-kernel.mjs';

test('expansion kernel has a unique, healthy lens ecology', () => {
  const result = validateSovereignExpansionKernel();
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  assert.equal(result.lensCount, 40);
  assert.equal(new Set(SOVEREIGN_EXPANSION_LENSES.map(x => x.id)).size, SOVEREIGN_EXPANSION_LENSES.length);
});

test('expansion envelope is deterministic, includes mandatory reality lenses, and carries zero authority', () => {
  const input = { context: 'new silent intent interface', affectedDomains: ['neuroengineering'], changedPrimitives: ['lower-latency intent signal'], ideationGeneratorKeys: ['neuroengineering::new-sense'], maxLenses: 16, seed: 'signal-7' };
  const a = buildExpansionEnvelope(input);
  const b = buildExpansionEnvelope(input);
  assert.equal(a.ok, true);
  assert.deepEqual(a.selectedLenses, b.selectedLenses);
  const ids = a.selectedLenses.map(x => x.id);
  for (const id of ['missing-uberbond', 'ontology-stress', 'possibility-derivative', 'bottleneck-gradient', 'reality-contact', 'self-completion-attractor']) assert.ok(ids.includes(id), id);
  assert.equal(a.externalEffectAuthority, 'NONE');
  assert.equal(a.businessEffectAuthority, 'NONE');
  assert.equal(a.externalEffectLedger.providerCalls, 0);
  assert.match(a.claimBoundary, /NOT_FACTS_DISCOVERIES_CAPABILITIES_OUTCOMES_OR_ASI_PROOF/);
});

test('missing UberBond ledger distinguishes gaps from proof', () => {
  const result = buildMissingUberBondLedger({ desiredCapabilities: ['ambient context', 'physical forge', 'local model'], currentCapabilities: ['local model'], blindSpots: ['real-world sensing'], externalBlockers: ['owned hardware'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing.map(x => x.capability), ['ambient context', 'physical forge']);
  assert.match(result.claimBoundary, /GAP_CANDIDATE_NOT_PROOF_OF_IMPOSSIBILITY/);
});

test('theory ecology refuses a one-theory monoculture and preserves falsifiers', () => {
  assert.equal(buildTheoryEcology({ question: 'q', theories: [{ id: 'a', summary: 'a' }] }).ok, false);
  const result = buildTheoryEcology({ question: 'why did performance change?', theories: [
    { id: 'sleep', summary: 'sleep drove it', predictions: ['tracks sleep'], falsifiers: ['no association'], evidenceRefs: [] },
    { id: 'method', summary: 'method drove it', predictions: ['tracks method'], falsifiers: ['method change no effect'], evidenceRefs: [] }
  ] });
  assert.equal(result.ok, true);
  assert.equal(result.theories.length, 2);
  assert.match(result.selectionRule, /NO_WINNER_WITHOUT/);
});

test('possibility derivative is a heuristic and cannot become choice authority', () => {
  const result = scorePossibilityDerivative({ options: [
    { id: 'skill', unlockedOptions: ['a', 'b', 'c'], crossDomainCount: 4, reversibility: 1, evidenceStrength: 0.8, timeToFeedbackDays: 30 },
    { id: 'flash', unlockedOptions: [], crossDomainCount: 0, reversibility: 0.2, evidenceStrength: 0.2, timeToFeedbackDays: 1 }
  ] });
  assert.equal(result.ok, true);
  assert.equal(result.options[0].id, 'skill');
  assert.match(result.scoringBoundary, /NOT_A_VALUE_FUNCTION_OR_CHOICE/);
  assert.equal(result.externalEffectAuthority, 'NONE');
});

test('bottleneck gradient favors broad evidenced unlocks per effort but remains reality-bound', () => {
  const result = rankBottleneckGradient({ constraints: [
    { id: 'broad', blockedOptions: 100, unlockProbability: 0.8, evidenceStrength: 0.9, effortUnits: 16 },
    { id: 'narrow', blockedOptions: 10, unlockProbability: 0.9, evidenceStrength: 0.9, effortUnits: 1 }
  ] });
  assert.equal(result.ok, true);
  assert.equal(result.constraints[0].id, 'broad');
  assert.match(result.scoringBoundary, /REALITY_VALIDATION_REQUIRED/);
});

test('mystery preservation accepts founder-declared non-model and non-surface zones only', () => {
  const result = buildMysteryPreservationContract({ protectedDomains: [
    { domain: 'movie endings', mode: 'NO_SPOILERS' },
    { domain: 'private reflection', mode: 'DO_NOT_MODEL' }
  ] });
  assert.equal(result.ok, true);
  assert.equal(result.rules.length, 2);
  assert.ok(result.rules.every(x => x.source === 'FOUNDER_DECLARED'));
  assert.equal(buildMysteryPreservationContract({ protectedDomains: [{ domain: 'x', mode: 'INVENT' }] }).ok, false);
});

test('public expansion kernel remains founder-generic and private personalization stays out of source', () => {
  const source = readFileSync(new URL('../src/sovereign-expansion-kernel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Mohamed/i);
  assert.doesNotMatch(source, /psychiatr|Kasr|iPad|medical training/i);
  assert.match(source, /founder-specific adaptation/i);
  assert.match(source, /businessEffectAuthority: 'NONE'/);
  assert.match(source, /externalEffectAuthority: 'NONE'/);
});
