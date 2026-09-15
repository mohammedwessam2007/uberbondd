#!/usr/bin/env node
// Section 008. Compile the failure-debt ledger from the recorded failures.
//
// These are real defects this project produced and found. They are written
// here so the next session inherits the diagnosis rather than the symptom.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordFailure, compileFailureDebt } from '../src/nullstar-failure-debt.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'artifacts/nullstar-terminal/failure-debt.json';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const previous = (() => {
  try { return JSON.parse(readFileSync(join(root, OUT), 'utf8')).failures.map(row => row.id); }
  catch { return []; }
})();

const FAILURES = [
  {
    id: 'F001-PROSE-OBSERVER',
    timestamp: '2026-09-14T22:31:00.000Z',
    sourceSha: 'b741029274d0f60d163b296fedef4855f9082cd0',
    mission: 'NULLSTAR OMEGA reality connection',
    gate: 'observation admissibility',
    expected: 'the mutation observer reports survivors from the run summary',
    observed: 'it matched the word "survived" inside the guard descriptions WAR-02, LKG-04 and FCSTACK-07 and reported survivors from a run that killed all 397',
    failureClass: 'PROSE_PARSING_OBSERVER',
    rootCause: 'The observer chose text matching against a producer that also emits a structured summary line. Nothing forced it to declare which it was reading, so the weakest available parse was free to pick.',
    severity: 'HIGH',
    regressionTest: 'tests/nullstar-omega-observer-contract.test.mjs',
    repairCommit: 'ea1b87c9',
    status: 'CLOSED_WITH_PROOF',
    evidenceRefs: ['artifacts/nullstar-omega/reality-connection.json']
  },
  {
    id: 'F002-SELF-REFERENTIAL-OBSERVER',
    timestamp: '2026-09-14T22:45:00.000Z',
    sourceSha: 'b741029274d0f60d163b296fedef4855f9082cd0',
    mission: 'NULLSTAR OMEGA reality connection',
    gate: 'observation independence',
    expected: 'the triage observer computes reachability from the import graph',
    observed: 'it read config/reachability-classification.json, the file this same session had written to declare those modules NEEDS_TRIAGE, so the observation confirmed its own premise',
    failureClass: 'SELF_REFERENTIAL_OBSERVATION',
    rootCause: 'An observer was never required to name which session-authored artifacts it reads, so reading its own claim looked identical to reading evidence.',
    severity: 'HIGH',
    regressionTest: 'tests/nullstar-omega-observer-contract.test.mjs',
    repairCommit: 'ea1b87c9',
    status: 'CLOSED_WITH_PROOF',
    evidenceRefs: ['artifacts/nullstar-omega/reality-connection.json']
  },
  {
    id: 'F003-TAUTOLOGICAL-SUITE',
    timestamp: '2026-09-15T02:10:00.000Z',
    sourceSha: '03a98c2752cef5a0c90c8c4107fb511a8415ea5c',
    mission: 'NULLSTAR OMEGA ABSOLUTE baselines',
    gate: 'baseline comparison',
    expected: 'the sealed corpus separates a capable system from a trivial one',
    observed: 'for every sealed task the expected answer and the observation were the same expression over the same file, so any tree scored 6 of 6 against itself; a single constant scores 3 of 6, and the previous UberBond scores exactly what the constant scores',
    failureClass: 'TAUTOLOGICAL_INSTRUMENT',
    rootCause: 'The corpus was authored without a baseline, so nothing ever asked what answering nothing clever would score. A perfect score with no comparator was accepted as a capability measurement for four generations.',
    severity: 'CRITICAL',
    regressionTest: 'tests/nullstar-omega-independent-suite.test.mjs',
    repairCommit: '73ae28c6',
    status: 'CLOSED_WITH_PROOF',
    evidenceRefs: ['artifacts/nullstar-omega/baselines.json', 'artifacts/nullstar-omega/suite-retirement.json']
  },
  {
    id: 'F004-SUMMARY-CONTRADICTS-DATA',
    timestamp: '2026-09-15T02:20:00.000Z',
    sourceSha: '03a98c2752cef5a0c90c8c4107fb511a8415ea5c',
    mission: 'NULLSTAR OMEGA ABSOLUTE measurement integrity',
    gate: 'meta-improvement reporting',
    expected: 'the truth boundary describes the episodes it sits on',
    observed: 'the artifact asserted "EVERY EPISODE HERE IS RETROSPECTIVE" directly above four episodes marked PROSPECTIVE',
    failureClass: 'SUMMARY_CONTRADICTS_DATA',
    rootCause: 'The sentence was a literal written when it was true and never rederived when prospective episodes were added. A hardcoded summary cannot be contradicted by its own data.',
    severity: 'MEDIUM',
    regressionTest: 'tests/nullstar-omega-meta-improvement.test.mjs',
    repairCommit: '616b4ca1',
    status: 'CLOSED_WITH_PROOF',
    evidenceRefs: ['artifacts/nullstar-omega/meta-improvement.json']
  },
  {
    id: 'F005-CALIBRATION-OVERCLAIM',
    timestamp: '2026-09-15T02:25:00.000Z',
    sourceSha: '03a98c2752cef5a0c90c8c4107fb511a8415ea5c',
    mission: 'NULLSTAR OMEGA ABSOLUTE measurement integrity',
    gate: 'denominator state assignment',
    expected: 'a calibration state reflects how far the evidence reaches',
    observed: 'N12 read REALITY_CALIBRATED because a calibration receipt file existed; the underlying evidence was two forecasts about this repository settled by running a command in this repository',
    failureClass: 'EPISTEMIC_INFLATION',
    rootCause: 'File presence was used as the state test. One broad state had to carry every degree of calibration from two local forecasts to external longitudinal evidence.',
    severity: 'HIGH',
    regressionTest: 'tests/nullstar-omega-calibration-ladder.test.mjs',
    repairCommit: '616b4ca1',
    status: 'CLOSED_WITH_PROOF',
    evidenceRefs: ['artifacts/nullstar-omega/denominator.json']
  },
  {
    id: 'F006-BLOCKER-LOSS',
    timestamp: '2026-09-14T23:05:00.000Z',
    sourceSha: '1834abe3',
    mission: 'NULLSTAR OMEGA handoff',
    gate: 'handoff consistency',
    expected: 'a handoff rewrite preserves every open blocker',
    observed: 'a rewrite dropped six external-provider blockers, the entire runtimeProof block, seven nextExecutor lanes and eight completion entries; nine tests caught it',
    failureClass: 'BLOCKER_LOSS',
    rootCause: 'The handoff was rewritten wholesale rather than merged, and nothing compared the new blocker set against the old one before writing.',
    severity: 'HIGH',
    regressionTest: 'tests/nightfall-research-artifacts.test.mjs',
    repairCommit: '24698afb',
    status: 'CLOSED_WITH_PROOF',
    evidenceRefs: ['docs/CURRENT_HANDOFF.json']
  },
  {
    id: 'F007-MAGIC-ZERO-DIFFICULTY',
    timestamp: '2026-09-15T02:50:00.000Z',
    sourceSha: '73ae28c67cef877b1d9a62eb8534928181a26146',
    mission: 'NULLSTAR OMEGA ABSOLUTE independent suite',
    gate: 'task definition validation',
    expected: 'a task without a stated difficulty is refused',
    observed: 'Number(null) is 0, which is finite and in range, so an unstated difficulty was accepted as the easiest possible task',
    failureClass: 'MAGIC_ZERO',
    rootCause: 'A numeric validator used Number() coercion instead of a type check, so absent and zero became the same value.',
    severity: 'MEDIUM',
    regressionTest: 'tests/nullstar-omega-independent-suite.test.mjs',
    repairCommit: '73ae28c6',
    status: 'CLOSED_WITH_PROOF',
    evidenceRefs: ['src/nullstar-omega-independent-suite.mjs']
  },
  {
    id: 'F008-UNTESTED-PRODUCTION-PATH',
    timestamp: '2026-09-15T04:00:00.000Z',
    sourceSha: head,
    mission: 'NULLSTAR terminal completion war',
    gate: 'production coverage ratchet',
    expected: 'every production-reachable module is executed by some gate',
    observed: 'src/outreach-100k-runtime-control.mjs is imported by server.mjs and worker.mjs and exports six functions; its only suite read the file as text and regex-matched it, executing nothing',
    failureClass: 'UNTESTED_PRODUCTION_PATH',
    rootCause: 'A suite that reads a module as a string satisfies every "does a test exist" check while exercising none of its behaviour. Wiring assertions over source text look like coverage and are not.',
    severity: 'HIGH',
    regressionTest: 'tests/outreach-100k-runtime-control-behaviour.test.mjs',
    repairCommit: head,
    status: 'CLOSED_WITH_PROOF',
    evidenceRefs: ['tests/production-coverage-ratchet.test.mjs']
  },
  {
    id: 'F009-NO-CAPABILITY-GENERATION',
    timestamp: '2026-09-15T03:30:00.000Z',
    sourceSha: 'b5cb7d803865cfd48a2de9cbee351de4b6092841',
    mission: 'NULLSTAR OMEGA ABSOLUTE',
    gate: 'actual capability generation',
    expected: 'at least one generation targets a capability rather than the instrument',
    observed: 'G0 through G6 were all instrumentation; zero capability-focused generations have run',
    failureClass: 'MISSION_DRIFT',
    rootCause: 'Each generation diagnosed the instrument, and fixing the instrument was always the shortest path to a visible result. The drift was real but the diagnosis was also correct: the instrument was tautological, so no capability generation before now could have measured anything.',
    severity: 'HIGH',
    regressionTest: 'tests/nullstar-generation-discrimination.test.mjs',
    // The commit that carries tests/nullstar-generation-discrimination.test.mjs.
    // Written in a follow-up rather than in that commit itself: a SHA recorded
    // inside the commit it names cannot survive the commit being written, and
    // amending to correct it just produces a new SHA the file no longer names.
    repairCommit: '865b7ef5',
    status: 'CLOSED_WITH_PROOF',
    closingNote: 'Three capability-focused generations have now run against three distinct families -- GA1 forecasting, GA2 research, GA3 invention -- each against a threshold committed before its candidates existed. The test asserts the count, the kind, that each result names a declaration whose threshold matches the one used, and that the three families are distinct so a rerun cannot pass as a generation. Closing this says three generations exist; it does not say all three were attributable. F010 carries that, and by the ablations only GA3 was.',
    evidenceRefs: [
      'artifacts/nullstar-omega/baselines.json',
      'artifacts/nullstar-terminal/ga1-result.json',
      'artifacts/nullstar-terminal/ga2-result.json',
      'artifacts/nullstar-terminal/ga3-result.json'
    ]
  },
  {
    id: 'F010-UNDISCRIMINATING-TOURNAMENT',
    timestamp: '2026-09-15T12:20:00.000Z',
    sourceSha: '9422ae8399c2c44022079cb767bffe104b5407cd',
    mission: 'NULLSTAR TERMINAL COMPLETION WAR, generations GA1 and GA2',
    gate: 'capability generation attribution',
    expected: 'the GA2 tournament shows whether ranking sources on provenance and freshness as two axes beats ranking on provenance alone',
    observed: 'Both generations promoted out of a three-way tie at 1.0, and in both the shared minimal fix scores the same. GA2: the old provenance-only ladder with one entry, REPLICATED_MEASUREMENT, added and no freshness term at all matches the promoted solver at every difficulty, so the freshness axis does no measured work. GA1: hard-coding difference orders one and two matches the promoted general method at every difficulty, because the generator emits nothing higher. Both result artifacts read as reasoning improvements. GA1 is the milder case -- its promoted solver does answer a cubic the ablation cannot -- but the instrument never presents one, so the generality is visible only by reading the code.',
    failureClass: 'EPISTEMIC_INFLATION',
    rootCause: 'I wrote each candidate set to explore one hypothesis and never included the minimal fix as an entrant, so the change every candidate shared was the one thing the tournament could not isolate. The tie was the visible symptom and I read it as convergence -- three independent designs agreeing -- when a tie at a perfect score means the opposite: the instrument ranked them by byte count because it could not rank them by capability. The promotion rule only ever asked whether a candidate beats the incumbent, which is a weaker question than whether the mechanism under test is what beat it.',
    severity: 'MEDIUM',
    status: 'OPEN',
    evidenceRefs: [
      'artifacts/nullstar-terminal/ga1-result.json',
      'artifacts/nullstar-terminal/ga1-ablation.json',
      'artifacts/nullstar-terminal/ga2-result.json',
      'artifacts/nullstar-terminal/ga2-ablation.json',
      'src/nullstar-cognitive-solvers.mjs'
    ]
  },
  {
    id: 'F011-COMPOSITION-SUPERSET-ACCEPTED',
    timestamp: '2026-09-15T13:10:00.000Z',
    sourceSha: '021f0028',
    mission: 'NULLSTAR TERMINAL COMPLETION WAR, generation GA3',
    gate: 'invention composition scoring',
    expected: 'the composition half of an invention item rewards using the route the answer actually needs',
    observed: 'scoreComposition tests that every required primitive appears in the claimed list, so any superset passes. A solver claiming all four available primitives satisfies the composition half of every item whatever it used. Eight of forty level-3 items in the ablation seed range need fewer than four and still accept a claim of four, and the effect inflated the GA3 null candidate from roughly a quarter to 0.6.',
    failureClass: 'EPISTEMIC_INFLATION',
    rootCause: 'The scorer was written to check sufficiency and never to check that the claim was honest. TOOL_USE had the same temptation and was built to penalise calling every tool; INVENTION was not given the matching rule, so over-claiming is free there. The asymmetry survived because no candidate over-claimed until the null candidate was deliberately written to ignore the prompt.',
    severity: 'MEDIUM',
    status: 'OPEN',
    evidenceRefs: [
      'artifacts/nullstar-terminal/ga3-ablation.json',
      'artifacts/nullstar-terminal/ga3-result.json',
      'src/nullstar-cognitive-tasks.mjs'
    ]
  },
  {
    id: 'F012-PROMOTED-SOLVER-ANSWERS-A-DIFFERENT-QUESTION',
    timestamp: '2026-09-15T13:40:00.000Z',
    sourceSha: 'b0055c6d',
    mission: 'NULLSTAR TERMINAL COMPLETION WAR, generalization V2',
    gate: 'out-of-pattern generalization',
    expected: 'the invention solver promoted by GA3 either answers a composition built from the same primitives in a new combination, or returns nothing',
    observed: 'It answers 0 of 3 and confabulates on one. Given "Report the mean plus the midrange" it returns 8.0000, the mean, because the prompt contains the substring "report the mean" and the pattern fires on it -- the answer is 16.5000. It does not fail loudly; it silently answers a question that was not asked. The runner-up it beat, I4_COMPOSITIONAL_SEARCH, answers all three. The tournament promoted the narrower mechanism because every question the generator asks is one the promoted solver has a pattern for.',
    failureClass: 'EPISTEMIC_INFLATION',
    rootCause: 'Promotion was decided entirely by score on items the generator emits, and the generator emits only the four compositions the winning solver matches. An evaluation drawn wholly from inside the training distribution cannot distinguish a mechanism from a lookup table over that distribution, so the selection pressure ran toward pattern matching. The substring test made it worse: a pattern for a short phrase claims any longer sentence containing it, which turns a missing capability into a wrong answer instead of a refusal.',
    severity: 'HIGH',
    regressionTest: 'tests/nullstar-out-of-pattern-gate.test.mjs',
    repairCommit: 'SEE_CLOSING_NOTE',
    status: 'CLOSED_WITH_PROOF',
    closingNote: 'Three generations. GA4 added a gate on items built outside the generator and promoted nothing. GA5 repaired the operator search and promoted nothing, because the comparison rule defended an incumbent the candidates tied. GA6 repaired the comparison and promoted L2_OPERATOR_REPAIRED, which composes the named quantity rather than matching a phrase. It answers 3 of 3 gating probes and 3 of 3 held-back reporting probes that gated nothing, where the solver it replaces answers none and confabulates on one. What closes is the confabulation and the specific narrowness; what does not close is the general claim -- the probes are hand-built by the same author as the solvers and share his blind spots, which is stated in the GA4 declaration and remains true.',
    evidenceRefs: [
      'artifacts/nullstar-terminal/generalization-v2.json',
      'artifacts/nullstar-terminal/ga3-result.json',
      'src/nullstar-cognitive-solvers.mjs'
    ]
  }
];

const records = FAILURES.map(spec => recordFailure(spec));
const invalid = records.filter(row => !row.ok);
if (invalid.length) {
  console.error('FAILURE_RECORD_INVALID', invalid.map(row => row.reasonCodes));
  process.exit(1);
}

const ledger = compileFailureDebt({ failures: records, previousIds: previous, sourceSha: head });
if (!ledger.ok) {
  console.error('FAILURE_DEBT_INVALID', ledger.reasonCodes);
  process.exit(1);
}

mkdirSync(join(root, 'artifacts/nullstar-terminal'), { recursive: true });
writeFileSync(join(root, OUT), `${JSON.stringify(ledger, null, 2)}\n`);

console.log(`failure debt @ ${head.slice(0, 8)}`);
console.log(`  total ${ledger.counts.total} | open ${ledger.counts.openRequiringWork} | closed ${ledger.counts.byStatus.CLOSED_WITH_PROOF}`);
for (const row of ledger.failures) {
  console.log(`  ${row.entryStatus === 'CLOSED_WITH_PROOF' ? 'closed' : row.entryStatus.toLowerCase()}  ${row.id}  ${row.failureClass}`);
}
