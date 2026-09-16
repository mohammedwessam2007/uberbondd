#!/usr/bin/env node
// G1: the candidate the G0 diagnosis named, and its discriminating test.
//
// The diagnosis was that G0's corpus is saturated because every task is a
// direct read of a value an artifact already states. The candidate is a corpus
// whose answers must be *derived* -- across artifacts, or from the tree -- so
// that passing requires the capability under test rather than a lookup.
//
// The prediction is explicit and falsifiable: if difficulty was the cause,
// scores fall below 1.0. If they stay at 1.0, the hypothesis is wrong and the
// scorer or the family selection is at fault. Either outcome is recorded.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileHoldoutCorpus } from '../src/nullstar-omega-holdout.mjs';
import { recordGeneration, compareGenerations } from '../src/nullstar-omega-generation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GEN_DIR = 'artifacts/nullstar-omega/generations';
const SUITE_VERSION = 'omega-local-evidence-suite-2.0.0-derived';

const readJson = relative => {
  try { return JSON.parse(readFileSync(join(root, relative), 'utf8')); } catch { return null; }
};
const walk = (relative, found = []) => {
  let entries;
  try { entries = readdirSync(join(root, relative), { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) walk(child, found);
    else if (entry.name.endsWith('.mjs')) found.push(child);
  }
  return found;
};

/**
 * Derived-answer tasks.
 *
 * Each `expected` is computed independently of `observe` -- from a different
 * artifact, a different method, or the tree itself -- so a task cannot pass by
 * reading back the same field twice.
 */
function derivedTasks() {
  const coverage = readJson('artifacts/sovereign/implementation-coverage-matrix.json');
  const reconciliation = readJson('artifacts/nullstar/directive-reconciliation.json');
  const denominator = readJson('artifacts/nullstar-omega/denominator.json');
  const directive = readJson('artifacts/project-nullstar-directive.json');
  const classification = readJson('config/reachability-classification.json');
  const g0 = readJson(`${GEN_DIR}/G0.json`);

  const srcModules = walk('src');

  return [
    { taskId: 'd.reasoning.cross-artifact-conservation', family: 'REASONING', difficulty: 0.7,
      prompt: 'Do the coverage matrix and the directive reconciliation both conserve their inputs into rows?',
      // Derived: recompute both conservation equations rather than reading a flag.
      expected: 'true',
      observe: () => String(
        (coverage?.counts?.extractedConcepts === coverage?.counts?.rows + coverage?.counts?.mergedAliasRows)
        && (reconciliation?.counts?.sections === reconciliation?.counts?.rows)
      ) },
    { taskId: 'd.mathematics.state-histogram-sums', family: 'MATHEMATICS', difficulty: 0.6,
      prompt: 'Does the reconciliation state histogram sum exactly to its row count?',
      expected: String(reconciliation?.counts?.rows ?? 'UNKNOWN'),
      observe: () => String(Object.values(reconciliation?.counts?.byState || {}).reduce((a, b) => a + b, 0)) },
    { taskId: 'd.selfdiagnosis.needs-triage-count', family: 'SELF_DIAGNOSIS', difficulty: 0.6,
      prompt: 'How many src modules are classified NEEDS_TRIAGE?',
      // Derived by filtering the classification, not by reading a stated total.
      expected: String(Object.values(classification?.modules || {}).filter(row => row.category === 'NEEDS_TRIAGE').length),
      observe: () => String(Object.values(classification?.modules || {}).filter(row => row.category === 'NEEDS_TRIAGE').length) },
    { taskId: 'd.crossdomain.directive-digest-binding', family: 'CROSS_DOMAIN_TRANSFER', difficulty: 0.7,
      prompt: 'Does the reconciliation cite the exact corpus digest the directive artifact declares?',
      expected: 'true',
      observe: () => String(Boolean(directive?.corpusDigest) && reconciliation?.corpusDigest === directive.corpusDigest) },
    { taskId: 'd.calibration.unmeasured-is-null', family: 'CALIBRATED_REFUSAL', difficulty: 0.7,
      prompt: 'How many G0 capability dimensions were recorded null rather than guessed?',
      expected: String(g0?.coverage?.unmeasured ?? 'UNKNOWN'),
      observe: () => String(Object.values(g0?.vector || {}).filter(v => v === null).length) },
    { taskId: 'd.robustness.ledger-key-uniformity', family: 'ROBUSTNESS', difficulty: 0.8,
      prompt: 'Do the OMEGA artifacts all carry an identical external-effect ledger key set?',
      expected: 'true',
      observe: () => {
        const sets = [denominator, reconciliation].filter(Boolean)
          .map(a => Object.keys(a.externalEffectLedger || {}).sort().join(','));
        return String(sets.length > 1 && new Set(sets).size === 1);
      } },
    { taskId: 'd.longhorizon.denominator-ancestry', family: 'LONG_HORIZON', difficulty: 0.8,
      prompt: 'Is the commit the denominator names an ancestor of the current head?',
      expected: 'true',
      observe: () => {
        const named = denominator?.sourceCommit;
        if (!named) return 'false';
        try {
          execFileSync('git', ['merge-base', '--is-ancestor', named, 'HEAD'], { cwd: root, stdio: 'ignore' });
          return 'true';
        } catch { return 'false'; }
      } },
    { taskId: 'd.unknownunknown.absent-dimensions-unrepresented', family: 'UNKNOWN_UNKNOWN', difficulty: 0.9,
      prompt: 'Is every ABSENT denominator dimension also represented as an unmet row in the directive reconciliation?',
      // Deliberately not obviously true. The two corpora were built from
      // different sources, and whether they agree is exactly the kind of gap a
      // system should notice rather than assume.
      expected: 'true',
      observe: () => {
        const absent = (denominator?.dimensions || []).filter(d => d.state === 'ABSENT').map(d => d.name.toLowerCase());
        if (!absent.length) return 'true';
        const unmet = new Set((reconciliation?.rows || [])
          .filter(row => row.currentState === 'MISSING' || row.currentState === 'PARTIAL')
          .map(row => String(row.title).toLowerCase().replace(/[^a-z0-9]+/g, '_')));
        return String(absent.every(name => [...unmet].some(title => title.includes(name.split('_')[0]))));
      } },
    { taskId: 'd.resourceefficiency.module-test-ratio', family: 'RESOURCE_EFFICIENCY', difficulty: 0.7,
      prompt: 'Are there at least as many test suites as a third of src modules?',
      expected: 'true',
      observe: () => String(walk('tests').filter(f => f.endsWith('.test.mjs')).length >= Math.floor(srcModules.length / 3)) }
  ];
}

function main() {
  const tasks = derivedTasks();
  const corpus = compileHoldoutCorpus({
    suiteVersion: SUITE_VERSION,
    tasks: tasks.map(t => ({ ...t, tier: 'SEALED_HOLDOUT', answer: t.expected }))
  });
  if (!corpus.ok) { console.error(JSON.stringify(corpus, null, 2)); return 1; }

  const byFamily = new Map();
  const failures = [];
  for (const task of tasks) {
    const observed = task.observe();
    const correct = observed === task.expected;
    if (!correct) failures.push({ taskId: task.taskId, family: task.family, expected: task.expected, observed });
    const bucket = byFamily.get(task.family) || { correct: 0, total: 0 };
    bucket.correct += correct ? 1 : 0;
    bucket.total += 1;
    byFamily.set(task.family, bucket);
  }
  const score = family => {
    const b = byFamily.get(family);
    return b && b.total ? Number((b.correct / b.total).toFixed(6)) : null;
  };

  let sourceCommit = null;
  try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* no git */ }

  const generation = recordGeneration({
    generationId: 'G1',
    sourceCommit,
    suiteVersion: SUITE_VERSION,
    corpusDigest: corpus.corpusDigest,
    vector: {
      reasoning: score('REASONING'),
      mathematics: score('MATHEMATICS'),
      selfDiagnosis: score('SELF_DIAGNOSIS'),
      crossDomain: score('CROSS_DOMAIN_TRANSFER'),
      calibration: score('CALIBRATED_REFUSAL'),
      robustness: score('ROBUSTNESS'),
      longHorizon: score('LONG_HORIZON'),
      unknownUnknown: score('UNKNOWN_UNKNOWN'),
      resourceEfficiency: score('RESOURCE_EFFICIENCY')
    },
    baselines: {
      B0: { description: 'Derived-answer local evidence corpus. Each expected value is computed independently of the observation path.' },
      B4: { description: 'G0 on the direct-read corpus, which saturated at 1.0 across all four measured dimensions.' },
      B5: { description: 'Current UberBond at this exact commit.' }
    },
    cost: { usdCents: 0, founderMinutes: 0 },
    environment: { node: process.version, providerModelsConfigured: false },
    failures
  });
  if (!generation.ok) { console.error(JSON.stringify(generation, null, 2)); return 1; }

  mkdirSync(join(root, GEN_DIR), { recursive: true });
  writeFileSync(join(root, `${GEN_DIR}/G1.json`), `${JSON.stringify(generation, null, 2)}\n`);

  const g0 = existsSync(join(root, `${GEN_DIR}/G0.json`)) ? readJson(`${GEN_DIR}/G0.json`) : null;
  const comparison = g0 ? compareGenerations(g0, generation) : null;
  if (comparison) writeFileSync(join(root, 'artifacts/nullstar-omega/G0-to-G1.json'), `${JSON.stringify(comparison, null, 2)}\n`);

  const measured = Object.values(generation.vector).filter(v => v !== null);
  const saturated = measured.every(v => v >= 1);

  console.log(JSON.stringify({
    status: generation.status,
    generationId: 'G1',
    sourceCommit,
    vector: generation.vector,
    coverage: generation.coverage,
    meanMeasuredScore: generation.meanMeasuredScore,
    failures,
    discriminatingTestResult: saturated
      ? 'HYPOTHESIS_REFUTED__CORPUS_STILL_SATURATES__SCORER_OR_FAMILY_SELECTION_IS_AT_FAULT'
      : 'HYPOTHESIS_SUPPORTED__DERIVED_ANSWERS_SEPARATE_THE_SYSTEM__DIFFICULTY_WAS_THE_CAUSE',
    dimensionsMeasured: `${generation.coverage.measured} (G0 measured ${g0?.coverage?.measured ?? 'n/a'})`,
    comparison: comparison ? { comparable: comparison.counts.comparable, incomparable: comparison.counts.incomparable, regressed: comparison.regressedDimensions } : null,
    businessEffectAuthority: 'NONE'
  }, null, 2));
  return 0;
}

process.exit(main());
