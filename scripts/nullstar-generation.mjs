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
import { UBERBOND_SOLVERS, scoreTaskSet, scoreItem } from '../src/nullstar-cognitive-solvers.mjs';
import { GA2_CANDIDATES } from '../src/nullstar-ga2-candidates.mjs';
import { GA3_CANDIDATES } from '../src/nullstar-ga3-candidates.mjs';
import { GA4_CANDIDATES } from '../src/nullstar-ga4-candidates.mjs';
import { GA5_CANDIDATES } from '../src/nullstar-ga5-candidates.mjs';
import { GA6_CANDIDATES } from '../src/nullstar-ga6-candidates.mjs';
import { GA7_CANDIDATES } from '../src/nullstar-ga7-candidates.mjs';
import { GA8_CANDIDATES } from '../src/nullstar-ga8-candidates.mjs';
import { GATING_PROBES, REPORTING_PROBES, runProbes, gateVerdict } from '../src/nullstar-out-of-pattern-probes.mjs';
import { separability } from '../src/nullstar-tie-resolution.mjs';

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
  GA4: { candidates: GA4_CANDIDATES, sourcePath: 'src/nullstar-ga4-candidates.mjs' },
  GA5: { candidates: GA5_CANDIDATES, sourcePath: 'src/nullstar-ga5-candidates.mjs' },
  GA6: { candidates: GA6_CANDIDATES, sourcePath: 'src/nullstar-ga6-candidates.mjs' },
  GA7: { candidates: GA7_CANDIDATES, sourcePath: 'src/nullstar-ga7-candidates.mjs' },
  GA8: { candidates: GA8_CANDIDATES, sourcePath: 'src/nullstar-ga8-candidates.mjs' }
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
/**
 * Bytes of the candidate's implementation, used only to break a tie.
 *
 * It used to return the whole file's length whenever it could not find the
 * function, which made every candidate in a re-exporting module measure
 * identically: GA6 reported 1052 bytes against 1052 and the tie-break decided
 * nothing while claiming to decide something. A measurement that silently
 * returns the same number for everything is worse than one that admits it
 * failed, so this follows the re-export to the module that defines the function
 * and returns null when it cannot find it at all.
 */
const complexityOf = name => {
  const bodyIn = (text, fnName) => {
    const marker = text.indexOf(`export function ${fnName}`);
    if (marker < 0) return null;
    const rest = text.slice(marker);
    const end = rest.indexOf('\n}\n');
    return end < 0 ? rest.length : end;
  };

  // Candidates are named like L2_OPERATOR_REPAIRED and defined as
  // l2OperatorRepaired, so try the camel-case spelling before the old prefix
  // guess, which only ever matched by luck.
  const parts = name.toLowerCase().split('_');
  const camel = parts[0] + parts.slice(1).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');

  for (const candidateName of [camel, parts[0]]) {
    const direct = bodyIn(source, candidateName);
    if (direct !== null) return direct;
  }

  // Follow re-exports: the module may only forward a function defined elsewhere.
  for (const match of source.matchAll(/from '(\.\/[^']+\.mjs)'/g)) {
    let imported = '';
    try {
      imported = readFileSync(join(root, 'src', match[1].replace('./', '')), 'utf8');
    } catch {
      continue;
    }
    for (const candidateName of [camel, parts[0]]) {
      const found = bodyIn(imported, candidateName);
      if (found !== null) return found;
    }
  }
  return null;
};

// The incumbent faces the gate too. A candidate can only claim the gate as a
// reason to win if the thing it is replacing actually fails it.
const incumbentProbeResult = OUT_OF_PATTERN_GATE && (GATING_PROBES[FAMILY] ?? []).length
  ? runProbes(UBERBOND_SOLVERS[FAMILY], GATING_PROBES[FAMILY])
  : null;
const incumbentGate = incumbentProbeResult
  ? gateVerdict(incumbentProbeResult, { minimumCorrectRate: OUT_OF_PATTERN_MINIMUM })
  : { passes: true, reason: null };

const incumbentTrain = scoreTaskSet(itemsAt(trainSeeds, DIFFICULTY), UBERBOND_SOLVERS).mean;
const incumbentHeldOut = scoreTaskSet(itemsAt(heldOutSeeds, DIFFICULTY), UBERBOND_SOLVERS).mean;

const results = Object.entries(candidates).map(([name, fn]) => {
  const solvers = { ...UBERBOND_SOLVERS, [FAMILY]: fn };
  const train = scoreTaskSet(itemsAt(trainSeeds, DIFFICULTY), solvers).mean;
  const heldOut = scoreTaskSet(itemsAt(heldOutSeeds, DIFFICULTY), solvers).mean;

  const regressions = [];
  for (const level of declaration.precommittedCriteria.regressionLevels ?? [1, 2]) {
    const before = scoreTaskSet(itemsAt(trainSeeds, level), UBERBOND_SOLVERS).mean;
    const after = scoreTaskSet(itemsAt(trainSeeds, level), solvers).mean;
    if (after < before) regressions.push({ difficulty: level, before, after });
  }

  const meetsThreshold = heldOut > THRESHOLD;

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

  /**
   * Beating the incumbent, compared on both numbers rather than one.
   *
   * This used to be `heldOut > incumbentHeldOut` and nothing else. GA5 produced
   * three candidates that tied the incumbent in-distribution at 1.0 and passed
   * the out-of-pattern gate 3 of 3 where the incumbent confabulates -- strictly
   * better, and none of them promotable, because the comparison could only see
   * the number they tied on. The GA4 declaration had said in as many words that
   * the incumbent was not grandfathered; the comparison grandfathered it.
   *
   * So when a gate is in force, passing it while the incumbent fails counts as
   * beating the incumbent provided the in-distribution score is not worse. A
   * lower in-distribution score still loses: this widens what can win, it does
   * not let a candidate buy the gate with accuracy it gave up.
   */
  const gateIsDecisive = OUT_OF_PATTERN_GATE && gate.passes && !incumbentGate.passes;
  const beatsIncumbent = gateIsDecisive
    ? heldOut >= incumbentHeldOut
    : heldOut > incumbentHeldOut;

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
// An unmeasurable size cannot win a tie-break, so it sorts last rather than
// being treated as zero bytes.
eligible.sort((a, b) => (b.heldOutScore - a.heldOutScore)
  || ((a.complexityBytes ?? Infinity) - (b.complexityBytes ?? Infinity)));

// Whether tied candidates are actually interchangeable. The rule and its
// reasoning live in src/nullstar-tie-resolution.mjs so they can be tested
// directly rather than only through a whole generation run.
const differentialCheck = tied => separability({
  candidates: tied.map(row => ({ name: row.candidate, solver: candidates[row.candidate] })),
  family: FAMILY,
  probes: [...(GATING_PROBES[FAMILY] ?? []), ...(REPORTING_PROBES[FAMILY] ?? [])],
  items: [...new Set([DIFFICULTY, ...(declaration.precommittedCriteria.regressionLevels ?? [])])]
    .flatMap(level => itemsAt(trainSeeds, level)),
  runProbes,
  scoreItem,
  baseSolvers: UBERBOND_SOLVERS
});

const topScore = eligible[0]?.heldOutScore;
const tiedOnScore = eligible.filter(row => row.heldOutScore === topScore);
const differential = tiedOnScore.length > 1 ? differentialCheck(tiedOnScore) : { separable: false, disagreements: [] };

// A tie between candidates that behave differently is unresolved, not won. The
// runner does not get to pick one on bytes and call it a promotion.
const tieIsUnresolved = differential.separable;
const winner = tieIsUnresolved ? null : (eligible[0] ?? null);
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
  incumbent: {
    trainScore: incumbentTrain,
    heldOutScore: incumbentHeldOut,
    outOfPattern: incumbentProbeResult
      ? { correct: incumbentProbeResult.correct, refused: incumbentProbeResult.refused, confabulated: incumbentProbeResult.confabulated, of: incumbentProbeResult.of }
      : null,
    outOfPatternGate: incumbentGate.passes ? 'PASSES' : incumbentGate.reason
  },
  comparisonRule: OUT_OF_PATTERN_GATE && !incumbentGate.passes
    ? 'GATE_DECISIVE__A_CANDIDATE_PASSING_THE_GATE_BEATS_A_FAILING_INCUMBENT_ON_AN_EQUAL_IN_DISTRIBUTION_SCORE'
    : 'IN_DISTRIBUTION_STRICTLY_GREATER',
  candidates: results,
  disqualifiedForRegression: disqualified.map(row => ({ candidate: row.candidate, regressions: row.regressions })),
  winner: winner ? winner.candidate : null,
  outcome: winner ? 'PROMOTED' : (tieIsUnresolved ? 'NO_PROMOTION__TIE_UNRESOLVED' : 'NO_PROMOTION'),
  differentialCheck: tiedOnScore.length > 1
    ? { tiedCandidates: tiedOnScore.map(row => row.candidate), ...differential }
    : null,
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
    ? (winner.complexityBytes === null || winner.complexityBytes === eligible[1].complexityBytes
        ? `Tied at ${eligible[0].heldOutScore} and the size heuristic did not separate them either (${winner.complexityBytes ?? 'unmeasurable'} against ${eligible[1].complexityBytes ?? 'unmeasurable'}); ${winner.candidate} won on registration order, which is arbitrary.`
        : `Tied at ${eligible[0].heldOutScore}; ${winner.candidate} won on being smaller (${winner.complexityBytes} bytes vs ${eligible[1].complexityBytes}).`)
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

// Redirectable so a rule change can be tried against a finished generation
// without overwriting what that generation actually recorded.
const resultPath = resolve(root, process.env.NULLSTAR_GENERATION_OUT
  || `artifacts/nullstar-terminal/${generation.toLowerCase()}-result.json`);
mkdirSync(dirname(resultPath), { recursive: true });
writeFileSync(resultPath, `${JSON.stringify(record, null, 2)}\n`);

console.log(`${generation} @ ${head.slice(0, 8)} | family ${FAMILY} | difficulty ${DIFFICULTY}`);
console.log(`  incumbent: train ${incumbentTrain} held-out ${incumbentHeldOut}${incumbentProbeResult ? `  out-of-pattern ${incumbentProbeResult.correct}/${incumbentProbeResult.of}, ${incumbentProbeResult.confabulated} confabulated -- ${incumbentGate.passes ? 'gate passes' : 'GATE FAILS'}` : ''}`);
console.log(`  comparison: ${record.comparisonRule}`);
for (const row of results) {
  const flags = [row.meetsThreshold ? 'threshold' : null, row.beatsIncumbent ? 'beats-incumbent' : null, row.noRegression ? 'no-regression' : 'REGRESSES'].filter(Boolean).join(', ');
  console.log(`  ${row.candidate.padEnd(24)} train ${row.trainScore} held-out ${row.heldOutScore} [${flags}]`);
  for (const reg of row.regressions) console.log(`      regression at d${reg.difficulty}: ${reg.before} -> ${reg.after}`);
  if (row.outOfPattern) {
    const verdict = row.outOfPatternGate === 'PASSES' ? 'gate passes' : `GATE FAILS: ${row.outOfPatternGate}`;
    console.log(`      out-of-pattern ${row.outOfPattern.correct}/${row.outOfPattern.of} correct, ${row.outOfPattern.refused} refused, ${row.outOfPattern.confabulated} confabulated -- ${verdict}`);
  }
}
if (record.differentialCheck) {
  console.log(`\n  differential: ${record.differentialCheck.verdict}`);
  for (const row of record.differentialCheck.disagreements) {
    console.log(`    ${row.on}: ${Object.entries(row.answers).map(([name, value]) => `${name}=${value}`).join('  ')}`);
  }
}
console.log(`\n  outcome: ${record.outcome}${winner ? ` -> ${winner.candidate}` : ''}`);
if (record.tieBreak) console.log(`  tie-break: ${record.tieBreak}`);
if (record.attributionWarning) {
  console.log(`  discrimination: ${discrimination}`);
  console.log(`  WARNING: ${record.attributionWarning}`);
}
console.log(`  delta: ${record.improvementVelocity.deltaCapability} | wall clock ${wallClockMs}ms | provider calls 0`);
