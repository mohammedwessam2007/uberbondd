import test from 'node:test';
import assert from 'node:assert/strict';

import { createAuthorityRoot, delegateAuthority, revokeAuthority, authorityIsUsable } from '../src/uberos/authority.mjs';
import { normalizePackageProvenance, comparePackageProvenance } from '../src/uberos/package-provenance.mjs';
import { compileStateTransition, compileRollbackReceipt } from '../src/uberos/state-engine.mjs';
import { normalizeKernelAdapter, selectKernelAdapter } from '../src/uberos/kernel-adapter.mjs';
import { compileAssumptionExperiment, analyzeExperimentOutcomes, defaultOsAssumptionPortfolio } from '../src/uberos/unknown-unknown-lab.mjs';
import { compileUberOsManifest } from '../src/uberos/system-compiler.mjs';

const sha = char => `sha256:${char.repeat(64)}`;

test('authority delegation can narrow but cannot widen', () => {
  const root = createAuthorityRoot({ authorityId: 'root', scopes: ['boot', 'inspect'], effects: ['read-local-state'], provenanceRef: 'founder-authority-epoch-1' });
  assert.equal(root.ok, true);
  const child = delegateAuthority(root.authority, { authorityId: 'doctor', scopes: ['inspect'], effects: ['read-local-state'], provenanceRef: 'mission:doctor' });
  assert.equal(child.ok, true);
  const widened = delegateAuthority(child.authority, { authorityId: 'bad', scopes: ['inspect', 'deploy'], effects: ['read-local-state'], provenanceRef: 'mission:bad' });
  assert.equal(widened.ok, false);
  assert.match(widened.reasonCodes.join(','), /scope-expansion-forbidden/);
});

test('revocation makes an authority unusable', () => {
  const root = createAuthorityRoot({ authorityId: 'root', scopes: ['inspect'], effects: [], provenanceRef: 'epoch' }).authority;
  const revoked = revokeAuthority(root, { reason: 'rotation' });
  assert.equal(revoked.ok, true);
  assert.equal(authorityIsUsable(revoked.authority), false);
});

test('package provenance requires cryptographic source and recipe identities', () => {
  const row = normalizePackageProvenance({ name: 'busybox', version: '1', source: 'https://example.invalid/busybox.tar.xz', sourceDigest: sha('a'), buildRecipeDigest: sha('b'), license: 'GPL-2.0', capabilities: ['base-userspace'] });
  assert.equal(row.ok, true);
  const bad = normalizePackageProvenance({ name: 'mystery', version: '1', source: 'somewhere', license: 'UNKNOWN' });
  assert.equal(bad.ok, false);
});

test('package comparison flags permission and network widening', () => {
  const base = normalizePackageProvenance({ name: 'x', version: '1', source: 's', sourceDigest: sha('a'), buildRecipeDigest: sha('b'), license: 'MIT', permissions: ['read'] });
  const next = normalizePackageProvenance({ name: 'x', version: '2', source: 's', sourceDigest: sha('c'), buildRecipeDigest: sha('d'), license: 'MIT', permissions: ['read', 'write'], networkDestinations: ['example.org'] });
  const diff = comparePackageProvenance(base, next);
  assert.equal(diff.requiresFreshReview, true);
  assert.deepEqual(diff.widenedPermissions, ['write']);
  assert.deepEqual(diff.widenedNetwork, ['example.org']);
});

test('transactional state refuses promotion when one check fails', () => {
  const row = compileStateTransition({ currentState: { generation: 1 }, candidateState: { generation: 2 }, checks: [{ id: 'boot', passed: true, evidenceRef: 'test:boot' }, { id: 'replay', passed: false, evidenceRef: 'test:replay' }], rollback: { restore: 'generation-1' }, provenanceRef: 'candidate:2' });
  assert.equal(row.ok, true);
  assert.equal(row.promotable, false);
  assert.deepEqual(row.failedChecks, ['replay']);
});

test('rollback receipts bind transition and restored state', () => {
  const row = compileRollbackReceipt({ transitionDigest: sha('e'), restoredState: { generation: 1 }, cause: 'canary failed', observedAt: '2026-09-15T00:00:00Z' });
  assert.equal(row.ok, true);
  assert.match(row.receipt.receiptDigest, /^sha256:/);
});

test('kernel selection treats Linux as preferred but replaceable', () => {
  const linux = normalizeKernelAdapter({ id: 'linux', kernelClass: 'LINUX', sourceRef: 'kernel.org', revision: 'lts', license: 'GPL-2.0', abi: 'linux-syscall', capabilities: ['process', 'memory', 'fs'] });
  const future = normalizeKernelAdapter({ id: 'future', kernelClass: 'EXPERIMENTAL_KERNEL', sourceRef: 'local', revision: '0', license: 'MIT', abi: 'uberos-kernel-v1', capabilities: ['process', 'memory', 'fs'] });
  const selected = selectKernelAdapter({ adapters: [future.adapter, linux.adapter], requiredCapabilities: ['process', 'memory', 'fs'] });
  assert.equal(selected.ok, true);
  assert.equal(selected.adapter.id, 'linux');
  assert.deepEqual(selected.alternatives, ['future']);
});

test('unknown-unknown lab compiles perturbations without claiming findings', () => {
  const row = compileAssumptionExperiment({ assumption: 'time is monotonic', invariant: 'replay remains safe', observable: 'duplicate effect' });
  assert.equal(row.ok, true);
  assert.equal(row.experiment.perturbations.length >= 10, true);
});

test('unknown-unknown analysis preserves the question-only boundary', () => {
  const result = analyzeExperimentOutcomes({ observations: [{ statement: 'same anomaly', source: 'a', verdict: 'RESISTS_EXPLANATION', domain: 'clock' }, { statement: 'same anomaly', source: 'b', verdict: 'RESISTS_EXPLANATION', domain: 'clock' }], declaredDomains: ['clock'], sourceCoverage: { a: ['clock'], b: ['clock'] } });
  assert.equal(result.ok, true);
  assert.equal(result.mining.questions.length, 1);
  assert.match(result.promotionBoundary, /NO_AUTOMATIC/);
});

test('default OS assumption portfolio is broad and finite', () => {
  const rows = defaultOsAssumptionPortfolio();
  assert.equal(rows.length, 12);
  assert.equal(new Set(rows.map(row => row.assumption)).size, rows.length);
});

test('system compiler produces a digest only for admissible manifests', () => {
  const manifest = { schemaVersion: 'uberos.machine-manifest.v1', identity: { name: 'UBER/OS', generation: '0' }, authorityRoot: { authorityId: 'uberos-root', epoch: 1, scopes: ['boot', 'inspect'], effects: ['read-local-state'], provenanceRef: 'founder-constitution' }, packages: [{ name: 'base-userspace', version: '0', source: 'buildroot:2026.08', sourceDigest: sha('a'), buildRecipeDigest: sha('b'), license: 'GPL-2.0', capabilities: ['base-userspace'] }], kernelAdapters: [{ id: 'linux-bootstrap', kernelClass: 'LINUX', sourceRef: 'buildroot-qemu-defconfig', revision: 'captured-at-build', license: 'GPL-2.0', abi: 'linux-syscall', capabilities: ['process', 'memory', 'filesystem', 'network'] }], requiredKernelCapabilities: ['process', 'memory', 'filesystem'] };
  const compiled = compileUberOsManifest(manifest);
  assert.equal(compiled.ok, true);
  assert.match(compiled.manifest.manifestDigest, /^sha256:/);
  assert.equal(compiled.manifest.aiPolicy.bootRequiresModel, false);
});
