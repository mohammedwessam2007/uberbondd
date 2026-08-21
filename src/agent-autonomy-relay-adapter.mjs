// Adapter from the autonomous-mesh TaskIntent to UberBond's canonical AgentTask.
// It does not send, poll, invoke a model, or grant external authority.

import { compileAgentTask } from './agent-relay.mjs';
import { AUTONOMY_FORBIDDEN_ACTIONS } from './agent-autonomy-loop.mjs';

export const AGENT_AUTONOMY_RELAY_ADAPTER_POLICY_VERSION = 'agent-autonomy-relay-adapter-1.1.0';

const REQUIRED_RESULT_FIELDS = Object.freeze([
  'outcome',
  'changedArtifacts',
  'testsActuallyRun',
  'truthTable',
  'externalEffectLedger',
  'decision',
  'coordination'
]);

function failure(reasonCodes) {
  return {
    ok: false,
    policyVersion: AGENT_AUTONOMY_RELAY_ADAPTER_POLICY_VERSION,
    status: 'REJECTED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))]
  };
}

export function compileRelayTaskFromIntent(intent, session, date = new Date()) {
  if (!intent?.ok || !intent.taskId || !intent.sessionId) return failure(['valid-task-intent-required']);
  if (!session?.ok || session.sessionId !== intent.sessionId) return failure(['matching-autonomy-session-required']);
  const tests = Array.isArray(intent.acceptanceTests) ? intent.acceptanceTests.filter(Boolean) : [];
  if (!tests.length) return failure(['acceptance-tests-required']);

  const task = compileAgentTask({
    taskId: intent.taskId,
    objective: intent.objective,
    originAgent: intent.originAgent,
    targetAgent: intent.targetAgent,
    parentTask: intent.parentTaskId || session.sessionId,
    contextRefs: [
      `session:${session.sessionId}`,
      ...intent.contextRefs
    ],
    evidenceRefs: intent.evidenceRefs,
    constraints: [
      ...intent.constraints,
      `autonomy-session:${session.sessionId}`,
      `autonomy-kind:${intent.kind}`
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
    autonomyPolicyVersion: intent.policyVersion,
    autonomyAdapterPolicyVersion: AGENT_AUTONOMY_RELAY_ADAPTER_POLICY_VERSION
  };
}
