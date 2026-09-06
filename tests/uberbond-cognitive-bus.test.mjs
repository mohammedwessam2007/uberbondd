import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileCognitiveEvent,
  routeCognitiveEvent,
  compileClosedLoopActivation
} from '../src/uberbond-cognitive-bus.mjs';

test('world signal wakes Gamechanger without inheriting consequence authority', () => {
  const event = compileCognitiveEvent({
    kind: 'WORLD_SIGNAL',
    sourceNodeId: 'world-sensing',
    subjectType: 'TECHNOLOGY_CHANGE',
    subjectId: 'signal-1',
    summary: 'A bounded public frontier signal changed.',
    evidenceRefs: ['web:https://example.com/evidence']
  });
  assert.equal(event.ok, true);
  const route = routeCognitiveEvent({ compiledEvent: event });
  assert.equal(route.ok, true);
  assert.ok(route.activations.some(item => item.targetNodeId === 'gamechanger'));
  assert.ok(route.activations.every(item => item.businessEffectAuthority === 'NONE'));
  assert.ok(route.activations.every(item => item.consequenceAuthority === 'NONE'));
});

test('Genesis hypothesis fans into evolution, idea generation and opportunity work', () => {
  const event = compileCognitiveEvent({
    kind: 'GENESIS_HYPOTHESIS',
    sourceNodeId: 'genesis',
    subjectType: 'HYPOTHESIS',
    subjectId: 'hypothesis-1',
    summary: 'Recombine two distant mechanisms for bounded evaluation.',
    evidenceRefs: ['artifact:perpetual-frontier-genesis-latest']
  });
  const route = routeCognitiveEvent({ compiledEvent: event });
  const targets = new Set(route.activations.map(item => item.targetNodeId));
  for (const expected of ['genesis-evolution', 'idea-generator', 'opportunity-factory']) assert.equal(targets.has(expected), true);
});

test('commercial outcomes feed the allocator, genomes and trusted learning', () => {
  const event = compileCognitiveEvent({
    kind: 'COMMERCIAL_OUTCOME',
    sourceNodeId: 'payment-reconciliation',
    subjectType: 'ECONOMIC_RESULT',
    subjectId: 'outcome-1',
    summary: 'Observed bounded economic outcome for learning.',
    evidenceRefs: ['receipt:payment-truth-1'],
    truthClass: 'VERIFIED_CURRENT'
  });
  const route = routeCognitiveEvent({ compiledEvent: event });
  const targets = new Set(route.activations.map(item => item.targetNodeId));
  for (const expected of ['event-horizon', 'business-genome', 'opportunity-factory', 'capability-genome', 'economic-memory']) assert.equal(targets.has(expected), true);
});

test('blockers wake Wallbreaker and MAX Council rather than blind retrying', () => {
  const event = compileCognitiveEvent({
    kind: 'BLOCKER',
    sourceNodeId: 'self-maintainer',
    subjectType: 'ENGINEERING_BLOCKER',
    subjectId: 'blocker-1',
    summary: 'A materially different solution family is required.',
    evidenceRefs: ['test:failure-receipt-1']
  });
  const route = routeCognitiveEvent({ compiledEvent: event });
  const targets = new Set(route.activations.map(item => item.targetNodeId));
  assert.equal(targets.has('wallbreaker'), true);
  assert.equal(targets.has('max-council'), true);
});

test('closed-loop activation preserves zero external effects', () => {
  const events = [
    compileCognitiveEvent({ kind: 'WORLD_SIGNAL', sourceNodeId: 'world-sensing', subjectType: 'SIGNAL', subjectId: 's1', summary: 'Signal', evidenceRefs: ['web:one'] }),
    compileCognitiveEvent({ kind: 'CAPABILITY_GAP', sourceNodeId: 'event-horizon', subjectType: 'CAPABILITY', subjectId: 'c1', summary: 'Missing capability', evidenceRefs: ['artifact:gap'] }),
    compileCognitiveEvent({ kind: 'VERIFICATION_RESULT', sourceNodeId: 'self-maintainer', subjectType: 'CODE', subjectId: 'v1', summary: 'Verification result', evidenceRefs: ['test:verification'] })
  ];
  const cycle = compileClosedLoopActivation({ events });
  assert.equal(cycle.ok, true);
  assert.ok(cycle.activationCount >= 3);
  assert.equal(cycle.businessEffectAuthority, 'NONE');
  assert.equal(cycle.externalEffectLedger.messages, 0);
  assert.equal(cycle.externalEffectLedger.deployments, 0);
  assert.equal(cycle.externalEffectLedger.spendCents, 0);
});
