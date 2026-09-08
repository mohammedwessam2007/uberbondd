#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFeasibleBoundedExperiment } from '../src/genesis-experiment-feasibility.mjs';

const explicitProbe = (over = {}) => ({
  description: 'run one synthetic fixture',
  costCents: 0,
  timeMinutes: 2,
  measure: 'fixture verdict',
  decisionRule: 'support on FAIL; falsify on PASS',
  supportsHypothesis: 'fixture fails',
  falsifiesHypothesis: 'fixture passes',
  ...over
});

export function runGenesisExperimentFeasibilityDoctor() {
  const fakeBadge = compileFeasibleBoundedExperiment({
    hypothesis: 'x', falsifier: 'y', costCeilingCents: 0, timeCeilingMinutes: 10,
    probes: [{ description: 'trust the badge', costCents: 0, timeMinutes: 1, discriminating: true }]
  });
  const overCeiling = compileFeasibleBoundedExperiment({
    hypothesis: 'x', falsifier: 'y', costCeilingCents: 0, timeCeilingMinutes: 5,
    probes: [explicitProbe({ description: 'too slow', timeMinutes: 6 })]
  });
  const badReversibility = compileFeasibleBoundedExperiment({
    hypothesis: 'x', falsifier: 'y', costCeilingCents: 0, timeCeilingMinutes: 5,
    probes: [explicitProbe({ reversibility: 'REVERSIBL' })]
  });
  const local = compileFeasibleBoundedExperiment({
    hypothesis: 'the fixture exposes the defect',
    falsifier: 'the fixture passes under the candidate implementation',
    costCeilingCents: 0,
    timeCeilingMinutes: 5,
    probes: [explicitProbe()]
  });

  const checks = {
    selfDeclaredDiscriminationRefused: fakeBadge.ok === false
      && fakeBadge.reasonCodes?.includes('probe-measure-required')
      && fakeBadge.reasonCodes?.includes('probe-decision-rule-required'),
    timeCeilingActuallyBinds: overCeiling.ok === false
      && overCeiling.reasonCodes?.includes('no-probe-fits-declared-cost-and-time-ceilings'),
    reversibilityTypoFailsClosed: badReversibility.ok === false
      && badReversibility.reasonCodes?.includes('probe-recognized-reversibility-required'),
    boundedLocalProbeCompiles: local.ok === true
      && local.runnable === true
      && local.feasibility?.hasExplicitCompetingOutcomes === true
      && local.feasibility?.hasExplicitDecisionRule === true,
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
