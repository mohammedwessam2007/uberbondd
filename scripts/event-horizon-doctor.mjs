import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeEventHorizon } from '../src/event-horizon.mjs';

export const EVENT_HORIZON_ARTIFACT_PATH = 'artifacts/event-horizon/economic-genome-2026-08-31.json';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  const record = JSON.parse(fs.readFileSync(path.join(root, EVENT_HORIZON_ARTIFACT_PATH), 'utf8'));
  const summary = summarizeEventHorizon(record);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.ok) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, health: 'EVENT_HORIZON_DOCTOR_FAILED', reason: error?.message || 'unknown-error' }, null, 2)}\n`);
  process.exitCode = 1;
}
