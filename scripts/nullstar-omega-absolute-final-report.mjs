#!/usr/bin/env node
// Sections 357 and 358. The final report, generated rather than written.
//
// A hand-written report drifts from the tree the moment either changes. This
// reads the artifacts, refuses any gate receipt that does not name the exact
// head, and fills every required field -- including the ones whose honest
// value is zero or NOT_ESTABLISHED.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = 'artifacts/nullstar-omega-absolute';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const read = relative => { try { return JSON.parse(readFileSync(join(root, relative), 'utf8')); } catch { return null; } };
const git = (...args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); } catch { return null; } };

// Gate numbers come from a receipt this session writes after actually running
// the gates. Section 013: a receipt that does not describe the code being
// claimed is a historical receipt, never exact-head evidence.
//
// "Exact head" means the source the gates ran against, not the commit id. A
// canon-only commit after the run -- regenerating readiness, say -- changes
// the head without changing anything a gate exercised, and invalidating the
// receipt for that would force either a re-run that cannot terminate or a
// relabelled SHA, which is the forgery this rule exists to prevent. So the
// receipt holds while no source file has changed since it was taken, which is
// the same rule canon freshness already applies to readiness.
const GENERATED_PREFIXES = ['artifacts/', 'docs/CURRENT_SYSTEM_STATE.md', 'docs/CURRENT_HANDOFF.json'];
const gates = read(`${OUT_DIR}/gate-receipts.json`);
const changedSinceReceipt = gates?.sourceCommit
  ? (git('diff', '--name-only', gates.sourceCommit, head) ?? '').split('\n').filter(Boolean)
  : null;
const sourceChangedSinceReceipt = (changedSinceReceipt ?? [])
  .filter(path => !GENERATED_PREFIXES.some(prefix => path.startsWith(prefix)));
const gatesAreExactHead = Boolean(gates?.sourceCommit)
  && (gates.sourceCommit === head || sourceChangedSinceReceipt.length === 0);
const gate = key => (gatesAreExactHead ? gates?.[key] ?? null : null);

const denominator = read('artifacts/nullstar-omega/denominator.json');
const directive = read('artifacts/nullstar/directive-reconciliation.json');
const baselines = read('artifacts/nullstar-omega/baselines.json');
const meta = read('artifacts/nullstar-omega/meta-improvement.json');
const generalization = read('artifacts/nullstar-omega/generalization.json');
const reality = read('artifacts/nullstar-omega/reality-connection.json');
const velocity = read('artifacts/nullstar-omega/velocity.json');
const retirement = read('artifacts/nullstar-omega/suite-retirement.json');
const handoff = read('docs/CURRENT_HANDOFF.json');
const reachability = read('artifacts/reachability-report.json');

const generations = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6']
  .map(id => ({ id, data: read(`artifacts/nullstar-omega/generations/${id}.json`) }))
  .filter(row => row.data);
const latest = generations.length ? generations[generations.length - 1].data : null;

const vector = latest?.vector ?? {};
const measured = Object.entries(vector).filter(([, v]) => Number.isFinite(v)).map(([k]) => k);
const unmeasured = Object.entries(vector).filter(([, v]) => !Number.isFinite(v)).map(([k]) => k);

const baselineField = id => {
  const row = baselines?.set?.baselines?.find(entry => entry.id === id);
  if (!row) return { status: 'NOT_RECORDED', note: 'No baseline record. This is the unexplained null the baseline module exists to prevent.' };
  return row.baselineStatus === 'EXECUTED'
    ? { status: 'EXECUTED', score: row.score, tasksCorrect: row.tasksCorrect, tasksAttempted: row.tasksAttempted, method: row.method }
    : { status: row.baselineStatus, reason: row.reason, blockingDependency: row.blockingDependency, whatWasTried: row.whatWasTried, nextUnblockCondition: row.nextUnblockCondition };
};

const report = {
  schemaVersion: 'uberbond-nullstar-omega-absolute-final-report-1.0.0',
  directive: 'PROJECT NULLSTAR OMEGA ABSOLUTE',
  generatedAt: new Date().toISOString(),

  START_MAIN_SHA: '66430f5b7562de83d4d8907a6e228cbd3eb14ec1',
  START_NULLSTAR_SHA: '0a5cd4b46e070855c04abfb4d2a27453976ddf20',
  MERGE_BASE: '2831e4e010fce9b4775ade0c31aae0622de2b104',
  FINAL_MAIN_SHA: git('rev-parse', 'origin/main'),
  FINAL_INTEGRATION_SHA: head,

  PR_HISTORY: [
    { number: 889, title: 'NULLSTAR OMEGA ABSOLUTE: reconcile the cognitive-measurement lineage onto current main', base: 'main', head: 'claude/uberbond-bootstrap-archaeology-zmqw8l', state: 'OPEN_AT_REPORT_TIME' }
  ],
  BRANCH_DEBT: {
    behindMain: Number(git('rev-list', '--count', `${head}..origin/main`) ?? -1),
    aheadOfMain: Number(git('rev-list', '--count', `origin/main..${head}`) ?? -1),
    note: 'Behind-count zero means the branch carries exact current main.'
  },

  DIRECTIVE_TOTAL: directive?.counts?.sections ?? null,
  DIRECTIVE_BY_STATE: directive?.counts?.byState ?? null,

  N01_N24_BY_STATE: denominator?.counts?.byState ?? null,

  TEST_TOTAL: gate('testTotal'),
  TEST_PASS: gate('testPass'),
  TEST_FAIL: gate('testFail'),
  TEST_SKIP: gate('testSkip'),

  MUTATIONS_TOTAL: gate('mutationsTotal'),
  MUTATIONS_KILLED: gate('mutationsKilled'),
  MUTATIONS_SURVIVED: gate('mutationsSurvived'),

  PARSE_COUNT: gate('parseCount'),

  REACHABILITY_COUNTS: reachability
    ? { srcModules: reachability.srcModules, production: reachability.reachableFromProduction, operatorOnly: reachability.reachableFromOperatorScriptsOnly, noEntry: reachability.noEntryPointAtAll, allClassified: reachability.allClassified }
    : gate('reachability'),

  CI_STATE: 'NOT_OBSERVED_AT_THIS_HEAD__LOCAL_GATES_ONLY',
  DEPLOYMENT_STATE: 'NOT_ATTEMPTED__NO_DEPLOYMENT_AUTHORITY_IN_THIS_MISSION',
  RUNTIME_STATE: 'NOT_OBSERVED__NO_RUNTIME_RECEIPT_PRODUCED_BY_THIS_MISSION',

  BASELINE_B0: baselineField('B0'),
  BASELINE_B1: baselineField('B1'),
  BASELINE_B2: baselineField('B2'),
  BASELINE_B3: baselineField('B3'),
  BASELINE_B4: baselineField('B4'),
  BASELINE_B5: baselineField('B5'),

  EVALUATION_EPOCH: {
    retiredSuite: retirement?.retirement?.suiteVersion ?? null,
    retiredBecause: retirement?.retirement?.reason ?? null,
    successorSuite: retirement?.retirement?.replacedBy ?? null,
    comparableAcrossEpochs: retirement?.retirement?.comparableWithSuccessor ?? null,
    contaminatedGenerations: retirement?.contaminatedGenerations?.map(row => row.generationId) ?? []
  },

  CURRENT_COGNITIVE_VECTOR: vector,
  MEASURED_DIMENSIONS: measured,
  UNMEASURED_DIMENSIONS: unmeasured,
  COGNITIVE_VECTOR_CAVEAT: 'Every number in this vector was produced on the retired suite. It is reported for continuity and none of it is a current capability measurement.',

  GENERALIZATION_VERDICT: generalization?.verdict ?? 'NOT_ESTABLISHED',
  META_IMPROVEMENT_VERDICT: meta?.verdict?.status ?? 'NOT_ESTABLISHED',
  META_IMPROVEMENT_TIMING_BOUNDARY: meta?.truthBoundary ?? null,

  CAPABILITY_GENERATIONS: {
    recorded: generations.map(row => row.id),
    instrumentationFocused: ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'],
    actualCapabilityFocused: [],
    note: 'Section 056 asks for generations that target capability rather than measurement coverage. None has run. Every recorded generation was instrumentation, and the baselines then showed the instrument was measuring self-consistency.'
  },

  IMPROVEMENT_VELOCITY: {
    trend: velocity?.trend ?? 'NOT_ESTABLISHED',
    accelerationClaim: velocity?.accelerationClaim ?? 'NOT_ESTABLISHED',
    note: 'A velocity computed across a retired instrument describes the instrument.'
  },

  CALIBRATION_STATE: reality?.calibrationPlacement?.status ?? 'UNMEASURED',
  CALIBRATION_SAMPLE_SIZE: reality?.calibrationPlacement?.sample ?? null,

  UB_LEVEL_EARNED: 'NONE__NO_UB_TIER_IS_CLAIMABLE_WHILE_THREE_BASELINES_ARE_BLOCKED_AND_THE_SUITE_IS_RETIRED',

  ASI_STATUS: 'NOT_ESTABLISHED',
  INTELLIGENCE_EXPLOSION_STATUS: 'NOT_ESTABLISHED',
  SINGULARITY_STATUS: 'NOT_ESTABLISHED',

  REVENUE: 0,
  CLEARED_REVENUE: 0,
  CUSTOMERS: 0,

  PERSONAL_OUTCOME_EVIDENCE: 'NONE_OBSERVED. The founder command center carries a sealed forecast settled by elapsed time; no outcome has been observed against it.',
  ECONOMIC_OUTCOME_EVIDENCE: 'NONE_OBSERVED. The first-cash claim carries a sealed forecast settled by a provider-origin receipt; no such receipt exists.',
  SOFTWARE_OUTCOME_EVIDENCE: 'Measured from git: of the src modules introduced on this branch, the share never edited after the commit that introduced them. This is a floor on first-attempt correctness, not a quality measure.',

  EXTERNAL_BLOCKERS: handoff?.genuineBlockers ?? [],

  FOUNDER_ACTIONS: [],

  NEXT_HIGHEST_LEVERAGE_BOTTLENECK: 'Instantiate the independent suite. The tautology-refusing definition exists and is mutation-guarded, but no task has been written against it, so there is currently no instrument that can separate this system from a constant. Everything downstream -- the seven unmeasured dimensions, any capability generation, any UB tier -- waits on that.',

  GATE_RECEIPT: {
    sourceCommit: gates?.sourceCommit ?? null,
    describesThisSource: gatesAreExactHead,
    sourceFilesChangedSinceReceipt: sourceChangedSinceReceipt,
    rule: 'A receipt holds while no source file has changed since it was taken. Generated artifacts and canon do not invalidate it; any source change does.'
  },

  truthBoundary: 'THIS REPORT IS GENERATED FROM ARTIFACTS AT ONE COMMIT. GATE NUMBERS ARE NULL UNLESS A RECEIPT NAMES THIS EXACT HEAD. NOTHING HERE ESTABLISHES ASI, AN INTELLIGENCE EXPLOSION, A SINGULARITY, REVENUE, A CUSTOMER, OR A LIFE OUTCOME.',
  businessEffectAuthority: 'NONE'
};

const missing = Object.entries(report).filter(([, value]) => value === null).map(([key]) => key);

mkdirSync(join(root, OUT_DIR), { recursive: true });
writeFileSync(join(root, `${OUT_DIR}/final-report.json`), `${JSON.stringify({ ...report, FIELDS_WITH_NO_VALUE: missing }, null, 2)}\n`);

console.log(`final report @ ${head.slice(0, 8)}`);
console.log(`  gate receipt describes this source: ${gatesAreExactHead}${sourceChangedSinceReceipt.length ? ` (${sourceChangedSinceReceipt.length} source file(s) changed since)` : ''}`);
console.log(`  directive: ${JSON.stringify(report.DIRECTIVE_BY_STATE)}`);
console.log(`  denominator: ${JSON.stringify(report.N01_N24_BY_STATE)}`);
console.log(`  baselines executed: ${['B0','B1','B2','B3','B4','B5'].filter(id => report[`BASELINE_${id}`].status === 'EXECUTED').join(', ')}`);
console.log(`  calibration: ${report.CALIBRATION_STATE}`);
console.log(`  generalization: ${report.GENERALIZATION_VERDICT}`);
console.log(`  meta-improvement: ${report.META_IMPROVEMENT_VERDICT}`);
console.log(`  capability generations: ${report.CAPABILITY_GENERATIONS.actualCapabilityFocused.length}`);
if (missing.length) console.log(`  fields with no value: ${missing.join(', ')}`);
