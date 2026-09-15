#!/usr/bin/env node
// The same audit applied to GA1, because GA1 promoted from a tie too.
//
// GA2's promotion turned out to close a vocabulary gap rather than a reasoning
// gap, and the symptom -- three eligible candidates tying at 1.0 -- was present
// in GA1 as well. Auditing only the generation I happened to notice would make
// the audit selective, so this runs the equivalent minimal-fix entrant here.
//
// The incumbent tested for a constant FIRST difference and returned null for
// anything else. The difficulty-3 generator plants a constant SECOND
// difference. So the minimal fix is: handle order two as a special case.
// C1_POLYNOMIAL_DIFFERENCE instead walks to whatever order goes constant. If
// the two are indistinguishable, GA1 bought one hard-coded case, not a general
// method, and the artifact should say so.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTaskSet } from '../src/nullstar-cognitive-tasks.mjs';
import { UBERBOND_SOLVERS, scoreTaskSet } from '../src/nullstar-cognitive-solvers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'artifacts/nullstar-terminal/ga1-ablation.json';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

/** The minimal fix: first difference, else second difference, else give up. */
function firstOrSecondOrderOnly(surface) {
  const series = (surface.series ?? []).map(Number);
  if (series.length < 3) return null;
  const d1 = series.slice(1).map((v, i) => v - series[i]);
  if (d1.every(v => v === d1[0])) return String(series[series.length - 1] + d1[0]);
  const d2 = d1.slice(1).map((v, i) => v - d1[i]);
  if (d2.length > 0 && d2.every(v => v === d2[0])) {
    const nextD1 = d1[d1.length - 1] + d2[0];
    return String(series[series.length - 1] + nextD1);
  }
  return null;
}

// Disjoint from GA1's train and held-out seeds.
const SEEDS = Array.from({ length: 40 }, (_, i) => 70000 + i);

const rows = [1, 2, 3].map(difficulty => {
  const set = generateTaskSet({ seeds: SEEDS, families: ['FORECASTING'], difficulty });
  const promoted = scoreTaskSet(set.items, UBERBOND_SOLVERS).mean;
  const ablated = scoreTaskSet(set.items, { ...UBERBOND_SOLVERS, FORECASTING: firstOrSecondOrderOnly }).mean;
  return { difficulty, items: set.items.length, promotedMean: promoted, ablatedMean: ablated, separated: promoted !== ablated };
});

// A cubic is outside every difficulty the generator currently emits, so this is
// a probe of the mechanism rather than a scored task: it asks whether the
// promoted solver can do anything the hard-coded one cannot, on input the
// instrument has never presented.
const cubic = { series: [1, 8, 27, 64, 125] };
const outOfRange = {
  note: 'A cubic series, outside every difficulty the generator emits. Not a scored task and not evidence of a capability the instrument measured -- it only shows whether the two implementations differ at all.',
  series: cubic.series,
  promotedAnswer: UBERBOND_SOLVERS.FORECASTING(cubic),
  ablatedAnswer: firstOrSecondOrderOnly(cubic),
  trueNext: 216
};

const separated = rows.some(row => row.separated);

const artifact = {
  schemaVersion: 'uberbond-nullstar-generation-ablation-1.0.0',
  generation: 'GA1',
  question: 'Does walking to whatever difference order goes constant beat hard-coding orders one and two, on the items the instrument actually emits?',
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  evaluationEpoch: 'EPOCH_2__PROCEDURAL_GENERATED',
  family: 'FORECASTING',
  seedRange: `${SEEDS[0]}..${SEEDS[SEEDS.length - 1]}`,
  seedsDisjointFromTournament: true,
  promotedSolver: 'C1_POLYNOMIAL_DIFFERENCE (walk to constant order)',
  ablatedSolver: 'first difference, else second difference, else null',
  rows,
  separated,
  outOfRangeProbe: outOfRange,
  finding: separated
    ? 'THE_GENERAL_METHOD_DOES_MEASURED_WORK'
    : 'THE_GENERAL_METHOD_DOES_NO_MEASURED_WORK_ON_THIS_INSTRUMENT__THE_GENERATOR_EMITS_ONLY_ORDERS_ONE_AND_TWO',
  whatThisChanges: separated
    ? 'GA1 improved a general method and the instrument can show it.'
    : 'The GA1 promotion stands -- it scores where the incumbent scored zero and regresses nothing -- and unlike GA2 the promoted solver does handle input the ablation cannot, as the out-of-range probe shows. But the instrument never presents that input, so within what was measured the two are equivalent and the generality is asserted by reading the code, not established by the score.',
  rescoresGa1: false,
  failureDebtRef: 'F010-UNDISCRIMINATING-TOURNAMENT',
  truthBoundary: 'AN ABLATION SHOWS WHAT ONE INSTRUMENT CAN AND CANNOT SEPARATE. AN OUT-OF-RANGE PROBE SHOWS TWO IMPLEMENTATIONS DIFFER; IT IS NOT A MEASURED CAPABILITY.',
  businessEffectAuthority: 'NONE',
  externalEffects: { providerCalls: 0, spendCents: 0, networkCalls: 0, messagesSent: 0 }
};

mkdirSync(join(root, 'artifacts/nullstar-terminal'), { recursive: true });
writeFileSync(join(root, OUT), `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`GA1 ablation @ ${head.slice(0, 8)} | family FORECASTING`);
for (const row of rows) {
  console.log(`  d${row.difficulty}  promoted ${row.promotedMean}   first-or-second-only ${row.ablatedMean}   ${row.separated ? 'SEPARATED' : 'indistinguishable'}`);
}
console.log(`  out-of-range cubic: promoted ${outOfRange.promotedAnswer} | ablated ${outOfRange.ablatedAnswer} | true ${outOfRange.trueNext}`);
console.log(`\n  finding: ${artifact.finding}`);
