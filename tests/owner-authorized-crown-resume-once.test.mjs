import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

test('founder-authorized Crown resume hook is exactly bounded and fail closed',()=>{
  const start=source.indexOf("UBERMIND_OWNER_AUTHORIZED_CROWN_RESUME");
  assert.ok(start>0);
  const window=source.slice(Math.max(0,start-5000),start+1800);
  assert.match(window,/CROWN_OWNER_RESUME_CONFIRMATION/);
  assert.match(window,/maximumIncrementalUsd:0\.30/);
  assert.match(window,/ttlMs:15\*60\*1000/);
  assert.match(window,/missingCandidateAnswers!==1/);
  assert.match(window,/missingEvaluatorCalls!==1/);
  assert.match(window,/runCrownAutoFinish/);
  assert.match(window,/persistDurableCrownAdmission/);
  assert.match(window,/sourceAttemptKey:INTERRUPTED_RESUME_KEY/);
  assert.match(window,/hiddenPayloadsExposed:false/);
  assert.doesNotMatch(window,/console\.log\([^\n]*(prompt|answer|rubric)/i);
});
