import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeKnowledgeState, diagnoseKnowledgeState, scheduleReview, updateFromRecall, compileLearningQueue
} from '../src/adaptive-mastery-engine.mjs';
import {
  contactNode, bridgeCandidates, mentorApprenticeshipCandidates, proposeRelationshipAction
} from '../src/relationship-opportunity-graph.mjs';
import {
  evidenceRecord, pathway, nextPathwayBlockers, comparePathways
} from '../src/geographic-sovereignty-engine.mjs';
import {
  datasetAsset, trainingRecipe, checkpointRecord, evaluatePromotion, deploymentCandidate
} from '../src/model-foundry-control-plane.mjs';
import { knowledgeCapitalRecord, institutionSpec, patronageCandidate } from '../src/legacy-institution-engine.mjs';

test('adaptive mastery preserves uncertainty and prerequisite repair', () => {
  const states = [
    { id: 'algebra', mastery: .8, uncertainty: .1, stabilityDays: 10 },
    { id: 'calculus', mastery: .2, uncertainty: .8, stabilityDays: 1, prerequisites: ['algebra'] }
  ];
  assert.equal(normalizeKnowledgeState(states[0]).ok, true);
  assert.equal(diagnoseKnowledgeState({ states }).diagnostics[0].id, 'calculus');
  assert.equal(compileLearningQueue({ states }).queue[0].id, 'calculus');
  assert.ok(scheduleReview({ state: states[0] }).review.intervalDays > 0);
  assert.ok(updateFromRecall({ state: states[0], recalled: true, latencyMs: 1000 }).state.mastery > .8);
});

test('relationship graph scores bridges but never grants messaging authority', () => {
  const contacts = [
    { id: 'a', domains: ['psychiatry'], capabilities: ['research'], trust: .9, reciprocity: .8, consentToContact: false },
    { id: 'b', domains: ['software'], capabilities: ['coding'], trust: .4, reciprocity: .4 }
  ];
  assert.equal(contactNode(contacts[0]).ok, true);
  assert.equal(bridgeCandidates({ contacts, targetDomains: ['psychiatry'] }).candidates[0].id, 'a');
  assert.equal(mentorApprenticeshipCandidates({ contacts, capabilityGaps: ['research'] }).candidates[0].id, 'a');
  const action = proposeRelationshipAction({ contact: contacts[0], purpose: 'Ask for research apprenticeship advice' });
  assert.equal(action.requiresOwnerApproval, true);
  assert.equal(action.externalEffectAuthority, 'NONE');
});

test('geographic pathways expire stale legal evidence instead of laundering it into truth', () => {
  const stale = evidenceRecord({ url: 'https://example.gov', checkedAt: '2020-01-01T00:00:00.000Z', authority: 'PRIMARY_AUTHORITY', maxAgeDays: 30 }, { now: '2026-09-15T00:00:00.000Z' });
  assert.equal(stale.status, 'EVIDENCE_STALE');
  const p = pathway({
    id: 'route', destination: 'X', profession: 'physician',
    evidence: [{ url: 'https://example.gov', checkedAt: '2026-09-14T00:00:00.000Z', authority: 'PRIMARY_AUTHORITY', maxAgeDays: 30 }],
    requirements: [
      { id: 'exam', label: 'Pass exam', status: 'MET' },
      { id: 'license', label: 'Obtain license', status: 'UNMET', dependsOn: ['exam'] }
    ], careerFit: .9, stability: .8
  }, { now: '2026-09-15T00:00:00.000Z' });
  assert.equal(p.status, 'PATHWAY_READY');
  assert.equal(nextPathwayBlockers({ route: p.pathway }).blockers[0].id, 'license');
  assert.equal(comparePathways({ pathways: [p.pathway] }).ranked.length, 1);
});

test('model foundry rejects bad data lineage and requires complete evaluation gates', () => {
  assert.equal(datasetAsset({ id: 'bad', source: 'x', license: 'unknown', allowedPurpose: 'train', containsSecrets: true }).ok, false);
  const recipe = {
    id: 'uberlm0', stage: 'FROM_SCRATCH',
    datasets: [{ id: 'd1', source: 'owned://corpus', license: 'OWNER_AUTHORIZED', allowedPurpose: 'train' }],
    architecture: { family: 'decoder', parameterCount: 125000000, tokenizer: 'uberlm-bpe', contextLength: 4096 },
    evalSuite: ['reasoning', 'memorization'], budgetUsd: 100, maxGpuHours: 50
  };
  assert.equal(trainingRecipe(recipe).ok, true);
  assert.equal(checkpointRecord({ recipe, checkpoint: { hash: 'abc123', step: 1000 } }).ok, true);
  const blocked = evaluatePromotion({ recipe, checkpoint: { hash: 'abc123', step: 1000 }, evaluations: [{ id: 'reasoning', score: .8 }], thresholds: { reasoning: .7, memorization: .9 } });
  assert.equal(blocked.ok, false);
  const passed = deploymentCandidate({
    recipe, checkpoint: { hash: 'abc123', step: 1000 },
    evaluations: [{ id: 'reasoning', score: .8 }, { id: 'memorization', score: .95 }],
    thresholds: { reasoning: .7, memorization: .9 },
    target: { id: 'local-vllm', servingAdapter: 'VLLM', rollbackCheckpointHash: 'prev' }
  });
  assert.equal(passed.status, 'DEPLOYABLE_CANDIDATE');
  assert.equal(passed.deploymentAuthority, 'NONE');
});

test('legacy compiler preserves provenance and owner authority', () => {
  assert.equal(knowledgeCapitalRecord({ id: 'lesson-1', title: 'Why a strategy failed', sourceRefs: ['receipt:a'] }).ok, true);
  assert.equal(institutionSpec({ mission: 'Fund unusual talent', horizonYears: 100, invariants: ['truth'] }).activationAuthority, 'NONE');
  assert.equal(patronageCandidate({ candidate: { id: 'c', strengths: ['math'] }, missionNeeds: ['math'] }).requiresOwnerApproval, true);
});
