import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../public/outreach-one-button.js', import.meta.url), 'utf8');

test('admin exposes one guarded outreach start button', () => {
  assert.match(html, /id="start-outreach"/);
  assert.match(html, /outreach-one-button\.js/);
  assert.match(js, /START UBERBOND NOW/);
  assert.match(js, /\/api\/outreach\/100k\/status/);
  assert.match(js, /\/api\/outreach\/100k\/start/);
  assert.match(js, /confirmExactTarget:\s*100000/);
});

test('one-button starts internal mission when 100K is not green and preserves certified send gate', () => {
  assert.match(js, /CERTIFIED_100K_READY/);
  assert.match(js, /hardStopReasonCodes/);
  assert.match(js, /waitReasonCodes/);
  assert.match(js, /shortfall/);
  assert.match(js, /\/api\/admin\/uber-socket\/outreach-100k-council/);
  assert.match(js, /\/api\/admin\/uber-socket\/cognitive-cycle/);
  assert.match(js, /START UBERBOND NOW/);
  assert.match(js, /100K READY · PRESS TO LAUNCH/);
});

test('owner bearer is page-memory only and never persisted', () => {
  assert.match(js, /tokenField\?\.value/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(js, /console\.(?:log|info|debug|warn)\([^)]*token/i);
});

test('founder button cannot fall back to the legacy A/B Gmail wake path', () => {
  assert.doesNotMatch(js, /\/api\/worker\/resume|\/api\/outbound\/resume|\/api\/run['"]/);
  assert.doesNotMatch(js, /gmail\.users\.messages\.send|transportAdapter|dispatchGovernedOutreach|pressUberLaunchButton/);
  assert.match(js, /every batch re-certifies/);
});
