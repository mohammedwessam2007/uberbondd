import {
  AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION,
  employeeRoleIdentityFromTask,
  employeeRoleIdentityErrors
} from './ai-employee-terminal-identity.mjs';

export const AI_EMPLOYEE_RELAY_RESULT_ADMISSION_POLICY_VERSION = 'ai-employee-relay-result-admission-1.0.0';

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: AI_EMPLOYEE_RELAY_RESULT_ADMISSION_POLICY_VERSION,
    identityPolicyVersion: AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION,
    bound: false,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))]
  };
}

function receiptIdentityErrors(receipt, expected = {}) {
  const expectedRef = text(expected.employeeRoleRef, 500);
  const expectedDigest = text(expected.employeeRoleDigest, 100);
  if (!expectedRef && !expectedDigest) return [];
  if (!expectedRef || !expectedDigest) return ['expected-employee-role-binding-incomplete'];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return ['employee-role-terminal-receipt-required'];

  const declaredRef = text(receipt.employeeRoleRef, 500);
  const declaredDigest = text(receipt.employeeRoleDigest, 100);
  const reasons = [];
  if (!declaredRef) reasons.push('terminal-receipt-employee-role-ref-required');
  else if (declaredRef !== expectedRef) reasons.push('terminal-receipt-employee-role-ref-mismatch');
  if (!declaredDigest) reasons.push('terminal-receipt-employee-role-digest-required');
  else if (declaredDigest !== expectedDigest) reasons.push('terminal-receipt-employee-role-digest-mismatch');
  if (receipt.result != null) reasons.push(...employeeRoleIdentityErrors({ result: receipt.result, expected }));
  return [...new Set(reasons)];
}

export function validateEmployeeRoleRelayResultAdmission({ task, result, receipt } = {}) {
  const identity = employeeRoleIdentityFromTask(task);
  if (!identity.ok) return fail(['relay-task-employee-role-identity-invalid', ...(identity.reasonCodes || [])]);
  if (!identity.bound) {
    return {
      ok: true,
      policyVersion: AI_EMPLOYEE_RELAY_RESULT_ADMISSION_POLICY_VERSION,
      identityPolicyVersion: AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION,
      bound: false,
      employeeRoleRef: null,
      employeeRoleDigest: null,
      reasonCodes: []
    };
  }
  const expected = { employeeRoleRef: identity.employeeRoleRef, employeeRoleDigest: identity.employeeRoleDigest };
  const reasons = [
    ...employeeRoleIdentityErrors({ result, expected }),
    ...receiptIdentityErrors(receipt, expected)
  ];
  if (reasons.length) return fail(reasons);
  return {
    ok: true,
    policyVersion: AI_EMPLOYEE_RELAY_RESULT_ADMISSION_POLICY_VERSION,
    identityPolicyVersion: AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION,
    bound: true,
    employeeRoleRef: identity.employeeRoleRef,
    employeeRoleDigest: identity.employeeRoleDigest,
    reasonCodes: []
  };
}
