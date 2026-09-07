import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSelfMaintainerContinuation } from '../src/self-maintainer-continuation-policy.mjs';

const BASE = 'a'.repeat(40);
const task = status => decideSelfMaintainerContinuation({
  taskId: 'uberbond_self_maintain_aaaaaaaaaaaaaaaaaaaaaaaa',
  baseRevision: BASE,
  relayStatus: status,
  evidenceRefs: [`test:${status.toLowerCase()}`]
});

test('waiting for the existing worker never creates a duplicate attempt', () => {
  const result = task('WAITING_FOR_WORKER_RESULT');
  assert.equal(result.ok, true);
  assert.equal(result.status, 'WAIT_FOR_EXISTING_ATTEMPT');
  assert.equal(result.decision, 'DO_NOT_CREATE_DUPLICATE_TASK');
  assert.match(result.truthBoundary, /NOT BE COUNTED AS PROGRESS/);
});

test('review pending never reimplements or repromotes because an hour elapsed', () => {
  const result = task('ALREADY_PROMOTED_REVIEW_PENDING');
  assert.equal(result.status, 'REVIEW_PENDING');
  assert.equal(result.decision, 'DO_NOT_REIMPLEMENT_OR_REPROMOTE');
  assert.match(result.truthBoundary, /CLOCK TIME DOES NOT CREATE/);
});

for (const blocked of ['WORKER_REPAIR_REQUIRED', 'RELAY_UNAVAILABLE', 'PROMOTION_BLOCKED', 'RUNTIME_BLOCKED', 'CANDIDATE_REJECTED']) {
  test(`${blocked} requires strategy mutation instead of another clock retry`, () => {
    const result = task(blocked);
    assert.equal(result.ok, true);
    assert.equal(result.status, 'STRATEGY_MUTATION_REQUIRED');
    assert.equal(result.decision, 'DO_NOT_REPEAT_ON_NEXT_CLOCK_TICK');
    assert.equal(result.nextMechanismMustDiffer, true);
    assert.equal(result.requiresNewEvidenceOrNewMechanism, true);
    assert.equal(result.mutationPlan.identicalRetryAllowed, false);
    assert.ok(result.mutationPlan.forbidden.includes('blind-identical-retry'));
    assert.equal(result.businessEffectAuthority, 'NONE');
  });
}

test('authority/promotion block never recommends circumvention', () => {
  const result = task('PROMOTION_BLOCKED');
  assert.ok(result.mutationPlan.mutationFamilies.includes('find-lawful-substitute'));
  assert.ok(result.mutationPlan.mutationFamilies.includes('redesign-dependency'));
  assert.ok(result.mutationPlan.forbidden.includes('access-control-circumvention'));
  assert.ok(!result.mutationPlan.mutationFamilies.some(item => /circumvent|evad|bypass/i.test(item)));
});

test('successful/terminal primary results are not rewritten by continuation policy', () => {
  const result = task('VERIFIED_CHANGESET_PROMOTED_TO_REVIEW');
  assert.equal(result.status, 'CONTINUATION_NOT_REQUIRED');
  assert.equal(result.decision, 'FOLLOW_PRIMARY_RESULT');
});

test('exact base identity is mandatory', () => {
  const result = decideSelfMaintainerContinuation({ taskId: 'x', baseRevision: 'not-a-sha', relayStatus: 'WORKER_REPAIR_REQUIRED' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'CONTINUATION_REFUSED');
});
