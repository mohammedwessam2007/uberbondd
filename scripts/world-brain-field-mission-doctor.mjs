import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeWorldBrainFieldMission } from '../src/world-brain-field-mission.mjs';

export const WORLD_BRAIN_FIELD_MISSION_ROOT = 'artifacts/world-brain-field-mission-2026-09-01';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, WORLD_BRAIN_FIELD_MISSION_ROOT, file), 'utf8'));

try {
  const summary = summarizeWorldBrainFieldMission(read('mission-summary.json'), {
    partners: read('first-cash-partner-candidates.json'),
    corpus: read('capability-genome-candidates.json')
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.ok) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, health: 'WORLD_BRAIN_FIELD_MISSION_DOCTOR_FAILED', reason: error?.message || 'unknown-error' }, null, 2)}\n`);
  process.exitCode = 1;
}
