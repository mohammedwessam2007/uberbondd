import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../worker.mjs',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/outreach-100k-runtime-control.mjs',import.meta.url),'utf8');

test('server exposes only certified 100K start seam',()=>{
  assert.match(server,/\/api\/outreach\/100k\/status/);
  assert.match(server,/\/api\/outreach\/100k\/start/);
  assert.match(server,/CERTIFIED_100K_READY/);
  assert.match(server,/confirmExactTarget/);
  assert.match(server,/outreach\.100k\.process/);
});

test('resident worker registers certified processor',()=>{
  assert.match(worker,/handlers\['outreach\.100k\.process'\]/);
  assert.match(worker,/buildLiveOutreach100kSummary/);
  assert.match(worker,/runOutreach100kBatch/);
});

test('runtime re-certifies each batch and quarantines uncertain outcomes',()=>{
  assert.match(runtime,/prepareOutreach100kRuntime/);
  assert.match(runtime,/launch-certificate-changed-since-founder-press/);
  assert.match(runtime,/recipient-set-changed-since-founder-press/);
  assert.match(runtime,/DISPATCH_OUTCOME_UNCERTAIN/);
  assert.match(runtime,/automaticRetryAuthorized:\s*false/);
  assert.match(runtime,/dispatchGovernedOutreach/);
});
