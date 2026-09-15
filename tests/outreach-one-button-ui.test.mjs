import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../public/outreach-one-button.js', import.meta.url), 'utf8');

test('admin exposes one guarded outreach start button', () => {
  assert.match(html, /id="start-outreach"/);
  assert.match(html, /outreach-one-button\.js/);
  assert.match(js, /\/api\/summary/);
  assert.match(js, /\/api\/campaigns/);
  assert.match(js, /\/api\/worker\/resume/);
  assert.match(js, /\/api\/outbound\/resume/);
  assert.match(js, /\/api\/run/);
});

test('one-button start fails closed on runtime and campaign blockers', () => {
  assert.match(js, /outbound\.enabled !== true/);
  assert.match(js, /outbound\.dryRun === true/);
  assert.match(js, /outbound\.uncertain/);
  assert.match(js, /campaign\?\.approved === true && campaign\?\.autoSend === true/);
});

test('owner bearer is page-memory only and never persisted', () => {
  assert.match(js, /tokenField\?\.value/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(js, /console\.(?:log|info|debug|warn)\([^)]*token/i);
});

test('the one-button layer does not bypass #875 governed send gates', () => {
  assert.doesNotMatch(js, /gmail\.users\.messages\.send|smtp|transportAdapter|dispatchGovernedOutreach|pressUberLaunchButton/);
  assert.match(js, /#875 safety gates remain binding/);
  assert.match(js, /limit:\s*250/);
});
