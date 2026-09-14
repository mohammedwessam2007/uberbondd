#!/usr/bin/env node
// Improvement velocity across recorded generations.
//
// The receipt this writes is honest about its own emptiness: with two
// generations the answer is INSUFFICIENT_DATA, and that is the output rather
// than a number. The organ having run and reported that it cannot yet say is a
// different fact from the organ not existing, and the denominator distinguishes
// them.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { improvementTrend, compareGenerations } from '../src/nullstar-omega-generation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GEN_DIR = 'artifacts/nullstar-omega/generations';

function main() {
  const dir = join(root, GEN_DIR);
  if (!existsSync(dir)) { console.error(JSON.stringify({ ok: false, status: 'NO_GENERATIONS' }, null, 2)); return 2; }
  const generations = readdirSync(dir)
    .filter(name => /^G\d+\.json$/.test(name))
    .sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)))
    .map(name => JSON.parse(readFileSync(join(dir, name), 'utf8')));

  const trend = improvementTrend(generations);
  const pairs = generations.slice(1).map((g, i) => compareGenerations(generations[i], g))
    .filter(c => c.ok)
    .map(c => ({ from: c.from, to: c.to, comparable: c.counts.comparable, incomparable: c.counts.incomparable, netDelta: c.netDelta, regressed: c.regressedDimensions }));

  const receipt = {
    schemaVersion: 'uberbond-nullstar-omega-velocity-1.0.0',
    generatedAt: new Date().toISOString(),
    generations: generations.map(g => ({ id: g.generationId, commit: g.sourceCommit, measured: g.coverage.measured, mean: g.meanMeasuredScore })),
    pairwise: pairs,
    trend,
    accelerationClaim: 'NOT_ESTABLISHED',
    accelerationLaw: 'Acceleration requires repeated evidence that capability gain persists, generalizes, and arrives faster or larger, with controlled cost and no loss of security. A score series alone cannot establish it.',
    truthBoundary: 'VELOCITY_IS_COMPUTED_FROM_RECORDED_GENERATIONS_ONLY. INSUFFICIENT_DATA_IS_A_RESULT_AND_NOT_A_FAILURE_TO_RUN.',
    businessEffectAuthority: 'NONE'
  };

  mkdirSync(join(root, 'artifacts/nullstar-omega'), { recursive: true });
  writeFileSync(join(root, 'artifacts/nullstar-omega/velocity.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'VELOCITY_RECORDED', generations: receipt.generations.length, trend: trend.trend, reason: trend.reason || null, accelerationClaim: 'NOT_ESTABLISHED' }, null, 2));
  return 0;
}

process.exit(main());
