#!/usr/bin/env node
// GA3's declared ablation, plus a scoring weakness the run exposed.
//
// GA1 and GA2 each promoted a winner out of a tie and each turned out, when
// the minimal shared fix was finally run, to have bought that fix rather than
// the mechanism under test. GA3 put the null candidate in the tournament
// instead of discovering it afterwards, so the ablation here is a confirmation
// rather than a correction: I1_HARDCODE_ONE_TARGET competed and lost.
//
// It also records something the run made visible. scoreComposition accepts a
// superset, so a solver that claims every available primitive satisfies the
// composition half of every item whatever it actually used. That inflated I1
// from roughly a quarter to 0.6. It is recorded and not repaired here: GA3's
// threshold was fixed before the run, and changing the scorer after seeing
// scores would invalidate the experiment. The repair is declared for a later
// generation.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTaskSet, generateInventionTask } from '../src/nullstar-cognitive-tasks.mjs';
import { UBERBOND_SOLVERS, scoreTaskSet } from '../src/nullstar-cognitive-solvers.mjs';
import { GA3_CANDIDATES } from '../src/nullstar-ga3-candidates.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'artifacts/nullstar-terminal/ga3-ablation.json';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const result = JSON.parse(readFileSync(join(root, 'artifacts/nullstar-terminal/ga3-result.json'), 'utf8'));

// Disjoint from the tournament's train and held-out seeds.
const SEEDS = Array.from({ length: 40 }, (_, i) => 70000 + i);

const arm = solver => [1, 2, 3].map(difficulty => {
  const set = generateTaskSet({ seeds: SEEDS, families: ['INVENTION'], difficulty });
  return { difficulty, mean: scoreTaskSet(set.items, { ...UBERBOND_SOLVERS, INVENTION: solver }).mean };
});

const nullArm = arm(GA3_CANDIDATES.I1_HARDCODE_ONE_TARGET);
const promotedArm = arm(GA3_CANDIDATES.I3_PROMPT_DIRECTED);

const rows = [1, 2, 3].map((difficulty, i) => ({
  difficulty,
  promotedMean: promotedArm[i].mean,
  ablatedMean: nullArm[i].mean,
  separated: promotedArm[i].mean !== nullArm[i].mean
}));
const separated = rows.some(row => row.separated);

// How often the composition half can be satisfied by over-claiming.
let overClaimable = 0;
let counted = 0;
for (const seed of SEEDS) {
  const task = generateInventionTask(seed, 3);
  counted += 1;
  if (task.requiredComposition.length < 4 && task.scoreComposition(['sum', 'count', 'max', 'min']) === 1) overClaimable += 1;
}

const artifact = {
  schemaVersion: 'uberbond-nullstar-generation-ablation-1.0.0',
  generation: 'GA3',
  question: 'Does reading the named composition out of the prompt beat hard-coding one formula, on seeds neither arm was selected on?',
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  evaluationEpoch: 'EPOCH_2__PROCEDURAL_GENERATED',
  family: 'INVENTION',
  seedRange: `${SEEDS[0]}..${SEEDS[SEEDS.length - 1]}`,
  seedsDisjointFromTournament: true,
  promotedSolver: 'I3_PROMPT_DIRECTED (parse the named quantity, assemble it)',
  ablatedSolver: 'I1_HARDCODE_ONE_TARGET (one fixed formula, prompt ignored)',
  nullCandidateWasInTheTournament: true,
  howThisDiffersFromGa1AndGa2: 'In GA1 and GA2 the minimal fix was absent from the candidate set and had to be reconstructed afterwards, at which point it matched the winner and the promotions turned out to be unattributable. Here it competed under the same precommitted threshold and lost outright, so the difference between the two arms is the thing the tournament was built to measure.',
  rows,
  separated,
  tournamentDiscrimination: result.discrimination,
  finding: separated
    ? 'PROMPT_DIRECTED_COMPOSITION_DOES_MEASURED_WORK__THE_GAIN_IS_ATTRIBUTABLE'
    : 'NO_SEPARATION__THE_GAIN_IS_NOT_ATTRIBUTABLE',
  instrumentWeaknessFound: {
    what: 'scoreComposition accepts any superset of the required primitives, so a solver claiming every available primitive satisfies the composition half of every item regardless of what it actually used.',
    reach: `${overClaimable} of ${counted} level-3 items in this seed range need fewer than four primitives and still accept a claim of all four.`,
    effect: 'It inflated the null candidate from roughly a quarter to 0.6 by giving it the composition half for free. TOOL_USE already penalises calling every tool; INVENTION does not penalise claiming every primitive.',
    whyNotRepairedHere: "GA3's threshold and scorer were fixed before the run. Tightening the scorer after seeing the scores would invalidate the experiment, and the direction of the error is against the promoted candidate rather than for it: under an exact-set rule the null falls further and I3 still scores 1.0, so the verdict does not depend on the defect.",
    declaredFor: 'A later generation, declared prospectively, together with the TOOL_USE vocabulary gap left open by the GA3 declaration.'
  },
  rescoresGa3: false,
  failureDebtRef: 'F011-COMPOSITION-SUPERSET-ACCEPTED',
  truthBoundary: 'A SEPARATION ON ONE PROCEDURALLY GENERATED FAMILY IS EVIDENCE ABOUT ONE INSTRUMENT. IT IS NOT EVIDENCE OF GENERAL COMPOSITIONAL REASONING, NOT EVIDENCE OF TRANSFER, AND NOT EVIDENCE OF RECURSIVE SELF-IMPROVEMENT.',
  businessEffectAuthority: 'NONE',
  externalEffects: { providerCalls: 0, spendCents: 0, networkCalls: 0, messagesSent: 0 }
};

mkdirSync(join(root, 'artifacts/nullstar-terminal'), { recursive: true });
writeFileSync(join(root, OUT), `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`GA3 ablation @ ${head.slice(0, 8)} | family INVENTION`);
for (const row of rows) {
  console.log(`  d${row.difficulty}  promoted ${row.promotedMean}   null candidate ${row.ablatedMean}   ${row.separated ? 'SEPARATED' : 'indistinguishable'}`);
}
console.log(`\n  finding: ${artifact.finding}`);
console.log(`  instrument weakness: ${artifact.instrumentWeaknessFound.reach}`);
