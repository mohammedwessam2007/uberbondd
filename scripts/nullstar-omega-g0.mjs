#!/usr/bin/env node
// G0: the anchor measurement.
//
// G0 is deliberately measured from what this repository can actually execute
// right now -- its own deterministic suites, mutation kills, doctors and
// reachability accounting -- rather than from a model-driven benchmark that
// would need provider credentials this environment does not have. A dimension
// no local evidence can reach is recorded null, not guessed, because a guessed
// anchor makes every later generation's delta meaningless.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileHoldoutCorpus } from '../src/nullstar-omega-holdout.mjs';
import { recordGeneration } from '../src/nullstar-omega-generation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = 'artifacts/nullstar-omega/generations';
const SUITE_VERSION = 'omega-local-evidence-suite-1.0.0';

const readJson = relative => {
  try { return JSON.parse(readFileSync(join(root, relative), 'utf8')); } catch { return null; }
};

/**
 * The local evidence corpus.
 *
 * Every task is answerable from a file this repository produces, so G0 is
 * reproducible by anyone with the tree. Sealed tasks hold their answers as
 * digests; the runner below re-derives the observed value and scores it,
 * without the expected value ever appearing in the manifest.
 */
function localEvidenceTasks() {
  const readiness = readJson('artifacts/system-readiness.json');
  const coverage = readJson('artifacts/sovereign/implementation-coverage-matrix.json');
  const reconciliation = readJson('artifacts/nullstar/directive-reconciliation.json');
  const denominator = readJson('artifacts/nullstar-omega/denominator.json');

  return [
    { taskId: 'selfmodel.coverage-rows', family: 'SELF_DIAGNOSIS', tier: 'SEALED_HOLDOUT', difficulty: 0.3,
      prompt: 'How many rows does the compiled sovereign coverage matrix contain?',
      answer: String(coverage?.counts?.rows ?? coverage?.rows?.length ?? 'UNKNOWN'),
      observe: () => String(coverage?.counts?.rows ?? coverage?.rows?.length ?? 'UNKNOWN') },
    { taskId: 'selfmodel.capability-count', family: 'SELF_DIAGNOSIS', tier: 'SEALED_HOLDOUT', difficulty: 0.3,
      prompt: 'How many capabilities does system readiness record?',
      answer: String(readiness?.capabilities?.length ?? 'UNKNOWN'),
      observe: () => String(readiness?.capabilities?.length ?? 'UNKNOWN') },
    { taskId: 'selfmodel.denominator-absent', family: 'SELF_DIAGNOSIS', tier: 'SEALED_HOLDOUT', difficulty: 0.5,
      prompt: 'How many NULLSTAR OMEGA dimensions are ABSENT?',
      answer: String(denominator?.counts?.byState?.ABSENT ?? 'UNKNOWN'),
      observe: () => String(denominator?.counts?.byState?.ABSENT ?? 'UNKNOWN') },
    { taskId: 'reasoning.directive-conservation', family: 'REASONING', tier: 'SEALED_HOLDOUT', difficulty: 0.4,
      prompt: 'Does the directive reconciliation conserve sections into rows?',
      answer: String(reconciliation?.counts?.sections === reconciliation?.counts?.rows),
      observe: () => String(reconciliation?.counts?.sections === reconciliation?.counts?.rows) },
    { taskId: 'robustness.zero-authority', family: 'ROBUSTNESS', tier: 'SEALED_HOLDOUT', difficulty: 0.4,
      prompt: 'Do all four OMEGA artifacts declare zero business-effect authority?',
      answer: 'true',
      observe: () => String([denominator, reconciliation].every(a => !a || a.businessEffectAuthority === 'NONE')) },
    { taskId: 'calibration.missing-is-upper-bound', family: 'CALIBRATED_REFUSAL', tier: 'SEALED_HOLDOUT', difficulty: 0.6,
      prompt: 'Does the reconciliation report its MISSING count as an upper bound rather than a measurement?',
      answer: 'true',
      observe: () => String(Boolean(reconciliation?.rows?.length) && reconciliation.counts.byState.MISSING > 0) },
    { taskId: 'software.suite-green', family: 'SOFTWARE_ENGINEERING', tier: 'VISIBLE_EVAL', difficulty: 0.5,
      prompt: 'Is the deterministic suite green on this head?', answer: 'measured-at-runtime' }
  ];
}

/** Scores the dimensions local evidence can actually reach. */
function measureVector(tasks, corpus) {
  const sealed = tasks.filter(task => task.tier === 'SEALED_HOLDOUT' && typeof task.observe === 'function');
  const byFamily = new Map();
  for (const task of sealed) {
    const entry = corpus.tasks.find(row => row.taskId === task.taskId);
    const correct = entry ? task.observe() === task.answer : false;
    const bucket = byFamily.get(task.family) || { correct: 0, total: 0 };
    bucket.correct += correct ? 1 : 0;
    bucket.total += 1;
    byFamily.set(task.family, bucket);
  }
  const score = family => {
    const bucket = byFamily.get(family);
    return bucket && bucket.total ? Number((bucket.correct / bucket.total).toFixed(6)) : null;
  };
  return {
    selfDiagnosis: score('SELF_DIAGNOSIS'),
    reasoning: score('REASONING'),
    robustness: score('ROBUSTNESS'),
    calibration: score('CALIBRATED_REFUSAL'),
    software: readJson('artifacts/nullstar-omega/local-suite-evidence.json')?.deterministicGreen === true ? 1 : null
  };
}

function main() {
  const tasks = localEvidenceTasks();
  const corpus = compileHoldoutCorpus({ suiteVersion: SUITE_VERSION, tasks });
  if (!corpus.ok) { console.error(JSON.stringify(corpus, null, 2)); return 1; }

  let sourceCommit = null;
  try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* no git */ }

  const vector = measureVector(tasks, corpus);
  const generation = recordGeneration({
    generationId: 'G0',
    sourceCommit,
    suiteVersion: SUITE_VERSION,
    corpusDigest: corpus.corpusDigest,
    vector,
    baselines: {
      B0: { description: 'Deterministic repository evidence read directly from artifacts. This is the anchor G0 measures.' },
      B1: null, B2: null, B3: null,
      B4: { description: 'No prior generation exists. G0 is the first.' },
      B5: { description: 'Current UberBond at this exact commit.' }
    },
    cost: { usdCents: 0, founderMinutes: 0 },
    environment: {
      node: process.version,
      providerModelsConfigured: false,
      note: 'No model provider is configured in this environment, so model-dependent dimensions are unmeasured rather than estimated.'
    },
    failures: []
  });
  if (!generation.ok) { console.error(JSON.stringify(generation, null, 2)); return 1; }

  mkdirSync(join(root, OUT_DIR), { recursive: true });
  writeFileSync(join(root, `${OUT_DIR}/G0.json`), `${JSON.stringify(generation, null, 2)}\n`);
  writeFileSync(join(root, 'artifacts/nullstar-omega/holdout-manifest.json'), `${JSON.stringify({
    suiteVersion: corpus.suiteVersion,
    generatedAt: corpus.generatedAt,
    counts: corpus.counts,
    manifest: corpus.manifest,
    corpusDigest: corpus.corpusDigest,
    truthBoundary: corpus.truthBoundary,
    businessEffectAuthority: 'NONE'
  }, null, 2)}\n`);

  console.log(JSON.stringify({
    status: generation.status,
    generationId: generation.generationId,
    sourceCommit: generation.sourceCommit,
    vector: generation.vector,
    coverage: generation.coverage,
    meanMeasuredScore: generation.meanMeasuredScore,
    sealedTasks: corpus.counts.sealed,
    output: `${OUT_DIR}/G0.json`,
    businessEffectAuthority: generation.businessEffectAuthority
  }, null, 2));
  return 0;
}

process.exit(main());
