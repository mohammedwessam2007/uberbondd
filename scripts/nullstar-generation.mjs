#!/usr/bin/env node
// A capability generation, run against criteria fixed before its candidates
// existed. GA1 had its own runner; this one is parameterised so GA2 and GA3
// cannot quietly differ in how they are judged.
//
// Usage: node scripts/nullstar-generation.mjs GA2
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTaskSet } from '../src/nullstar-cognitive-tasks.mjs';
import { UBERBOND_SOLVERS, scoreTaskSet } from '../src/nullstar-cognitive-solvers.mjs';
import { GA2_CANDIDATES } from '../src/nullstar-ga2-candidates.mjs';
import { GA3_CANDIDATES } from '../src/nullstar-ga3-candidates.mjs';
import { GA4_CANDIDATES } from '../src/nullstar-ga4-candidates.mjs';
import { GATING_PROBES, runProbes, gateVerdict } from '../src/nullstar-out-of-pattern-probes.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const generation = (process.argv[2] || '').toUpperCase();
if (!/^GA\d+$/.test(generation)) {
  console.error('usage: node scripts/nullstar-generation.mjs GA2');
  process.exit(1);
}

/**
 * Candidate sets, imported statically so the reachability graph can see them.
 *
 * This was a dynamic import keyed by generation name, which read as the more
 * flexible design and cost a true record: the graph could not follow it, so
 * src/nullstar-ga2-candidates.mjs showed up as a module with no entry point.
 * The only way to quiet that without lying would have been to classify a file
 * this script actually loads as unreachable.
 *
 * One line per generation is the price of the graph being accurate about what
 * runs. Adding GA3 means adding its import here.
 */
const CANDIDATE_SETS = {
  GA2: { candidates: GA2_CANDIDATES, sourcePath: 'src/nullstar-ga2-candidates.mjs' },
  GA3: { candidates: GA3_CANDIDATES, sourcePath: 'src/nullstar-ga3-candidates.mjs' },
  GA4: { candidates: GA4_CANDIDATES, sourcePath: 'src/nullstar-ga4-candidates.mjs' }
};

// The declaration is read first and on purpose. Criteria are fixed before the
// candidates exist, so a generation with no declaration is not a run that is
// missing a file -- it is a run whose threshold could still be chosen after
// seeing the scores, which is the thing this whole apparatus exists to prevent.
const declarationPath = `artifacts/nullstar-terminal/${generation.toLowerCase()}-declaration.json`;
let declaration;
try {
  declaration = JSON.parse(readFileSync(join(root, declarationPath), 'utf8'));
} catch {
  console.error(`no declaration at ${declarationPath}`);
  console.error(`${generation} must declare its bottleneck, evaluation difficulty and promotion threshold BEFORE its candidates are written. Commit that declaration first.`);
  process.exit(1);
}

const registered = CANDIDATE_SETS[generation];
if (!registered) {
  console.error(`no candidate set registered for ${generation}; add its static import to CANDIDATE_SETS`);
  process.exit(1);
}
const { candidates, sourcePath } = registered;

const FAMILY = declaration.bottleneck.selected;
const DIFFICULTY = declaration.evaluationDifficulty;
const THRESHOLD = 0.8;
const { trainSeeds, heldOutSeeds } = declaration.precommittedCriteria;

const OUT_OF_PATTERN_GATE = declaration.precommittedCriteria.outOfPatternGate === true;
const OUT_OF_PATTERN_MINIMUM = Number(declaration.precommittedCriteria.outOfPatternMinimumCorrectRate ?? 0);

const itemsAt = (seeds, difficulty) => generateTaskSet({ seeds, families: [FAMILY], difficulty }).items;
const started = Date.now();

const source = readFileSync(join(root, sourcePath), 'utf8');
const complexityOf = name => {
  // Crude but consistent: bytes of the exported function's body.
  const marker = source.indexOf(`export function ${name.split('_')[0].toLowerCase()}`);
  if (marker < 0) return source.length;
  const rest = source.slice(marker);
  const end = rest.indexOf('\n}\n');
  return end < 0 ? rest.length : end;
};

const incumbentTrain = scoreTaskSet(itemsAt(trainSeeds, DIFFICULTY), UBERBOND_SOLVERS).mean;
const incumbentHeldOut = scoreTaskSet(itemsAt(heldOutSeeds, DIFFICULTY), UBERBOND_SOLVERS).mean;

const results = Object.entries(candidates).map(([name, fn]) => {
  const solvers = { ...UBERBOND_SOLVERS, [FAMILY]: fn };
  const train = scoreTaskSet(itemsAt(trainSeeds, DIFFICULTY), solvers).mean;
  const heldOut = scoreTaskSet(itemsAt(heldOutSeeds, DIFFICULTY), solvers).mean;

  const regressions = [];
  for (const level of [1, 2]) {
    const before = scoreTaskSet(itemsAt(trainSeeds, level), UBERBOND_SOLVERS).mean;
    const after = scoreTaskSet(itemsAt(trainSeeds, level), solvers).mean;
    if (after < before) regressions.push({ difficulty: level, before, after });
  }

  const meetsThreshold = heldOut > THRESHOLD;
  const beatsIncumbent = heldOut > incumbentHeldOut;

  // The out-of-pattern gate, when the declaration asks for one.
  //
  // GA3 promoted a solver that scored 1.0 on every item its generator emits and
  // could not compose anything the generator does not ask for -- on one such
  // item it returned the answer to a different question. No in-distribution
  // score could have caught that, because the distribution is what it learned.
  // So a declaration may require candidates to face items built outside the
  // generator, and confabulating on them disqualifies at any score.
  const probes = OUT_OF_PATTERN_GATE ? GATING_PROBES[FAMILY] ?? [] : [];
  const probeResult = probes.length ? runProbes(fn, probes) : null;
  const gate = probeResult ? gateVerdict(probeResult, { minimumCorrectRate: OUT_OF_PATTERN_MINIMUM }) : { passes: true, reason: null };

  return {
    candidate: name,
    trainScore: train,
    heldOutScore: heldOut,
    regressions,
    complexityBytes: complexityOf(name),
    meetsThreshold,
    beatsIncumbent,
    noRegression: regressions.length === 0,
    outOfPattern: probeResult
      ? { correct: probeResult.correct, refused: probeResult.refused, confabulated: probeResult.confabulated, of: probeResult.of, correctRate: probeResult.correctRate }
      : null,
    outOfPatternGate: gate.passes ? 'PASSES' : gate.reason,
    eligible: meetsThreshold && beatsIncumbent && regressions.length === 0 && gate.passes
  };
});

const eligible = results.filter(row => row.eligible);
eligible.sort((a, b) => (b.heldOutScore - a.heldOutScore) || (a.complexityBytes - b.complexityBytes));
const winner = eligible[0] ?? null;
const disqualified = results.filter(row => !row.eligible && row.meetsThreshold && row.beatsIncumbent);
const wallClockMs = Date.now() - started;

/**
 * Whether the tournament separated its candidates at all.
 *
 * GA2 promoted a winner from three candidates that all scored exactly 1.0, and
 * the result artifact read as a reasoning improvement. It was not: an ablation
 * run afterwards showed a one-line dictionary fix scoring the same, because
 * every candidate carried that fix and nothing isolated it. Two or more
 * eligible candidates tying means the instrument ranked them by complexity,
 * not by capability, and the artifact has to say so where the next reader will
 * see it rather than leaving it to be rediscovered. See F010 in the
 * failure-debt ledger.
 */
const tiedAtTop = eligible.filter(row => winner && row.heldOutScore === winner.heldOutScore);
const discrimination = eligible.length === 0
  ? 'NO_ELIGIBLE_CANDIDATE'
  : tiedAtTop.length > 1
    ? 'UNDISCRIMINATING__CANDIDATES_TIED'
    : 'SEPARATED';

const record = {
  schemaVersion: 'uberbond-nullstar-capability-generation-1.0.0',
  generation,
  kind: 'ACTUAL_CAPABILITY_FOCUSED',
  directiveSections: ['053', '054', '055', '056', '057', '058', '074', '076'],
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  evaluationEpoch: declaration.evaluationEpoch,
  family: FAMILY,
  difficulty: DIFFICULTY,
  declarationRef: declarationPath,
  precommittedThreshold: declaration.precommittedCriteria.promotionThreshold,
  thresholdUsed: THRESHOLD,
  incumbent: { trainScore: incumbentTrain, heldOutScore: incumbentHeldOut },
  candidates: results,
  disqualifiedForRegression: disqualified.map(row => ({ candidate: row.candidate, regressions: row.regressions })),
  winner: winner ? winner.candidate : null,
  outcome: winner ? 'PROMOTED' : 'NO_PROMOTION',
  discrimination,
  outOfPatternGate: OUT_OF_PATTERN_GATE
    ? { applied: true, minimumCorrectRate: OUT_OF_PATTERN_MINIMUM, probeCount: (GATING_PROBES[FAMILY] ?? []).length, confabulationDisqualifies: true }
    : { applied: false },
  disqualifiedByOutOfPatternGate: results.filter(row => row.outOfPatternGate && row.outOfPatternGate !== 'PASSES')
    .map(row => ({ candidate: row.candidate, heldOutScore: row.heldOutScore, reason: row.outOfPatternGate })),
  tiedAtTop: tiedAtTop.map(row => row.candidate),
  attributionWarning: discrimination === 'UNDISCRIMINATING__CANDIDATES_TIED'
    ? `${tiedAtTop.length} eligible candidates scored ${winner.heldOutScore} on held-out seeds, so the winner was chosen on size rather than on capability. This tournament shows that the promoted solver beats the incumbent; it does NOT show that the mechanism distinguishing it from the other tied candidates is what did the work. Isolating that needs an ablation carrying the minimal shared fix and nothing else.`
    : null,
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
  truthBoundary: 'A CANDIDATE THAT BEATS AN INCUMBENT ON HELD-OUT SEEDS HAS IMPROVED ONE MEASURED CAPABILITY ON ONE INSTRUMENT. IT HAS NOT ESTABLISHED GENERAL IMPROVEMENT OR ACCELERATION.',
  businessEffectAuthority: 'NONE'
};

mkdirSync(join(root, 'artifacts/nullstar-terminal'), { recursive: true });
writeFileSync(join(root, `artifacts/nullstar-terminal/${generation.toLowerCase()}-result.json`), `${JSON.stringify(record, null, 2)}\n`);

console.log(`${generation} @ ${head.slice(0, 8)} | family ${FAMILY} | difficulty ${DIFFICULTY}`);
console.log(`  incumbent: train ${incumbentTrain} held-out ${incumbentHeldOut}`);
for (const row of results) {
  const flags = [row.meetsThreshold ? 'threshold' : null, row.beatsIncumbent ? 'beats-incumbent' : null, row.noRegression ? 'no-regression' : 'REGRESSES'].filter(Boolean).join(', ');
  console.log(`  ${row.candidate.padEnd(24)} train ${row.trainScore} held-out ${row.heldOutScore} [${flags}]`);
  for (const reg of row.regressions) console.log(`      regression at d${reg.difficulty}: ${reg.before} -> ${reg.after}`);
  if (row.outOfPattern) {
    const verdict = row.outOfPatternGate === 'PASSES' ? 'gate passes' : `GATE FAILS: ${row.outOfPatternGate}`;
    console.log(`      out-of-pattern ${row.outOfPattern.correct}/${row.outOfPattern.of} correct, ${row.outOfPattern.refused} refused, ${row.outOfPattern.confabulated} confabulated -- ${verdict}`);
  }
}
console.log(`\n  outcome: ${record.outcome}${winner ? ` -> ${winner.candidate}` : ''}`);
if (record.tieBreak) console.log(`  tie-break: ${record.tieBreak}`);
if (record.attributionWarning) {
  console.log(`  discrimination: ${discrimination}`);
  console.log(`  WARNING: ${record.attributionWarning}`);
}
console.log(`  delta: ${record.improvementVelocity.deltaCapability} | wall clock ${wallClockMs}ms | provider calls 0`);
