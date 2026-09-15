#!/usr/bin/env node
// CD005 and sections 087 to 090. Whether a promoted mechanism transfers.
//
// The GA2 declaration argued that ranking sources on provenance and freshness
// should transfer -- that weighing evidence whose quality signals conflict is
// what the economic organ does to provider evidence and the forecast organ does
// to world evidence. That was an architectural argument and nothing measured it.
//
// The receiving organ here is the epistemic immune system, which carries its
// own evidence vocabulary: KNOWLEDGE_STATES, ordered weakest first, from
// UNKNOWABLE_FROM_AVAILABLE_EVIDENCE up to DIRECTLY_OBSERVED. It shares no
// label with the suite the solver was built against.
//
// Three arms, and the distinction between them is the whole point:
//
//   the promoted solver, unchanged, handed the organ's vocabulary
//   the pre-GA2 ladder, likewise
//   the MECHANISM alone -- provenance times freshness -- reading the organ's
//     own ordering rather than the suite's table
//
// If the third transfers and the first does not, then what generalizes is the
// idea and not the code, and saying "the solver transfers" would be false while
// saying "nothing transfers" would also be false.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UBERBOND_SOLVERS } from '../src/nullstar-cognitive-solvers.mjs';
import { KNOWLEDGE_STATES } from '../src/epistemic-immune-system.mjs';
import { seededRandom } from '../src/nullstar-cognitive-tasks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.NULLSTAR_TRANSFER_OUT || 'artifacts/nullstar-terminal/cross-organ-transfer.json';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

// Strength is the organ's own ordering, not a second opinion about it. Reusing
// the position in KNOWLEDGE_STATES means this cannot quietly disagree with the
// organ about what counts as better evidence.
const STRENGTH = Object.fromEntries(KNOWLEDGE_STATES.map((state, index) => [state, index]));
const TOP = KNOWLEDGE_STATES.length - 1;

/**
 * Generate a claim with conflicting sources.
 *
 * The truth is planted before any source is written: one source carries it and
 * the generator decides which, so no arm can recover the answer by reading the
 * task's own structure. The trap is the same shape the suite uses and the
 * vocabulary is entirely the organ's: a strong but old source against a weaker
 * recent one, where the recent one is right because the world moved.
 */
function generateClaimTask(seed) {
  const rand = seededRandom(seed);
  const truth = String(200 + Math.floor(rand() * 600));
  const decoy = String(200 + Math.floor(rand() * 600));
  if (truth === decoy) return generateClaimTask(seed + 100000);

  // The first version of this drew the truth-carrying sources from states 4 to
  // 6 and gave the decoy HYPOTHETICAL at the latest date -- state 5. The decoy
  // was therefore as strong as the truth and fresher than it, so no rule
  // weighing strength against recency could win and every arm scored noise.
  // The promoted solver came out ahead at 0.48 by picking whatever the shuffle
  // put first, with two of four sources carrying the truth. A question with no
  // recoverable answer measures nothing, and a number that flattered the arm
  // under test was how it showed.
  //
  // The states are now separated so the intended reading is actually available:
  // a very strong but years-old source carrying the decoy, recent well-supported
  // sources carrying the truth, and recent noise below both.
  const strongState = KNOWLEDGE_STATES[TOP - Math.floor(rand() * 2)];
  const supportedState = KNOWLEDGE_STATES[8 + Math.floor(rand() * 2)];
  const noiseState = KNOWLEDGE_STATES[4 + Math.floor(rand() * 3)];
  const staleYear = 2013 + Math.floor(rand() * 4);

  const sources = [
    { value: decoy, knowledgeState: strongState, observedAt: `${staleYear}-04-01` },
    { value: truth, knowledgeState: supportedState, observedAt: '2026-08-20' },
    { value: truth, knowledgeState: supportedState, observedAt: '2026-09-02' },
    { value: decoy, knowledgeState: noiseState, observedAt: '2026-09-05' }
  ];

  // Shuffle so position carries no information.
  for (let i = sources.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [sources[i], sources[j]] = [sources[j], sources[i]];
  }

  return { taskId: `transfer.claim.${seed}`, sources, groundTruth: truth };
}

/** The suite's shape, so the promoted solver sees something it can read at all. */
const asSuiteSurface = task => ({
  sources: task.sources.map(source => ({
    claim: source.value,
    quality: source.knowledgeState,
    observedAt: source.observedAt
  }))
});

/** The mechanism alone: provenance times freshness, over the organ's ordering. */
function transferredMechanism(task) {
  const latest = task.sources.reduce((best, source) =>
    (!best || source.observedAt > best.observedAt ? source : best), null)?.observedAt;

  let best = null;
  let bestScore = -Infinity;
  for (const source of task.sources) {
    const provenance = STRENGTH[source.knowledgeState] ?? 0;
    const ageDays = Math.abs(Date.parse(latest) - Date.parse(source.observedAt)) / 86400000;
    const score = provenance * (1 / (1 + ageDays / 30));
    if (score > bestScore) { bestScore = score; best = source; }
  }
  return best ? best.value : null;
}

/** The pre-GA2 ladder: strongest state wins, recency ignored. */
function flatLadder(task) {
  let best = null;
  let bestScore = -1;
  for (const source of task.sources) {
    const score = STRENGTH[source.knowledgeState] ?? 0;
    if (score > bestScore) { bestScore = score; best = source; }
  }
  return best ? best.value : null;
}

const SEEDS = Array.from({ length: 60 }, (_, i) => 620000 + i);
const tasks = SEEDS.map(generateClaimTask);

const ARMS = {
  PROMOTED_SOLVER_UNCHANGED: task => UBERBOND_SOLVERS.RESEARCH(asSuiteSurface(task)),
  PRE_GA2_FLAT_LADDER: flatLadder,
  MECHANISM_ON_ORGAN_VOCABULARY: transferredMechanism
};

const results = Object.entries(ARMS).map(([arm, fn]) => {
  let correct = 0;
  for (const task of tasks) {
    let answer = null;
    try { answer = fn(task); } catch { answer = null; }
    if (answer === task.groundTruth) correct += 1;
  }
  return { arm, correct, of: tasks.length, rate: Number((correct / tasks.length).toFixed(4)) };
});

const byArm = Object.fromEntries(results.map(row => [row.arm, row.rate]));

/**
 * Chance, and why it is the baseline rather than the ladder.
 *
 * The first verdict here compared every arm against the pre-GA2 ladder and
 * concluded that the promoted solver transferred, because 0.43 beats 0. But the
 * ladder scores 0 by being systematically wrong -- it always picks the strong
 * stale decoy -- and beating a systematically wrong rule is not evidence of
 * anything. Two of the four sources carry the truth, so an arm that cannot read
 * the vocabulary at all and falls through to whatever comes first lands near
 * 0.5 by construction.
 *
 * Against the ladder, "the implementation transfers". Against chance, it does
 * not. Chance is the honest comparison and the other reading was flattery.
 */
const CHANCE = 0.5;
const chanceMargin = 0.05;

const mechanismTransfers = byArm.MECHANISM_ON_ORGAN_VOCABULARY > CHANCE + chanceMargin
  && byArm.MECHANISM_ON_ORGAN_VOCABULARY > byArm.PRE_GA2_FLAT_LADDER;
const codeTransfers = byArm.PROMOTED_SOLVER_UNCHANGED > CHANCE + chanceMargin;

const artifact = {
  schemaVersion: 'uberbond-nullstar-cross-organ-transfer-1.0.0',
  completionDebtRef: 'CD005-CROSS-ORGAN-TRANSFER-NOT-MEASURED',
  directiveSections: ['087', '088', '089', '090', '183'],
  generatedAt: new Date().toISOString(),
  sourceCommit: head,

  claimUnderTest: 'The GA2 declaration argued that ranking sources on provenance and freshness should transfer to organs that weigh evidence whose quality signals conflict. That was an architectural argument and nothing measured it.',
  receivingOrgan: {
    module: 'src/epistemic-immune-system.mjs',
    vocabulary: 'KNOWLEDGE_STATES',
    states: [...KNOWLEDGE_STATES],
    sharesNoLabelWithTheSuite: true,
    orderingIsTheOrgansOwn: 'Strength is the position in KNOWLEDGE_STATES, so no arm can disagree with the organ about what counts as better evidence.'
  },
  taskConstruction: {
    truthPlantedBeforeSourcesAreWritten: true,
    sourcesShuffled: true,
    firstConstructionWasIllPosed: 'The decoy was drawn from the same band as the truth-carrying sources and dated later, so it was as strong and fresher and no rule weighing strength against recency could recover the intended answer. Every arm scored noise and the solver under test came out ahead at 0.48 by picking whatever the shuffle put first. It was caught because the ordering of the arms made no sense, not because a check failed.',
    illPosedVersionNotReported: 'Its numbers are not in this artifact. A measurement of an unanswerable question is not a weaker measurement, it is not one.',
    whyNotTautological: 'The generator decides which source carries the truth and the arms see only the sources. No arm can recover the answer from the task structure, and none of them computes the ground truth.',
    tasks: tasks.length
  },

  results,
  baseline: {
    chance: CHANCE,
    why: 'Two of the four sources carry the truth, so an arm that cannot read the vocabulary and falls through to whatever comes first lands near 0.5 by construction. The pre-GA2 ladder is not the baseline: it scores 0 by being systematically wrong, and beating a systematically wrong rule is not evidence.',
    margin: chanceMargin,
    correctionMade: 'The first verdict compared every arm against the ladder and concluded the implementation transferred because 0.43 beats 0. That was flattery, and the arm it flattered was the one under test.'
  },
  mechanismTransfers,
  codeTransfers,
  finding: mechanismTransfers && !codeTransfers
    ? 'THE_MECHANISM_TRANSFERS_AND_THE_IMPLEMENTATION_DOES_NOT'
    : mechanismTransfers && codeTransfers
      ? 'BOTH_THE_MECHANISM_AND_THE_IMPLEMENTATION_TRANSFER'
      : !mechanismTransfers && codeTransfers
        ? 'THE_IMPLEMENTATION_TRANSFERS_BUT_THE_MECHANISM_DOES_NOT__INVESTIGATE'
        : 'NOTHING_TRANSFERS',

  reading: mechanismTransfers && !codeTransfers
    ? `What generalizes is the idea, not the code. The promoted solver carries a table of the suite's own labels, so handed an organ that names evidence differently it scores every source at zero and falls through to whatever comes first -- ${byArm.PROMOTED_SOLVER_UNCHANGED}, which is chance. The same rule reading the organ's own ordering scores ${byArm.MECHANISM_ON_ORGAN_VOCABULARY}. The ladder it replaced scores ${byArm.PRE_GA2_FLAT_LADDER}, worse than chance, because it is systematically wrong rather than merely uninformed. So "the solver transfers" is false, "nothing transfers" is false, and the true statement is narrower than either: a mechanism transfers when it is given the receiving organ's vocabulary, and an implementation carrying its own vocabulary does not travel with it.`
    : 'See results.',

  whatThisIsNot: [
    'Not a production change. The receiving organ is unmodified and nothing in it calls this.',
    'Not evidence about the economic or personal organs, which were not tested.',
    'Not evidence that the mechanism improves real decisions, only that it ranks constructed claims better than the rule it replaced.',
    'Not general transfer. One mechanism, one receiving vocabulary, one task shape.'
  ],
  truthBoundary: 'TRANSFER MEASURED ON CONSTRUCTED TASKS IN ONE ORGAN\'S VOCABULARY IS NOT TRANSFER TO THAT ORGAN\'S WORK.',
  businessEffectAuthority: 'NONE',
  externalEffects: { providerCalls: 0, spendCents: 0, networkCalls: 0, messagesSent: 0 }
};

const outPath = resolve(root, OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`cross-organ transfer @ ${head.slice(0, 8)}`);
console.log(`  receiving organ: epistemic immune system, ${KNOWLEDGE_STATES.length} knowledge states, no shared label`);
console.log(`  ${tasks.length} constructed claims\n`);
for (const row of results) {
  console.log(`    ${row.arm.padEnd(32)} ${row.correct}/${row.of}  (${row.rate})`);
}
console.log(`\n  ${artifact.finding}`);
