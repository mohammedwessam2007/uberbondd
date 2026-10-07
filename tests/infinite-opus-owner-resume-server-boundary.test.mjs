import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const start=source.indexOf("if (req.method === 'POST' && url.pathname === '/api/admin/infinite-opus/crown-resume')");
const end=source.indexOf("if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/references')",start);
const block=source.slice(start,end);

test('Crown owner resume route is authenticated and exact-edge bounded by broker placement',()=>{
  assert.ok(start>source.indexOf('async function brokerInfiniteOpus('));
  assert.match(block,/compileCrownOwnerResumeAuthority\(body\)/);
  assert.match(block,/maximumIncrementalUsd/);
  assert.match(block,/maximumRemainingPaidCalls/);
});

test('Crown resume reconciles vanished generation and verifies exact sealed edge count before paid continuation',()=>{
  const reconcile=block.indexOf('reconcileInterruptedCrownGeneration');
  const recovery=block.indexOf('readCrownRecoveryMetadata');
  const execute=block.indexOf('runCrownAutoFinish');
  assert.ok(reconcile>=0&&recovery>reconcile&&execute>recovery);
  assert.match(block,/missingCandidateAnswers!==1/);
  assert.match(block,/missingEvaluatorCalls!==1/);
});

test('successful Crown receipt is persisted durably after the sealed finisher returns',()=>{
  const execute=block.indexOf('runCrownAutoFinish');
  const persist=block.indexOf('persistDurableCrownAdmission');
  assert.ok(execute>=0&&persist>execute);
  assert.match(block,/sourceAttemptKey:INTERRUPTED_RESUME_KEY/);
  assert.match(block,/businessEffectAuthority:'NONE'/);
  assert.match(block,/sideEffectAuthority:'NONE'/);
});

test('read-only recovery route cannot execute paid Crown continuation',()=>{
  const rs=source.indexOf("if (req.method === 'GET' && url.pathname === '/api/admin/infinite-opus/crown-recovery')");
  const re=source.indexOf("if (req.method === 'POST' && url.pathname === '/api/admin/infinite-opus/crown-resume')",rs);
  const readBlock=source.slice(rs,re);
  assert.match(readBlock,/readCrownRecoveryMetadata/);
  assert.doesNotMatch(readBlock,/runCrownAutoFinish/);
  assert.doesNotMatch(readBlock,/reconcileInterruptedCrownGeneration/);
});
