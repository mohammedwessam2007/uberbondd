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

function roleIdentity({ roleId, version, department, allowedCapabilities, authorityCeiling, consequenceClassCeiling, evidencePrerequisites, economicMetric, stopConditions, escalationTarget, outputSchema }) {
  return {
    policyVersion: AI_EMPLOYEE_ROLE_POLICY_VERSION,
    roleId: text(roleId, 120),
    version: text(version, 40),
    department: text(department, 120),
    allowedCapabilities: strings(allowedCapabilities),
    authorityCeiling: text(authorityCeiling, 240),
    consequenceClassCeiling: text(consequenceClassCeiling, 80).toUpperCase(),
    evidencePrerequisites: strings(evidencePrerequisites),
    economicMetric: text(economicMetric, 500),
    stopConditions: strings(stopConditions),
    escalationTarget: text(escalationTarget, 240),
    outputSchema: text(outputSchema, 500)
  };
}

function parseRoleRef(value) {
  const match = /^uberbond-role:([^/]+)\/([^@]+)@(.+)$/.exec(text(value, 500));
  return match ? { department: match[1], roleId: match[2], version: match[3] } : null;
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
  const identity = roleIdentity({
    roleId, version, department, allowedCapabilities, authorityCeiling,
    consequenceClassCeiling, evidencePrerequisites, economicMetric,
    stopConditions, escalationTarget, outputSchema
  });
  const reasons = [];

  if (!identity.roleId) reasons.push('employee-role-id-required');
  else if (!ROLE_IDS.has(identity.roleId)) reasons.push('unknown-employee-role');
  if (!identity.version) reasons.push('employee-role-version-required');
  if (!identity.department) reasons.push('employee-role-department-required');
  if (!identity.allowedCapabilities.length) reasons.push('employee-role-capabilities-required');
  if (!identity.authorityCeiling) reasons.push('employee-role-authority-ceiling-required');
  if (!(identity.consequenceClassCeiling in CONSEQUENCE_RANK)) reasons.push('employee-role-consequence-ceiling-invalid');
  if (!identity.evidencePrerequisites.length) reasons.push('employee-role-evidence-prerequisites-required');
  if (!identity.economicMetric) reasons.push('employee-role-economic-metric-required');
  if (!identity.stopConditions.length) reasons.push('employee-role-stop-conditions-required');
  if (!identity.escalationTarget) reasons.push('employee-role-escalation-target-required');
  if (!identity.outputSchema) reasons.push('employee-role-output-schema-required');
  if (reasons.length) return fail(reasons);

  return {
    ok: true,
    status: 'ROLE_VALIDATED',
    ...identity,
    roleRef: `uberbond-role:${identity.department}/${identity.roleId}@${identity.version}`,
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
  const parsed = parseRoleRef(task?.employeeRoleRef);
  if (!parsed) reasons.push('employee-role-ref-required-for-execution');
  if (!/^[a-f0-9]{64}$/.test(String(task?.employeeRoleDigest || ''))) reasons.push('employee-role-digest-required-for-execution');
  if (!Array.isArray(task?.employeeRoleAllowedCapabilities) || !task.employeeRoleAllowedCapabilities.length) reasons.push('employee-role-capabilities-required-for-execution');
  if (!text(task?.employeeRoleAuthorityCeiling, 240)) reasons.push('employee-role-authority-required-for-execution');

  if (parsed) {
    if (!ROLE_IDS.has(parsed.roleId)) reasons.push('unknown-employee-role');
    const identity = roleIdentity({
      roleId: parsed.roleId,
      version: parsed.version,
      department: parsed.department,
      allowedCapabilities: task?.employeeRoleAllowedCapabilities,
      authorityCeiling: task?.employeeRoleAuthorityCeiling,
      consequenceClassCeiling: task?.employeeRoleConsequenceCeiling,
      evidencePrerequisites: task?.employeeRoleEvidencePrerequisites,
      economicMetric: task?.employeeRoleEconomicMetric,
      stopConditions: task?.employeeRoleStopConditions,
      escalationTarget: task?.employeeRoleEscalationTarget,
      outputSchema: task?.employeeRoleOutputSchema
    });
    if (digest(identity) !== String(task?.employeeRoleDigest || '')) reasons.push('employee-role-digest-integrity-mismatch');
  }

  return reasons.length ? fail(reasons) : {
    ok: true,
    policyVersion: AI_EMPLOYEE_ROLE_POLICY_VERSION,
    status: 'ROLE_BOUND_EXECUTION_ELIGIBLE',
    employeeRoleRef: task.employeeRoleRef,
    employeeRoleDigest: task.employeeRoleDigest
  };
}
