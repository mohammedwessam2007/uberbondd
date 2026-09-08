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

test('prior continuation memory is restored before the pulse and saved afterward', () => {
  assert.match(workflow, /Restore prior self-maintainer continuation memory/);
  assert.match(workflow, /uberbond-self-maintenance-continuation-/);
  assert.match(workflow, /Enforce prior continuation before same-base reentry/);
  assert.match(workflow, /Save continuation guard for the next pulse/);
});

test('same-base WAIT resume is bound to the exact existing relay issue', () => {
  assert.match(workflow, /resume_issue_number=/);
  assert.match(workflow, /resume_only=/);
  assert.match(workflow, /steps\.preflight\.outputs\.resume_issue_number \|\| inputs\.issueNumber/);
  assert.match(workflow, /Verify resume-only pulse stayed on the exact existing task/);
  assert.match(workflow, /steps\.initial\.outputs\.issue_number != steps\.preflight\.outputs\.resume_issue_number/);
});

test('blocked initial result is preserved when no second tick is justified', () => {
  assert.match(workflow, /Preserve initial truth whenever no second tick was justified/);
  assert.match(workflow, /if \[ ! -f artifacts\/cognitive\/self-maintainer-latest\.json \]/);
});

test('every workflow pulse emits or preserves a non-repeating continuation receipt', () => {
  assert.match(workflow, /Compile or preserve non-repeating continuation decision/);
  assert.match(workflow, /self-maintainer-continuation-receipt\.mjs/);
  assert.match(workflow, /self-maintainer-continuation\.json/);
});
