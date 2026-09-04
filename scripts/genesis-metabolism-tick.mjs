#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGenesisMetabolism } from '../src/genesis-metabolism.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  args.set(arg, process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i] ?? true);
}
const relativeOrAbsolute = (value, fallback) => resolve(root, String(value || fallback));
const paths = {
  gamechanger: relativeOrAbsolute(args.get('--gamechanger'), 'artifacts/gamechanger-mesh-latest.json'),
  evolution: relativeOrAbsolute(args.get('--evolution'), 'artifacts/genesis-evolution-latest.json'),
  scientist: relativeOrAbsolute(args.get('--scientist'), 'artifacts/genesis-scientist-latest.json'),
  ontology: relativeOrAbsolute(args.get('--ontology'), 'artifacts/genesis-ontology-latest.json'),
  output: relativeOrAbsolute(args.get('--output'), 'artifacts/genesis-metabolism-latest.json')
};

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return {}; }
}

const [gamechanger, evolution, scientist, ontology] = await Promise.all([
  readJson(paths.gamechanger),
  readJson(paths.evolution),
  readJson(paths.scientist),
  readJson(paths.ontology)
]);

const metabolism = buildGenesisMetabolism({ gamechanger, evolution, scientist, ontology });
const receipt = {
  schemaVersion: 'uberbond.genesis-metabolism.tick.v1',
  generatedAt: new Date().toISOString(),
  inputs: {
    gamechanger: paths.gamechanger,
    evolution: paths.evolution,
    scientist: paths.scientist,
    ontology: paths.ontology
  },
  ...metabolism
};
await mkdir(dirname(paths.output), { recursive: true });
await writeFile(paths.output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: 'GENESIS_METABOLISM_TICK_COMPLETE',
  inputCounts: receipt.inputCounts,
  organStatuses: Object.fromEntries(Object.entries(receipt.organs || {}).map(([key, value]) => [key, value?.status || null])),
  output: paths.output,
  businessEffectAuthority: receipt.businessEffectAuthority
}, null, 2));
