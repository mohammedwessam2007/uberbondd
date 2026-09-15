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
    status: 'OPEN',
    evidenceRefs: ['artifacts/nullstar-omega/baselines.json']
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
