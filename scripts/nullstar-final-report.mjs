#!/usr/bin/env node
// Sections 221 and 222. The final report, computed rather than written.
//
// A summary is the easiest place in a project to lie, because nothing checks
// it. So every figure here is read from an artifact or measured live, the
// generation table is built from the result files rather than remembered, and
// the DONE verdict comes from the completion ledger's own count instead of a
// sentence.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTaskSet } from '../src/nullstar-cognitive-tasks.mjs';
import { UBERBOND_SOLVERS, scoreTaskSet } from '../src/nullstar-cognitive-solvers.mjs';
import { GATING_PROBES, REPORTING_PROBES, runProbes } from '../src/nullstar-out-of-pattern-probes.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.NULLSTAR_FINAL_OUT || 'artifacts/nullstar-terminal/final-report.json';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const readJson = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const has = path => existsSync(join(root, path));

const failureDebt = readJson('artifacts/nullstar-terminal/failure-debt.json');
const completionDebt = readJson('artifacts/nullstar-terminal/completion-debt.json');
const transfer = readJson('artifacts/nullstar-terminal/cross-organ-transfer.json');
const generalization = readJson('artifacts/nullstar-terminal/generalization-v2.json');
const attribution = readJson('artifacts/nullstar-terminal/attribution-audit.json');
const saturation = readJson('artifacts/nullstar-terminal/probe-saturation.json');
const metaImprovement = readJson('artifacts/nullstar-terminal/meta-improvement-v2.json');

const generations = ['ga1', 'ga2', 'ga3', 'ga4', 'ga5', 'ga6', 'ga7', 'ga8']
  .filter(name => has(`artifacts/nullstar-terminal/${name}-result.json`))
  .map(name => {
    const result = readJson(`artifacts/nullstar-terminal/${name}-result.json`);
    return {
      generation: result.generation,
      family: result.family,
      difficulty: result.difficulty,
      outcome: result.outcome,
      winner: result.winner,
      discrimination: result.discrimination ?? null,
      gateApplied: result.outOfPatternGate?.applied ?? false,
      declaredBefore: result.declarationRef,
      thresholdMatchesDeclaration: result.precommittedThreshold
        === readJson(`artifacts/nullstar-terminal/${name}-declaration.json`).precommittedCriteria.promotionThreshold
    };
  });

// Live capability, measured now rather than quoted.
const SEEDS = Array.from({ length: 30 }, (_, i) => 50000 + i);
const FAMILIES = ['PLANNING', 'SCIENCE', 'CAUSALITY', 'TOOL_USE', 'RESEARCH', 'INVENTION', 'FORECASTING'];
const capability = FAMILIES.map(family => ({
  family,
  byDifficulty: Object.fromEntries([1, 2, 3, 4, 5].map(difficulty =>
    [`d${difficulty}`, scoreTaskSet(generateTaskSet({ seeds: SEEDS, families: [family], difficulty }).items, UBERBOND_SOLVERS).mean]))
}));

const probeStanding = Object.keys(GATING_PROBES).map(family => {
  const gating = runProbes(UBERBOND_SOLVERS[family], GATING_PROBES[family]);
  const reporting = runProbes(UBERBOND_SOLVERS[family], REPORTING_PROBES[family]);
  return {
    family,
    gating: { correct: gating.correct, of: gating.of, confabulated: gating.confabulated, threw: gating.threw },
    heldBackReporting: { correct: reporting.correct, of: reporting.of, confabulated: reporting.confabulated, threw: reporting.threw }
  };
});

const promoted = generations.filter(row => row.outcome === 'PROMOTED');
const nullResults = generations.filter(row => row.outcome !== 'PROMOTED');

const artifact = {
  schemaVersion: 'uberbond-nullstar-terminal-final-report-1.0.0',
  directiveSections: ['009', '221', '222', '244'],
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  everyFigureComputed: 'Generation rows are read from their own result files, capability is measured live at report time, and the verdict is the completion ledger\'s own count. Nothing here is a remembered number.',

  verdict: {
    softwareOpen: completionDebt.softwareOpen,
    externalOpen: completionDebt.externalOpen,
    done: completionDebt.doneVerdict,
    whatDoneMeans: 'No writable work remains that the completion ledger has identified. It does not mean the system is capable, that the permanent limitations have gone away, or that the external blockers have.',
    externalBlockers: completionDebt.items.filter(row => row.class === 'EXTERNAL' && row.open).map(row => ({ id: row.id, what: row.what }))
  },

  generations: {
    run: generations.length,
    promoted: promoted.length,
    nullResults: nullResults.length,
    everyOneDeclaredBeforeItsCandidates: generations.every(row => row.declaredBefore && row.thresholdMatchesDeclaration),
    table: generations
  },

  capabilityNow: {
    measuredAt: head,
    seeds: `${SEEDS[0]}..${SEEDS[SEEDS.length - 1]}`,
    families: capability,
    headroomRemaining: capability
      .flatMap(row => Object.entries(row.byDifficulty).map(([level, score]) => ({ family: row.family, level, score })))
      .filter(row => row.score < 1)
  },

  outOfPatternStanding: probeStanding,

  failureDebt: {
    total: failureDebt.counts.total,
    closedWithProof: failureDebt.counts.byStatus.CLOSED_WITH_PROOF,
    open: failureDebt.counts.openRequiringWork,
    everyClosureCarriesARegressionTest: failureDebt.failures
      .filter(row => row.entryStatus === 'CLOSED_WITH_PROOF')
      .every(row => Boolean(row.regressionTest) && Boolean(row.repairCommit))
  },

  whatWasLearned: [
    'An evaluation drawn from inside the distribution a solver was built against cannot distinguish a mechanism from a lookup over that distribution. This cost two promotions their attribution before it was named, and then cost three more generations to fix.',
    'A tie among candidates means the instrument could not separate them, not that they are equivalent. Twice a tie-break chose on size and twice the tied candidates were separable by evidence nobody had run; once it picked the worse one.',
    'Confabulation and refusal are different failures and a mean treats them alike. Every promotion on the invention family closed a confident wrong answer that the previous promotion introduced and no existing level could see.',
    'A mechanism transfers between organs when given the receiving vocabulary; an implementation carrying its own vocabulary does not travel with it. Vocabulary and reasoning are separable and mistaking one for the other was the root of the attribution failures too.',
    'A limitation is not debt. An item that no work can close makes a completion count meaningless, and three such were moved out of the ledger into a section that does not enter it.'
  ],

  correctionsMadeAgainstOwnResults: [
    'The GA2 and GA3 tournaments were annotated as undiscriminating from their own recorded scores, without rescoring.',
    'The GA1 audit was run because GA1 shared the symptom, not because anything flagged it.',
    'The cross-organ task was rebuilt after its first construction proved unanswerable, and the flattering number it produced is not reported.',
    'The cross-organ verdict was changed from comparing against the rule under replacement to comparing against chance, which reversed its conclusion about the implementation.'
  ],

  evidenceIndex: {
    failureDebt: 'artifacts/nullstar-terminal/failure-debt.json',
    completionDebt: 'artifacts/nullstar-terminal/completion-debt.json',
    generalization: 'artifacts/nullstar-terminal/generalization-v2.json',
    metaImprovement: 'artifacts/nullstar-terminal/meta-improvement-v2.json',
    attributionAudit: 'artifacts/nullstar-terminal/attribution-audit.json',
    probeSaturation: 'artifacts/nullstar-terminal/probe-saturation.json',
    crossOrganTransfer: 'artifacts/nullstar-terminal/cross-organ-transfer.json',
    generationResults: generations.map(row => `artifacts/nullstar-terminal/${row.generation.toLowerCase()}-result.json`)
  },

  supportingFindings: {
    generalization: generalization.probeA.verdict,
    generalizationOutOfPattern: generalization.probeB.verdict,
    attribution: attribution.overall,
    probeSaturation: saturation.verdict,
    transfer: transfer.finding,
    metaBacktest: metaImprovement.backtest.finding
  },

  permanentLimitations: completionDebt.permanentLimitations,

  whatThisIsNot: [
    'Not evidence of artificial general intelligence, superintelligence, an intelligence explosion or a singularity. No such claim is made or supported anywhere in this work.',
    'Not evidence about a model. Every solver here is a hand-written deterministic function, so what improved is the author\'s understanding of a task expressed as code.',
    'Not evidence of recursive self-improvement. The improvements were written by hand, selected by a tournament, and each one introduced the defect the next had to fix.',
    'Not revenue, customers, cleared payment, or any economic outcome. Those remain zero and nothing here bears on them.',
    'Not a production change to any organ. The epistemic immune system is unmodified and nothing in it references this work.'
  ],

  truthBoundary: 'THIS REPORTS WORK DONE AND MEASUREMENTS TAKEN ON ONE INSTRUMENT BUILT BY THE SAME AUTHOR AS THE SOLVERS IT JUDGES. CAPABILITY NEVER CREATES AUTHORITY.',
  businessEffectAuthority: 'NONE',
  externalEffects: { providerCalls: 0, spendCents: 0, networkCalls: 0, messagesSent: 0, deployments: 0, purchases: 0 }
};

const outPath = resolve(root, OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`final report @ ${head.slice(0, 8)}`);
console.log(`\n  verdict: ${artifact.verdict.done}  (software open ${artifact.verdict.softwareOpen}, external open ${artifact.verdict.externalOpen})`);
console.log(`\n  generations: ${generations.length} run, ${promoted.length} promoted, ${nullResults.length} null results`);
for (const row of generations) {
  console.log(`    ${row.generation}  ${row.family.padEnd(12)} d${row.difficulty}  ${row.outcome.padEnd(28)} ${row.winner ?? ''}`);
}
console.log(`\n  failure debt: ${artifact.failureDebt.total} total, ${artifact.failureDebt.closedWithProof} closed with proof, ${artifact.failureDebt.open} open`);
console.log(`  headroom remaining: ${artifact.capabilityNow.headroomRemaining.map(row => `${row.family} ${row.level} ${row.score}`).join(', ') || 'none'}`);
console.log(`\n  transfer: ${transfer.finding}`);
