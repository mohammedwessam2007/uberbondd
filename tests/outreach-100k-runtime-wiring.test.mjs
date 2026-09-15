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
  assert.match(server,/recoveryPolicy:\s*'reconcile'/);
  assert.match(server,/maxAttempts:\s*1/);
});

test('resident worker registers certified processor and fences retries behind reconciliation',()=>{
  assert.match(worker,/handlers\['outreach\.100k\.process'\]/);
  assert.match(worker,/buildLiveOutreach100kSummary/);
  assert.match(worker,/runOutreach100kBatch/);
  assert.match(worker,/founderCertificateId/);
  assert.match(worker,/certificateId:\s*''/);
  assert.match(worker,/exact recipient-set digest/);
  assert.match(worker,/recoveryPolicy:\s*'reconcile'/);
  assert.match(worker,/maxAttempts:\s*1/);
});

test('runtime re-certifies each batch, binds corpus digest, and quarantines uncertain outcomes',()=>{
  assert.match(runtime,/prepareOutreach100kRuntime/);
  assert.match(runtime,/recipient-set-changed-since-founder-press/);
  assert.match(runtime,/DISPATCH_OUTCOME_UNCERTAIN/);
  assert.match(runtime,/automaticRetryAuthorized:\s*false/);
  assert.match(runtime,/dispatchGovernedOutreach/);
});
