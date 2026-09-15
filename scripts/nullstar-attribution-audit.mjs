#!/usr/bin/env node
// CD002. Whether GA1's and GA2's promoted solvers are better than the minimal
// fixes they tied, on items neither was selected against.
//
// This cannot make those tournaments attributable. A tournament either
// separated its candidates or it did not, and nothing run afterwards changes
// what it separated -- F010 records that and is not closed by this script.
//
// It answers the question underneath, which is different and still worth
// knowing: the promotions happened, the code is in the tree, and nobody has
// ever checked whether the promoted version is actually better than the
// one-line fix it turned out to match. If it is not, the repository is carrying
// complexity it did not buy anything with.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UBERBOND_SOLVERS } from '../src/nullstar-cognitive-solvers.mjs';
import { GATING_PROBES, REPORTING_PROBES, runProbes } from '../src/nullstar-out-of-pattern-probes.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.NULLSTAR_ATTRIBUTION_OUT || 'artifacts/nullstar-terminal/attribution-audit.json';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

/** GA1's minimal fix: the two difference orders the generator actually emits. */
function forecastMinimalFix(surface) {
  const series = (surface.series ?? []).map(Number);
  if (series.length < 3) return null;
  const d1 = series.slice(1).map((v, i) => v - series[i]);
  if (d1.every(v => v === d1[0])) return String(series[series.length - 1] + d1[0]);
  const d2 = d1.slice(1).map((v, i) => v - d1[i]);
  if (d2.length > 0 && d2.every(v => v === d2[0])) {
    return String(series[series.length - 1] + d1[d1.length - 1] + d2[0]);
  }
  return null;
}

/** GA2's minimal fix: the old ladder with the one category it was missing. */
function researchMinimalFix(surface) {
  const rank = { REPLICATED_MEASUREMENT: 4, PRIMARY_MEASUREMENT: 3, SECONDHAND_SUMMARY: 1, UNSOURCED_ASSERTION: 0 };
  let best = null;
  let bestScore = -1;
  for (const source of surface.sources ?? []) {
    const score = rank[source.quality] ?? 0;
    if (score > bestScore) { bestScore = score; best = source; }
  }
  return best ? String(best.claim) : null;
}

const ARMS = [
  { generation: 'GA1', family: 'FORECASTING', promoted: UBERBOND_SOLVERS.FORECASTING, minimalFix: forecastMinimalFix,
    minimalFixIs: 'first difference, else second difference, else nothing' },
  { generation: 'GA2', family: 'RESEARCH', promoted: UBERBOND_SOLVERS.RESEARCH, minimalFix: researchMinimalFix,
    minimalFixIs: 'the original provenance ladder plus REPLICATED_MEASUREMENT, no freshness term' }
];

const rows = ARMS.map(arm => {
  const probes = [...GATING_PROBES[arm.family], ...REPORTING_PROBES[arm.family]];
  const promoted = runProbes(arm.promoted, probes);
  const minimal = runProbes(arm.minimalFix, probes);
  const separates = promoted.correct !== minimal.correct || promoted.confabulated !== minimal.confabulated;

  return {
    generation: arm.generation,
    family: arm.family,
    minimalFixIs: arm.minimalFixIs,
    probeCount: probes.length,
    promoted: { correct: promoted.correct, refused: promoted.refused, confabulated: promoted.confabulated },
    minimalFix: { correct: minimal.correct, refused: minimal.refused, confabulated: minimal.confabulated },
    separates,
    verdict: separates
      ? (promoted.correct > minimal.correct
          ? 'PROMOTED_SOLVER_IS_BETTER_OUT_OF_PATTERN'
          : 'MINIMAL_FIX_IS_BETTER_OUT_OF_PATTERN')
      : 'STILL_INDISTINGUISHABLE',
    disagreements: promoted.answers
      .map((row, i) => ({ id: row.id, expected: row.expected, promoted: row.given, minimalFix: minimal.answers[i].given }))
      .filter(row => row.promoted !== row.minimalFix)
  };
});

const artifact = {
  schemaVersion: 'uberbond-nullstar-attribution-audit-1.0.0',
  completionDebtRef: 'CD002-GA1-GA2-UNATTRIBUTABLE',
  failureDebtRef: 'F010-UNDISCRIMINATING-TOURNAMENT',
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  question: 'Are the solvers GA1 and GA2 promoted better than the minimal fixes they were shown to tie?',
  whatThisCannotDo: 'Make those tournaments attributable. They were undiscriminating when they ran and remain so; F010 stays open on that basis. Probes written now, after the winners are known, cannot retroactively become the test those tournaments used.',
  whyItIsStillWorthKnowing: 'The promoted code is in the tree. If it is no better than a one-line fix, the repository is carrying complexity that bought nothing, and that is worth knowing whether or not the tournament was sound.',
  probesWrittenAfterTheFact: true,
  rows,
  overall: rows.every(row => row.verdict === 'PROMOTED_SOLVER_IS_BETTER_OUT_OF_PATTERN')
    ? 'BOTH_PROMOTED_SOLVERS_EARN_THEIR_COMPLEXITY'
    : rows.some(row => row.verdict === 'STILL_INDISTINGUISHABLE')
      ? 'AT_LEAST_ONE_PROMOTION_REMAINS_INDISTINGUISHABLE_FROM_ITS_MINIMAL_FIX'
      : 'AT_LEAST_ONE_MINIMAL_FIX_BEATS_THE_SOLVER_PROMOTED_OVER_IT',
  truthBoundary: 'A HANDFUL OF HAND-BUILT PROBES IS NOT A CAPABILITY MEASUREMENT. THIS SAYS WHETHER TWO IMPLEMENTATIONS DIFFER WHERE IT MATTERS, NOTHING MORE.',
  businessEffectAuthority: 'NONE',
  externalEffects: { providerCalls: 0, spendCents: 0, networkCalls: 0, messagesSent: 0 }
};

const outPath = resolve(root, OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`attribution audit @ ${head.slice(0, 8)}`);
for (const row of rows) {
  console.log(`\n  ${row.generation} ${row.family} over ${row.probeCount} out-of-pattern probes`);
  console.log(`    promoted     correct ${row.promoted.correct}  refused ${row.promoted.refused}  confabulated ${row.promoted.confabulated}`);
  console.log(`    minimal fix  correct ${row.minimalFix.correct}  refused ${row.minimalFix.refused}  confabulated ${row.minimalFix.confabulated}`);
  console.log(`    ${row.verdict}`);
  for (const d of row.disagreements) console.log(`      ${d.id}: expected ${d.expected}, promoted ${d.promoted}, minimal fix ${d.minimalFix}`);
}
console.log(`\n  ${artifact.overall}`);
