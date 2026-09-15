#!/usr/bin/env node
// The candidate GA2 should have contained.
//
// R2, R3 and R4 all scored 1.0 on held-out seeds. Three candidates tying at a
// perfect score is not convergence, it is an instrument that cannot separate
// them, and the thing they shared was never isolated: every one of them knew
// the REPLICATED_MEASUREMENT category, which the incumbent's rank table simply
// omitted.
//
// So this runs the entrant the tournament lacked -- the incumbent's ladder
// with that one entry added and no freshness term at all. If it matches the
// promoted solver, the freshness axis did no measured work and GA2 closed a
// vocabulary gap rather than a reasoning gap.
//
// It does not rescore GA2. The recorded result stands; this says what it does
// and does not establish.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTaskSet } from '../src/nullstar-cognitive-tasks.mjs';
import { UBERBOND_SOLVERS, scoreTaskSet } from '../src/nullstar-cognitive-solvers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'artifacts/nullstar-terminal/ga2-ablation.json';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

/** The minimal fix: the incumbent ladder, one category added, no freshness. */
function ladderPlusOneEntry(surface) {
  const rank = {
    REPLICATED_MEASUREMENT: 4,
    PRIMARY_MEASUREMENT: 3,
    SECONDHAND_SUMMARY: 1,
    UNSOURCED_ASSERTION: 0
  };
  let best = null;
  let bestScore = -1;
  for (const source of surface.sources ?? []) {
    const score = rank[source.quality] ?? 0;
    if (score > bestScore) { bestScore = score; best = source; }
  }
  return best ? String(best.claim) : null;
}

// Seeds disjoint from GA2's train and held-out sets, so neither arm is being
// read back off seeds it was selected on.
const SEEDS = Array.from({ length: 40 }, (_, i) => 70000 + i);

const rows = [1, 2, 3].map(difficulty => {
  const set = generateTaskSet({ seeds: SEEDS, families: ['RESEARCH'], difficulty });
  const promoted = scoreTaskSet(set.items, UBERBOND_SOLVERS).mean;
  const ablated = scoreTaskSet(set.items, { ...UBERBOND_SOLVERS, RESEARCH: ladderPlusOneEntry }).mean;
  return { difficulty, items: set.items.length, promotedMean: promoted, ablatedMean: ablated, separated: promoted !== ablated };
});

const separated = rows.some(row => row.separated);

const artifact = {
  schemaVersion: 'uberbond-nullstar-generation-ablation-1.0.0',
  generation: 'GA2',
  question: 'Does ranking on provenance AND freshness beat ranking on provenance alone, once the missing REPLICATED_MEASUREMENT category is supplied to both?',
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  evaluationEpoch: 'EPOCH_2__PROCEDURAL_GENERATED',
  family: 'RESEARCH',
  seedRange: `${SEEDS[0]}..${SEEDS[SEEDS.length - 1]}`,
  seedsDisjointFromTournament: true,
  promotedSolver: 'R2_TWO_AXIS (provenance x freshness)',
  ablatedSolver: 'incumbent provenance ladder + REPLICATED_MEASUREMENT, no freshness term',
  rows,
  separated,
  finding: separated
    ? 'THE_FRESHNESS_AXIS_DOES_MEASURED_WORK'
    : 'THE_FRESHNESS_AXIS_DOES_NO_MEASURED_WORK__GA2_CLOSED_A_VOCABULARY_GAP',
  whatThisChanges: separated
    ? 'GA2 improved a ranking mechanism and the instrument can show it.'
    : 'The GA2 promotion stands -- it scores 1.0 where the incumbent scored 0.00 and regresses nothing -- but the two-axis hypothesis is untested, not confirmed. The instrument cannot currently distinguish it from a one-line dictionary fix.',
  whatWouldTestIt: 'An item where a fresh SECONDHAND_SUMMARY carries the truth and a stale PRIMARY_MEASUREMENT carries a superseded value, with no REPLICATED_MEASUREMENT present to shortcut the ranking. No such item exists in the generator yet, so this must be declared prospectively as a new difficulty level rather than added and scored in the same pass.',
  rescoresGa2: false,
  failureDebtRef: 'F010-UNDISCRIMINATING-TOURNAMENT',
  truthBoundary: 'AN ABLATION SHOWS WHAT ONE INSTRUMENT CAN AND CANNOT SEPARATE. IT IS NOT EVIDENCE ABOUT RESEARCH QUALITY IN THE WORLD.',
  businessEffectAuthority: 'NONE',
  externalEffects: { providerCalls: 0, spendCents: 0, networkCalls: 0, messagesSent: 0 }
};

mkdirSync(join(root, 'artifacts/nullstar-terminal'), { recursive: true });
writeFileSync(join(root, OUT), `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`GA2 ablation @ ${head.slice(0, 8)} | family RESEARCH`);
for (const row of rows) {
  console.log(`  d${row.difficulty}  promoted ${row.promotedMean}   ladder+one-entry ${row.ablatedMean}   ${row.separated ? 'SEPARATED' : 'indistinguishable'}`);
}
console.log(`\n  finding: ${artifact.finding}`);
