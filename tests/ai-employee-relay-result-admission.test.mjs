import test from 'node:test';
import assert from 'node:assert/strict';

import { validateEmployeeRoleRelayResultAdmission } from '../src/ai-employee-relay-result-admission.mjs';

const ROLE_REF = 'engineering/capability-gap-analyst@1';
const ROLE_DIGEST = 'a'.repeat(64);
const roleTask = (overrides = {}) => ({ employeeRoleRef: ROLE_REF, employeeRoleDigest: ROLE_DIGEST, ...overrides });
const roleResult = (overrides = {}) => ({ employeeRoleRef: ROLE_REF, employeeRoleDigest: ROLE_DIGEST, ...overrides });
const roleReceipt = (overrides = {}) => ({ employeeRoleRef: ROLE_REF, employeeRoleDigest: ROLE_DIGEST, ...overrides });

test('generic role-free relay submissions remain backward compatible', () => {
  const verdict = validateEmployeeRoleRelayResultAdmission({ task: { taskId: 'generic-1' }, result: {}, receipt: null });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.bound, false);
});

test('incomplete task role identity fails closed', () => {
  const verdict = validateEmployeeRoleRelayResultAdmission({ task: { employeeRoleRef: ROLE_REF }, result: roleResult(), receipt: roleReceipt() });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasonCodes.includes('relay-task-employee-role-identity-invalid'));
});

test('role-bound relay submission requires exact result identity', () => {
  const missing = validateEmployeeRoleRelayResultAdmission({ task: roleTask(), result: {}, receipt: roleReceipt() });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('worker-result-employee-role-ref-required'));
  const substituted = validateEmployeeRoleRelayResultAdmission({ task: roleTask(), result: roleResult({ employeeRoleRef: 'engineering/other@1' }), receipt: roleReceipt() });
  assert.equal(substituted.ok, false);
  assert.ok(substituted.reasonCodes.includes('worker-result-employee-role-ref-mismatch'));
});

test('role-bound relay submission requires terminal receipt identity', () => {
  const absent = validateEmployeeRoleRelayResultAdmission({ task: roleTask(), result: roleResult(), receipt: null });
  assert.equal(absent.ok, false);
  assert.ok(absent.reasonCodes.includes('employee-role-terminal-receipt-required'));
  const mismatched = validateEmployeeRoleRelayResultAdmission({ task: roleTask(), result: roleResult(), receipt: roleReceipt({ employeeRoleDigest: 'b'.repeat(64) }) });
  assert.equal(mismatched.ok, false);
  assert.ok(mismatched.reasonCodes.includes('terminal-receipt-employee-role-digest-mismatch'));
});

test('nested receipt result cannot substitute employee identity', () => {
  const verdict = validateEmployeeRoleRelayResultAdmission({ task: roleTask(), result: roleResult(), receipt: roleReceipt({ result: roleResult({ employeeRoleDigest: 'c'.repeat(64) }) }) });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasonCodes.includes('worker-result-employee-role-digest-mismatch'));
});

test('exact role-bound result and receipt identity is admitted', () => {
  const verdict = validateEmployeeRoleRelayResultAdmission({ task: roleTask(), result: roleResult(), receipt: roleReceipt({ result: roleResult() }) });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.bound, true);
  assert.equal(verdict.employeeRoleRef, ROLE_REF);
  assert.equal(verdict.employeeRoleDigest, ROLE_DIGEST);
});
