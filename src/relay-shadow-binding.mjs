import { createHash } from 'node:crypto';
import { ZERO_EFFECTS } from './cloud-agent-relay.mjs';

export const RELAY_SHADOW_BINDING_POLICY_VERSION = 'relay-shadow-binding-1.0.0';
export const RELAY_PROJECT_ID = 'prj_QTPTlb6JpYN8IyBTgyVrlWgq4ePT';
export const RELAY_TEAM_ID = 'team_A9LnjIuS5PU0rNetsHMu1N0r';
export const RELAY_JOB_TYPE = 'prometheus.agent.relay';

const READ_OPERATIONS = Object.freeze(['relayHealthSummary', 'listCloudRelayTasks']);
const FORBIDDEN_OPERATIONS = Object.freeze([
  'createCloudRelayTask',
  'claimCloudRelayTask',
  'heartbeatCloudRelayTask',
  'submitCloudRelayResult',
  'deploy',
  'promote'
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function validZeroLedger(ledger) {
  return ledger && typeof ledger === 'object'
    && Object.entries(ZERO_EFFECTS).every(([key, value]) => Number(ledger[key] ?? NaN) === value);
}

function rejected(reasonCodes) {
  return Object.freeze({
    ok: false,
    policyVersion: RELAY_SHADOW_BINDING_POLICY_VERSION,
    status: 'REJECTED',
    reasonCodes: [...new Set(reasonCodes)],
    executionAuthority: false,
    externalEffectLedger: { ...ZERO_EFFECTS }
  });
}

function validPreviewReceipt(receipt) {
  const reasons = [];
  if (!receipt || typeof receipt !== 'object') return ['preview-receipt-required'];
  const deployment = receipt?.deployment;
  if (receipt.ok !== true || receipt.status !== 'PREVIEW_INTERFACE_PROVEN') reasons.push('preview-interface-not-proven');
  if (receipt.truthClassification !== 'INTERFACE_ONLY') reasons.push('truth-classification-invalid');
  if (deployment?.projectId !== RELAY_PROJECT_ID) reasons.push('project-id-mismatch');
  if (deployment?.teamId !== RELAY_TEAM_ID) reasons.push('team-id-mismatch');
  if (deployment?.state !== 'READY') reasons.push('deployment-ready-required');
  if (deployment?.environment !== 'preview') reasons.push('preview-environment-required');
  if (receipt.productionPromotion !== 'BLOCKED') reasons.push('production-promotion-not-blocked');
  if (receipt.fullDurableRelay !== 'NOT_PROVEN') reasons.push('durable-relay-truth-inflated');
  if (!deployment?.id || !/^dpl_[A-Za-z0-9]+$/.test(deployment.id)) reasons.push('deployment-id-invalid');
  if (!deployment?.url || !/^https:\/\/[a-z0-9-]+\.vercel\.app\/?$/i.test(deployment.url)) reasons.push('preview-url-invalid');
  return reasons;
}

export function compileRelayShadowBindingPlan({ previewReceipt, queueContract = {}, date = new Date() } = {}) {
  const reasons = validPreviewReceipt(previewReceipt);
  if (queueContract.jobType !== RELAY_JOB_TYPE) reasons.push('canonical-job-type-required');
  if (queueContract.durableStore !== true) reasons.push('durable-store-proof-required');
  if (queueContract.readOnly !== true) reasons.push('read-only-contract-required');
  if (queueContract.executionAuthority !== false) reasons.push('execution-authority-must-be-false');
  if (!validZeroLedger(queueContract.externalEffectLedger)) reasons.push('zero-effect-ledger-required');
  if (reasons.length) return rejected(reasons);

  const core = {
    policyVersion: RELAY_SHADOW_BINDING_POLICY_VERSION,
    status: 'SHADOW_BINDING_PLANNED',
    mode: 'SHADOW_READ_ONLY',
    projectId: RELAY_PROJECT_ID,
    teamId: RELAY_TEAM_ID,
    deploymentId: previewReceipt.deployment.id,
    previewUrl: previewReceipt.deployment.url.replace(/\/$/, ''),
    jobType: RELAY_JOB_TYPE,
    allowedOperations: [...READ_OPERATIONS],
    forbiddenOperations: [...FORBIDDEN_OPERATIONS],
    executionAuthority: false,
    workerExecution: 'BLOCKED',
    productionPromotion: 'BLOCKED',
    truthClassification: 'INTERFACE_ONLY',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
  return Object.freeze({
    ok: true,
    ...core,
    planId: `relay-shadow:${digest(core)}`,
    compiledAt: new Date(date).toISOString()
  });
}

export function evaluateRelayShadowObservation({ plan, healthSummary, taskList, date = new Date() } = {}) {
  const reasons = [];
  if (!plan || plan.ok !== true || plan.status !== 'SHADOW_BINDING_PLANNED') reasons.push('valid-shadow-plan-required');
  if (plan?.executionAuthority !== false || plan?.workerExecution !== 'BLOCKED') reasons.push('execution-boundary-invalid');
  if (!validZeroLedger(plan?.externalEffectLedger)) reasons.push('plan-ledger-invalid');
  if (!healthSummary || healthSummary.ok !== true) reasons.push('health-summary-required');
  if (!validZeroLedger(healthSummary?.externalEffectLedger)) reasons.push('health-ledger-invalid');
  if (!healthSummary?.counts || !Number.isInteger(healthSummary?.total) || healthSummary.total < 0) reasons.push('health-shape-invalid');
  if (!taskList || taskList.ok !== true || !Array.isArray(taskList.tasks)) reasons.push('task-list-required');
  if (!validZeroLedger(taskList?.externalEffectLedger)) reasons.push('task-list-ledger-invalid');
  if (Number(taskList?.count) !== taskList?.tasks?.length) reasons.push('task-count-mismatch');
  if (taskList?.tasks?.some(task => task?.type && task.type !== RELAY_JOB_TYPE)) reasons.push('foreign-job-type-observed');
  if (reasons.length) return rejected(reasons);

  const observation = {
    policyVersion: RELAY_SHADOW_BINDING_POLICY_VERSION,
    planId: plan.planId,
    status: 'SHADOW_OBSERVED',
    truthClassification: 'SHADOW_READ_ONLY',
    queue: {
      jobType: RELAY_JOB_TYPE,
      total: healthSummary.total,
      counts: { ...healthSummary.counts },
      staleLeases: Number(healthSummary.staleLeases || 0),
      listedTasks: taskList.tasks.length
    },
    executionAuthority: false,
    workerExecution: 'BLOCKED',
    productionPromotion: 'BLOCKED',
    mutationCount: 0,
    externalEffectLedger: { ...ZERO_EFFECTS },
    observedAt: new Date(date).toISOString()
  };
  return Object.freeze({ ok: true, ...observation, observationId: `relay-shadow-observation:${digest(observation)}` });
}
