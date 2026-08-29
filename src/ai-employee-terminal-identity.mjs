export const AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION = 'ai-employee-terminal-identity-1.0.0';

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))]
  };
}

export function employeeRoleIdentityFromTask(task = {}) {
  const employeeRoleRef = text(task?.employeeRoleRef, 500);
  const employeeRoleDigest = text(task?.employeeRoleDigest, 100);
  if (!employeeRoleRef && !employeeRoleDigest) {
    return {
      ok: true,
      policyVersion: AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION,
      bound: false,
      employeeRoleRef: null,
      employeeRoleDigest: null
    };
  }
  if (!employeeRoleRef || !employeeRoleDigest) {
    return fail(['task-employee-role-binding-incomplete']);
  }
  return {
    ok: true,
    policyVersion: AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION,
    bound: true,
    employeeRoleRef,
    employeeRoleDigest
  };
}

export function employeeRoleIdentityErrors({ result, expected = {} } = {}) {
  const expectedRef = text(expected?.employeeRoleRef, 500);
  const expectedDigest = text(expected?.employeeRoleDigest, 100);
  if (!expectedRef && !expectedDigest) return [];
  if (!expectedRef || !expectedDigest) return ['expected-employee-role-binding-incomplete'];
  const declaredRef = text(result?.employeeRoleRef, 500);
  const declaredDigest = text(result?.employeeRoleDigest, 100);
  const reasons = [];
  if (!declaredRef) reasons.push('worker-result-employee-role-ref-required');
  else if (declaredRef !== expectedRef) reasons.push('worker-result-employee-role-ref-mismatch');
  if (!declaredDigest) reasons.push('worker-result-employee-role-digest-required');
  else if (declaredDigest !== expectedDigest) reasons.push('worker-result-employee-role-digest-mismatch');
  return reasons;
}

export function bindEmployeeRoleIdentityToResult({ task, result } = {}) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return fail(['worker-result-object-required-for-role-binding']);
  }
  const identity = employeeRoleIdentityFromTask(task);
  if (!identity.ok) return identity;
  if (!identity.bound) {
    return {
      ok: true,
      policyVersion: AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION,
      bound: false,
      result: structuredClone(result)
    };
  }
  const declaredRef = text(result.employeeRoleRef, 500);
  const declaredDigest = text(result.employeeRoleDigest, 100);
  const reasons = [];
  if (declaredRef && declaredRef !== identity.employeeRoleRef) reasons.push('model-result-employee-role-ref-conflict');
  if (declaredDigest && declaredDigest !== identity.employeeRoleDigest) reasons.push('model-result-employee-role-digest-conflict');
  if (reasons.length) return fail(reasons);
  return {
    ok: true,
    policyVersion: AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION,
    bound: true,
    result: {
      ...structuredClone(result),
      employeeRoleRef: identity.employeeRoleRef,
      employeeRoleDigest: identity.employeeRoleDigest
    }
  };
}

export function bindEmployeeRoleIdentityToReceipt({ task, receipt } = {}) {
  const identity = employeeRoleIdentityFromTask(task);
  if (!identity.ok) return identity;
  if (!identity.bound) {
    return {
      ok: true,
      policyVersion: AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION,
      bound: false,
      receipt: receipt == null ? null : structuredClone(receipt)
    };
  }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return fail(['employee-role-receipt-required']);
  }
  const declaredRef = text(receipt.employeeRoleRef, 500);
  const declaredDigest = text(receipt.employeeRoleDigest, 100);
  const reasons = [];
  if (declaredRef && declaredRef !== identity.employeeRoleRef) reasons.push('receipt-employee-role-ref-conflict');
  if (declaredDigest && declaredDigest !== identity.employeeRoleDigest) reasons.push('receipt-employee-role-digest-conflict');
  if (reasons.length) return fail(reasons);

  const boundResult = receipt.result == null ? null : bindEmployeeRoleIdentityToResult({ task, result: receipt.result });
  if (boundResult && !boundResult.ok) return boundResult;

  return {
    ok: true,
    policyVersion: AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION,
    bound: true,
    receipt: {
      ...structuredClone(receipt),
      employeeRoleRef: identity.employeeRoleRef,
      employeeRoleDigest: identity.employeeRoleDigest,
      ...(boundResult ? { result: boundResult.result } : {})
    }
  };
}

export function bindEmployeeRoleSubmissionPayload({ task, payload = {} } = {}) {
  const resultBinding = bindEmployeeRoleIdentityToResult({ task, result: payload.result });
  if (!resultBinding.ok) return resultBinding;
  const receiptBinding = bindEmployeeRoleIdentityToReceipt({ task, receipt: payload.receipt });
  if (!receiptBinding.ok) return receiptBinding;
  return {
    ok: true,
    policyVersion: AI_EMPLOYEE_TERMINAL_IDENTITY_POLICY_VERSION,
    bound: Boolean(resultBinding.bound || receiptBinding.bound),
    payload: {
      ...structuredClone(payload),
      result: resultBinding.result,
      receipt: receiptBinding.receipt
    }
  };
}
