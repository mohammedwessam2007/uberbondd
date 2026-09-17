#!/usr/bin/env node
// Records an observed health probe into the Ubercel signal file.
//
// Takes a probe result on stdin or from a file -- from waitForUberLitHealth, a
// CI step, or a human with network authority -- and converts it. It makes no
// network call itself, so running it can never manufacture the evidence it
// records.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordHealthObservation } from '../src/ubercel-health-evidence.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIGNALS = process.env.UBERCEL_SIGNALS || 'artifacts/ubercel/deployment-signals.json';

async function readInput(path) {
  if (path) return readFileSync(resolve(root, path), 'utf8');
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  const raw = await readInput(process.argv[2]);
  if (!raw.trim()) {
    console.error('Usage: node scripts/ubercel-record-health.mjs observation.json  (or pipe JSON)');
    process.exitCode = 2;
    return;
  }

  const input = JSON.parse(raw);
  const result = recordHealthObservation(input);
  if (!result.ok) {
    console.error(`${result.status}: ${result.reasonCodes.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const path = resolve(root, SIGNALS);
  const file = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : { schemaVersion: 'uberbond.ubercel-deployment-signals.v1', serviceId: input.serviceId || 'uberbondd', healthContract: null, signals: [] };

  if (input.healthContract) file.healthContract = input.healthContract;
  // Replacing a signal with the same provenance rather than appending, so
  // re-recording one observation does not become two pieces of evidence.
  file.signals = [
    ...(file.signals || []).filter(row => row.sourceRef !== result.signal.sourceRef),
    result.signal
  ];

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`${result.status}`);
  console.log(`  ${result.signal.healthRef} → ${result.signal.status}, observed ${result.signal.observedAt} by ${result.signal.observedBy}`);
  if (!result.signal.contractBound) console.log(`  not contract-bound: ${result.signal.unboundReason}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
export { main };
