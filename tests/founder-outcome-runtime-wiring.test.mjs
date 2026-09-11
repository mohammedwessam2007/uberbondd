import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker=readFileSync(new URL('../worker.mjs',import.meta.url),'utf8');
const scheduler=readFileSync(new URL('../src/scheduler.mjs',import.meta.url),'utf8');

test('dedicated worker owns founder outcome runtime handler',()=>{
  assert.match(worker,/createFounderOutcomeRuntimeHandlers/);
  assert.match(worker,/\.\.\.createFounderOutcomeRuntimeHandlers\(\{ store, queue, cfg: config \}\)/);
});

test('mission supervision heartbeat is worker-only and independent of generic autopilot',()=>{
  assert.match(scheduler,/cfg\.processRole === 'worker'/);
  assert.match(scheduler,/founder\.outcome\.supervise/);
  assert.ok(scheduler.indexOf("cfg.processRole === 'worker'")<scheduler.indexOf('if (cfg.autopilot)'));
});
