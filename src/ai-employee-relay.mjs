import crypto from 'node:crypto';
import { compileAgentTask, RELAY_EXTERNAL_EFFECTS } from './agent-relay.mjs';
import { evaluateWorkerResultTruth } from './agent-worker-result-truth.mjs';
import { bindRoleToTask, validateRoleBoundExecution } from './ai-employee-role-contract.mjs';

export const AI_EMPLOYEE_RELAY_POLICY_VERSION = 'ai-employee-relay-1.0.0';

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AI_EMPLOYEE_RELAY_POLICY_VERSION,
    status: 'ESCALATE_OWNER',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...RELAY_EXTERNAL_EFFECTS },
    ...extra
  };
}

export function compileEmployeeAgentTask({ roleContract, allowedCapabilities = [], ...taskInput } = {}) {
  const base = compileAgentTask({ ...taskInput, taskId: undefined });
  if (!base.ok) return fail(base.reasonCodes || ['base-relay-task-invalid']);

  const bound = bindRoleToTask({
    roleContract,
    taskAllowedCapabilities: allowedCapabilities,
    taskConsequenceClass: base.consequenceClass
  });
  if (!bound.ok) return fail(bound.reasonCodes || ['employee-role-binding-failed']);

  const taskId = `employee_task_${digest({
    relayTaskId: base.taskId,
    employeeRoleRef: bound.employeeRoleRef,
    employeeRoleDigest: bound.employeeRoleDigest,
    allowedCapabilities: [...allowedCapabilities].sort()
  }).slice(0, 24)}`;

  const task = {
    ...base,
    policyVersion: AI_EMPLOYEE_RELAY_POLICY_VERSION,
    taskId,
    relayPolicyVersion: base.policyVersion,
    employeeRoleRef: bound.employeeRoleRef,
    employeeRoleDigest: bound.employeeRoleDigest,
    employeeRoleAuthorityCeiling: bound.employeeRoleAuthorityCeiling,
    employeeRoleConsequenceCeiling: bound.employeeRoleConsequenceCeiling,
    employeeRoleAllowedCapabilities: [...bound.employeeRoleAllowedCapabilities],
    employeeRoleEvidencePrerequisites: [...bound.employeeRoleEvidencePrerequisites],
    employeeRoleEconomicMetric: bound.employeeRoleEconomicMetric,
    employeeRoleStopConditions: [...bound.employeeRoleStopConditions],
    employeeRoleEscalationTarget: bound.employeeRoleEscalationTarget,
    employeeRoleOutputSchema: bound.employeeRoleOutputSchema,
    parentAllowedCapabilities: [...allowedCapabilities],
    roleBindingStatus: 'TASK_BOUND'
  };

  const executionEligibility = validateRoleBoundExecution(task);
  if (!executionEligibility.ok) return fail(executionEligibility.reasonCodes || ['employee-role-execution-ineligible']);
  return task;
}

export function evaluateEmployeeWorkerResultTruth({ result, task, expected = {} } = {}) {
  const eligibility = validateRoleBoundExecution(task);
  if (!eligibility.ok) return {
    ok: false,
    terminal: false,
    policyVersion: AI_EMPLOYEE_RELAY_POLICY_VERSION,
    reasonCodes: eligibility.reasonCodes
  };

  const base = evaluateWorkerResultTruth({
    result,
    expected: { ...expected, taskId: expected.taskId || task.taskId }
  });
  const reasons = [...base.reasonCodes];
  const resultRoleRef = text(result?.employeeRoleRef, 300);
  const resultRoleDigest = text(result?.employeeRoleDigest, 100);
  if (!resultRoleRef) reasons.push('worker-result-employee-role-ref-required');
  else if (resultRoleRef !== task.employeeRoleRef) reasons.push('worker-result-employee-role-ref-mismatch');
  if (!resultRoleDigest) reasons.push('worker-result-employee-role-digest-required');
  else if (resultRoleDigest !== task.employeeRoleDigest) reasons.push('worker-result-employee-role-digest-mismatch');

  return {
    ok: reasons.length === 0,
    terminal: base.terminal,
    policyVersion: AI_EMPLOYEE_RELAY_POLICY_VERSION,
    reasonCodes: [...new Set(reasons)]
  };
}

export function compileEmployeeTerminalReceipt({ task, result, expected = {}, date = new Date() } = {}) {
  const truth = evaluateEmployeeWorkerResultTruth({ result, task, expected });
  if (!truth.ok || !truth.terminal) return fail([
    ...truth.reasonCodes,
    ...(!truth.terminal ? ['terminal-employee-result-required'] : [])
  ]);
  return {
    ok: true,
    policyVersion: AI_EMPLOYEE_RELAY_POLICY_VERSION,
    status: 'TERMINAL_JUDGED',
    taskId: task.taskId,
    employeeRoleRef: task.employeeRoleRef,
    employeeRoleDigest: task.employeeRoleDigest,
    decision: text(result?.decision, 80).toUpperCase(),
    evidenceRefs: Array.isArray(result?.evidenceRefs) ? [...result.evidenceRefs] : [],
    judgedAt: date instanceof Date ? date.toISOString() : new Date(date).toISOString(),
    externalEffectLedger: { ...RELAY_EXTERNAL_EFFECTS }
  };
}
