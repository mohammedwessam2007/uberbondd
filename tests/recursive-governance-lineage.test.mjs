import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyRecursiveGovernanceLineage } from '../src/recursive-governance-lineage.mjs';

const D = ch => `sha256:${String(ch).repeat(64).slice(0,64)}`;

function generation(id, over = {}) {
  return {
    generationId: id,
    parentGenerationId: null,
    proposerId: `${id}:p`,
    approverId: `${id}:a`,
    deployerId: `${id}:d`,
    verifierId: `${id}:v`,
    monitorId: `${id}:m`,
    policyDigest: D('a'),
    constitutionalDigest: D('c'),
    riskTier: 'CRITICAL',
    securityEnvelopeTier: 'CRITICAL',
    constitutionalMutationApproved: false,
    ownerAuthorityRef: null,
    policyMutationApproved: false,
    policyAuthorityRef: null,
    independentPolicyVerifierId: null,
    ...over
  };
}

function chain(...rows) {
  return rows.map((row, i) => ({ ...row, parentGenerationId: i ? rows[i - 1].generationId : null }));
}

test('ancestor proposer cannot become descendant verifier', () => {
  const g1 = generation('g1');
  const g2 = generation('g2', { verifierId: g1.proposerId });
  const out = verifyRecursiveGovernanceLineage({ generations: chain(g1, g2) });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('ancestor-builder-cannot-verify-descendant:g2'));
});

test('ancestor deployer cannot become descendant monitor', () => {
  const g1 = generation('g1');
  const g2 = generation('g2', { monitorId: g1.deployerId });
  const out = verifyRecursiveGovernanceLineage({ generations: chain(g1, g2) });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('ancestor-builder-cannot-monitor-descendant:g2'));
});

test('policy digest cannot drift without explicit authority', () => {
  const g1 = generation('g1');
  const g2 = generation('g2', { policyDigest: D('b') });
  const out = verifyRecursiveGovernanceLineage({ generations: chain(g1, g2) });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('policy-mutation-requires-explicit-authority:g2'));
});

test('policy change requires independent verifier', () => {
  const g1 = generation('g1');
  const g2 = generation('g2', { policyDigest: D('b'), policyMutationApproved: true, policyAuthorityRef: 'authority://founder/policy-1' });
  const out = verifyRecursiveGovernanceLineage({ generations: chain(g1, g2) });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('policy-mutation-independent-verifier-required:g2'));
});

test('policy verifier cannot come from parent or current build lineage', () => {
  const g1 = generation('g1');
  const g2 = generation('g2', {
    policyDigest: D('b'),
    policyMutationApproved: true,
    policyAuthorityRef: 'authority://founder/policy-1',
    independentPolicyVerifierId: g1.deployerId
  });
  const out = verifyRecursiveGovernanceLineage({ generations: chain(g1, g2) });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('policy-mutation-verifier-must-be-independent-of-build-lineage:g2'));
});

test('explicit independently verified policy mutation can remain structurally valid', () => {
  const g1 = generation('g1');
  const g2 = generation('g2', {
    policyDigest: D('b'),
    policyMutationApproved: true,
    policyAuthorityRef: 'authority://founder/policy-1',
    independentPolicyVerifierId: 'independent:policy-verifier'
  });
  const out = verifyRecursiveGovernanceLineage({ generations: chain(g1, g2) });
  assert.equal(out.ok, true);
  assert.equal(out.runtimeProof, 'NONE__STRUCTURAL_LINEAGE_ONLY');
  assert.equal(out.businessEffectAuthority, 'NONE');
  assert.equal(out.asiClaim, 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');
});
