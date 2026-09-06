#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankGenesisIdeasForCurrentGaps, compileGenesisReactivationEvents } from '../src/uberbond-genesis-reactivation.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function read(relative, required = false) {
  try { return JSON.parse(await readFile(resolve(root, relative), 'utf8')); }
  catch {
    if (required) throw new Error(`required GENESIS reactivation input missing: ${relative}`);
    return null;
  }
}

try {
  const [featureAtlas, featureGenome, metacognitiveSynthesis] = await Promise.all([
    read('artifacts/uberbond-feature-atom-atlas-latest.json', true),
    read('artifacts/uberbond-feature-genome-latest.json', true),
    read('artifacts/uberbond-metacognitive-synthesis-latest.json', true)
  ]);
  const ranking = rankGenesisIdeasForCurrentGaps({ featureAtlas, featureGenome, metacognitiveSynthesis, limit: 20 });
  if (!ranking.ok) {
    process.stderr.write(`${JSON.stringify(ranking, null, 2)}\n`);
    process.exit(2);
  }
  const outputRelative = process.argv[2] || 'artifacts/uberbond-genesis-reactivation-latest.json';
  const output = resolve(root, outputRelative);
  const eventBundle = compileGenesisReactivationEvents(ranking, { ref: `artifact:${outputRelative}` });
  if (!eventBundle.ok) {
    process.stderr.write(`${JSON.stringify(eventBundle, null, 2)}\n`);
    process.exit(2);
  }
  const receipt = {
    schemaVersion: 'uberbond.genesis-reactivation.v1',
    generatedAt: new Date().toISOString(),
    ...ranking,
    events: eventBundle.events,
    eventCount: eventBundle.eventCount,
    executionAuthority: 'NONE',
    promotionAuthority: 'NONE'
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    ok: true,
    status: ranking.status,
    candidates: ranking.candidateCount,
    cognitiveEvents: eventBundle.eventCount,
    top: ranking.candidates.slice(0, 5).map(item => ({ ordinal: item.ordinal, name: item.name, score: item.score, maturity: item.maturity, implementationStatus: item.implementationStatus })),
    output,
    businessEffectAuthority: 'NONE'
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, status: 'GENESIS_REACTIVATION_OPERATOR_FAILED', reason: error?.message || 'unknown-error', businessEffectAuthority: 'NONE' }, null, 2)}\n`);
  process.exit(2);
}
