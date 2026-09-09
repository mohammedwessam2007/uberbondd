import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalMergeAdmissionEnvelope,
  compilePendingForgeDecision,
  newPendingForgeState,
  parseRuntimeReleaseReceipt,
  RUNTIME_RELEASE_RECEIPT_SCHEMA,
  selectSovereignForgeProvider
} from '../src/sovereign-autonomy-forge.mjs';

const BASE = '1'.repeat(40);
const HEAD = '2'.repeat(40);
const CHANGE = 'agent_changes_' + 'a'.repeat(24);
const RECEIPT = 'self_maint_' + 'b'.repeat(24);
const RELEASE = `release-${HEAD}`;
const SEQUENCE = '20260909235959';

function runtimeReceipt(status, extra = {}) {
  return {
    schemaVersion: RUNTIME_RELEASE_RECEIPT_SCHEMA,
    status,
    releaseName: RELEASE,
    sourceCommit: HEAD,
    releaseSequence: SEQUENCE,
    recordedAt: '2026-09-09T20:00:00.000Z',
    exitCode: status === 'REJECTED' ? 2 : 0,
    ...extra
  };
}

function pending() {
  const compiled = newPendingForgeState({
    baseRevision: BASE,
    candidateRevision: HEAD,
    branchName: 'uberbond/self-maintain/task-aaaaaaaaaaaa',
    taskId: 'task_1',
    changeSetId: CHANGE,
    receiptId: RECEIPT,
    releaseName: RELEASE,
    releaseSequence: SEQUENCE,
    createdAt: new Date('2026-09-09T19:59:00.000Z')
  });
  assert.equal(compiled.ok, true);
  return compiled.state;
}

test('sovereign forge prefers a ready open model and grants no authority', () => {
  const selected = selectSovereignForgeProvider([
    { provider: 'open-model', ready: true, blockers: [] },
    { provider: 'openai', ready: true, blockers: [] }
  ]);
  assert.equal(selected.ok, true);
  assert.equal(selected.provider, 'open-model');
  assert.equal(selected.sovereignPreferred, true);
  assert.equal(selected.businessEffectAuthority, 'NONE');
});

test('sovereign forge does not silently fall back to an external model', () => {
  const selected = selectSovereignForgeProvider([
    { provider: 'open-model', ready: false, blockers: ['runtime-absent'] },
    { provider: 'openai', ready: true, blockers: [] }
  ]);
  assert.equal(selected.ok, false);
  assert.equal(selected.status, 'MODEL_PROVIDER_BLOCKED');
  assert.match(selected.reasonCodes.join(','), /runtime-absent/);
});

test('external provider fallback requires an explicit opt-in', () => {
  const selected = selectSovereignForgeProvider([
    { provider: 'open-model', ready: false, blockers: ['runtime-absent'] },
    { provider: 'openai', ready: true, blockers: [] }
  ], { allowExternalFallback: true });
  assert.equal(selected.ok, true);
  assert.equal(selected.provider, 'openai');
  assert.equal(selected.status, 'MODEL_PROVIDER_READY_WITH_EXPLICIT_FALLBACK');
});

test('runtime admission receipt is exact-release and exact-source syntactically bound', () => {
  const parsed = parseRuntimeReleaseReceipt(runtimeReceipt('ADMITTED'), { expectedReleaseName: RELEASE });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.receipt.sourceCommit, HEAD);
  const wrong = parseRuntimeReleaseReceipt(runtimeReceipt('ADMITTED', { sourceCommit: BASE }), { expectedReleaseName: RELEASE });
  assert.equal(wrong.ok, true);
  assert.equal(wrong.receipt.sourceCommit, BASE);
});

test('runtime receipt rejects an unexpected release identity', () => {
  const parsed = parseRuntimeReleaseReceipt(runtimeReceipt('ADMITTED'), { expectedReleaseName: 'different-release' });
  assert.equal(parsed.ok, false);
  assert.match(parsed.reasonCodes.join(','), /runtime-release-name-mismatch/);
});

test('pending candidate advances only after admitted receipt and runtime state agree', () => {
  const decision = compilePendingForgeDecision({
    pending: pending(),
    admittedReceipt: runtimeReceipt('ADMITTED'),
    runtimeSourceCommit: HEAD
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.status, 'ADVANCE_CANONICAL_SOURCE_AFTER_RUNTIME_ADMISSION');
});

test('pending state digest is load-bearing and tamper evidence refuses admission', () => {
  const state = pending();
  state.candidateRevision = BASE;
  const decision = compilePendingForgeDecision({
    pending: state,
    admittedReceipt: runtimeReceipt('ADMITTED'),
    runtimeSourceCommit: HEAD
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.status, 'PENDING_STATE_REJECTED');
  assert.ok(decision.reasonCodes.includes('pending-forge-state-digest-invalid'));
});

test('admitted receipt cannot advance source when runtime state is missing', () => {
  const decision = compilePendingForgeDecision({
    pending: pending(),
    admittedReceipt: runtimeReceipt('ADMITTED')
  });
  assert.equal(decision.ok, false);
  assert.ok(decision.reasonCodes.includes('runtime-state-source-commit-required'));
});

test('admitted receipt without matching runtime state is refused', () => {
  const decision = compilePendingForgeDecision({
    pending: pending(),
    admittedReceipt: runtimeReceipt('ADMITTED'),
    runtimeSourceCommit: BASE
  });
  assert.equal(decision.ok, false);
  assert.match(decision.reasonCodes.join(','), /runtime-state-does-not-confirm-admitted-candidate/);
});

test('admitted receipt must carry the exact pending release sequence', () => {
  const decision = compilePendingForgeDecision({
    pending: pending(),
    admittedReceipt: runtimeReceipt('ADMITTED', { releaseSequence: '20260910000000' }),
    runtimeSourceCommit: HEAD
  });
  assert.equal(decision.ok, false);
  assert.ok(decision.reasonCodes.includes('admitted-receipt-release-sequence-mismatch'));
});

test('rejected runtime release becomes strategy mutation evidence', () => {
  const decision = compilePendingForgeDecision({
    pending: pending(),
    rejectedReceipt: runtimeReceipt('REJECTED')
  });
  assert.equal(decision.ok, true);
  assert.equal(decision.status, 'ROLL_BACK_CANDIDATE_AND_MUTATE_STRATEGY');
  assert.match(decision.blockerFingerprint, /^[a-f0-9]{64}$/);
});

test('rejected receipt must carry the exact pending release sequence', () => {
  const decision = compilePendingForgeDecision({
    pending: pending(),
    rejectedReceipt: runtimeReceipt('REJECTED', { releaseSequence: '20260910000000' })
  });
  assert.equal(decision.ok, false);
  assert.ok(decision.reasonCodes.includes('rejected-receipt-release-sequence-mismatch'));
});

test('conflicting admitted and rejected receipts fail closed', () => {
  const decision = compilePendingForgeDecision({
    pending: pending(),
    admittedReceipt: runtimeReceipt('ADMITTED'),
    rejectedReceipt: runtimeReceipt('REJECTED'),
    runtimeSourceCommit: HEAD
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.status, 'RUNTIME_ADMISSION_CONFLICT');
});

test('absence of runtime receipt waits instead of replaying or manufacturing success', () => {
  const decision = compilePendingForgeDecision({ pending: pending(), runtimeSourceCommit: BASE });
  assert.equal(decision.ok, true);
  assert.equal(decision.status, 'WAIT_FOR_RUNTIME_ADMISSION_RECEIPT');
});

test('local merge admission envelope binds exact base, candidate, change set and receipt', () => {
  const envelope = buildLocalMergeAdmissionEnvelope({
    baseRevision: BASE,
    candidateRevision: HEAD,
    branchName: 'uberbond/self-maintain/task-aaaaaaaaaaaa',
    taskId: 'task_1',
    changeSetId: CHANGE,
    receiptId: RECEIPT,
    changedFiles: [{ filename: 'src/example.mjs', status: 'modified', patch: '@@ test @@', additions: 1, deletions: 1 }]
  });
  assert.equal(envelope.ok, true);
  assert.match(envelope.pullRequest.body, new RegExp(`Base: ${BASE}`));
  assert.match(envelope.pullRequest.body, new RegExp(`Candidate commit: ${HEAD}`));
  assert.match(envelope.pullRequest.body, new RegExp(`Change set: ${CHANGE}`));
  assert.match(envelope.pullRequest.body, new RegExp(`Self-maintenance receipt: ${RECEIPT}`));
});

test('local merge admission rejects non-self-maintainer branch', () => {
  const envelope = buildLocalMergeAdmissionEnvelope({
    baseRevision: BASE,
    candidateRevision: HEAD,
    branchName: 'feature/not-autonomous',
    taskId: 'task_1',
    changeSetId: CHANGE,
    receiptId: RECEIPT
  });
  assert.equal(envelope.ok, false);
  assert.match(envelope.reasonCodes.join(','), /branch-prefix/);
});

test('pending state is cryptographically identified and authority-free', () => {
  const compiled = newPendingForgeState({
    baseRevision: BASE,
    candidateRevision: HEAD,
    branchName: 'uberbond/self-maintain/task-aaaaaaaaaaaa',
    taskId: 'task_1',
    changeSetId: CHANGE,
    receiptId: RECEIPT,
    releaseName: RELEASE,
    releaseSequence: SEQUENCE,
    createdAt: new Date('2026-09-09T20:00:00.000Z')
  });
  assert.equal(compiled.ok, true);
  assert.match(compiled.state.stateDigest, /^[a-f0-9]{64}$/);
  assert.equal(compiled.state.businessEffectAuthority, 'NONE');
});

test('invalid pending timestamp is refused before digest creation', () => {
  const compiled = newPendingForgeState({
    baseRevision: BASE,
    candidateRevision: HEAD,
    branchName: 'uberbond/self-maintain/task-aaaaaaaaaaaa',
    taskId: 'task_1',
    changeSetId: CHANGE,
    receiptId: RECEIPT,
    releaseName: RELEASE,
    releaseSequence: SEQUENCE,
    createdAt: 'not-a-date'
  });
  assert.equal(compiled.ok, false);
  assert.ok(compiled.reasonCodes.includes('pending-state-created-at-invalid'));
});
