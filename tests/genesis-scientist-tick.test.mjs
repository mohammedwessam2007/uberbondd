import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('GENESIS evolution receipts reach the economic scientist without external effects', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-genesis-scientist-'));
  const input = path.join(dir, 'evolution.json');
  const output = path.join(dir, 'scientist.json');
  fs.writeFileSync(input, JSON.stringify({
    schemaVersion: 'uberbond.genesis-evolution.tick.v1',
    cycles: [{
      ok: true,
      signalId: 'signal-x',
      source: 'https://example.com/release',
      multiplication: { primitive: 'cheap reliable local agent runtime' },
      portfolio: {
        options: [{ hypothesis: { hypothesisId: 'h1', noveltyDistance: 0.8, mechanismSketch: 'bounded recurring monitoring automation' } }]
      }
    }]
  }, null, 2));
  const run = spawnSync(process.execPath, ['scripts/genesis-scientist-tick.mjs', '--input', input, '--output', output], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(receipt.summary.laboratories, 1);
  assert.equal(receipt.summary.ready, 1);
  assert.ok(receipt.summary.syntheticWorlds > 0);
  assert.ok(receipt.summary.syntheticFutureMemories > 0);
  assert.equal(receipt.laboratories[0].causal.status, 'CAUSAL_ECONOMIC_GENOME_READY');
  assert.equal(receipt.laboratories[0].protocol.status, 'ECONOMIC_SCIENTIST_PROTOCOL_READY');
  assert.equal(receipt.laboratories[0].objectiveGuard.status, 'META_OBJECTIVE_ACCEPTED');
  assert.equal(receipt.businessEffectAuthority, 'NONE');
  assert.match(receipt.truthBoundary, /NOT_CAUSAL_MARKET_CUSTOMER_OR_REVENUE_PROOF/);
});
