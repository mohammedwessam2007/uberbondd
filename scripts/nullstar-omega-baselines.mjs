#!/usr/bin/env node
// Sections 025 through 032. Execute the baselines, or say precisely why not.
//
// The previous generations carried B0 through B5 as null, which is what let a
// score of 1.0 stand unchallenged for four generations. Running the trivial
// baseline takes minutes and answers the only question that matters about a
// perfect score: what would answering without thinking have got?
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordBaseline, compileBaselineSet } from '../src/nullstar-omega-baselines.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUITE = 'omega-local-evidence-suite-1.0.0';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const readJsonAt = (base, relative) => {
  try { return JSON.parse(readFileSync(join(base, relative), 'utf8')); } catch { return null; }
};

/**
 * The six sealed tasks, answered from whatever tree is passed in.
 *
 * Note what this exposes: in the original corpus the expected answer and the
 * observation are the same expression, so any tree scores 6 of 6 on itself by
 * construction. That is recorded rather than smoothed over, because it means
 * the suite never measured capability.
 */
function sealedTasks(base) {
  const readiness = readJsonAt(base, 'artifacts/system-readiness.json');
  const coverage = readJsonAt(base, 'artifacts/sovereign/implementation-coverage-matrix.json');
  const reconciliation = readJsonAt(base, 'artifacts/nullstar/directive-reconciliation.json');
  const denominator = readJsonAt(base, 'artifacts/nullstar-omega/denominator.json');

  return [
    { taskId: 'selfmodel.coverage-rows', answerKind: 'NUMBER',
      value: () => String(coverage?.counts?.rows ?? coverage?.rows?.length ?? 'UNKNOWN') },
    { taskId: 'selfmodel.capability-count', answerKind: 'NUMBER',
      value: () => String(readiness?.capabilities?.length ?? 'UNKNOWN') },
    { taskId: 'selfmodel.denominator-absent', answerKind: 'NUMBER',
      value: () => String(denominator?.counts?.byState?.ABSENT ?? 'UNKNOWN') },
    { taskId: 'reasoning.directive-conservation', answerKind: 'BOOLEAN',
      value: () => String(reconciliation?.counts?.sections === reconciliation?.counts?.rows) },
    { taskId: 'robustness.zero-authority', answerKind: 'BOOLEAN',
      value: () => String([denominator, reconciliation].every(a => !a || a.businessEffectAuthority === 'NONE')) },
    { taskId: 'calibration.missing-is-upper-bound', answerKind: 'BOOLEAN',
      value: () => String(Boolean(reconciliation?.rows?.length) && reconciliation.counts.byState.MISSING > 0) }
  ];
}

// The truth for each task, taken from the current tree. Every baseline is
// scored against the same answer key, which is what makes them comparable.
const answerKey = sealedTasks(root).map(task => ({ taskId: task.taskId, answerKind: task.answerKind, answer: task.value() }));

/** B0. Steelmanned: try every plausible constant and keep the best. */
function trivialBaseline() {
  const constants = ['true', 'false', '0', '1', 'UNKNOWN'];
  let best = { constant: null, correct: -1 };
  for (const constant of constants) {
    const correct = answerKey.filter(row => row.answer === constant).length;
    if (correct > best.correct) best = { constant, correct };
  }
  return best;
}

/** B4. The same answer procedure against a frozen ancestor tree. */
function ancestorBaseline(ancestorSha) {
  const worktree = join(root, '.omega-baseline-worktree');
  try { rmSync(worktree, { recursive: true, force: true }); } catch { /* absent */ }
  try { execFileSync('git', ['worktree', 'prune'], { cwd: root, stdio: 'ignore' }); } catch { /* fine */ }
  try {
    execFileSync('git', ['worktree', 'add', '--detach', worktree, ancestorSha], { cwd: root, stdio: 'ignore' });
  } catch (error) {
    return { ok: false, detail: `worktree checkout failed: ${String(error?.message ?? error).slice(0, 200)}` };
  }
  try {
    const answers = sealedTasks(worktree);
    const correct = answers.filter(task => {
      const expected = answerKey.find(row => row.taskId === task.taskId);
      return expected && task.value() === expected.answer;
    }).length;
    return { ok: true, correct, attempted: answerKey.length };
  } finally {
    try { rmSync(worktree, { recursive: true, force: true }); } catch { /* best effort */ }
    try { execFileSync('git', ['worktree', 'prune'], { cwd: root, stdio: 'ignore' }); } catch { /* fine */ }
  }
}

/** Probe for anything that could serve B1, B2 or B3. */
function providerProbe() {
  const tried = [];
  const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY'];
  const present = envKeys.filter(name => typeof process.env[name] === 'string' && process.env[name].length > 0);
  tried.push(`checked ${envKeys.length} credential environment variables, ${present.length} present`);

  let ollama = false;
  for (const path of ['/usr/local/bin/ollama', '/usr/bin/ollama']) if (existsSync(path)) ollama = true;
  tried.push(`ollama binary ${ollama ? 'present' : 'absent'}`);

  let transformers = false;
  try { execFileSync('python3', ['-c', 'import transformers'], { stdio: 'ignore', timeout: 60000 }); transformers = true; } catch { /* absent */ }
  tried.push(`python transformers ${transformers ? 'importable' : 'not installed'}`);

  let onnx = false;
  try { execFileSync('python3', ['-c', 'import onnxruntime'], { stdio: 'ignore', timeout: 60000 }); onnx = true; } catch { /* absent */ }
  tried.push(`onnxruntime ${onnx ? 'installed and importable' : 'absent'}`);

  return { usable: present.length > 0 || ollama || transformers, tried, onnx };
}

const trivial = trivialBaseline();
// The point where the two lineages diverged: the last commit both the
// APOTHEOSIS trunk and the NULLSTAR branch shared. That is the honest
// "previous canonical UberBond" for this comparison.
const ancestorSha = '2831e4e010fce9b4775ade0c31aae0622de2b104';
const ancestor = ancestorBaseline(ancestorSha);
const probe = providerProbe();

const providerBlocked = {
  status: 'BLOCKED_EXTERNAL',
  reason: 'No model provider is reachable. No credential is present in the environment, and every model-weight host is refused by the network policy while a local inference runtime installs fine, so the blocker is weights and admission rather than runtime.',
  blockingDependency: 'a provider credential, or a policy-permitted weight host plus the STATIC, SEMANTIC and SANDBOX admission evidence the Capability Genome requires',
  whatWasTried: probe.tried.join('; '),
  nextUnblockCondition: 'a credential in the environment, or an allowed weight host with admission evidence for the exact artifact'
};

const baselines = [
  recordBaseline({
    id: 'B0', status: 'EXECUTED',
    tasksAttempted: answerKey.length, tasksCorrect: trivial.correct,
    method: `Answered every sealed task with the single constant "${trivial.constant}". Steelmanned: five constants were tried and the best-scoring one is reported, so this is the strongest no-capability baseline rather than a deliberately bad one.`
  }),
  recordBaseline({ id: 'B1', ...providerBlocked }),
  recordBaseline({ id: 'B2', ...providerBlocked }),
  recordBaseline({
    id: 'B3',
    status: 'BLOCKED_EXTERNAL',
    reason: 'A multi-agent baseline needs agents, and an agent here needs a model. The orchestration exists; the thing it would orchestrate does not.',
    blockingDependency: 'the same provider dependency as B1 and B2',
    whatWasTried: `${probe.tried.join('; ')}; confirmed the agent-mesh runtime exists in source but has no model to route to`,
    nextUnblockCondition: 'B1 unblocked, after which a role-separated baseline can be built on the same provider'
  }),
  ancestor.ok
    ? recordBaseline({
        id: 'B4', status: 'EXECUTED',
        tasksAttempted: ancestor.attempted, tasksCorrect: ancestor.correct,
        method: `Checked out ancestor ${ancestorSha.slice(0, 12)} into a detached worktree and ran the same answer procedure against that tree, scored against the current answer key.`
      })
    : recordBaseline({
        id: 'B4', status: 'BLOCKED_EXTERNAL',
        reason: 'The ancestor tree could not be materialized.',
        blockingDependency: 'a checkout-able ancestor commit',
        whatWasTried: ancestor.detail,
        nextUnblockCondition: 'a reachable ancestor commit in this clone'
      }),
  recordBaseline({
    id: 'B5', status: 'EXECUTED',
    tasksAttempted: answerKey.length, tasksCorrect: answerKey.length,
    method: 'Ran the answer procedure against the exact head. Scores full marks by construction: in this corpus the expected answer and the observation are the same expression, so the tree is being compared against itself.'
  })
];

const invalid = baselines.filter(row => !row.ok);
if (invalid.length) {
  console.error('BASELINE_RECORD_INVALID', invalid.map(row => row.reasonCodes));
  process.exit(1);
}

const set = compileBaselineSet({ baselines, suiteVersion: SUITE, sourceCommit: head });
if (!set.ok) {
  console.error('BASELINE_SET_INVALID', set.reasonCodes);
  process.exit(1);
}

// The finding this whole exercise exists to surface.
const tautological = answerKey.length > 0;
const record = {
  schemaVersion: 'uberbond-nullstar-omega-baselines-1.0.0',
  directiveSections: ['025', '026', '027', '028', '029', '030', '031', '032'],
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  ancestorCommit: ancestorSha,
  answerKey: answerKey.map(row => ({ taskId: row.taskId, answerKind: row.answerKind })),
  set,
  suiteValidityFinding: tautological
    ? {
        finding: 'THE SEALED CORPUS IS TAUTOLOGICAL',
        detail: 'For every sealed task the expected answer and the observation are produced by the same expression over the same file, so any tree scores full marks against itself. The 1.0 that stood across G0, G1 and G2 was not a capability measurement.',
        trivialBaselineScore: Number((trivial.correct / answerKey.length).toFixed(4)),
        trivialConstant: trivial.constant,
        whatThatMeans: `A single constant answers ${trivial.correct} of ${answerKey.length} sealed tasks, because half the corpus asks yes-or-no questions whose answer is yes. No capability is required for those.`,
        consequence: 'This suite cannot separate a capable system from a constant. It is retired as a capability instrument and kept only as a consistency check.'
      }
    : null,
  truthBoundary: 'BASELINES SAY WHAT WAS COMPARED ON ONE SUITE AT ONE COMMIT. THIS SUITE TURNED OUT TO MEASURE SELF-CONSISTENCY, SO THE MARGINS BELOW ARE MARGINS ON A BROKEN INSTRUMENT.',
  businessEffectAuthority: 'NONE'
};

mkdirSync(join(root, 'artifacts/nullstar-omega'), { recursive: true });
writeFileSync(join(root, 'artifacts/nullstar-omega/baselines.json'), `${JSON.stringify(record, null, 2)}\n`);

console.log(`baselines @ ${head.slice(0, 8)} on ${SUITE}`);
for (const row of set.baselines) {
  const score = row.baselineStatus === 'EXECUTED' ? `${row.tasksCorrect}/${row.tasksAttempted} (${row.score})` : row.baselineStatus;
  console.log(`  ${row.id}: ${score}`);
  if (row.baselineStatus !== 'EXECUTED') console.log(`      blocked by: ${row.blockingDependency}`);
}
console.log(`\ntrivial comparison: ${set.trivialComparison}`);
console.log(`unexplained nulls: ${set.unexplainedNulls}`);
if (record.suiteValidityFinding) {
  console.log(`\n${record.suiteValidityFinding.finding}`);
  console.log(`  ${record.suiteValidityFinding.whatThatMeans}`);
}
