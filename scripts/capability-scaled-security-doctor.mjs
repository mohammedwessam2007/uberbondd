#!/usr/bin/env node
import {
  evaluateCompositionAuthorityBoundary,
  verifyRecursiveGovernanceChain
} from '../src/capability-scaled-security.mjs';
import { verifyRecursiveGovernanceLineage } from '../src/recursive-governance-lineage.mjs';

const D = ch => `sha256:${String(ch).repeat(64).slice(0, 64)}`;

const composition = evaluateCompositionAuthorityBoundary({
  components: [
    { id: 'planner', authorities: [] },
    { id: 'deployer', authorities: ['production.deploy'] }
  ],
  requestedPermissions: ['production.deploy'],
  explicitCompositionAuthority: ['production.deploy'],
  authorityRef: 'synthetic://doctor/composition-authority'
});

const g1 = {
  generationId: 'doctor-g1',
  parentGenerationId: null,
  proposerId: 'doctor:g1:proposer',
  approverId: 'doctor:g1:approver',
  deployerId: 'doctor:g1:deployer',
  verifierId: 'doctor:g1:verifier',
  monitorId: 'doctor:g1:monitor',
  policyDigest: D('a'),
  constitutionalDigest: D('c'),
  riskTier: 'CRITICAL',
  securityEnvelopeTier: 'CRITICAL'
};
const g2 = {
  ...g1,
  generationId: 'doctor-g2',
  parentGenerationId: 'doctor-g1',
  proposerId: 'doctor:g2:proposer',
  approverId: 'doctor:g2:approver',
  deployerId: 'doctor:g2:deployer',
  verifierId: 'doctor:g2:verifier',
  monitorId: 'doctor:g2:monitor'
};

const chain = verifyRecursiveGovernanceChain({ generations: [g1, g2] });
const lineage = verifyRecursiveGovernanceLineage({ generations: [g1, g2] });

const report = {
  version: 'uberbond.c26-security-doctor.v1',
  composition,
  chain,
  lineage,
  runtimeProof: 'NONE__SYNTHETIC_ZERO_EFFECT_DOCTOR',
  businessEffectAuthority: 'NONE',
  externalEffectsExecuted: 0,
  asiClaim: 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED'
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!composition.ok || !chain.ok || !lineage.ok) process.exitCode = 1;
