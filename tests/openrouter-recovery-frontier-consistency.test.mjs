import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const canon=JSON.parse(fs.readFileSync('open router/OPEN_ROUTER_UBERMIND_CANON.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('open router/73_OPENROUTER_RECOVERY_MANIFEST_2026-09-30.json','utf8'));
const tracker=JSON.parse(fs.readFileSync('open router/74_MULTIPLIER_TRACKER_2026-09-30.json','utf8'));

test('recovery surfaces agree on current 33,333x benchmark-capacity without erasing historical cold path',()=>{
  const c=canon.recoveryBackup20260930;
  assert.equal(c.multiplierCheckpoint,33333.345);
  assert.equal(c.executedBenchmarkCapacityMultiplier,33333.345);
  assert.equal(c.productionRealizedEconomicMultiplier,null);
  assert.equal(c.historicalCertifiedResidualModeledMultiplier,14.161946017994001);
  assert.match(c.currentCheckpointClass,/BENCHMARK_CAPACITY/);

  assert.equal(manifest.multiplierCheckpoint.executedBenchmarkCapacity.multiplier,33333.345);
  assert.equal(manifest.multiplierCheckpoint.productionRealizedMultiplier,null);

  assert.equal(tracker.scoreboardLanes.compiledRecurrence.multiplier,33333.345);
  assert.match(String(tracker.scoreboardLanes.compiledRecurrence.status),/E3|BENCHMARK|OPUS_BATCH/);
});

test('no recovery surface may present 14.161946x as the current checkpoint',()=>{
  const c=canon.recoveryBackup20260930;
  assert.notEqual(c.multiplierCheckpoint,14.161946017994001);
  assert.equal(c.historicalCertifiedResidualModeledMultiplier,14.161946017994001);
});
