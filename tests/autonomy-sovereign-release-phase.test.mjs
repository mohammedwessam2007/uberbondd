import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAutonomySovereignReleasePhase } from '../src/autonomy-sovereign-release-phase.mjs';
import { compileSovereignReleaseRequest } from '../src/sovereign-release-handoff.mjs';

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const c = 'c'.repeat(40);
function request() {
  return compileSovereignReleaseRequest({
    mergeReceipt: {
      ok: true,
      status: 'SELF_MAINTAINER_PR_MERGED_AFTER_INDEPENDENT_VERIFICATION',
      prNumber: 700,
      headSha: b,
      priorMainSha: a,
      mergeCommitSha: c,
      changeSetId: `agent_changes_${'1'.repeat(24)}`,
      receiptId: `self_maint_${'2'.repeat(24)}`,
      deploymentAuthority: 'NONE',
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE'
    }
  });
}

test('missing release request stays not observed and runtime proof pending', () => {
  const out = summarizeAutonomySovereignReleasePhase({ evidenceState: 'UNAVAILABLE', currentSourceCommit: c });
  assert.equal(out.releasePhase, 'NOT_OBSERVED');
  assert.equal(out.runtimePhase, 'RUNTIME_PROOF_PENDING');
  assert.equal(out.deploymentAuthority, 'NONE');
});

test('valid current release request is pending offline signer only', () => {
  const out = summarizeAutonomySovereignReleasePhase({ evidenceState: 'AVAILABLE', request: request(), currentSourceCommit: c });
  assert.equal(out.releasePhase, 'PENDING_OFFLINE_SIGNER');
  assert.equal(out.runtimePhase, 'WAITING_FOR_SIGNED_RELEASE_AND_REAL_HOST_REHEARSAL');
  assert.equal(out.signingAuthority, 'NOT_GRANTED_BY_REQUEST');
  assert.equal(out.deploymentAuthority, 'NONE');
});

test('request for an older merge cannot make newer main look deployable', () => {
  const out = summarizeAutonomySovereignReleasePhase({ evidenceState: 'AVAILABLE', request: request(), currentSourceCommit: 'd'.repeat(40) });
  assert.equal(out.releasePhase, 'STALE_FOR_CURRENT_SOURCE');
  assert.ok(out.reasonCodes.includes('release-request-source-does-not-equal-current-source'));
  assert.equal(out.deploymentAuthority, 'NONE');
});

test('tampered request is invalid rather than pending', () => {
  const r = request();
  r.sourceCommit = 'd'.repeat(40);
  const out = summarizeAutonomySovereignReleasePhase({ evidenceState: 'AVAILABLE', request: r, currentSourceCommit: 'd'.repeat(40) });
  assert.equal(out.releasePhase, 'INVALID');
  assert.ok(out.reasonCodes.includes('release-request-digest-mismatch'));
});

test('verified named runtime is not downgraded by missing release-request evidence', () => {
  const out = summarizeAutonomySovereignReleasePhase({ evidenceState: 'UNAVAILABLE', currentSourceCommit: c, namedRuntimeStatus: 'NAMED_RUNTIME_VERIFIED_WITHIN_REHEARSED_SCOPE' });
  assert.equal(out.releasePhase, 'NOT_REQUIRED_FOR_ALREADY_VERIFIED_RUNTIME_SCOPE');
  assert.equal(out.runtimePhase, 'VERIFIED_WITHIN_REHEARSED_SCOPE');
  assert.equal(out.deploymentAuthority, 'NONE');
});
