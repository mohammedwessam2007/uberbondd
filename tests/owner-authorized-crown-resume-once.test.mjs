import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Original bounded operation was replaced by the next one-time recovery step.
// Preserve its exact source guard; do not reinstate a retired production hook.
// Source: server.mjs at f6ef8db7dcf22b3acbc074a5c4d6d5be195c8b4f.
const source=fs.readFileSync(new URL('./fixtures/retired-startup-guards/owner-authorized-crown-resume-once.txt',import.meta.url),'utf8');
const currentSource=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'0b50bc70274b60cdc93c68051f824961a02b722af99544688e0bda1a7bda3637');
assert.equal(currentSource.includes('UBERMIND_OWNER_AUTHORIZED_CROWN_RESUME'),false, 'retired operation must not restart on deployment');

test('retired founder-authorized Crown resume hook is exactly bounded and fail closed',()=>{
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
