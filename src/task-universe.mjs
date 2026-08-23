// Bounded Task Universe Engine primitives.
//
// This module defines the shared contract for just-in-time work generation.
// It does not create a second task database, call providers, enqueue work, or
// authorize consequential actions. A caller may persist the returned receipt
// through the existing auditLog and may map an approved local task onto the
// existing DurableQueue in a later, explicit integration.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const TASK_UNIVERSE_POLICY_VERSION = 'task-universe-1.0.0';

export const TASK_STATES = Object.freeze([
  'READY', 'REVIEW_REQUIRED', 'BLOCKED', 'LEASED', 'RUNNING', 'SUCCEEDED',
  'FAILED', 'CANCELLED', 'QUARANTINED', 'EXPIRED'
]);

export const TRIGGER_TYPES = Object.freeze([
  'SCHEDULE', 'EVENT', 'THRESHOLD', 'STATE_TRANSITION', 'EVIDENCE_EXPIRY',
  'REPLY', 'PAYMENT', 'FAILURE', 'BENCHMARK_CHANGE', 'OWNER_INSTRUCTION'
]);

export const POLICY_DECISIONS = Object.freeze([
  'ALLOW_LOCAL_PREPARATION', 'REVIEW_REQUIRED', 'DENY'
]);

export const DEPENDENCY_EDGE_TYPES = Object.freeze([
  'PREREQUISITE', 'BLOCKS', 'SUPERSEDES', 'INVALIDATES', 'RETRIES',
  'COMPENSATES', 'UNLOCKS'
]);

const MAX_RETRY_ATTEMPTS = 20;
const MAX_REFS = 100;
const MAX_CONDITIONS = 50;
const MAX_INSTANCES = 500;

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function validDate(value, fallback) {
  const candidate = new Date(value || fallback);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function text(value) {
  return String(value ?? '').trim();
}

function boundedStrings(values, max = MAX_REFS) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))].slice(0, max);
}

function boundedConditions(values) {
  return (Array.isArray(values) ? values : []).slice(0, MAX_CONDITIONS).map(condition => {
    if (typeof condition === 'string') return condition.trim().slice(0, 300);
    if (!condition || typeof condition !== 'object') return null;
    return {
      type: text(condition.type) || 'UNSPECIFIED',
      field: text(condition.field) || null,
      operator: text(condition.operator) || null,
      expected: condition.expected == null ? null : condition.expected
    };
  }).filter(Boolean);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonnegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function failure(reasonCodes, timestamp, extra = {}) {
  return {
    ok: false,
    policyVersion: TASK_UNIVERSE_POLICY_VERSION,
    status: 'DENIED',
    timestamp,
    reasonCodes: unique(reasonCodes),
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...extra
  };
}

function normalizeCostCeiling(value) {
  if (!value || typeof value !== 'object') {
    return { amountCents: null, currency: null, status: 'UNKNOWN' };
  }
  const amountCents = nonnegativeInteger(value.amountCents);
  const currency = text(value.currency).toUpperCase() || null;
  if (value.amountCents != null && amountCents == null) {
    return { amountCents: null, currency, status: 'INVALID' };
  }
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    return { amountCents, currency: null, status: 'INVALID' };
  }
  return { amountCents, currency, status: amountCents == null ? 'UNKNOWN' : 'OWNER_PROVIDED_NOT_AUTHORIZED' };
}

function normalizeRetryStrategy(value) {
  const input = value && typeof value === 'object' ? value : {};
  const maxAttempts = nonnegativeInteger(input.maxAttempts);
  const backoffMs = nonnegativeInteger(input.backoffMs);
  const maxBackoffMs = nonnegativeInteger(input.maxBackoffMs);
  return {
    maxAttempts: maxAttempts == null ? 1 : Math.min(MAX_RETRY_ATTEMPTS, Math.max(1, maxAttempts)),
    backoffMs: backoffMs == null ? 0 : backoffMs,
    maxBackoffMs: maxBackoffMs == null ? null : Math.max(backoffMs || 0, maxBackoffMs),
    retryableErrors: boundedStrings(input.retryableErrors, 50),
    nonRetryableErrors: boundedStrings(input.nonRetryableErrors, 50)
  };
}

function normalizeOwnerBurden(value) {
  const input = value && typeof value === 'object' ? value : {};
  const minutes = finite(input.minutes);
  return {
    minutes: minutes == null || minutes < 0 ? null : minutes,
    reason: text(input.reason) || null,
    authorization: 'OWNER_REQUIRED_IF_NONZERO'
  };
}

function normalizePolicy(value) {
  const input = value && typeof value === 'object' ? value : {};
  const consequenceClass = text(input.consequenceClass).toUpperCase() || 'LOCAL_PREPARATION';
  const externalEffects = boundedStrings(input.externalEffects, 20);
  return {
    consequenceClass,
    externalEffects,
    requiresOwner: input.requiresOwner === true,
    policyVersion: text(input.policyVersion) || TASK_UNIVERSE_POLICY_VERSION,
    purpose: text(input.purpose) || null
  };
}

// A TaskBlueprint is immutable metadata. Unknown economics remain null; no
// field is filled with a plausible default merely to make a task rankable.
export function compileTaskBlueprint(input = {}) {
  const at = referenceDate(input.date);
  const timestamp = at.toISOString();
  if (!input || typeof input !== 'object') return failure(['blueprint-object-required'], timestamp);
  const id = text(input.id);
  const purpose = text(input.purpose);
  if (!id) return failure(['blueprint-id-required'], timestamp);
  if (!purpose) return failure(['blueprint-purpose-required'], timestamp);
  const costCeiling = normalizeCostCeiling(input.costCeiling);
  const policy = normalizePolicy(input.policy);
  const invalid = [];
  if (costCeiling.status === 'INVALID') invalid.push('invalid-cost-ceiling');
  if (!['LOCAL_PREPARATION', 'OWNER_AUTHORIZED_EXTERNAL'].includes(policy.consequenceClass)) invalid.push('unknown-consequence-class');
  if (id.length > 160) invalid.push('blueprint-id-too-long');
  if (invalid.length) return failure(invalid, timestamp);

  const version = text(input.version) || '1.0.0';
  const blueprint = {
    ok: true,
    policyVersion: TASK_UNIVERSE_POLICY_VERSION,
    status: 'COMPILED',
    blueprintId: id,
    version,
    purpose: purpose.slice(0, 1000),
    inputs: boundedStrings(input.inputs, 100),
    outputs: boundedStrings(input.outputs, 100),
    eligibility: {
      requiredFields: boundedStrings(input.eligibility?.requiredFields, 100),
      requiredEvidenceRefs: boundedStrings(input.eligibility?.requiredEvidenceRefs, 100),
      allowSyntheticFixtures: input.eligibility?.allowSyntheticFixtures === true
    },
    policy,
    evaluator: {
      type: text(input.evaluator?.type).toUpperCase() || 'DETERMINISTIC',
      requiredOutputs: boundedStrings(input.evaluator?.requiredOutputs || input.outputs, 100),
      successConditions: boundedConditions(input.evaluator?.successConditions),
      killConditions: boundedConditions(input.evaluator?.killConditions)
    },
    retryStrategy: normalizeRetryStrategy(input.retryStrategy),
    ownerBurden: normalizeOwnerBurden(input.ownerBurden),
    costCeiling,
    expiration: (() => {
      const expiresAt = input.expiration?.expiresAt ? validDate(input.expiration.expiresAt, timestamp) : null;
      return {
        maxAgeMs: nonnegativeInteger(input.expiration?.maxAgeMs),
        expiresAt: input.expiration?.expiresAt && !expiresAt ? null : expiresAt?.toISOString() || null
      };
    })(),
    successConditions: boundedConditions(input.successConditions),
    killConditions: boundedConditions(input.killConditions),
    createdAt: timestamp,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  return blueprint;
}

export function compileTrigger(input = {}) {
  const at = referenceDate(input.date);
  const timestamp = at.toISOString();
  if (!input || typeof input !== 'object') return failure(['trigger-object-required'], timestamp);
  const triggerId = text(input.triggerId || input.id);
  const type = text(input.type).toUpperCase();
  if (!triggerId) return failure(['trigger-id-required'], timestamp);
  if (!TRIGGER_TYPES.includes(type)) return failure([`unknown-trigger-type:${type}`], timestamp);
  const observedAt = validDate(input.observedAt, timestamp);
  if (!observedAt) return failure(['invalid-trigger-time'], timestamp);
  return {
    ok: true,
    policyVersion: TASK_UNIVERSE_POLICY_VERSION,
    triggerId,
    type,
    observedAt: observedAt.toISOString(),
    sourceRef: text(input.sourceRef) || null,
    eventRef: text(input.eventRef) || null,
    payloadDigest: input.payload == null ? null : digest(input.payload),
    synthetic: input.synthetic === true,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function evaluateTaskPolicy({ blueprint, trigger, entity = {}, date = new Date() } = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const reasonCodes = [];
  if (!blueprint?.ok || blueprint.status !== 'COMPILED') reasonCodes.push('compiled-blueprint-required');
  if (!trigger?.ok) reasonCodes.push('compiled-trigger-required');
  if (entity?.policyEligible === false) reasonCodes.push('entity-policy-ineligible');
  if (trigger?.synthetic && blueprint?.eligibility?.allowSyntheticFixtures !== true) reasonCodes.push('synthetic-trigger-not-eligible');
  const policy = blueprint?.policy || {};
  if (policy.consequenceClass !== 'LOCAL_PREPARATION') reasonCodes.push('consequence-class-requires-owner-authority');
  if (Array.isArray(policy.externalEffects) && policy.externalEffects.length) reasonCodes.push('external-effects-disabled');
  if (policy.requiresOwner) reasonCodes.push('owner-review-required');
  let decision = 'ALLOW_LOCAL_PREPARATION';
  if (reasonCodes.includes('external-effects-disabled') || reasonCodes.includes('consequence-class-requires-owner-authority')) decision = 'DENY';
  else if (reasonCodes.length) decision = 'REVIEW_REQUIRED';
  return {
    ok: true,
    policyVersion: TASK_UNIVERSE_POLICY_VERSION,
    decision,
    reasonCodes: unique(reasonCodes),
    authority: decision === 'ALLOW_LOCAL_PREPARATION' ? 'SYSTEM_LOCAL_POLICY' : 'OWNER_REQUIRED',
    evaluatedAt: timestamp,
    evidenceUsed: boundedStrings([
      blueprint?.blueprintId,
      blueprint?.version,
      trigger?.triggerId,
      trigger?.sourceRef,
      ...(Array.isArray(entity?.evidenceRefs) ? entity.evidenceRefs : [])
    ], 50),
    policyVersionSource: policy.policyVersion || TASK_UNIVERSE_POLICY_VERSION,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function computeTaskPriority(metrics = {}) {
  const required = ['expectedGrossProfit', 'probability', 'urgency', 'strategicMultiplier', 'cost', 'riskPenalty', 'ownerBurden'];
  const missing = required.filter(key => finite(metrics[key]) == null);
  const normalized = {
    expectedGrossProfit: finite(metrics.expectedGrossProfit),
    probability: finite(metrics.probability),
    urgency: finite(metrics.urgency),
    strategicMultiplier: finite(metrics.strategicMultiplier),
    cost: finite(metrics.cost),
    riskPenalty: finite(metrics.riskPenalty),
    ownerBurden: finite(metrics.ownerBurden)
  };
  if (missing.length) {
    return { score: null, status: 'UNKNOWN', missing, formula: 'expectedGrossProfit × probability × urgency × strategicMultiplier − cost − riskPenalty − ownerBurden', factors: normalized };
  }
  const score = normalized.expectedGrossProfit * Math.max(0, Math.min(1, normalized.probability))
    * Math.max(0, normalized.urgency) * Math.max(0, normalized.strategicMultiplier)
    - normalized.cost - normalized.riskPenalty - normalized.ownerBurden;
  return {
    score: Math.round(score * 100) / 100,
    status: 'EXPLAINABLE',
    missing: [],
    formula: 'expectedGrossProfit × probability × urgency × strategicMultiplier − cost − riskPenalty − ownerBurden',
    factors: normalized
  };
}

function entityId(entity) {
  if (typeof entity === 'string') return text(entity);
  return text(entity?.entityId || entity?.id || entity?.opportunityId || entity?.prospectId);
}

export function compileDependencyEdge({ fromTaskId, toTaskId, type, reason = null } = {}) {
  const from = text(fromTaskId);
  const to = text(toTaskId);
  const edgeType = text(type).toUpperCase();
  if (!from || !to) return { ok: false, reason: 'dependency-task-ids-required' };
  if (from === to) return { ok: false, reason: 'dependency-self-edge-denied' };
  if (!DEPENDENCY_EDGE_TYPES.includes(edgeType)) return { ok: false, reason: `unknown-dependency-edge:${edgeType}` };
  return {
    ok: true,
    policyVersion: TASK_UNIVERSE_POLICY_VERSION,
    edgeId: `edge_${digest({ from, to, edgeType }).slice(0, 24)}`,
    fromTaskId: from,
    toTaskId: to,
    type: edgeType,
    reason: text(reason) || null,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

function emptyLease() {
  return { owner: null, leasedAt: null, heartbeatAt: null, expiresAt: null };
}

// Just-in-time generator. It creates immutable task instances in memory; a
// caller may enqueue a local instance explicitly, but this function itself
// never touches the durable queue or any external service.
export function generateTaskInstances({ blueprint, trigger, entities = [], evidenceRefs = [], priorityMetrics = {}, date = new Date(), maxInstances = MAX_INSTANCES } = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  if (!blueprint?.ok || blueprint.status !== 'COMPILED') return failure(['compiled-blueprint-required'], timestamp);
  if (!trigger?.ok) return failure(['compiled-trigger-required'], timestamp);
  const limit = Number.isInteger(maxInstances) ? Math.max(0, Math.min(MAX_INSTANCES, maxInstances)) : MAX_INSTANCES;
  const priority = computeTaskPriority(priorityMetrics);
  const instances = [];
  const rejected = [];
  const policyDecisions = [];
  for (const entity of (Array.isArray(entities) ? entities : []).slice(0, limit)) {
    const id = entityId(entity);
    if (!id) {
      rejected.push({ entityId: null, reasonCodes: ['entity-id-required'] });
      continue;
    }
    const decision = evaluateTaskPolicy({ blueprint, trigger, entity, date: at });
    policyDecisions.push({ entityId: id, decision: decision.decision, reasonCodes: decision.reasonCodes });
    const taskId = `task_${digest({ blueprintId: blueprint.blueprintId, version: blueprint.version, entityId: id, triggerId: trigger.triggerId }).slice(0, 24)}`;
    const state = decision.decision === 'ALLOW_LOCAL_PREPARATION' ? 'READY'
      : decision.decision === 'REVIEW_REQUIRED' ? 'REVIEW_REQUIRED' : 'BLOCKED';
    instances.push({
      ok: true,
      policyVersion: TASK_UNIVERSE_POLICY_VERSION,
      taskId,
      idempotencyKey: `task:${blueprint.blueprintId}:${blueprint.version}:${id}:${trigger.triggerId}`,
      state,
      blueprintRef: { blueprintId: blueprint.blueprintId, version: blueprint.version },
      entityRefs: [{ type: text(entity?.entityType) || 'ENTITY', id }],
      evidenceRefs: boundedStrings([...evidenceRefs, ...(Array.isArray(entity?.evidenceRefs) ? entity.evidenceRefs : [])]),
      triggerRef: { triggerId: trigger.triggerId, type: trigger.type, observedAt: trigger.observedAt },
      evaluator: blueprint.evaluator,
      priority,
      lease: emptyLease(),
      attempts: 0,
      receipts: [],
      cost: {
        ceiling: blueprint.costCeiling,
        actualCents: 0,
        currency: blueprint.costCeiling.currency,
        status: blueprint.costCeiling.status
      },
      result: null,
      nextTransition: state === 'READY' ? 'LOCAL_EVALUATION' : state,
      policyDecision: decision,
      createdAt: timestamp,
      updatedAt: timestamp,
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    });
  }
  return {
    ok: true,
    policyVersion: TASK_UNIVERSE_POLICY_VERSION,
    status: 'GENERATED',
    timestamp,
    blueprintRef: { blueprintId: blueprint.blueprintId, version: blueprint.version },
    triggerRef: { triggerId: trigger.triggerId, type: trigger.type },
    requestedCount: Array.isArray(entities) ? entities.length : 0,
    boundedCount: Math.min(Array.isArray(entities) ? entities.length : 0, limit),
    instances,
    rejected,
    policyDecisions,
    generationReceipt: createTaskReceipt({
      eventType: 'TASK_INSTANCES_GENERATED',
      taskIds: instances.map(instance => instance.taskId),
      inputs: { blueprintId: blueprint.blueprintId, triggerId: trigger.triggerId, entityCount: instances.length },
      outputs: { taskCount: instances.length, rejectedCount: rejected.length },
      date: at
    }),
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

function hasOutput(result, name) {
  return result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, name) && result[name] != null;
}

export function evaluateTaskResult({ taskInstance, result = {}, date = new Date() } = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  if (!taskInstance?.ok || !TASK_STATES.includes(taskInstance.state)) return failure(['task-instance-required'], timestamp);
  if (!['READY', 'REVIEW_REQUIRED', 'LEASED', 'RUNNING'].includes(taskInstance.state)) return failure(['task-not-evaluable-in-current-state'], timestamp);
  if (taskInstance.policyDecision?.decision !== 'ALLOW_LOCAL_PREPARATION') return failure(['task-policy-does-not-allow-local-evaluation'], timestamp);
  const requiredOutputs = boundedStrings(taskInstance.evaluator?.requiredOutputs || taskInstance.blueprint?.evaluator?.requiredOutputs || []);
  const missingOutputs = requiredOutputs.filter(name => !hasOutput(result, name));
  const killed = result?.kill === true;
  const succeeded = result?.success === true && missingOutputs.length === 0 && !killed;
  const status = killed ? 'QUARANTINED' : succeeded ? 'SUCCEEDED' : 'FAILED';
  const reasonCodes = killed ? ['kill-condition-triggered'] : missingOutputs.length ? ['required-output-missing'] : result?.success === true ? [] : ['result-not-successful'];
  return {
    ok: true,
    policyVersion: TASK_UNIVERSE_POLICY_VERSION,
    taskId: taskInstance.taskId,
    previousState: taskInstance.state,
    state: status,
    reasonCodes,
    missingOutputs,
    resultRef: text(result?.resultRef) || null,
    outputRefs: boundedStrings(result?.outputRefs, 100),
    evaluatedAt: timestamp,
    receipt: createTaskReceipt({
      eventType: `TASK_${status}`,
      taskIds: [taskInstance.taskId],
      inputs: { taskId: taskInstance.taskId, previousState: taskInstance.state },
      outputs: { state: status, missingOutputs },
      date: at
    }),
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function createTaskReceipt({ eventType, taskIds = [], inputs = {}, outputs = {}, decision = null, date = new Date() } = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const safeInputs = { ...inputs };
  const safeOutputs = { ...outputs };
  return {
    receiptId: `receipt_${digest({ policyVersion: TASK_UNIVERSE_POLICY_VERSION, eventType, taskIds, inputs: safeInputs, outputs: safeOutputs, timestamp }).slice(0, 24)}`,
    policyVersion: TASK_UNIVERSE_POLICY_VERSION,
    eventType: text(eventType) || 'TASK_EVENT',
    taskIds: boundedStrings(taskIds, 100),
    inputDigest: digest(safeInputs),
    outputDigest: digest(safeOutputs),
    decision: decision ? text(decision) : null,
    createdAt: timestamp,
    externalEffects: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function createLearningEvent({ taskId, outcome, errorClass = null, repair = null, benchmarkDelta = null, date = new Date() } = {}) {
  const at = referenceDate(date);
  const task = text(taskId);
  const result = text(outcome).toUpperCase();
  if (!task || !result) return failure(['learning-task-and-outcome-required'], at.toISOString());
  return {
    ok: true,
    policyVersion: TASK_UNIVERSE_POLICY_VERSION,
    learningEventId: `learn_task_${digest({ task, result, errorClass, repair, benchmarkDelta, at: at.toISOString() }).slice(0, 24)}`,
    taskId: task,
    outcome: result,
    errorClass: text(errorClass) || null,
    repair: text(repair) || null,
    benchmarkDelta: finite(benchmarkDelta),
    createdAt: at.toISOString(),
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export async function logTaskUniverseReceipt(store, type, detail) {
  if (!store || typeof store.log !== 'function' || !detail) return null;
  return store.log(text(type) || 'task_universe', detail);
}

export const TASK_UNIVERSE_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
