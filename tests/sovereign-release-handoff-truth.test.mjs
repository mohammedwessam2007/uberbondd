import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSovereignReleaseRequest } from '../src/sovereign-release-handoff.mjs';

const merge = () => ({
  ok: true,
  status: 'SELF_MAINTAINER_PR_MERGED_AFTER_INDEPENDENT_VERIFICATION',
  prNumber: 700,
  headSha: 'b'.repeat(40),
  priorMainSha: 'a'.repeat(40),
  mergeCommitSha: 'c'.repeat(40),
  changeSetId: `agent_changes_${'1'.repeat(24)}`,
  receiptId: `self_maint_${'2'.repeat(24)}`,
  deploymentAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE'
});

test('release request names worker receipt without pretending it is a verifier receipt', () => {
  const request = compileSovereignReleaseRequest({ mergeReceipt: merge() });
  assert.equal(request.ok, true);
  assert.match(request.selfMaintenanceReceiptId, /^self_maint_/);
  assert.equal(Object.hasOwn(request, 'verificationReceiptId'), false);
  assert.match(request.independentVerificationClass, /MERGE_GOVERNOR_CONFIRMED/);
});

test('failure paths can never inherit authority from supplied merge metadata', () => {
  const receipt = merge();
  receipt.deploymentAuthority = 'GRANTED';
  const request = compileSovereignReleaseRequest({ mergeReceipt: receipt });
  assert.equal(request.ok, false);
  assert.equal(request.signingAuthority, 'NONE');
  assert.equal(request.deploymentAuthority, 'NONE');
  assert.equal(request.businessEffectAuthority, 'NONE');
  assert.equal(request.externalEffectAuthority, 'NONE');
});
