#!/usr/bin/env node
import { compileConstraintMutationPlan } from '../src/constraint-mutation-engine.mjs';

const blocked = {
  objectiveId: 'verify-exact-head',
  mechanismId: 'provider-preview-build',
  providerId: 'provider-a',
  evidenceRefs: ['doctor:rate-limit'],
  failure: { providerUnavailable: true, rateLimited: true, outcomeUncertain: true }
};

const repeatedProvider = compileConstraintMutationPlan({ currentAttempt: blocked, history: [blocked] });
const capabilityGap = compileConstraintMutationPlan({
  currentAttempt: {
    objectiveId: 'execute-missing-capability',
    mechanismId: 'current-capability-set',
    providerId: 'local',
    evidenceRefs: ['doctor:gap'],
    failure: { missingCapability: true, missingCapabilities: ['missing-capability'], outcomeUncertain: false }
  },
  history: [{
    objectiveId: 'execute-missing-capability',
    mechanismId: 'current-capability-set',
    providerId: 'local',
    evidenceRefs: ['doctor:gap'],
    failure: { missingCapability: true, missingCapabilities: ['missing-capability'], outcomeUncertain: false }
  }]
});

const checks = {
  repeatedProviderMutates: repeatedProvider.status === 'STRATEGY_MUTATION_REQUIRED' && repeatedProvider.identicalRetryAllowed === false,
  alternateSubstratePresent: repeatedProvider.mutationFamilies.includes('switch-execution-substrate'),
  noBypass: repeatedProvider.forbidden.includes('provider-limit-bypass') && repeatedProvider.forbidden.includes('identity-cycling'),
  capabilityGapBuilds: capabilityGap.mutationFamilies.includes('build-missing-capability'),
  zeroAuthority: repeatedProvider.businessEffectAuthority === 'NONE' && capabilityGap.businessEffectAuthority === 'NONE'
};

const ok = Object.values(checks).every(Boolean);
const report = {
  schemaVersion: 'uberbond.constraint-mutation-doctor.v1',
  status: ok ? 'CONSTRAINT_MUTATION_HEALTHY' : 'CONSTRAINT_MUTATION_UNHEALTHY',
  checks,
  repeatedProvider: {
    status: repeatedProvider.status,
    decision: repeatedProvider.decision,
    mutationFamilies: repeatedProvider.mutationFamilies,
    forbidden: repeatedProvider.forbidden
  },
  capabilityGap: {
    status: capabilityGap.status,
    mutationFamilies: capabilityGap.mutationFamilies
  },
  businessEffectAuthority: 'NONE',
  truthBoundary: 'DOCTOR USES SYNTHETIC ATTEMPTS ONLY; IT PROVES POLICY SHAPE, NOT PROVIDER AVAILABILITY OR EXTERNAL SUCCESS'
};

console.log(JSON.stringify(report, null, 2));
if (!ok) process.exitCode = 1;
