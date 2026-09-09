import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const control=readFileSync(new URL('../.github/workflows/uberbond-command-center-control.yml',import.meta.url),'utf8');
const wake=readFileSync(new URL('../.github/workflows/uberbond-autonomy-wake.yml',import.meta.url),'utf8');
const script=readFileSync(new URL('../scripts/uberbond-command-center-control.mjs',import.meta.url),'utf8');

test('command control is fenced to issue 604 and repository owner identity',()=>{
  assert.match(control,/issue_comment:/);
  assert.match(control,/github\.event\.issue\.number == 604/);
  assert.match(control,/github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(control,/github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(control,/permissions:\n  actions: write\n  contents: read\n  issues: write/);
});

test('control can only actuate wake and pause fence, not deploy/payment/customer rails',()=>{
  assert.match(control,/uberbond-autonomy-wake\.yml\/dispatches/);
  assert.match(control,/uberbond-autonomy-paused/);
  assert.doesNotMatch(control,/deployments\/|payments\/|paypal|stripe|customer-contact|credential.*write|dns.*write/i);
});

test('scheduled wake fails closed on unreadable pause state and honors pause on every consequential step',()=>{
  assert.match(wake,/Command Center pause state is unavailable; failing closed/);
  assert.match(wake,/echo 'paused=true'/);
  const guarded=(wake.match(/if: steps\.control\.outputs\.paused != 'true'/g)||[]).length;
  assert.ok(guarded>=6,`expected >=6 pause guards, got ${guarded}`);
  assert.match(wake,/Founder pause fence is active/);
});

test('control script uses pure policy and existing autonomy status compiler',()=>{
  assert.match(script,/compileAutonomyCommand/);
  assert.match(script,/buildAutonomyCommandCenterStatus/);
  assert.match(script,/dispatch_wake/);
  assert.match(script,/apply_pause/);
  assert.match(script,/remove_pause/);
});
