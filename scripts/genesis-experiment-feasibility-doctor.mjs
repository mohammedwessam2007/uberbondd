#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFeasibleBoundedExperiment } from '../src/genesis-experiment-feasibility.mjs';

export function runGenesisExperimentFeasibilityDoctor() {
  const fakeBadge = compileFeasibleBoundedExperiment({
    hypothesis: 'x', falsifier: 'y', costCeilingCents: 0, timeCeilingMinutes: 10,
    probes: [{ description: 'trust the badge', costCents: 0, timeMinutes: 1, discriminating: true }]
  });
  const overCeiling = compileFeasibleBoundedExperiment({
    hypothesis: 'x', falsifier: 'y', costCeilingCents: 0, timeCeilingMinutes: 5,
    probes: [{
      description: 'too slow', costCents: 0, timeMinutes: 6,
      measure: 'fixture result', supportsHypothesis: 'fixture fails', falsifiesHypothesis: 'fixture passes'
    }]
  });
  const local = compileFeasibleBoundedExperiment({
    hypothesis: 'the fixture exposes the defect',
    falsifier: 'the fixture passes under the candidate implementation',
    costCeilingCents: 0,
    timeCeilingMinutes: 5,
    probes: [{
      description: 'run one synthetic fixture', costCents: 0, timeMinutes: 2,
      measure: 'fixture verdict', supportsHypothesis: 'fixture fails', falsifiesHypothesis: 'fixture passes'
    }]
  });

  const checks = {
    selfDeclaredDiscriminationRefused: fakeBadge.ok === false
      && fakeBadge.reasonCodes?.includes('probe-measure-required'),
    timeCeilingActuallyBinds: overCeiling.ok === false
      && overCeiling.reasonCodes?.includes('no-probe-fits-declared-cost-and-time-ceilings'),
    boundedLocalProbeCompiles: local.ok === true
      && local.runnable === true
      && local.feasibility?.hasExplicitCompetingOutcomes === true,
    noAuthorityMinted: local.businessEffectAuthority === 'NONE'
  };
  const ok = Object.values(checks).every(Boolean);
  return {
    ok,
    status: ok ? 'GENESIS_EXPERIMENT_FEASIBILITY_HEALTHY' : 'GENESIS_EXPERIMENT_FEASIBILITY_BROKEN',
    checks,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: {
      providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
      credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
    },
    truthBoundary: 'SYNTHETIC DOCTOR ONLY. THIS DOES NOT PROVE A REAL EXPERIMENT IS INFORMATIVE OR AUTHORIZE ONE.'
  };
}

const isEntry = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  const result = runGenesisExperimentFeasibilityDoctor();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
