import crypto from 'node:crypto';

export const AI_EMPLOYEE_ROLE_POLICY_VERSION = 'ai-employee-role-1.0.0';

const CONSEQUENCE_RANK = Object.freeze({
  LOCAL_PREPARATION: 0,
  OWNER_REVIEW: 1,
  OWNER_AUTHORIZED_EXTERNAL: 2
});

const ROLE_IDS = new Set([
  'world-signal-scout','buyer-icp-analyst','mechanism-miner','pricing-economic-analyst','evidence-critic',
  'partner-scout','qualification-worker','campaign-architect','personalization-copy-worker','revenue-operations-steward',
  'offer-scope-compiler','browser-operator','evidence-assembler','qa-evaluator','renewal-expansion-worker',
  'cost-accountant','experiment-allocator','capability-gap-analyst','deployment-verifier'
]);

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function strings(values, max = 40) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 240)).filter(Boolean))].slice(0, max);
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: AI_EMPLOYEE_ROLE_POLICY_VERSION,
    status: 'ROLE_DENIED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))]
  };
}

export function compileEmployeeRoleContract({
  roleId,
  version = '1.0.0',
  department,
  allowedCapabilities = [],
  authorityCeiling,
  consequenceClassCeiling = 'LOCAL_PREPARATION',
  evidencePrerequisites = [],
  economicMetric,
  stopConditions = [],
  escalationTarget,
  outputSchema
} = {}) {
  const id = text(roleId, 120);
  const normalizedVersion = text(version, 40);
  const normalizedDepartment = text(department, 120);
  const normalizedConsequence = text(consequenceClassCeiling, 80).toUpperCase();
  const capabilities = strings(allowedCapabilities);
  const evidence = strings(evidencePrerequisites);
  const stops = strings(stopConditions);
  const reasons = [];

  if (!id) reasons.push('employee-role-id-required');
  else if (!ROLE_IDS.has(id)) reasons.push('unknown-employee-role');
  if (!normalizedVersion) reasons.push('employee-role-version-required');
  if (!normalizedDepartment) reasons.push('employee-role-department-required');
  if (!capabilities.length) reasons.push('employee-role-capabilities-required');
  if (!text(authorityCeiling, 240)) reasons.push('employee-role-authority-ceiling-required');
  if (!(normalizedConsequence in CONSEQUENCE_RANK)) reasons.push('employee-role-consequence-ceiling-invalid');
  if (!evidence.length) reasons.push('employee-role-evidence-prerequisites-required');
  if (!text(economicMetric, 500)) reasons.push('employee-role-economic-metric-required');
  if (!stops.length) reasons.push('employee-role-stop-conditions-required');
  if (!text(escalationTarget, 240)) reasons.push('employee-role-escalation-target-required');
  if (!text(outputSchema, 500)) reasons.push('employee-role-output-schema-required');
  if (reasons.length) return fail(reasons);

  const identity = {
    policyVersion: AI_EMPLOYEE_ROLE_POLICY_VERSION,
    roleId: id,
    version: normalizedVersion,
    department: normalizedDepartment,
    allowedCapabilities: capabilities,
    authorityCeiling: text(authorityCeiling, 240),
    consequenceClassCeiling: normalizedConsequence,
    evidencePrerequisites: evidence,
    economicMetric: text(economicMetric, 500),
    stopConditions: stops,
    escalationTarget: text(escalationTarget, 240),
    outputSchema: text(outputSchema, 500)
  };

  return {
    ok: true,
    status: 'ROLE_VALIDATED',
    ...identity,
    roleRef: `uberbond-role:${normalizedDepartment}/${id}@${normalizedVersion}`,
    roleDigest: digest(identity)
  };
}

export function bindRoleToTask({ roleContract, taskAllowedCapabilities = [], taskConsequenceClass = 'LOCAL_PREPARATION' } = {}) {
  if (!roleContract?.ok || !roleContract.roleRef || !roleContract.roleDigest) return fail(['validated-employee-role-required']);
  const parentCapabilities = new Set(strings(taskAllowedCapabilities));
  const requestedConsequence = text(taskConsequenceClass, 80).toUpperCase();
  const reasons = [];
  if (!(requestedConsequence in CONSEQUENCE_RANK)) reasons.push('task-consequence-class-invalid');
  for (const capability of roleContract.allowedCapabilities || []) {
    if (!parentCapabilities.has(capability)) reasons.push('employee-role-capability-expands-parent-task');
  }
  if (requestedConsequence in CONSEQUENCE_RANK
    && CONSEQUENCE_RANK[roleContract.consequenceClassCeiling] > CONSEQUENCE_RANK[requestedConsequence]) {
    reasons.push('employee-role-consequence-expands-parent-task');
  }
  if (reasons.length) return fail(reasons);
  return {
    ok: true,
    policyVersion: AI_EMPLOYEE_ROLE_POLICY_VERSION,
    status: 'TASK_BOUND',
    employeeRoleRef: roleContract.roleRef,
    employeeRoleDigest: roleContract.roleDigest,
    employeeRoleAuthorityCeiling: roleContract.authorityCeiling,
    employeeRoleConsequenceCeiling: roleContract.consequenceClassCeiling,
    employeeRoleAllowedCapabilities: [...roleContract.allowedCapabilities],
    employeeRoleEvidencePrerequisites: [...roleContract.evidencePrerequisites],
    employeeRoleEconomicMetric: roleContract.economicMetric,
    employeeRoleStopConditions: [...roleContract.stopConditions],
    employeeRoleEscalationTarget: roleContract.escalationTarget,
    employeeRoleOutputSchema: roleContract.outputSchema
  };
}

export function validateRoleBoundExecution(task) {
  const reasons = [];
  if (!task?.employeeRoleRef) reasons.push('employee-role-ref-required-for-execution');
  if (!/^[a-f0-9]{64}$/.test(String(task?.employeeRoleDigest || ''))) reasons.push('employee-role-digest-required-for-execution');
  if (!Array.isArray(task?.employeeRoleAllowedCapabilities) || !task.employeeRoleAllowedCapabilities.length) reasons.push('employee-role-capabilities-required-for-execution');
  if (!text(task?.employeeRoleAuthorityCeiling, 240)) reasons.push('employee-role-authority-required-for-execution');
  return reasons.length ? fail(reasons) : {
    ok: true,
    policyVersion: AI_EMPLOYEE_ROLE_POLICY_VERSION,
    status: 'ROLE_BOUND_EXECUTION_ELIGIBLE',
    employeeRoleRef: task.employeeRoleRef,
    employeeRoleDigest: task.employeeRoleDigest
  };
}
