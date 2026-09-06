import test from 'node:test';
import assert from 'node:assert/strict';

import { compileCognitiveEvent } from '../src/uberbond-cognitive-bus.mjs';
import { compileWallbreakerReflex, compileWallbreakerReflexes } from '../src/wallbreaker-cognitive-reflex.mjs';

function event(kind, sourceNodeId = 'self-maintainer') {
  return compileCognitiveEvent({
    kind,
    sourceNodeId,
    subjectType: 'TEST_SIGNAL',
    subjectId: `${kind.toLowerCase()}-1`,
    summary: 'Bounded test signal.',
    evidenceRefs: ['test:cognitive-reflex']
  });
}

test('capability gap becomes capability-acquisition countermoves', () => {
  const reflex = compileWallbreakerReflex(event('CAPABILITY_GAP', 'capability-genome'));
  assert.equal(reflex.ok, true, JSON.stringify(reflex));
  assert.equal(reflex.failureClass, 'CAPABILITY_GAP');
  assert.ok(reflex.countermoveTypes.includes('query-capability-genome'));
  assert.ok(reflex.countermoveTypes.includes('benchmark-substitutes'));
  assert.equal(reflex.businessEffectAuthority, 'NONE');
});

test('self-maintainer blocker becomes implementation repair rather than blind identical retry', () => {
  const reflex = compileWallbreakerReflex(event('BLOCKER', 'self-maintainer'));
  assert.equal(reflex.ok, true);
  assert.equal(reflex.failureClass, 'IMPLEMENTATION_DEFECT');
  assert.equal(reflex.safeToRetrySameMechanism, false);
  assert.ok(reflex.countermoveTypes.includes('localize-defect'));
  assert.ok(reflex.countermoveTypes.includes('rerun-verifier'));
});

test('contradiction invalidates assumptions and expands solution families', () => {
  const reflex = compileWallbreakerReflex(event('CONTRADICTION', 'event-horizon'));
  assert.equal(reflex.ok, true);
  assert.equal(reflex.failureClass, 'WRONG_ASSUMPTION');
  assert.ok(reflex.countermoveTypes.includes('invalidate-assumption'));
  assert.ok(reflex.countermoveTypes.includes('expand-solution-families'));
});

test('non-failure events do not manufacture a Wallbreaker problem', () => {
  assert.equal(compileWallbreakerReflex(event('WORLD_SIGNAL', 'world-sensing')), null);
});

test('reflex batch exposes sanitized failure and countermove counts', () => {
  const result = compileWallbreakerReflexes([
    event('CAPABILITY_GAP', 'capability-genome'),
    event('BLOCKER', 'self-maintainer'),
    event('WORLD_SIGNAL', 'world-sensing')
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.reflexCount, 2);
  assert.equal(result.failureClassCounts.CAPABILITY_GAP, 1);
  assert.equal(result.failureClassCounts.IMPLEMENTATION_DEFECT, 1);
  assert.equal(result.businessEffectAuthority, 'NONE');
});
