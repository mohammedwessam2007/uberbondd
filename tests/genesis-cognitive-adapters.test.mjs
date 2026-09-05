import test from 'node:test';
import assert from 'node:assert/strict';

import {
  eventFromGenesisEvolution,
  eventFromGenesisScientist,
  eventFromGenesisOntology,
  eventFromGenesisMetabolism,
  compileGenesisLobeEvents
} from '../src/genesis-cognitive-adapters.mjs';

test('Genesis Evolution becomes invention evidence, not market proof', () => {
  const event = eventFromGenesisEvolution({ generatedAt: '2026-09-05T18:00:00Z', summary: { cycles: 4, generatedHypotheses: 9, impossibleTasksReopenedForReview: 2, antiUberBondChallenges: 3 } });
  assert.equal(event.ok, true);
  assert.equal(event.event.kind, 'IDEA_CANDIDATE');
  assert.equal(event.event.sourceNodeId, 'genesis-evolution');
  assert.equal(event.event.truthClass, 'RESEARCH_ASSET');
  assert.match(event.event.summary, /9 generated hypotheses/);
});

test('Genesis Scientist emits a falsifiable research agenda', () => {
  const event = eventFromGenesisScientist({ generatedAt: '2026-09-05T18:01:00Z', summary: { laboratories: 5, ready: 4, syntheticWorlds: 60, syntheticFutureMemories: 20 } });
  assert.equal(event.ok, true);
  assert.equal(event.event.kind, 'GENESIS_SCIENTIST_AGENDA');
  assert.match(event.event.summary, /5 laboratories/);
  assert.match(event.event.summary, /not causal or market proof/);
});

test('Genesis Ontology emits candidate vocabulary without canonicalizing it', () => {
  const event = eventFromGenesisOntology({ generatedAt: '2026-09-05T18:02:00Z', unresolvedInputCounts: { unknowns: 7, anomalies: 2, contradictions: 3 }, summary: { candidateConcepts: 6, generatedQuestions: 12 } });
  assert.equal(event.ok, true);
  assert.equal(event.event.kind, 'ONTOLOGY_CANDIDATE');
  assert.match(event.event.summary, /not canonical fact/);
});

test('Genesis Metabolism emits consolidation evidence', () => {
  const event = eventFromGenesisMetabolism({ generatedAt: '2026-09-05T18:03:00Z', inputCounts: { gamechanger: 2, evolution: 3 }, organs: { curiosity: { status: 'READY' }, memory: { status: 'DEGRADED' } } });
  assert.equal(event.ok, true);
  assert.equal(event.event.kind, 'METABOLISM_UPDATE');
  assert.match(event.event.summary, /curiosity:READY/);
});

test('GENESIS lobe compiler keeps missing organs absent instead of inventing receipts', () => {
  const result = compileGenesisLobeEvents({ evolution: { generatedAt: '2026-09-05T18:00:00Z', summary: {} } });
  assert.equal(result.ok, true);
  assert.equal(result.eventCount, 1);
  assert.equal(result.events[0].event.sourceNodeId, 'genesis-evolution');
});
