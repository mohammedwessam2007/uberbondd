import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tickScript = resolve(root, 'scripts/perpetual-frontier-genesis-tick.mjs');

test('GENESIS tick converts a Gamechanger frontier signal into a zero-effect shockwave receipt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uberbond-genesis-tick-'));
  const input = join(dir, 'gamechanger.json');
  const output = join(dir, 'genesis.json');
  writeFileSync(input, JSON.stringify({
    schemaVersion: 'uberbond.gamechanger-mesh.tick.v2',
    generatedAt: '2026-09-03T10:02:00Z',
    frontierSignals: [{
      id: 'frontier-signal-1',
      summary: 'A public model release improves reliable long-horizon tool use.',
      evidenceRefs: ['https://example.com/model-card'],
      claims: ['reliable-long-horizon-tool-use'],
      domains: ['AI_MODELS', 'AGENT_RUNTIME'],
      publishedAt: '2026-09-03T10:00:00Z',
      observedAt: '2026-09-03T10:02:00Z'
    }],
    intelligencePackets: [{
      signalId: 'frontier-signal-1',
      reasonCodes: []
    }]
  }, null, 2));

  const run = spawnSync(process.execPath, [tickScript, '--input', input, '--output', output, '--dry-run'], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const receipt = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(receipt.summary.cycles, 1);
  assert.equal(receipt.summary.successful, 1);
  assert.equal(receipt.summary.invalid, 0);
  assert.equal(receipt.cycles[0].status, 'GENESIS_CYCLE_PLAN_READY');
  assert.equal(receipt.cycles[0].shockwave.status, 'FRONTIER_SHOCKWAVE_PLAN_READY');
  assert.deepEqual(receipt.cycles[0].shockwave.changedPrimitives, ['reliable-long-horizon-tool-use']);
  assert.equal(receipt.cycles[0].latency.metrics.awarenessLagMs, 2 * 60 * 1000);
  assert.equal(receipt.businessEffectAuthority, 'NONE');
  assert.equal(receipt.externalEffectAuthority, 'NONE');
  assert.equal(receipt.externalEffectLedger.messages, 0);
  assert.equal(receipt.externalEffectLedger.providerCalls, 0);
  assert.match(receipt.truthBoundary, /NOT_TECHNOLOGY_MARKET_CUSTOMER_OR_REVENUE_PROOF/);
});
