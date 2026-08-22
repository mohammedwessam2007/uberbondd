import crypto from 'node:crypto';
import { normalizeCoordination } from './agent-autonomy-loop.mjs';
import { AGENT_MODEL_ROUTER_POLICY_VERSION } from './agent-model-router.mjs';
import { ZERO_BUSINESS_EFFECTS, ZERO_EXTERNAL_EFFECTS } from './effect-ledger.mjs';

export const AGENT_PROVIDER_WORKER_POLICY_VERSION = 'agent-provider-worker-1.0.0';



const SECRET_KEY = /^(authorization|api[-_]?key|secret|password|credential|access[-_]?token|refresh[-_]?token|private[-_]?key)$/i;
const SECRET_VALUE = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\bsk-[A-Za-z0-9_-]{12,}|\bgh[pousr]_[A-Za-z0-9_]{12,})/;
const MAX_TEXT = 8000;
const MAX_OUTPUTS = 64;
const MAX_TOOLS = 32;

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function int(value, min, max, fallback = null) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

function fail(reasonCodes, status = 'REJECTED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_PROVIDER_WORKER_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    ...extra
  };
}

function hasSecret(value, seen = new Set()) {
  if (value == null) return false;
  if (typeof value === 'string') return SECRET_VALUE.test(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some(item => hasSecret(item, seen));
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) return true;
    if (hasSecret(child, seen)) return true;
  }
  return false;
}

function allZero(value, template) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(template).every(([key, zero]) => Number(value[key] || 0) === zero);
}

function typedRefs(values) {
  if (!Array.isArray(values)) return { ok: true, refs: [] };
  const refs = [...new Set(values.map(value => text(value, 500)).filter(Boolean))].slice(0, 100);
  const valid = refs.filter(value => /^(evidence|audit|test|doc|outcome|signal|task|proposal|mission|receipt):/i.test(value));
  return { ok: refs.length === valid.length, refs: valid };
}

function normalizeRoute(route) {
  if (!route || route.ok !== true || route.policyVersion !== AGENT_MODEL_ROUTER_POLICY_VERSION || route.status !== 'ROUTED') return null;
  const selected = route.selected;
  const provider = text(selected?.provider, 80).toLowerCase();
  const model = text(selected?.model, 160);
  if (!provider || !model) return null;
  return { provider, model, candidateId: text(selected.candidateId, 120) || null };
}

function validateTask(task) {
  const reasons = [];
  if (!task || typeof task !== 'object' || task.ok !== true) reasons.push('valid-relay-task-required');
  if (!text(task?.taskId, 160)) reasons.push('task-id-required');
  if (!text(task?.targetAgent, 80)) reasons.push('target-agent-required');
  if (!text(task?.objective, MAX_TEXT)) reasons.push('objective-required');
  if (String(task?.consequenceClass || '').toUpperCase() !== 'LOCAL_PREPARATION') reasons.push('local-preparation-only');
  if (!Array.isArray(task?.acceptanceTests) || !task.acceptanceTests.length) reasons.push('acceptance-tests-required');
  if (hasSecret(task)) reasons.push('secret-bearing-task-rejected');
  return reasons;
}

function validateReservation(reservation, taskId, provider) {
  const reasons = [];
  if (!reservation || typeof reservation !== 'object' || reservation.status !== 'RESERVED') reasons.push('active-compute-reservation-required');
  if (text(reservation?.taskId, 160) !== taskId) reasons.push('compute-reservation-task-mismatch');
  if (text(reservation?.provider, 80).toLowerCase() !== provider) reasons.push('compute-reservation-provider-mismatch');
  if (int(reservation?.costCeilingCents, 0, 10_000_000) == null) reasons.push('compute-cost-ceiling-invalid');
  if (int(reservation?.tokenCeiling, 1, 100_000_000) == null) reasons.push('compute-token-ceiling-invalid');
  return reasons;
}

export function compileProviderWorkRequest({ relayTask, modelRoute, computeReservation, toolAllowlist = [] } = {}) {
  const reasons = validateTask(relayTask);
  const route = normalizeRoute(modelRoute);
  if (!route) reasons.push('valid-model-route-required');
  const taskId = text(relayTask?.taskId, 160);
  if (route) reasons.push(...validateReservation(computeReservation, taskId, route.provider));
  const tools = [...new Set((Array.isArray(toolAllowlist) ? toolAllowlist : []).map(value => text(value, 80)).filter(Boolean))].slice(0, MAX_TOOLS);
  if (reasons.length) return fail(reasons, 'BLOCKED');

  const requestCore = {
    taskId,
    targetAgent: text(relayTask.targetAgent, 80),
    objective: text(relayTask.objective, MAX_TEXT),
    contextRefs: Array.isArray(relayTask.contextRefs) ? relayTask.contextRefs.slice(0, 100) : [],
    evidenceRefs: Array.isArray(relayTask.evidenceRefs) ? relayTask.evidenceRefs.slice(0, 100) : [],
    requiredOutputs: Array.isArray(relayTask.requiredOutputs) ? relayTask.requiredOutputs.slice(0, MAX_OUTPUTS) : [],
    acceptanceTests: relayTask.acceptanceTests.slice(0, MAX_OUTPUTS),
    constraints: Array.isArray(relayTask.constraints) ? relayTask.constraints.slice(0, MAX_OUTPUTS) : [],
    provider: route.provider,
    model: route.model,
    toolAllowlist: tools,
    compute: {
      reservationId: text(computeReservation.reservationId, 160),
      costCeilingCents: computeReservation.costCeilingCents,
      tokenCeiling: computeReservation.tokenCeiling
    },
    consequenceClass: 'LOCAL_PREPARATION'
  };

  return {
    ok: true,
    policyVersion: AGENT_PROVIDER_WORKER_POLICY_VERSION,
    status: 'READY_FOR_PROVIDER',
    requestId: `provider_req_${hash(requestCore).slice(0, 24)}`,
    ...requestCore,
    businessEffectAuthority: 'NONE'
  };
}

export function validateProviderWorkResult({ request, result } = {}) {
  const reasons = [];
  if (!request?.ok || request.policyVersion !== AGENT_PROVIDER_WORKER_POLICY_VERSION) reasons.push('valid-provider-request-required');
  if (!result || typeof result !== 'object' || Array.isArray(result)) reasons.push('provider-result-object-required');
  if (text(result?.taskId, 160) !== text(request?.taskId, 160)) reasons.push('provider-result-task-mismatch');
  if (text(result?.provider, 80).toLowerCase() !== text(request?.provider, 80).toLowerCase()) reasons.push('provider-result-provider-mismatch');
  if (text(result?.model, 160) !== text(request?.model, 160)) reasons.push('provider-result-model-mismatch');
  if (hasSecret(result)) reasons.push('secret-bearing-provider-result-rejected');
  if (!allZero(result?.businessEffectLedger || ZERO_BUSINESS_EFFECTS, ZERO_BUSINESS_EFFECTS)) reasons.push('nonzero-business-effect-rejected');
  if (!allZero(result?.externalEffectLedger || ZERO_EXTERNAL_EFFECTS, ZERO_EXTERNAL_EFFECTS)) reasons.push('nonzero-external-effect-rejected');

  const inputTokens = int(result?.usage?.inputTokens, 0, request?.compute?.tokenCeiling ?? 0);
  const outputTokens = int(result?.usage?.outputTokens, 0, request?.compute?.tokenCeiling ?? 0);
  const totalTokens = inputTokens == null || outputTokens == null ? null : inputTokens + outputTokens;
  const costCents = int(result?.usage?.costCents, 0, request?.compute?.costCeilingCents ?? 0);
  if (inputTokens == null || outputTokens == null || totalTokens == null || totalTokens > request.compute.tokenCeiling) reasons.push('provider-token-usage-exceeds-reservation');
  if (costCents == null) reasons.push('provider-cost-exceeds-reservation');

  const evidence = typedRefs(result?.evidenceRefs || result?.coordination?.evidenceRefs || []);
  if (!evidence.ok) reasons.push('provider-evidence-reference-invalid');
  const coordination = normalizeCoordination(result || {});
  if (!coordination.ok) reasons.push(...(coordination.reasonCodes || ['provider-coordination-invalid']));
  const outcome = text(result?.outcome, MAX_TEXT);
  if (!outcome) reasons.push('provider-outcome-required');
  if (reasons.length) return fail(reasons, 'BLOCKED');

  return {
    ok: true,
    policyVersion: AGENT_PROVIDER_WORKER_POLICY_VERSION,
    status: 'VALIDATED',
    taskId: request.taskId,
    provider: request.provider,
    model: request.model,
    outcome,
    coordination,
    evidenceRefs: evidence.refs,
    changedArtifacts: Array.isArray(result.changedArtifacts) ? result.changedArtifacts.slice(0, MAX_OUTPUTS) : [],
    testsActuallyRun: Array.isArray(result.testsActuallyRun) ? result.testsActuallyRun.slice(0, MAX_OUTPUTS) : [],
    aiComputeLedger: {
      providerCalls: 1,
      reservationId: request.compute.reservationId,
      inputTokens,
      outputTokens,
      totalTokens,
      costCents
    },
    businessEffectLedger: { ...ZERO_BUSINESS_EFFECTS },
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export async function runProviderWorker({ request, invoke } = {}) {
  if (!request?.ok || request.policyVersion !== AGENT_PROVIDER_WORKER_POLICY_VERSION) return fail(['valid-provider-request-required']);
  if (typeof invoke !== 'function') return fail(['provider-invoke-function-required']);
  const raw = await invoke(structuredClone(request));
  return validateProviderWorkResult({ request, result: raw });
}
