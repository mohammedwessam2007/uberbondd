// Adapter from the autonomous-mesh TaskIntent to UberBond's canonical role-bound AgentTask.
// It does not send, poll, invoke a model, or grant external authority.

import { AUTONOMY_FORBIDDEN_ACTIONS } from './agent-autonomy-loop.mjs';
import { compileEmployeeRoleContract } from './ai-employee-role-contract.mjs';
import { compileEmployeeAgentTask } from './ai-employee-relay.mjs';

export const AGENT_AUTONOMY_RELAY_ADAPTER_POLICY_VERSION = 'agent-autonomy-relay-adapter-1.2.0';

const REQUIRED_RESULT_FIELDS = Object.freeze([
  'outcome',
  'changedArtifacts',
  'testsActuallyRun',
  'truthTable',
  'externalEffectLedger',
  'decision',
  'coordination'
]);

const ROLE_PROFILES = Object.freeze({
  RESEARCH_REQUIRED: Object.freeze({
    roleId: 'evidence-critic',
    department: 'intelligence',
    allowedCapabilities: Object.freeze(['repository-read', 'public-evidence-research', 'evidence-critique', 'preparation-artifact-write'])
  }),
  REVIEW_REQUIRED: Object.freeze({
    roleId: 'qa-evaluator',
    department: 'delivery',
    allowedCapabilities: Object.freeze(['repository-read', 'artifact-review', 'test-evidence-review', 'preparation-artifact-write'])
  }),
  ENGINEERING_REQUIRED: Object.freeze({
    roleId: 'capability-gap-analyst',
    department: 'engineering',
    allowedCapabilities: Object.freeze(['repository-read', 'code-preparation', 'test-preparation', 'implementation-review'])
  }),
  REPAIR_REQUIRED: Object.freeze({
    roleId: 'capability-gap-analyst',
    department: 'engineering',
    allowedCapabilities: Object.freeze(['repository-read', 'code-preparation', 'test-preparation', 'implementation-review'])
  })
});

function failure(reasonCodes) {
  return {
    ok: false,
    policyVersion: AGENT_AUTONOMY_RELAY_ADAPTER_POLICY_VERSION,
    status: 'REJECTED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))]
  };
}

function profileForIntent(intent) {
  const kind = String(intent?.kind || '').trim().toUpperCase();
  if (ROLE_PROFILES[kind]) return ROLE_PROFILES[kind];
  const target = String(intent?.targetAgent || '').trim().toLowerCase();
  if (target === 'claude-code') return ROLE_PROFILES.ENGINEERING_REQUIRED;
  if (target === 'chatgpt') return ROLE_PROFILES.RESEARCH_REQUIRED;
  return null;
}

export function compileAutonomyEmployeeRole(intent) {
  const profile = profileForIntent(intent);
  if (!profile) return failure(['deterministic-employee-role-unavailable']);
  return compileEmployeeRoleContract({
    roleId: profile.roleId,
    version: '1.0.0',
    department: profile.department,
    allowedCapabilities: [...profile.allowedCapabilities],
    authorityCeiling: 'local preparation only; no business external effects; no authority expansion',
    consequenceClassCeiling: 'LOCAL_PREPARATION',
    evidencePrerequisites: ['task-context', 'canonical-evidence-refs-when-claimed'],
    economicMetric: 'verified bounded task completion per compute cost and founder minute saved',
    stopConditions: [
      'task-complete',
      'evidence-insufficient',
      'external-consequence-required',
      'authority-boundary-reached',
      'budget-exhausted'
    ],
    escalationTarget: 'chatgpt-integrator',
    outputSchema: 'outcome, changedArtifacts, testsActuallyRun, truthTable, externalEffectLedger, decision, coordination'
  });
}

export function compileRelayTaskFromIntent(intent, session, date = new Date()) {
  if (!intent?.ok || !intent.taskId || !intent.sessionId) return failure(['valid-task-intent-required']);
  if (!session?.ok || session.sessionId !== intent.sessionId) return failure(['matching-autonomy-session-required']);
  const tests = Array.isArray(intent.acceptanceTests) ? intent.acceptanceTests.filter(Boolean) : [];
  if (!tests.length) return failure(['acceptance-tests-required']);

  const roleContract = compileAutonomyEmployeeRole(intent);
  if (!roleContract?.ok) return failure(roleContract?.reasonCodes || ['employee-role-compilation-failed']);
  const allowedCapabilities = [...roleContract.allowedCapabilities];

  const task = compileEmployeeAgentTask({
    roleContract,
    allowedCapabilities,
    objective: intent.objective,
    originAgent: intent.originAgent,
    targetAgent: intent.targetAgent,
    parentTask: intent.parentTaskId || session.sessionId,
    contextRefs: [
      `session:${session.sessionId}`,
      `autonomy-intent:${intent.taskId}`,
      ...intent.contextRefs
    ],
    evidenceRefs: intent.evidenceRefs,
    constraints: [
      ...intent.constraints,
      `autonomy-session:${session.sessionId}`,
      `autonomy-kind:${intent.kind}`,
      `employee-role:${roleContract.roleRef}`
    ],
    forbiddenActions: [...new Set([
      ...AUTONOMY_FORBIDDEN_ACTIONS,
      ...(Array.isArray(intent.forbiddenActions) ? intent.forbiddenActions : [])
    ])],
    requiredOutputs: [...new Set([...REQUIRED_RESULT_FIELDS, ...(intent.requiredOutputs || [])])],
    acceptanceTests: tests,
    budget: { maxTokens: intent.tokenBudget, maxCostCents: 0 },
    economicObjective: session.economicObjective,
    consequenceClass: 'LOCAL_PREPARATION',
    date
  });
  if (!task.ok) return task;
  return {
    ...task,
    autonomyIntentTaskId: intent.taskId,
    autonomyPolicyVersion: intent.policyVersion,
    autonomyAdapterPolicyVersion: AGENT_AUTONOMY_RELAY_ADAPTER_POLICY_VERSION,
    autonomyRoleSelection: 'DETERMINISTIC_BY_INTENT_KIND_AND_TARGET'
  };
}
