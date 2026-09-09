import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileSovereignReleaseRequest, verifySovereignReleaseRequest, admitOfflineReleasePack } from '../src/sovereign-release-handoff.mjs';

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const c = 'c'.repeat(40);
const merge = () => ({
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
});

test('verified autonomous merge compiles non-authoritative offline release request', () => {
  const r = compileSovereignReleaseRequest({ mergeReceipt: merge() });
  assert.equal(r.ok, true);
  assert.equal(r.sourceCommit, c);
  assert.equal(r.signingAuthority, 'NOT_GRANTED_BY_REQUEST');
  assert.equal(r.deploymentAuthority, 'NONE');
  assert.match(r.requestDigest, /^sha256:[a-f0-9]{64}$/);
});

test('unverified merge cannot request release', () => {
  const m = merge(); m.status = 'MERGED_SOMEHOW';
  const r = compileSovereignReleaseRequest({ mergeReceipt: m });
  assert.equal(r.ok, false);
  assert.ok(r.reasonCodes.includes('verified-autonomous-merge-receipt-required'));
});

test('merge receipt carrying deployment authority is refused', () => {
  const m = merge(); m.deploymentAuthority = 'GRANTED';
  const r = compileSovereignReleaseRequest({ mergeReceipt: m });
  assert.equal(r.ok, false);
  assert.ok(r.reasonCodes.includes('merge-receipt-must-not-carry-deployment-authority'));
});

test('request digest catches tampering', () => {
  const r = compileSovereignReleaseRequest({ mergeReceipt: merge() });
  r.sourceCommit = 'd'.repeat(40);
  const v = verifySovereignReleaseRequest(r);
  assert.equal(v.ok, false);
  assert.ok(v.reasonCodes.includes('release-request-digest-mismatch'));
});

test('request cannot grant itself signing authority', () => {
  const r = compileSovereignReleaseRequest({ mergeReceipt: merge() });
  r.signingAuthority = 'YES';
  const v = verifySovereignReleaseRequest(r);
  assert.equal(v.ok, false);
  assert.ok(v.reasonCodes.includes('request-cannot-grant-signing-authority'));
});

test('offline pack admission requires exact requested source', () => {
  const r = compileSovereignReleaseRequest({ mergeReceipt: merge() });
  const v = admitOfflineReleasePack({ request: r, localHeadSha: b, worktreeClean: true, signingKeyPresent: true });
  assert.equal(v.ok, false);
  assert.ok(v.reasonCodes.includes('local-head-must-equal-request-source-commit'));
});

test('offline pack admission requires clean tree and real local key', () => {
  const r = compileSovereignReleaseRequest({ mergeReceipt: merge() });
  for (const input of [
    { worktreeClean: false, signingKeyPresent: true, signingKeySymlink: false, code: 'clean-local-worktree-required' },
    { worktreeClean: true, signingKeyPresent: false, signingKeySymlink: false, code: 'offline-signing-key-required' },
    { worktreeClean: true, signingKeyPresent: true, signingKeySymlink: true, code: 'signing-key-symlink-refused' }
  ]) {
    const v = admitOfflineReleasePack({ request: r, localHeadSha: c, ...input });
    assert.equal(v.ok, false);
    assert.ok(v.reasonCodes.includes(input.code));
  }
});

test('admitted offline pack still has zero deployment authority', () => {
  const r = compileSovereignReleaseRequest({ mergeReceipt: merge() });
  const v = admitOfflineReleasePack({ request: r, localHeadSha: c, worktreeClean: true, signingKeyPresent: true });
  assert.equal(v.ok, true);
  assert.equal(v.status, 'OFFLINE_RELEASE_PACK_ADMITTED');
  assert.equal(v.deploymentAuthority, 'NONE');
  assert.equal(v.businessEffectAuthority, 'NONE');
});

test('request CLI is compilation only and carries no signing or deploy primitive', () => {
  const body = readFileSync(new URL('../scripts/sovereign-release-request.mjs', import.meta.url), 'utf8');
  assert.match(body, /compileSovereignReleaseRequest/);
  assert.doesNotMatch(body, /execFileSync|spawnSync|UBERBOND_RELEASE_SIGNING_KEY/);
});

test('offline pack controller invokes only sovereign pack entrypoint', () => {
  const body = readFileSync(new URL('../ops/sovereign/pack-release-request.mjs', import.meta.url), 'utf8');
  assert.match(body, /\['pack', '\.'\]/);
  assert.doesNotMatch(body, /\['deploy'/);
  assert.match(body, /signingKeySymlink/);
  assert.match(body, /deploymentAuthority: 'NONE'/);
});

test('offline pack controller never accepts signing authority from request', () => {
  const body = readFileSync(new URL('../ops/sovereign/pack-release-request.mjs', import.meta.url), 'utf8');
  assert.match(body, /process\.env\.UBERBOND_RELEASE_SIGNING_KEY/);
  assert.doesNotMatch(body, /request\.signingKey|request\.privateKey|request\.secret/);
});

test('merge governor emits request artifact but never signs or deploys from GitHub', () => {
  const body = readFileSync(new URL('../.github/workflows/uberbond-self-maintainer-merge-governor.yml', import.meta.url), 'utf8');
  assert.match(body, /sovereign-release-request\.mjs/);
  assert.match(body, /actions\/upload-artifact@v4/);
  assert.match(body, /signingAuthority\s*!==\s*'NOT_GRANTED_BY_REQUEST'/);
  assert.doesNotMatch(body, /UBERBOND_RELEASE_SIGNING_KEY/);
  assert.doesNotMatch(body, /uberbondctl\s+(?:pack|deploy)/);
});
