import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autogenResearchAgenda,
  buildAbstractionLadder,
  buildIdeaPhylogeny,
  buildOntogenesisCycle,
  buildOntologyDsl,
  compileConcept,
  compileExecutableOntology,
  compileQuestionGenome,
  compressInsight,
  decideOntologyDeath,
  evolveOntology,
  fuseConcepts,
  generateInverseProblem,
  scoreConceptFitness,
  speciateConcept
} from '../src/genesis-ontology.mjs';

const evidence = ['evidence:ontology-fixture'];
const baseConcept = {
  id: 'revenue-friction',
  name: 'Revenue Friction',
  definition: 'A mechanism that prevents verified demand from becoming cleared contribution profit.',
  evidenceRefs: evidence,
  parentIds: [],
  aliases: [],
  status: 'ACTIVE'
};

test('concept compiler requires bounded machine vocabulary and never creates an external fact', () => {
  assert.equal(compileConcept({ name: 'missing id', definition: 'x', evidenceRefs: evidence }).ok, false);
  const result = compileConcept(baseConcept);
  assert.equal(result.ok, true);
  assert.equal(result.concept.id, 'revenue-friction');
  assert.match(result.claimBoundary, /NOT_EXTERNAL_FACT/);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('concept fitness is explicit internal utility rather than truth score', () => {
  const result = scoreConceptFitness({ explanatoryGain: 90, usage: 70, contradictionReduction: 80, opportunityReach: 75, stability: 85, novelty: 60 });
  assert.equal(result.ok, true);
  assert.ok(result.fitness > 0 && result.fitness <= 100);
  assert.match(result.claimBoundary, /NOT_TRUTH/);
});

test('concept fusion and speciation remain candidate vocabulary', () => {
  const a = compileConcept(baseConcept).concept;
  const b = compileConcept({ id: 'trust-friction', name: 'Trust Friction', definition: 'A mechanism that blocks action because evidence or credibility is insufficient.', evidenceRefs: evidence }).concept;
  const fusion = fuseConcepts({ a, b });
  assert.equal(fusion.ok, true);
  assert.equal(fusion.concept.status, 'CANDIDATE');
  assert.deepEqual(new Set(fusion.concept.parentIds), new Set(['revenue-friction', 'trust-friction']));
  const species = speciateConcept({ concept: a, dimensions: ['payment stage', 'delivery stage'] });
  assert.equal(species.ok, true);
  assert.equal(species.children.length, 2);
  assert.ok(species.children.every(child => child.status === 'CANDIDATE'));
  assert.match(species.claimBoundary, /NOT_REAL_WORLD_CATEGORIES/);
});

test('ontology death requires zero usage, zero dependents, replacement and evidence', () => {
  const blocked = decideOntologyDeath({ concept: baseConcept, usageCount: 4, dependentConceptIds: [], replacementId: 'new-concept', evidenceRefs: evidence });
  assert.equal(blocked.status, 'ONTOLOGY_KEEP');
  const eligible = decideOntologyDeath({ concept: baseConcept, usageCount: 0, dependentConceptIds: [], replacementId: 'new-concept', evidenceRefs: evidence });
  assert.equal(eligible.status, 'ONTOLOGY_ARCHIVE_CANDIDATE');
  assert.equal(eligible.decisionAuthority, 'PROPOSE_ONLY');
  assert.match(eligible.claimBoundary, /NEVER_SILENTLY_DELETES_HISTORY/);
});

test('idea phylogeny rejects missing parents and cycles', () => {
  const missing = buildIdeaPhylogeny({ ideas: [{ id: 'child', parentIds: ['missing'] }] });
  assert.equal(missing.ok, false);
  const cycle = buildIdeaPhylogeny({ ideas: [{ id: 'a', parentIds: ['b'] }, { id: 'b', parentIds: ['a'] }] });
  assert.equal(cycle.ok, false);
  assert.ok(cycle.reasonCodes.includes('phylogeny-cycle-prohibited'));
  const valid = buildIdeaPhylogeny({ ideas: [{ id: 'root', name: 'Root', parentIds: [] }, { id: 'child', name: 'Child', parentIds: ['root'] }] });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.roots, ['root']);
  assert.deepEqual(valid.children.root, ['child']);
});

test('abstraction ladder preserves five levels and warns against overgeneralization', () => {
  const result = buildAbstractionLadder({ observation: 'checkout fails', mechanism: 'webhook mismatch', pattern: 'cross-system identity drift', principle: 'effects need stable identities', metaPrinciple: 'evidence must bind consequences to exact identities' });
  assert.equal(result.ok, true);
  assert.equal(result.levels.length, 5);
  assert.match(result.claimBoundary, /CAN_OVERGENERALIZE/);
});

test('inverse problem generator defines search but does not pretend to solve it', () => {
  const result = generateInverseProblem({ desiredOutcome: 'increase cleared contribution profit', observables: ['payment receipts', 'founder minutes'], controls: ['routing policy', 'offer scope'], constraints: ['authority', 'budget'] });
  assert.equal(result.ok, true);
  assert.equal(result.problem.questions.length, 4);
  assert.match(result.claimBoundary, /NOT_SOLUTION_OR_CAUSAL_PROOF/);
});

test('question genome classifies causal, counterfactual, predictive, decision and falsification questions', () => {
  const result = compileQuestionGenome({ questions: [
    'Why did payment clearing fall?',
    'What if hosted inference became free?',
    'What is the probability this signal persists?',
    'Which provider should we choose?',
    'What would falsify the current mechanism?'
  ] });
  assert.equal(result.ok, true);
  assert.equal(result.questions.length, 5);
  assert.deepEqual(new Set(result.questions.map(item => item.type)), new Set(['CAUSAL', 'COUNTERFACTUAL', 'PREDICTIVE', 'DECISION', 'FALSIFICATION']));
});

test('insight compression requires evidence and explicitly stays below source evidence', () => {
  const invalid = compressInsight({ statement: 'x', evidenceRefs: [] });
  assert.equal(invalid.ok, false);
  const result = compressInsight({ statement: 'A stable effect identity reduces uncertain retries.', evidenceRefs: ['evidence:runtime-test'], implications: ['prefer exact effect keys'], uncertainty: 20, contradictions: [] });
  assert.equal(result.ok, true);
  assert.match(result.claimBoundary, /NEVER_OUTRANKS_SOURCE_EVIDENCE/);
});

test('ontology DSL supports economic causal authority and company genome modes without arbitrary execution', () => {
  const concepts = [compileConcept(baseConcept).concept, compileConcept({ id: 'profit', name: 'Profit', definition: 'Cleared contribution profit outcome.', evidenceRefs: evidence }).concept];
  for (const mode of ['ECONOMIC', 'CAUSAL', 'AUTHORITY', 'COMPANY_GENOME']) {
    const result = buildOntologyDsl({ concepts, relations: [{ from: 'revenue-friction', to: 'profit', type: 'REDUCES' }], mode });
    assert.equal(result.ok, true);
    assert.equal(result.grammar.mode, mode);
    assert.match(result.grammar.execution, /NO_ARBITRARY_CODE_EXECUTION/);
  }
});

test('executable ontology rejects relations to unknown concepts and remains query-only', () => {
  const bad = compileExecutableOntology({ concepts: [baseConcept], relations: [{ from: 'revenue-friction', to: 'missing', type: 'CAUSES' }] });
  assert.equal(bad.ok, false);
  const valid = compileExecutableOntology({ concepts: [baseConcept, { id: 'profit', name: 'Profit', definition: 'Cleared contribution outcome.', evidenceRefs: evidence }], relations: [{ from: 'revenue-friction', to: 'profit', type: 'REDUCES' }] });
  assert.equal(valid.ok, true);
  assert.ok(valid.allowedOperations.includes('LOOKUP'));
  assert.ok(valid.prohibitedOperations.includes('AUTHORITY_WIDENING'));
  assert.match(valid.claimBoundary, /NOT_SELF_AUTHORIZING_CODE/);
});

test('ontology evolution only proposes promotion and archive changes', () => {
  const current = [baseConcept];
  const candidate = { id: 'new-friction', name: 'New Friction', definition: 'Candidate emergent mechanism.', evidenceRefs: evidence, status: 'CANDIDATE' };
  const result = evolveOntology({ currentConcepts: current, candidateConcepts: [candidate], fitnessById: { 'revenue-friction': 10, 'new-friction': 90 }, dependencies: { 'revenue-friction': [] }, promotionThreshold: 70, archiveThreshold: 20 });
  assert.equal(result.ok, true);
  assert.equal(result.promotions[0].conceptId, 'new-friction');
  assert.equal(result.archives[0].conceptId, 'revenue-friction');
  assert.equal(result.promotionAuthority, 'NONE');
  assert.match(result.claimBoundary, /CANNOT_SILENTLY_REDEFINE_REALITY/);
});

test('research agenda autogenesis turns ignorance into questions, not answers', () => {
  const result = autogenResearchAgenda({ unknowns: ['buyer acceptance mechanism'], anomalies: ['cost fell but profit did not'], contradictions: ['two receipts disagree'], maxQuestions: 6 });
  assert.equal(result.ok, true);
  assert.equal(result.agenda.length, 6);
  assert.match(result.claimBoundary, /NOT_FACTS/);
});

test('ONTOGENESIS creates candidate concepts beyond a static vocabulary without promoting them', () => {
  const result = buildOntogenesisCycle({
    currentConcepts: [baseConcept],
    unknowns: ['a new class of agent-to-agent trust primitive'],
    anomalies: ['machine buyer responds to proof structure unlike human buyer'],
    contradictions: ['current buyer ontology cannot classify the behavior'],
    evidenceRefs: ['evidence:frontier-observation']
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ONTOGENESIS_CYCLE_READY');
  assert.ok(result.candidates.length > 0);
  assert.ok(result.candidates.every(concept => concept.status === 'CANDIDATE'));
  assert.equal(result.evolution.promotionAuthority, 'NONE');
  assert.match(result.nextRule, /REQUIRE_EVIDENCE_AND_REPEATED_UTILITY/);
  assert.match(result.claimBoundary, /NOT_NEW_EXTERNAL_FACTS/);
  assert.equal(result.businessEffectAuthority, 'NONE');
});
