#!/usr/bin/env node
// Ranks bottlenecks from the latest generation's measured evidence.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankBottlenecks } from '../src/nullstar-omega-bottleneck.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GEN_DIR = 'artifacts/nullstar-omega/generations';
const REFUTED_PATH = 'artifacts/nullstar-omega/refutations.json';

/**
 * Which dimensions depend on which.
 *
 * Declared rather than inferred, so the leverage number can be argued with by
 * pointing at this graph instead of at a score.
 */
const DEPENDENCY_GRAPH = Object.freeze({
  reasoning: ['evaluation'], software: ['evaluation', 'reasoning'], research: ['evaluation', 'retrieval'],
  forecasting: ['evaluation', 'calibration'], planning: ['reasoning'], invention: ['reasoning', 'evaluation'],
  crossDomain: ['evaluation'], unknownUnknown: ['evaluation'], longHorizon: ['planning', 'memory'],
  selfDiagnosis: ['evaluation'], calibration: ['evaluation'], robustness: ['evaluation'],
  causality: ['reasoning'], toolUse: ['planning'], mathematics: ['reasoning'], science: ['research'],
  resourceEfficiency: ['evaluation']
});

function latestGeneration() {
  const dir = join(root, GEN_DIR);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter(name => /^G\d+\.json$/.test(name))
    .sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)));
  if (!files.length) return null;
  return { file: `${GEN_DIR}/${files.at(-1)}`, data: JSON.parse(readFileSync(join(dir, files.at(-1)), 'utf8')) };
}

function main() {
  const latest = latestGeneration();
  if (!latest) {
    console.error(JSON.stringify({ ok: false, status: 'NO_GENERATION_TO_DIAGNOSE', detail: 'Run npm run omega:g0 first.' }, null, 2));
    return 2;
  }
  const generation = latest.data;
  const measured = Object.entries(generation.vector || {}).filter(([, v]) => v !== null);
  const saturated = measured.filter(([, v]) => v >= 1);
  const unmeasured = generation.coverage?.unmeasuredDimensions || [];

  const bottlenecks = [];

  // Refuted hypotheses from earlier generations. A diagnosis that was tested
  // and failed must not be re-selected unchanged -- re-running a falsified
  // candidate is how a loop spends generations confirming what it already
  // disproved.
  const refuted = existsSync(join(root, REFUTED_PATH))
    ? JSON.parse(readFileSync(join(root, REFUTED_PATH), 'utf8')).refutations || []
    : [];
  const alreadyRefuted = new Set(refuted.map(entry => entry.bottleneckId));

  // A measurement where everything scores full marks cannot detect an
  // improvement or a regression. That is a defect in the instrument, and it is
  // load-bearing: every other dimension's future delta is read through it.
  if (measured.length > 0 && saturated.length === measured.length && !alreadyRefuted.has('BN-EVAL-SATURATED')) {
    bottlenecks.push({
      id: 'BN-EVAL-SATURATED',
      dimension: 'evaluation',
      symptom: `All ${measured.length} measured dimensions score 1.0 at ${generation.generationId}. A saturated instrument cannot register improvement or regression.`,
      evidenceClass: 'SEALED_HOLDOUT_FAILURE',
      evidenceRef: latest.file,
      rootCauseHypotheses: [
        'The corpus tasks are too easy: each is a direct read of a value the repository already computes, so passing requires no capability under test.',
        'The corpus is correct but the scoring collapses partial credit to pass/fail, hiding variance that exists.',
        'The measured families happen to be the system strengths and a wider family set would separate them.'
      ],
      discriminatingTest: 'Add tasks whose answers require deriving a value no artifact states directly. If scores fall below 1.0, difficulty was the cause; if they stay at 1.0, the scorer or family selection is.',
      estimatedCost: 1
    });
  }

  // Coverage is a separate defect from difficulty: a dimension never measured
  // has no anchor, so no later generation can claim a delta on it.
  if (unmeasured.length > 0) {
    bottlenecks.push({
      id: 'BN-EVAL-COVERAGE',
      dimension: 'evaluation',
      symptom: `${unmeasured.length} of ${unmeasured.length + measured.length} capability dimensions are unmeasured at ${generation.generationId}: ${unmeasured.slice(0, 6).join(', ')}...`,
      evidenceClass: 'DENOMINATOR_GAP',
      evidenceRef: latest.file,
      rootCauseHypotheses: [
        'Those dimensions need a configured model provider, which this environment does not have.',
        'Those dimensions could be measured from local deterministic evidence but no task was written for them.'
      ],
      discriminatingTest: 'Attempt a local-evidence task for one unmeasured dimension. If it can be scored without a provider, the gap was authorship; if not, it is an external capability gate.',
      estimatedCost: 2
    });
  }

  // Once difficulty has been ruled out by experiment, the remaining
  // explanation is about what the corpus can measure at all. A deterministic
  // assertion over repository artifacts is a test, not a benchmark: it passes
  // whenever the invariants hold, which the existing suite already enforces.
  // Separating capability from consistency needs a configured model provider,
  // and that is an external gate rather than a software gap.
  if (measured.length > 0 && saturated.length === measured.length && alreadyRefuted.has('BN-EVAL-SATURATED')) {
    bottlenecks.push({
      id: 'BN-EVAL-MEASURES-CONSISTENCY-NOT-CAPABILITY',
      dimension: 'evaluation',
      symptom: `${generation.generationId} still scores 1.0 across ${measured.length} dimensions after the difficulty hypothesis was refuted. Every local task is a deterministic assertion over repository artifacts, so it measures internal consistency the test suite already guarantees, not any capability under test.`,
      evidenceClass: 'SEALED_HOLDOUT_FAILURE',
      evidenceRef: latest.file,
      rootCauseHypotheses: [
        'No model provider is configured, so no task can require a judgement the repository does not already compute deterministically.',
        'A capability task could be written against a local open-weights runtime, and none has been.',
        'The family vocabulary is right but the scoring needs graded rather than binary outcomes to show variance.'
      ],
      discriminatingTest: 'Configure any model provider and run one task whose answer the repository does not compute. If the score leaves 1.0, the gate was the provider; if a local runtime can serve it, the gap was authorship.',
      estimatedCost: 3
    });
  }

  if (!bottlenecks.length) {
    console.log(JSON.stringify({ ok: true, status: 'NO_BOTTLENECK_FOUND_FROM_THIS_GENERATION', generation: generation.generationId }, null, 2));
    return 0;
  }

  let sourceCommit = null;
  try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { /* no git */ }

  const ranked = rankBottlenecks({ bottlenecks, dependencyGraph: DEPENDENCY_GRAPH, sourceCommit });
  if (!ranked.ok) { console.error(JSON.stringify(ranked, null, 2)); return 1; }

  mkdirSync(join(root, 'artifacts/nullstar-omega'), { recursive: true });
  const outPath = `artifacts/nullstar-omega/bottlenecks-${generation.generationId}.json`;
  writeFileSync(join(root, outPath), `${JSON.stringify({ ...ranked, diagnosedGeneration: generation.generationId }, null, 2)}\n`);

  console.log(JSON.stringify({
    status: ranked.status,
    diagnosedGeneration: generation.generationId,
    counts: ranked.counts,
    selected: ranked.selected ? { id: ranked.selected.id, dimension: ranked.selected.dimension, leverage: ranked.selected.leverage, downstreamUnlocks: ranked.selected.downstreamUnlocks } : null,
    ranked: ranked.ranked.map(r => `${r.id} leverage=${r.leverage} unlocks=${r.downstreamUnlocks}`),
    output: outPath,
    businessEffectAuthority: ranked.businessEffectAuthority
  }, null, 2));
  return 0;
}

process.exit(main());
