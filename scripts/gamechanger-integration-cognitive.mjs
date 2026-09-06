#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { augmentCognitiveReceiptWithGamechangerIntegration } from '../src/gamechanger-integration-cognitive.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  args.set(arg, process.argv[i + 1]?.startsWith('--') ? true : process.argv[++i] ?? true);
}
const receiptPath = resolve(root, String(args.get('--receipt') || 'artifacts/uberbond-cognitive-cycle-latest.json'));
const queuePath = resolve(root, String(args.get('--queue') || 'artifacts/gamechanger-integration-queue-latest.json'));
async function readJson(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } }
const [receipt, integrationQueue] = await Promise.all([readJson(receiptPath), readJson(queuePath)]);
const result = augmentCognitiveReceiptWithGamechangerIntegration({ receipt, integrationQueue, integrationRef:`artifact:${queuePath}` });
if (!result.ok) {
  process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(2);
}
await writeFile(receiptPath, `${JSON.stringify(result.receipt, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok:true,
  status:result.status,
  eventId:result.eventId,
  activationCount:result.activationCount || 0,
  targetNodeIds:result.targetNodeIds || [],
  queueCount:result.receipt?.gamechangerIntegration?.queueCount || 0,
  engineeringEligibleCount:result.receipt?.gamechangerIntegration?.engineeringEligibleCount || 0,
  output:receiptPath,
  businessEffectAuthority:'NONE'
}, null, 2)}\n`);
