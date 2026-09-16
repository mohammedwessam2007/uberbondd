import { runUniversalWealthJob } from '../src/universal-wealth-job-handler.mjs';

const reason = String(process.env.UBERBOND_FREE_RUNTIME_REASON || 'free-runtime-burst').slice(0, 120);
const requestedJobs = Math.max(1, Math.min(100, Number(process.env.UBERBOND_FREE_RUNTIME_REQUESTED_JOBS || 1)));

const receipt = await runUniversalWealthJob({
  root: process.cwd(),
  outputPath: 'artifacts/free-runtime-burst-latest.json',
  maxSearchCells: Math.min(4096, Math.max(256, requestedJobs * 64)),
  maxCanaries: Math.min(25, Math.max(5, requestedJobs)),
  maxCapitalAtRisk: 0
});

const summary = {
  schema: 'uberbond.free-runtime-burst-summary.v1',
  generatedAt: new Date().toISOString(),
  reason,
  requestedJobs,
  wealthStatus: receipt.status,
  searchCellCount: receipt.searchCellCount,
  canaryCount: receipt.canaryCount,
  openWorldAddressableCombinationCount: receipt.openWorldAddressableCombinationCount,
  economicInevitability: receipt.economicInevitability,
  externalEffectAuthority: 'NONE',
  capitalDeploymentAuthority: 'NONE',
  truthBoundary: 'THIS_PUBLIC_RUNNER_EXECUTES_INTERNAL_RESEARCH_SIMULATION_AND_RECONCILIATION_ONLY; NO_SIMULATED_DOLLAR_IS_REVENUE_AND_NO_REAL_WORLD_SIDE_EFFECT_AUTHORITY_IS_CREATED'
};

process.stdout.write(`${JSON.stringify(summary)}\n`);
