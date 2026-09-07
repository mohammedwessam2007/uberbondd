import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../.github/workflows/uberbond-self-maintainer.yml', import.meta.url), 'utf8');

test('self-maintainer is evidence-triggered, not hourly clock-triggered', () => {
  assert.match(workflow, /\non:\n\s+push:\n\s+branches:\n\s+- main\n/);
  assert.doesNotMatch(workflow, /\n\s*schedule:\s*\n/);
  assert.doesNotMatch(workflow, /cron:/);
  assert.match(workflow, /workflow_dispatch:/);
});

test('proposal dispatch is gated by proposal-needed primary states rather than issue existence alone', () => {
  assert.match(workflow, /primary_status/);
  assert.match(workflow, /RELAY_TASK_QUEUED/);
  assert.match(workflow, /RELAY_TASK_ALREADY_QUEUED/);
  assert.match(workflow, /WAITING_FOR_WORKER_RESULT/);
  assert.match(workflow, /Generate and submit canonical proposal only when proposal work is actually pending/);
});

test('blocked initial result is preserved when no second tick is justified', () => {
  assert.match(workflow, /Preserve initial truth whenever no second tick was justified/);
  assert.match(workflow, /if \[ ! -f artifacts\/cognitive\/self-maintainer-latest\.json \]/);
});

test('every workflow pulse emits a non-repeating continuation receipt', () => {
  assert.match(workflow, /Compile non-repeating continuation decision/);
  assert.match(workflow, /self-maintainer-continuation-receipt\.mjs/);
  assert.match(workflow, /self-maintainer-continuation\.json/);
});
