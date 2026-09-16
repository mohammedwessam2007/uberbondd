#!/usr/bin/env node
// GA1. The tournament, run against the criteria fixed before the candidates
// existed.
//
// The held-out seeds are scored once, at the end. Nothing here may adjust the
// threshold, and the declaration that set it is read back rather than restated
// so a drift between the two is visible.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTaskSet } from '../src/nullstar-cognitive-tasks.mjs';
import { UBERBOND_SOLVERS, scoreTaskSet } from '../src/nullstar-cognitive-solvers.mjs';
import { GA1_CANDIDATES } from '../src/nullstar-ga1-candidates.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const declaration = JSON.parse(readFileSync(join(root, 'artifacts/nullstar-terminal/ga1-declaration.json'), 'utf8'));

const { trainSeeds, heldOutSeeds } = declaration.precommittedCriteria;
const FAMILY = declaration.bottleneck.selected;
const DIFFICULTY = declaration.evaluationDifficulty;
const THRESHOLD = 0.8;

const itemsAt = (seeds, difficulty) =>
  generateTaskSet({ seeds, families: [FAMILY], difficulty }).items;

const started = Date.now();

// Source size as a crude complexity proxy. Section 074: on a tie, simpler wins.
const source = readFileSync(join(root, 'src/nullstar-ga1-candidates.mjs'), 'utf8');
const complexityOf = name => {
  const fnName = { C1_POLYNOMIAL_DIFFERENCE: 'c1PolynomialDifference', C2_HYPOTHESIS_TOURNAMENT: 'c2HypothesisTournament', C3_RECURRENCE_SEARCH: 'c3RecurrenceSearch', C4_RATIO_AND_DIFFERENCE: 'c4RatioAndDifference' }[name];
  const start = source.indexOf(`export function ${fnName}`);
  if (start < 0) return Number.MAX_SAFE_INTEGER;
  const rest = source.slice(start);
  const end = rest.indexOf('\n}\n');
  return end < 0 ? rest.length : end;
};

const incumbentTrain = scoreTaskSet(itemsAt(trainSeeds, DIFFICULTY), UBERBOND_SOLVERS).mean;
const incumbentHeldOut = scoreTaskSet(itemsAt(heldOutSeeds, DIFFICULTY), UBERBOND_SOLVERS).mean;

const results = Object.entries(GA1_CANDIDATES).map(([name, fn]) => {
  const solvers = { [FAMILY]: fn };
  const train = scoreTaskSet(itemsAt(trainSeeds, DIFFICULTY), solvers).mean;
  const heldOut = scoreTaskSet(itemsAt(heldOutSeeds, DIFFICULTY), solvers).mean;

  // A candidate that fixes difficulty 3 by breaking 1 and 2 is not an
  // improvement, it is a trade nobody agreed to.
  const regressions = [];
  for (const level of [1, 2]) {
    const before = scoreTaskSet(itemsAt(trainSeeds, level), UBERBOND_SOLVERS).mean;
    const after = scoreTaskSet(itemsAt(trainSeeds, level), solvers).mean;
    if (after < before) regressions.push({ difficulty: level, before, after });
  }

  const meetsThreshold = heldOut > THRESHOLD;
  const beatsIncumbent = heldOut > incumbentHeldOut;
  return {
    candidate: name,
    trainScore: train,
    heldOutScore: heldOut,
    regressions,
    complexityBytes: complexityOf(name),
    meetsThreshold,
    beatsIncumbent,
    noRegression: regressions.length === 0,
    eligible: meetsThreshold && beatsIncumbent && regressions.length === 0
  };
});

const eligible = results.filter(row => row.eligible);
// Section 074: on equal score the simpler candidate wins.
eligible.sort((a, b) => (b.heldOutScore - a.heldOutScore) || (a.complexityBytes - b.complexityBytes));
const winner = eligible[0] ?? null;
const wallClockMs = Date.now() - started;

// Which hypothesis the result actually supports.
let hypothesisVerdict;
if (!winner) {
  hypothesisVerdict = results.every(row => row.heldOutScore === 0)
    ? 'ALTERNATIVE_A_SUPPORTED__THE_ITEMS_MAY_BE_AT_FAULT'
    : 'NO_CANDIDATE_CLEARED_THE_PRECOMMITTED_THRESHOLD';
} else {
  hypothesisVerdict = 'PRIMARY_SUPPORTED__THE_GAP_WAS_REPRESENTATIONAL_NOT_ARITHMETIC';
}

const record = {
  schemaVersion: 'uberbond-nullstar-capability-generation-1.0.0',
  generation: 'GA1',
  kind: 'ACTUAL_CAPABILITY_FOCUSED',
  directiveSections: ['050', '053', '054', '055', '056', '057', '074', '076'],
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  evaluationEpoch: declaration.evaluationEpoch,
  family: FAMILY,
  difficulty: DIFFICULTY,
  declarationRef: 'artifacts/nullstar-terminal/ga1-declaration.json',
  precommittedThreshold: declaration.precommittedCriteria.promotionThreshold,
  thresholdUsed: THRESHOLD,
  incumbent: { trainScore: incumbentTrain, heldOutScore: incumbentHeldOut },
  candidates: results,
  winner: winner ? winner.candidate : null,
  outcome: winner ? 'PROMOTED' : 'NO_PROMOTION',
  hypothesisVerdict,
  tieBreak: eligible.length > 1 && eligible[0].heldOutScore === eligible[1].heldOutScore
    ? `Tied at ${eligible[0].heldOutScore}; ${winner.candidate} won on being smaller (${winner.complexityBytes} bytes vs ${eligible[1].complexityBytes}).`
    : null,
  improvementVelocity: {
    deltaCapability: winner ? Number((winner.heldOutScore - incumbentHeldOut).toFixed(4)) : 0,
    wallClockMs,
    providerCalls: 0,
    spendCents: 0,
    founderMinutes: 0,
    regressions: winner ? winner.regressions.length : null
  },
  whatThisDoesNotShow: 'One family at one difficulty on one instrument. The winner generalizes within forecasting; whether the mechanism transfers to another family is a separate question that GA2 has to ask rather than assume.',
  truthBoundary: 'A CANDIDATE THAT BEATS AN INCUMBENT ON HELD-OUT SEEDS HAS IMPROVED ONE MEASURED CAPABILITY. IT HAS NOT ESTABLISHED GENERAL IMPROVEMENT, ACCELERATION, OR ANYTHING ABOUT THE WORLD OUTSIDE THIS SUITE.',
  businessEffectAuthority: 'NONE'
};

mkdirSync(join(root, 'artifacts/nullstar-terminal'), { recursive: true });
writeFileSync(join(root, 'artifacts/nullstar-terminal/ga1-result.json'), `${JSON.stringify(record, null, 2)}\n`);

console.log(`GA1 @ ${head.slice(0, 8)} | family ${FAMILY} | difficulty ${DIFFICULTY}`);
console.log(`  incumbent: train ${incumbentTrain} held-out ${incumbentHeldOut}`);
for (const row of results) {
  const flags = [row.meetsThreshold ? 'threshold' : null, row.beatsIncumbent ? 'beats-incumbent' : null, row.noRegression ? 'no-regression' : null].filter(Boolean).join(', ');
  console.log(`  ${row.candidate.padEnd(26)} train ${row.trainScore} held-out ${row.heldOutScore} [${flags || 'ineligible'}]`);
}
console.log(`\n  outcome: ${record.outcome}${winner ? ` -> ${winner.candidate}` : ''}`);
console.log(`  hypothesis: ${hypothesisVerdict}`);
if (record.tieBreak) console.log(`  tie-break: ${record.tieBreak}`);
console.log(`  delta: ${record.improvementVelocity.deltaCapability} | wall clock ${wallClockMs}ms | provider calls 0`);
