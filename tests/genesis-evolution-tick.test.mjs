import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Gamechanger frontier signals reach the GENESIS evolution engine and produce a 275-item truth ledger', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-genesis-evolution-'));
  const input = path.join(dir, 'gamechanger.json');
  const output = path.join(dir, 'evolution.json');
  const ledger = path.join(dir, 'ledger.json');
  const tasks = path.join(dir, 'tasks.json');
  const assumptions = path.join(dir, 'assumptions.json');
  fs.writeFileSync(input, JSON.stringify({
    schemaVersion: 'uberbond.gamechanger-mesh.tick.v2',
    generatedAt: '2026-09-03T18:00:00Z',
    frontierSignals: [{
      id: 'gamechanger:test',
      source: 'https://example.com/release',
      observedAt: '2026-09-03T18:00:00Z',
      summary: 'A new reliable local agent runtime reduces inference cost and supports durable tool use.',
      claims: ['reliable-long-horizon-tool-use', 'cheap-local-inference'],
      domains: ['AGENT_RUNTIME', 'AI_MODELS'],
      scores: { novelty: 90, enablingPower: 95, costCurveShift: 95 }
    }]
  }, null, 2));
  fs.writeFileSync(tasks, JSON.stringify({ tasks: [{ id: 'durable-agent', objective: 'run durable agents', blockers: ['reliability'], unlockConditions: ['reliable-long-horizon-tool-use'] }] }, null, 2));
  fs.writeFileSync(assumptions, JSON.stringify({ assumptions: ['frontier cognition requires hosted models'] }, null, 2));

  const run = spawnSync(process.execPath, [
    'scripts/genesis-evolution-tick.mjs',
    '--input', input,
    '--output', output,
    '--ledger-output', ledger,
    '--tasks', tasks,
    '--assumptions', assumptions
  ], { cwd: root, encoding: 'utf8' });

  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
  const implementation = JSON.parse(fs.readFileSync(ledger, 'utf8'));
  assert.equal(receipt.summary.cycles, 1);
  assert.equal(receipt.summary.successful, 1);
  assert.equal(receipt.summary.impossibleTasksReopenedForReview, 1);
  assert.ok(receipt.summary.generatedHypotheses > 0);
  assert.ok(receipt.summary.antiUberBondChallenges > 0);
  assert.equal(receipt.businessEffectAuthority, 'NONE');
  assert.equal(implementation.ideaCount, 275);
  assert.equal(implementation.entries.length, 275);
  assert.equal(implementation.entries.find(item => item.id === 2).status, 'SOURCE_AND_TEST_PRESENT');
  assert.equal(implementation.entries.find(item => item.id === 275).status, 'SOURCE_AND_TEST_PRESENT');
  assert.equal(implementation.implementedOrPartialCount, 275);
  assert.equal(implementation.canonOnlyCount, 0);
  assert.match(implementation.warning, /does not prove/);
});