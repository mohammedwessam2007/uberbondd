import fs from 'node:fs/promises';
import path from 'node:path';
import { buildReplayScenarios } from '../src/omnia-v9/integrations/replay-scenarios.mjs';
import { runReplay } from '../src/omnia-v9/integrations/replay.mjs';

const scenarios = buildReplayScenarios();
const report = runReplay(scenarios);

const outputReport = {
  schemaVersion: 'omnia.v9.replay-report.v1',
  generatedAt: new Date().toISOString(),
  disclaimer: 'SYNTHETIC / OFFLINE REPLAY ONLY. No live sending, no real database, no real Cedar connection, and no production data were used. These numbers measure the V9 admission-decision logic and its integration adapter in isolation; they are not production metrics and must not be presented as such.',
  totalScenarios: report.totalScenarios,
  comparisonCategoryCounts: report.byComparisonCategory,
  byFailureClass: report.byFailureClass,
  criticalDisagreementCount: report.criticalDisagreements.length,
  criticalDisagreements: report.criticalDisagreements,
  errorCount: report.errors.length,
  errors: report.errors.map(item => ({ id: item.id, category: item.category, error: item.error })),
  latencyMs: report.latencyMs,
  fullResults: report.results
};

await fs.mkdir(path.resolve('artifacts/omnia-v9'), { recursive: true });
await fs.writeFile(path.resolve('artifacts/omnia-v9/replay-report.json'), JSON.stringify(outputReport, null, 2));

console.log(JSON.stringify({
  schemaVersion: outputReport.schemaVersion,
  totalScenarios: outputReport.totalScenarios,
  comparisonCategoryCounts: outputReport.comparisonCategoryCounts,
  criticalDisagreementCount: outputReport.criticalDisagreementCount,
  errorCount: outputReport.errorCount,
  latencyMs: outputReport.latencyMs
}, null, 2));

if (outputReport.criticalDisagreementCount > 0) {
  console.log('OMNIA_V9_REPLAY_FAIL=CRITICAL_DISAGREEMENT_FOUND');
  process.exit(1);
}

console.log('OMNIA_V9_REPLAY_COMPLETE');
