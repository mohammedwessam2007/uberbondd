import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function source(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('worker tick binds employee identity before relay submission and durable execution persistence', () => {
  const worker = source('src/agent-worker-job.mjs');
  assert.match(worker, /bindEmployeeRoleSubmissionPayload/);
  assert.match(worker, /submitResult:\s*submitRoleBoundResult/);
  assert.match(worker, /bindEmployeeRoleIdentityToReceipt/);
  assert.match(worker, /persistExecutionRecord:\s*persistRoleBoundExecution/);
  assert.match(worker, /employee-role-terminal-submission-binding-failed/);
});

test('autonomy pump records dispatched role identity and requires it at result truth admission', () => {
  const pump = source('src/agent-autonomy-pump.mjs');
  assert.match(pump, /employeeRoleRef:\s*text\(relayTask\.employeeRoleRef/);
  assert.match(pump, /employeeRoleDigest:\s*text\(relayTask\.employeeRoleDigest/);
  assert.match(pump, /employeeRoleRef:\s*next\.relayRef\.employeeRoleRef/);
  assert.match(pump, /employeeRoleDigest:\s*next\.relayRef\.employeeRoleDigest/);
});

test('worker truth delegates mandatory role identity checks to the canonical helper', () => {
  const truth = source('src/agent-worker-result-truth.mjs');
  assert.match(truth, /employeeRoleIdentityErrors/);
  assert.match(truth, /reasonCodes\.push\(\.\.\.employeeRoleIdentityErrors\(\{ result, expected \}\)\)/);
});
