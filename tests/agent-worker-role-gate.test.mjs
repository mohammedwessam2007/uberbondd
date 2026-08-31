import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/agent-worker-job.mjs', import.meta.url), 'utf8');

function indexOfRequired(fragment) {
  const index = source.indexOf(fragment);
  assert.notEqual(index, -1, `expected worker source to contain: ${fragment}`);
  return index;
}

test('new worker model execution requires an employee role by default', () => {
  indexOfRequired('requireEmployeeRole = true');
  indexOfRequired("import { validateRoleBoundExecution } from './ai-employee-role-contract.mjs';");
  indexOfRequired("'employee-role-required-before-model-execution'");
  indexOfRequired("'ROLE_BINDING_BLOCKED'");
});

test('role integrity is evaluated after durable claim but before compute/model execution', () => {
  const claim = indexOfRequired('const claim = await claimCloudRelayTask');
  const roleGate = indexOfRequired('const roleEligibility = validateRoleBoundExecution(claim.task)');
  const preExecutionPersistence = indexOfRequired("reason: 'worker-pre-execution'");
  // Anchored on the runtime call itself rather than on one statement that used
  // to wrap it. Failover made the call site a helper invoked from a loop, and an
  // anchor tied to `const result = await runAgentWorkerOnce` would have gone
  // quietly missing -- an ordering guard that stops finding its subject reads as
  // a passing test only because the assertion never runs.
  const runtime = indexOfRequired('runAgentWorkerOnce({');

  assert.ok(claim < roleGate, 'role gate must inspect the claimed immutable task');
  assert.ok(roleGate < preExecutionPersistence, 'role refusal must happen before pre-execution compute persistence');
  assert.ok(roleGate < runtime, 'role refusal must happen before worker runtime/modelExecutor');

  // Every invocation, not merely the first. A failover chain calls the runtime
  // more than once, and a role gate that only precedes the first attempt would
  // leave the retries ungated.
  assert.ok(roleGate < source.lastIndexOf('runAgentWorkerOnce({'),
    'the role gate must precede every runtime invocation, including failover retries');
});

test('legacy generic execution can exist only through explicit opt-out', () => {
  const signatureDefault = indexOfRequired('requireEmployeeRole = true');
  const explicitBranch = indexOfRequired('if (requireEmployeeRole)');
  assert.ok(signatureDefault < explicitBranch);

  // This test intentionally protects the shape rather than blessing a generic
  // call site. Any caller that wants legacy generic execution must now write
  // requireEmployeeRole:false explicitly, making the exception grep-visible.
  assert.equal(source.includes('requireEmployeeRole = false'), false);
});

test('role refusal carries no business-effect authority or provider/model receipt claim', () => {
  const gateStart = indexOfRequired('if (requireEmployeeRole)');
  const gateEnd = indexOfRequired('const before = await persistBudget');
  const gate = source.slice(gateStart, gateEnd);
  assert.match(gate, /validateRoleBoundExecution\(claim\.task\)/);
  assert.match(gate, /ROLE_BINDING_BLOCKED/);
  assert.doesNotMatch(gate, /modelExecutor\s*\(/);
  assert.doesNotMatch(gate, /runAgentWorkerOnce\s*\(/);
});
