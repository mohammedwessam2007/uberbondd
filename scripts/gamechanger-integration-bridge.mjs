#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGamechangerIntegrationQueue } from '../src/gamechanger-integration-bridge.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  args.set(arg, process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i] ?? true);
}
const meshPath = resolve(root, String(args.get('--mesh') || 'artifacts/gamechanger-mesh-latest.json'));
const seedPath = resolve(root, String(args.get('--seeds') || 'data/gamechanger-mesh/manual-integration-seeds.json'));
const capabilityPath = resolve(root, String(args.get('--capabilities') || 'artifacts/capability-genome/pilot/normalized-capability-records-2026-09-01.json'));
const statePath = resolve(root, String(args.get('--state') || '.cache/gamechanger-integration-state.json'));
const outputPath = resolve(root, String(args.get('--output') || 'artifacts/gamechanger-integration-queue-latest.json'));

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return fallback; }
}

const meshReceipt = await readJson(meshPath, null);
const seedManifest = await readJson(seedPath, { seeds: [] });
const capabilityManifest = await readJson(capabilityPath, { capabilities: [] });
const priorState = await readJson(statePath, { schemaVersion:'uberbond.gamechanger.integration-state.v1', entries:[] });
const result = buildGamechangerIntegrationQueue({
  meshReceipt,
  manualSeeds:Array.isArray(seedManifest?.seeds) ? seedManifest.seeds : [],
  capabilityRecords:Array.isArray(capabilityManifest?.capabilities) ? capabilityManifest.capabilities : [],
  priorState
});
if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
await mkdir(dirname(outputPath), { recursive:true });
await mkdir(dirname(statePath), { recursive:true });
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
const state = {
  schemaVersion:'uberbond.gamechanger.integration-state.v1',
  updatedAt:result.queue.generatedAt,
  queueDigest:result.queueDigest,
  entries:result.queue.entries,
  promotionAuthority:'NONE',
  executableAuthority:'NONE',
  commercialTruthAuthority:'NONE'
};
await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  status:result.status,
  queueCount:result.queue.queueCount,
  manualSeedCount:result.queue.manualSeedCount,
  liveEscalationCount:result.queue.liveEscalationCount,
  capabilityRecordCount:result.queue.capabilityRecordCount,
  engineeringEligibleCount:result.queue.engineeringEligibleCount,
  output:outputPath,
  state:statePath,
  promotionAuthority:'NONE'
}, null, 2));
