#!/usr/bin/env node
// Sections 068 to 071. Whether the three promoted improvements generalize.
//
// Each was selected on difficulty-3 items at ten held-out seeds. That shows
// they did not memorise ten training seeds. It does not show they learned the
// mechanism rather than the shape of the questions the generator happens to
// ask, and those are different claims.
//
// Three probes, from weakest to strongest:
//
//   A. Fresh seeds, same distribution. Confirms the held-out result was not a
//      lucky draw. The weakest of the three, and the one a tournament already
//      half-answers.
//   B. Out-of-pattern items, same family, hand-built here rather than drawn
//      from the generator. A solver that learned the mechanism answers them.
//      One that learned the generator's phrasing does not. This is where a
//      promotion chosen on a narrow instrument is most likely to come apart.
//   C. Refusal rather than confabulation on B. Returning nothing when the
//      question is outside what the solver can do is a correct answer; a
//      confident wrong number is the failure this whole apparatus exists to
//      catch, and it is scored separately because the two look identical in a
//      mean.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTaskSet } from '../src/nullstar-cognitive-tasks.mjs';
import { UBERBOND_SOLVERS, scoreTaskSet } from '../src/nullstar-cognitive-solvers.mjs';
import { GA3_CANDIDATES } from '../src/nullstar-ga3-candidates.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.NULLSTAR_GENERALIZATION_OUT || 'artifacts/nullstar-terminal/generalization-v2.json';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const TOURNAMENT_SEEDS = new Set([1, 2, 3, 7, 11, 42, 99, 1234, 20260915, 777, 555, 8080, 31337, 606, 24601, 90210, 13, 2718, 1618, 4242]);
const FRESH = Array.from({ length: 60 }, (_, i) => 810000 + i).filter(seed => !TOURNAMENT_SEEDS.has(seed));

const PROMOTED = [
  { generation: 'GA1', family: 'FORECASTING', mechanism: 'walk to whatever difference order goes constant' },
  { generation: 'GA2', family: 'RESEARCH', mechanism: 'rank sources on provenance and freshness' },
  { generation: 'GA3', family: 'INVENTION', mechanism: 'assemble the composition the prompt names' }
];

// ---- A. fresh seeds -------------------------------------------------------
const probeA = PROMOTED.map(entry => {
  const byDifficulty = [1, 2, 3].map(difficulty => ({
    difficulty,
    mean: scoreTaskSet(generateTaskSet({ seeds: FRESH, families: [entry.family], difficulty }).items, UBERBOND_SOLVERS).mean
  }));
  return { ...entry, seedsUsed: FRESH.length, byDifficulty, holds: byDifficulty.every(row => row.mean >= 0.8) };
});

// ---- B and C. out-of-pattern invention ------------------------------------
//
// Built here rather than drawn, because the generator only emits the four
// compositions the promoted solver has patterns for. These reuse the same
// primitives and the same phrasing conventions; only the combination is new,
// which is the narrowest possible step outside the training distribution.
const data = [4, 9, 2, 15, 7, 11];
const high = Math.max(...data);
const low = Math.min(...data);
const mean = data.reduce((a, b) => a + b, 0) / data.length;
const midrange = (high + low) / 2;
const spread = high - low;

const OUT_OF_PATTERN = [
  { prompt: 'Report the mean plus the midrange. No primitive computes it; compose one.', truth: (mean + midrange).toFixed(4) },
  { prompt: 'Report the midrange minus the mean. No primitive computes it; compose one.', truth: (midrange - mean).toFixed(4) },
  { prompt: 'Report the spread between largest and smallest divided by the mean. No primitive computes it; compose one.', truth: (spread / mean).toFixed(4) }
];

const surface = { primitives: ['sum', 'count', 'max', 'min'], data };

const armsB = {
  PROMOTED_I3_PROMPT_DIRECTED: UBERBOND_SOLVERS.INVENTION,
  RUNNER_UP_I4_COMPOSITIONAL_SEARCH: GA3_CANDIDATES.I4_COMPOSITIONAL_SEARCH,
  NULL_I1_HARDCODE_ONE_TARGET: GA3_CANDIDATES.I1_HARDCODE_ONE_TARGET
};

const probeB = Object.entries(armsB).map(([arm, solver]) => {
  const answers = OUT_OF_PATTERN.map(item => {
    let response = null;
    try { response = solver(surface, item.prompt); } catch { response = null; }
    const given = response?.answer ?? null;
    return {
      prompt: item.prompt.split('.')[0],
      expected: item.truth,
      given,
      correct: given === item.truth,
      refused: given === null
    };
  });
  return {
    arm,
    correct: answers.filter(row => row.correct).length,
    refused: answers.filter(row => row.refused).length,
    confabulated: answers.filter(row => !row.correct && !row.refused).length,
    of: answers.length,
    answers
  };
});

const promotedB = probeB.find(row => row.arm === 'PROMOTED_I3_PROMPT_DIRECTED');
const runnerUpB = probeB.find(row => row.arm === 'RUNNER_UP_I4_COMPOSITIONAL_SEARCH');

const artifact = {
  schemaVersion: 'uberbond-nullstar-generalization-2.0.0',
  directiveSections: ['068', '069', '070', '071'],
  supersedes: 'artifacts/nullstar-omega/generalization.json',
  whySuperseded: 'That artifact was computed against the corpus retired for being tautological, where every solver scored the same as a constant. Its verdict measured nothing and is kept for history rather than reused.',
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  evaluationEpoch: 'EPOCH_2__PROCEDURAL_GENERATED',
  suiteVersion: 'nullstar-procedural-suite-1.0.0',

  probeA: {
    question: 'Do the promoted solvers hold on seeds no tournament touched?',
    seedRange: `${FRESH[0]}..${FRESH[FRESH.length - 1]}`,
    disjointFromTournamentSeeds: true,
    results: probeA,
    verdict: probeA.every(row => row.holds) ? 'HOLDS_ON_FRESH_SEEDS' : 'DOES_NOT_HOLD_ON_FRESH_SEEDS'
  },

  probeB: {
    question: 'Do they answer compositions the generator never emits, built from the same primitives and phrasing?',
    itemsAreHandBuilt: true,
    whyHandBuilt: 'The generator emits only the four compositions the promoted solver has patterns for, so the question cannot be asked from inside it. These change the combination and nothing else.',
    results: probeB,
    verdict: promotedB.correct === promotedB.of
      ? 'GENERALIZES_OUT_OF_PATTERN'
      : promotedB.confabulated === 0
        ? 'DOES_NOT_GENERALIZE_BUT_REFUSES_CLEANLY'
        : 'DOES_NOT_GENERALIZE_AND_CONFABULATES'
  },

  probeC: {
    question: 'When it cannot answer, does it say so, or does it produce a confident wrong number?',
    promotedConfabulations: promotedB.confabulated,
    promotedRefusals: promotedB.refused,
    nullCandidateConfabulations: probeB.find(row => row.arm === 'NULL_I1_HARDCODE_ONE_TARGET').confabulated,
    verdict: promotedB.confabulated === 0 ? 'REFUSES_RATHER_THAN_CONFABULATES' : 'CONFABULATES'
  },

  headlineFinding: [
    probeA.every(row => row.holds)
      ? 'All three promoted solvers hold at or above 0.8 on sixty fresh seeds, so none of them memorised a tournament.'
      : 'At least one promoted solver does not hold on fresh seeds.',
    promotedB.correct === promotedB.of
      ? 'The promoted invention solver also answers compositions outside the generator.'
      : `The promoted invention solver answers ${promotedB.correct} of ${promotedB.of} out-of-pattern compositions, while the runner-up it beat answers ${runnerUpB.correct}. The tournament selected the narrower mechanism because the instrument only ever asks in-pattern questions.`,
    promotedB.confabulated === 0
      ? 'On the ones it cannot do it returns nothing rather than a wrong number, which is the right failure.'
      : 'On the ones it cannot do it returns a wrong number, which is the wrong failure.'
  ].join(' '),

  whatThisDoesNotEstablish: 'Generalization within one procedurally generated family to hand-built variants of the same primitives is the narrowest step outside a training distribution there is. It is not cross-family transfer, not transfer to any real organ, and not evidence of general reasoning. Cross-organ transfer is a separate measurement and is not claimed here.',
  truthBoundary: 'THIS MEASURES THREE SOLVERS AGAINST ONE INSTRUMENT AND SOME HAND-BUILT ITEMS. IT IS NOT EVIDENCE OF INTELLIGENCE, ACCELERATION, OR RECURSIVE SELF-IMPROVEMENT.',
  businessEffectAuthority: 'NONE',
  externalEffects: { providerCalls: 0, spendCents: 0, networkCalls: 0, messagesSent: 0 }
};

const outPath = resolve(root, OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`generalization v2 @ ${head.slice(0, 8)}`);
console.log(`\n  A. fresh seeds (${FRESH.length}, none from any tournament)`);
for (const row of probeA) {
  console.log(`     ${row.generation} ${row.family.padEnd(12)} ${row.byDifficulty.map(d => `d${d.difficulty} ${d.mean}`).join('  ')}  ${row.holds ? 'holds' : 'DOES NOT HOLD'}`);
}
console.log(`     ${artifact.probeA.verdict}`);
console.log('\n  B. out-of-pattern compositions, same primitives, new combination');
for (const row of probeB) {
  console.log(`     ${row.arm.padEnd(34)} correct ${row.correct}/${row.of}  refused ${row.refused}  confabulated ${row.confabulated}`);
}
console.log(`     ${artifact.probeB.verdict}`);
console.log(`\n  C. ${artifact.probeC.verdict}`);
console.log(`\n  ${artifact.headlineFinding}`);
