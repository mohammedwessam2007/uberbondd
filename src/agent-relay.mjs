// Canonical, bounded communication contracts for multiple AI workers.
//
// UberBond owns task state, evidence references, budgets, constraints, and
// disagreement handling. This module does not connect to GPT, Claude, Cowork,
// MCP, a provider, or a repository. It prepares relay packets and refuses
// unbounded agent-to-agent loops.

import crypto from 'node:crypto';

export const AGENT_RELAY_POLICY_VERSION = 'agent-relay-1.0.0';
export const RELAY_STATUSES = Object.freeze([
  'READY_FOR_REVIEW', 'OPEN_REVIEW', 'ROUND_REVIEW', 'RESOLVED', 'ESCALATE_OWNER'
]);
import { ZERO_EXTERNAL_EFFECTS as RELAY_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export { RELAY_EXTERNAL_EFFECTS };

const MAX_REFS = 100;
const MAX_ITEMS = 40;
const MAX_ROUNDS = 3;
const MAX_TOKENS = 200000;

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function strings(values, max = MAX_ITEMS) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 300)).filter(Boolean))].slice(0, max);
}

function evidenceRefs(values) {
  return strings(values, MAX_REFS).filter(value => /^(evidence|audit|test|doc|outcome|signal|task|proposal|mission|receipt):/i.test(value));
}

function failed(reasonCodes, at) {
  return {
    ok: false,
    policyVersion: AGENT_RELAY_POLICY_VERSION,
    status: 'ESCALATE_OWNER',
    timestamp: at,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...RELAY_EXTERNAL_EFFECTS }
  };
}

const MANDATORY_FORBIDDEN_ACTIONS = Object.freeze([
  'send', 'spend', 'purchase', 'deploy', 'push', 'merge', 'change-credentials',
  'change-dns', 'contact-anyone', 'use-private-data', 'mutate-production'
]);

function normalizeBudget(value) {
  const budget = value && typeof value === 'object' ? value : {};
  const maxTokens = Number.isInteger(budget.maxTokens)
    ? Math.max(1, Math.min(MAX_TOKENS, budget.maxTokens)) : null;
  const maxCostCents = Number.isInteger(budget.maxCostCents)
    ? Math.max(0, budget.maxCostCents) : null;
  return {
    maxTokens,
    maxCostCents,
    status: maxTokens == null && maxCostCents == null ? 'UNKNOWN' : 'BOUNDED_OR_PARTIAL'
  };
}

// Prepare a task for an actual connected worker. The result is not evidence
// that any worker ran; execution remains NOT_RUN until a separate receipt is
// received from a real integration.
export function compileAgentTask({
  taskId,
  objective,
  originAgent,
  targetAgent,
  parentTask,
  contextRefs = [],
  evidenceRefs: suppliedEvidenceRefs = [],
  constraints = [],
  forbiddenActions = [],
  requiredOutputs = [],
  acceptanceTests = [],
  budget,
  deadline,
  economicObjective,
  consequenceClass = 'LOCAL_PREPARATION',
  date = new Date()
} = {}) {
  const at = timestamp(date);
  const cleanObjective = text(objective, 1200);
  const origin = text(originAgent, 120);
  const target = text(targetAgent, 120);
  const context = strings(contextRefs, MAX_REFS);
  const evidence = evidenceRefs(suppliedEvidenceRefs);
  const outputs = strings(requiredOutputs);
  const tests = strings(acceptanceTests);
  const forbidden = [...new Set([...MANDATORY_FORBIDDEN_ACTIONS, ...strings(forbiddenActions)])];
  const allowedConsequences = ['LOCAL_PREPARATION', 'OWNER_REVIEW', 'OWNER_AUTHORIZED_EXTERNAL'];
  const reasons = [];
  if (!cleanObjective) reasons.push('objective-required');
  if (!origin || !target) reasons.push('origin-and-target-agents-required');
  if (!outputs.length) reasons.push('required-outputs-needed');
  if (!tests.length) reasons.push('acceptance-tests-needed');
  if (evidence.length !== strings(suppliedEvidenceRefs, MAX_REFS).length) reasons.push('evidence-reference-format-invalid');
  if (!allowedConsequences.includes(String(consequenceClass).toUpperCase())) reasons.push('unknown-consequence-class');
  if (reasons.length) return failed(reasons, at);

  const identity = {
    policyVersion: AGENT_RELAY_POLICY_VERSION,
    objective: cleanObjective,
    originAgent: origin,
    targetAgent: target,
    parentTask: text(parentTask, 120) || null,
    contextRefs: context,
    evidenceRefs: evidence,
    constraints: strings(constraints),
    forbiddenActions: forbidden,
    requiredOutputs: outputs,
    acceptanceTests: tests,
    budget: normalizeBudget(budget),
    deadline: text(deadline, 80) || null,
    economicObjective: text(economicObjective, 500) || 'UNKNOWN',
    consequenceClass: String(consequenceClass).toUpperCase()
  };

  return {
    ok: true,
    policyVersion: AGENT_RELAY_POLICY_VERSION,
    taskId: text(taskId, 120) || `agent_task_${digest(identity).slice(0, 24)}`,
    status: 'READY_FOR_REVIEW',
    createdAt: at,
    ...identity,
    authority: identity.consequenceClass === 'LOCAL_PREPARATION' ? 'LOCAL_PREPARATION' : 'OWNER_REQUIRED',
    execution: { status: 'NOT_RUN', workerReceipt: null, externalAction: false },
    externalEffectLedger: { ...RELAY_EXTERNAL_EFFECTS }
  };
}

export function compileDisputePacket({
  task,
  disagreements = [],
  evidenceRefs: suppliedEvidenceRefs = [],
  maxRounds = MAX_ROUNDS,
  arbiter = 'UBERBOND_RULES',
  date = new Date()
} = {}) {
  const at = timestamp(date);
  if (!task || task.ok !== true || !task.taskId) return failed(['valid-agent-task-required'], at);
  const rounds = Number.isInteger(maxRounds) ? Math.max(1, Math.min(MAX_ROUNDS, maxRounds)) : MAX_ROUNDS;
  const evidence = evidenceRefs(suppliedEvidenceRefs);
  const normalized = Array.isArray(disagreements) ? disagreements.slice(0, MAX_ITEMS).map(item => ({
    agent: text(item?.agent, 120),
    position: text(item?.position, 600),
    reasonCodes: strings(item?.reasonCodes, 20),
    evidenceRefs: evidenceRefs(item?.evidenceRefs)
  })).filter(item => item.agent && item.position) : [];
  if (!normalized.length) return failed(['disagreement-required'], at);
  if (evidence.length !== strings(suppliedEvidenceRefs, MAX_REFS).length) return failed(['evidence-reference-format-invalid'], at);
  const identity = { taskId: task.taskId, disagreements: normalized, evidenceRefs: evidence, maxRounds: rounds, arbiter: text(arbiter, 120) || 'UBERBOND_RULES' };
  return {
    ok: true,
    policyVersion: AGENT_RELAY_POLICY_VERSION,
    disputeId: `dispute_${digest(identity).slice(0, 24)}`,
    taskId: task.taskId,
    status: 'OPEN_REVIEW',
    createdAt: at,
    round: 0,
    maxRounds: rounds,
    arbiter: identity.arbiter,
    disagreements: normalized,
    evidenceRefs: evidence,
    resolution: null,
    externalEffectLedger: { ...RELAY_EXTERNAL_EFFECTS }
  };
}

// A bounded arbitration step. Missing evidence or exhausted rounds escalate
// to the owner rather than creating an infinite agent debate.
export function resolveDisputeRound({
  packet,
  outcome,
  rationale,
  evidenceRefs: suppliedEvidenceRefs = [],
  date = new Date()
} = {}) {
  const at = timestamp(date);
  if (!packet || packet.ok !== true || !packet.disputeId) return failed(['valid-dispute-required'], at);
  const allowed = ['ACCEPT_ORIGIN', 'ACCEPT_TARGET', 'REJECT_BOTH', 'DEFER'];
  const decision = String(outcome || '').toUpperCase();
  const evidence = evidenceRefs(suppliedEvidenceRefs);
  if (!allowed.includes(decision)) return failed(['unknown-dispute-outcome'], at);
  const nextRound = Number(packet.round || 0) + 1;
  const reasons = [];
  if (!text(rationale, 800)) reasons.push('rationale-required');
  if (!evidence.length) reasons.push('arbitration-evidence-required');
  if (nextRound > Number(packet.maxRounds || MAX_ROUNDS)) reasons.push('dispute-round-limit-reached');
  const resolved = !reasons.length && decision !== 'DEFER';
  return {
    ok: true,
    policyVersion: AGENT_RELAY_POLICY_VERSION,
    disputeId: packet.disputeId,
    taskId: packet.taskId,
    timestamp: at,
    round: Math.min(nextRound, Number(packet.maxRounds || MAX_ROUNDS)),
    status: resolved ? 'RESOLVED' : 'ESCALATE_OWNER',
    reasonCodes: reasons,
    resolution: resolved ? { outcome: decision, rationale: text(rationale, 800), evidenceRefs: evidence } : null,
    authority: resolved ? 'REVIEW_RECORDED_NOT_EXECUTED' : 'OWNER_REQUIRED',
    execution: { status: 'NOT_RUN', workerReceipt: null, externalAction: false },
    externalEffectLedger: { ...RELAY_EXTERNAL_EFFECTS }
  };
}

export async function logAgentRelayReceipt(store, type, detail) {
  if (!store || typeof store.log !== 'function' || !detail?.ok) return null;
  return store.log(type, {
    policyVersion: detail.policyVersion,
    taskId: detail.taskId || null,
    disputeId: detail.disputeId || null,
    status: detail.status,
    round: detail.round ?? null,
    evidenceRefs: detail.evidenceRefs || [],
    requiredOutputs: detail.requiredOutputs || [],
    acceptanceTests: detail.acceptanceTests || [],
    resolution: detail.resolution || null,
    execution: detail.execution || null,
    timestamp: detail.timestamp || detail.createdAt || null,
    externalEffectLedger: detail.externalEffectLedger
  });
}
