import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/uberbond-autonomy-wake.yml', import.meta.url), 'utf8');

function indexOfRequired(pattern, label) {
  const index = workflow.search(pattern);
  assert.notEqual(index, -1, `missing ${label}`);
  return index;
}

test('verified main promotion immediately wakes the next completion cycle with recovery clock retained', () => {
  assert.match(workflow, /on:\s*\n\s*push:\s*\n\s*branches:\s*\n\s*- main/);
  assert.match(workflow, /schedule:\s*\n\s*- cron: '\*\/15 \* \* \* \*'/);
  assert.match(workflow, /workflow_dispatch:/);
});

test('push handoff follows an in-flight promoting maintainer briefly instead of losing the event', () => {
  assert.match(workflow, /GITHUB_EVENT_NAME:-.*push/);
  assert.match(workflow, /for attempt in \$\(seq 1 12\)/);
  assert.match(workflow, /sleep 5/);
  assert.match(workflow, /actions\/workflows\/uberbond-self-maintainer\.yml\/runs\?per_page=20/);
});

test('founder pause and active-run collapse remain ahead of checkout and dispatch', () => {
  const pause = indexOfRequired(/Honor durable founder pause fence/, 'founder pause');
  const active = indexOfRequired(/Collapse pulse when the trusted self-maintainer is already active/, 'active maintainer collapse');
  const checkout = indexOfRequired(/Checkout exact current main for finite completion truth/, 'exact-current checkout');
  const dispatch = indexOfRequired(/Dispatch trusted self-maintainer onto the exact seeded completion task/, 'self-maintainer dispatch');
  assert.ok(pause < active && active < checkout && checkout < dispatch);
});

test('autocatalytic wake still regenerates truth before seeding one bounded task', () => {
  const terminal = indexOfRequired(/Regenerate exact-current terminal truth before choosing work/, 'terminal truth regeneration');
  const seed = indexOfRequired(/Seed exactly one finite-completion task from freshly regenerated tribunal truth/, 'finite seed');
  const dispatch = indexOfRequired(/Dispatch trusted self-maintainer onto the exact seeded completion task/, 'dispatch');
  assert.ok(terminal < seed && seed < dispatch);
  assert.match(workflow, /node scripts\/terminal-realization\.mjs/);
  assert.match(workflow, /node scripts\/uberbond-finite-completion-seed\.mjs/);
});

test('autocatalysis cannot acquire write credentials in checkout', () => {
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write/);
});
