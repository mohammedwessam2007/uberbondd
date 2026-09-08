import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideSelfMaintainerContinuation,
  gateSelfMaintainerPulse
} from '../src/self-maintainer-continuation-policy.mjs';

const BASE = 'a'.repeat(40);
const NEXT_BASE = 'b'.repeat(40);
const TASK_ID = 'uberbond_self_maintain_aaaaaaaaaaaaaaaaaaaaaaaa';
const task = (status, reasonCodes = []) => decideSelfMaintainerContinuation({
  taskId: TASK_ID,
  baseRevision: BASE,
  relayStatus: status,
  reasonCodes,
  evidenceRefs: [`test:${status.toLowerCase()}`, ...reasonCodes.map(code => `reason:${code}`)]
});
const receipt = ({ status, issueNumber = 487, baseRevision = BASE } = {}) => ({
  schemaVersion: 'uberbond.self-maintainer-continuation-receipt.v1',
  observedBaseRevision: baseRevision,
  observedIssueNumber: issueNumber,
  continuation: { status },
  businessEffectAuthority: 'NONE'
});

test('waiting for the existing worker never creates a duplicate attempt', () => {
  const result = task('WAITING_FOR_WORKER_RESULT');
  assert.equal(result.ok, true);
  assert.equal(result.status, 'WAIT_FOR_EXISTING_ATTEMPT');
  assert.equal(result.decision, 'DO_NOT_CREATE_DUPLICATE_TASK');
  assert.match(result.truthBoundary, /NOT BE COUNTED AS PROGRESS/);
});

test('same-base WAIT resumes only the exact existing relay issue so worker completion can still be observed', () => {
  const result = gateSelfMaintainerPulse({
    currentBaseRevision: BASE,
    priorReceipt: receipt({ status: 'WAIT_FOR_EXISTING_ATTEMPT', issueNumber: 487 })
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'CURRENT_BASE_EXISTING_ATTEMPT_RESUME_ONLY');
  assert.equal(result.runPrimaryTick, true);
  assert.equal(result.resumeExistingAttemptOnly, true);
  assert.equal(result.resumeIssueNumber, 487);
  assert.equal(result.requiredDecision, 'READ_OR_ADVANCE_EXISTING_ATTEMPT_ONLY');
  assert.match(result.truthBoundary, /MAY NOT CREATE A SECOND TASK/);
});

test('same-base WAIT without an exact issue binding fails closed instead of creating a new task', () => {
  const result = gateSelfMaintainerPulse({
    currentBaseRevision: BASE,
    priorReceipt: receipt({ status: 'WAIT_FOR_EXISTING_ATTEMPT', issueNumber: null })
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'CURRENT_BASE_WAIT_WITHOUT_BOUND_ATTEMPT_BLOCKED');
  assert.equal(result.runPrimaryTick, false);
  assert.ok(result.reasonCodes.includes('waiting-continuation-requires-existing-issue-binding'));
});

test('review pending never reimplements or repromotes because an hour elapsed', () => {
  const result = task('ALREADY_PROMOTED_REVIEW_PENDING');
  assert.equal(result.status, 'REVIEW_PENDING');
  assert.equal(result.decision, 'DO_NOT_REIMPLEMENT_OR_REPROMOTE');
  assert.match(result.truthBoundary, /CLOCK TIME DOES NOT CREATE/);
});

for (const blocked of ['WORKER_REPAIR_REQUIRED', 'RELAY_UNAVAILABLE', 'PROMOTION_BLOCKED', 'RUNTIME_BLOCKED']) {
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

test('malformed or unsafe candidate rejection mutates the candidate-generation strategy', () => {
  const result = task('CANDIDATE_REJECTED', ['candidate-required-verification-missing']);
  assert.equal(result.status, 'STRATEGY_MUTATION_REQUIRED');
  assert.equal(result.nextMechanismMustDiffer, true);
  assert.equal(result.mutationPlan.identicalRetryAllowed, false);
});

test('principled worker STOP is preserved as a stopping rule instead of forced mutation', () => {
  const result = task('CANDIDATE_REJECTED', ['worker-decision-stop']);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'NO_SAFE_CHANGE_THIS_BASE');
  assert.equal(result.decision, 'WAIT_FOR_NEW_EVIDENCE_OR_MAIN_CHANGE');
  assert.equal(result.nextMechanismMustDiffer, false);
  assert.equal(result.requiresNewEvidenceOrNewMechanism, true);
  assert.match(result.truthBoundary, /PRINCIPLED STOP IS A STOPPING RULE/);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

for (const status of ['REVIEW_PENDING', 'NO_SAFE_CHANGE_THIS_BASE', 'STRATEGY_MUTATION_REQUIRED']) {
  test(`same-base ${status} blocks ordinary re-entry`, () => {
    const result = gateSelfMaintainerPulse({
      currentBaseRevision: BASE,
      priorReceipt: receipt({ status })
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'CURRENT_BASE_REENTRY_BLOCKED');
    assert.equal(result.runPrimaryTick, false);
    assert.equal(result.resumeExistingAttemptOnly, false);
  });
}

test('a genuinely new main SHA reopens evaluation instead of inheriting an old same-base STOP', () => {
  const result = gateSelfMaintainerPulse({
    currentBaseRevision: NEXT_BASE,
    priorReceipt: receipt({ status: 'NO_SAFE_CHANGE_THIS_BASE', baseRevision: BASE })
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PULSE_ALLOWED_NEW_BASE_EVIDENCE');
  assert.equal(result.runPrimaryTick, true);
  assert.equal(result.resumeExistingAttemptOnly, false);
});

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
