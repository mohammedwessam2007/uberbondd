#!/usr/bin/env node
// CD003. The probes were hand-written, so they test the failure modes their
// author thought of. This enumerates the space instead.
//
// The invention prompts are built from a small grammar: two quantities out of
// four, joined by one of five operators, in either order. That is a finite
// space, and every point in it is a legal prompt of exactly the kind the
// generator emits -- so rather than picking three and hoping they are
// representative, this walks all of them and reports where the promoted solver
// stands across the whole space.
//
// It does not close the concern. The grammar has an author too, and a failure
// mode outside it is as invisible as before. What it removes is the narrower
// version: that the three gating probes happened to be the three the solver
// could do.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UBERBOND_SOLVERS } from '../src/nullstar-cognitive-solvers.mjs';
import { GATING_PROBES, REPORTING_PROBES } from '../src/nullstar-out-of-pattern-probes.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.NULLSTAR_SATURATION_OUT || 'artifacts/nullstar-terminal/probe-saturation.json';
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const DATA = [6, 13, 3, 18, 8, 12];
const high = Math.max(...DATA);
const low = Math.min(...DATA);
const VALUES = {
  mean: DATA.reduce((a, b) => a + b, 0) / DATA.length,
  midrange: (high + low) / 2,
  spread: high - low,
  size: DATA.length
};

const PHRASES = {
  mean: 'the mean',
  midrange: 'the midrange',
  spread: 'the spread between largest and smallest',
  size: 'how many numbers there are'
};

// Each operator with the English that carries it and where that English sits.
const OPERATORS = [
  { id: 'plus', apply: (a, b) => a + b, render: (x, y) => `Report ${x} plus ${y}.` },
  { id: 'minus', apply: (a, b) => a - b, render: (x, y) => `Report ${x} minus ${y}.` },
  { id: 'dividedBy', apply: (a, b) => (b === 0 ? null : a / b), render: (x, y) => `Report ${x} divided by ${y}.` },
  { id: 'times', apply: (a, b) => a * b, render: (x, y) => `Report ${x} times ${y}.` },
  { id: 'averageOf', apply: (a, b) => (a + b) / 2, render: (x, y) => `Report the average of ${x} and ${y}.` }
];

const KEYS = Object.keys(PHRASES);
const items = [];
for (const first of KEYS) {
  for (const second of KEYS) {
    if (first === second) continue;
    for (const operator of OPERATORS) {
      const value = operator.apply(VALUES[first], VALUES[second]);
      if (value === null || !Number.isFinite(value)) continue;
      // "the average of a and b" is symmetric, so both orderings are the same
      // question and counting them twice would inflate the denominator.
      if (operator.id === 'averageOf' && KEYS.indexOf(second) < KEYS.indexOf(first)) continue;
      items.push({
        id: `${first}-${operator.id}-${second}`,
        prompt: `${operator.render(PHRASES[first], PHRASES[second])} No primitive computes it; compose one.`,
        groundTruth: value.toFixed(4)
      });
    }
  }
}

const surface = { primitives: ['sum', 'count', 'max', 'min'], data: [...DATA] };
const answers = items.map(item => {
  let response = null;
  try {
    response = UBERBOND_SOLVERS.INVENTION(surface, item.prompt);
  } catch {
    response = null;
  }
  const given = response?.answer ?? null;
  return { id: item.id, expected: item.groundTruth, given, correct: given === item.groundTruth, refused: given === null };
});

const correct = answers.filter(row => row.correct).length;
const refused = answers.filter(row => row.refused).length;
const confabulated = answers.filter(row => !row.correct && !row.refused).length;

const handWritten = new Set([...GATING_PROBES.INVENTION, ...REPORTING_PROBES.INVENTION].map(row => row.id));

const artifact = {
  schemaVersion: 'uberbond-nullstar-probe-saturation-1.0.0',
  completionDebtRef: 'CD003-GATE-PROBES-SHARE-AN-AUTHOR',
  generatedAt: new Date().toISOString(),
  sourceCommit: head,
  question: 'Across every prompt the grammar can build, not just the six that were hand-written, where does the promoted invention solver stand?',
  grammar: {
    quantities: KEYS,
    operators: OPERATORS.map(row => row.id),
    orderings: 'both, except for the symmetric average-of which is counted once',
    totalItems: items.length,
    handWrittenProbesInThisSpace: handWritten.size
  },
  results: { of: items.length, correct, refused, confabulated },
  confabulations: answers.filter(row => !row.correct && !row.refused).map(row => ({ id: row.id, expected: row.expected, given: row.given })),
  refusals: answers.filter(row => row.refused).map(row => row.id),
  verdict: confabulated === 0
    ? (correct === items.length ? 'ANSWERS_THE_WHOLE_GRAMMAR' : 'ANSWERS_MOST_AND_REFUSES_THE_REST_WITHOUT_CONFABULATING')
    : 'CONFABULATES_SOMEWHERE_IN_THE_GRAMMAR',
  whatThisNarrows: 'That the six hand-written probes happened to be six the solver could do. They are a vanishing fraction of the space and the solver is measured on all of it.',
  whatThisDoesNotClose: 'The grammar has an author too. A failure mode it cannot express is exactly as invisible as one the hand-written probes missed -- prompts with three quantities, nested clauses, an operator stated in words this grammar does not use, a quantity the generator never names. CD003 is narrowed, not closed, and the completion ledger should keep saying so.',
  truthBoundary: 'ENUMERATING A GRAMMAR IS NOT ENUMERATING A CAPABILITY. THIS BOUNDS ONE SOLVER OVER ONE FINITE SPACE OF PROMPTS.',
  businessEffectAuthority: 'NONE',
  externalEffects: { providerCalls: 0, spendCents: 0, networkCalls: 0, messagesSent: 0 }
};

const outPath = resolve(root, OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`probe saturation @ ${head.slice(0, 8)}`);
console.log(`  ${items.length} prompts from the grammar, against ${handWritten.size} hand-written probes`);
console.log(`  correct ${correct}  refused ${refused}  confabulated ${confabulated}`);
if (artifact.confabulations.length) {
  for (const row of artifact.confabulations) console.log(`    CONFABULATED ${row.id}: expected ${row.expected}, gave ${row.given}`);
}
if (artifact.refusals.length) console.log(`  refused: ${artifact.refusals.join(', ')}`);
console.log(`\n  ${artifact.verdict}`);
