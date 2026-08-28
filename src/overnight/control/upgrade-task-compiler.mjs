// Compile a selected market capability into a bounded engineering/review
// queue. This is the durable bridge between opportunity selection and the
// GPT -> Claude -> tests -> independent review loop. It is deliberately a
// plan compiler: it never edits a repository, calls a provider, sends a
// message, spends money, deploys, changes DNS, or grants authority.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './overnight-upgrade-manifest.mjs';

export const OVERNIGHT_UPGRADE_TASK_COMPILER_POLICY_VERSION = 'overnight-upgrade-task-compiler-1.0.0';
export const MAX_COMPILED_CAPABILITIES = 20;
export const MAX_TASKS_PER_CAPABILITY = 6;
export const MAX_REPAIR_ROUNDS = 2;

const PHASES = Object.freeze([
  'EVIDENCE_RESEARCH',
  'IMPLEMENTATION',
  'DETERMINISTIC_TEST',
  'INDEPENDENT_REVIEW',
  'HOSTILE_REVIEW',
  'PROMOTION_REVIEW'
]);

const ACTORS = Object.freeze({
  EVIDENCE_RESEARCH: 'GPT_RESEARCH',
  IMPLEMENTATION: 'CLAUDE_CODE',
  DETERMINISTIC_TEST: 'CI_RUNNER',
  INDEPENDENT_REVIEW: 'GPT_REVIEW',
  HOSTILE_REVIEW: 'GPT_HOSTILE_REVIEW',
  PROMOTION_REVIEW: 'OWNER'
});

const COMMON_CONSTRAINTS = Object.freeze([
  'AI output is proposal input, not authority',
  'no provider calls, messages, purchases, spend, DNS, deployment, or customer-system mutation',
  'no credential retrieval or secret-shaped payloads',
  'no self-review: implementation and independent review require distinct worker identities',
  'do not edit or weaken sovereignty, payment truth, evidence ontology, kill-switch, or effect-ledger boundaries',
  'stop on disagreement after bounded repair rounds and escalate for owner review'
]);

const PROTECTED_PATH_MARKERS = Object.freeze([
  'src/agent-code-change-contract.mjs',
  'src/payments.mjs',
  'src/revenue.mjs',
  'src/effect-ledgers.mjs',
  'src/founder-absence-readiness.mjs',
  'src/service-fulfillment.mjs',
  'src/chatgpt-relay-client.mjs',
  'src/github-relay.mjs',
  'src/durable-audit-scan.mjs',
  'src/reservation-recovery.mjs',
  'src/prospect-evidence-reconciliation.mjs',
  'src/market-signal.mjs'
]);

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function unique(values, max = 30) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 300)).filter(Boolean))].slice(0, max);
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function zeroEffects() {
  return { ...ZERO_EXTERNAL_EFFECTS };
}

function failed(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: OVERNIGHT_UPGRADE_TASK_COMPILER_POLICY_VERSION,
    status: 'REVIEW_REQUIRED',
    reasonCodes: unique(reasonCodes, 30),
    tasks: [],
    externalEffectLedger: zeroEffects(),
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function safeInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function normalizeSelectedCapability(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { ok: false, reason: 'selected-capability-object-required' };
  }
  const id = text(row.id, 180);
  if (!id) return { ok: false, reason: 'selected-capability-id-required' };
  if (text(row.status, 80) !== 'SELECTED') return { ok: false, reason: `capability-not-selected:${id}` };
  const family = text(row.family, 120);
  const label = text(row.label, 220) || id;
  const modulePaths = unique(row.existingModulePaths, 20);
  const protectedPaths = modulePaths.filter(path => PROTECTED_PATH_MARKERS.some(marker => path === marker || path.endsWith(`/${marker}`)));
  return {
    ok: true,
    capability: {
      id,
      family: family || 'uncategorized',
      label,
      reuseState: text(row.reuseState, 60) || 'UNKNOWN',
      priority: text(row.priority, 10) || 'P3',
      existingModulePaths: modulePaths,
      protectedModulePaths: protectedPaths,
      score: Number.isFinite(row.score) ? row.score : null,
      economicConfidence: Number.isFinite(row.economicConfidence) ? row.economicConfidence : null,
      reasonCodes: unique(row.reasonCodes, 20)
    }
  };
}

function taskId({ tournamentId, capabilityId, phase }) {
  return `upgrade_task_${digest({ tournamentId, capabilityId, phase }).slice(0, 24)}`;
}

function taskFor({ tournament, capability, phase, sequence, expiresAt, taskIds }) {
  const id = taskId({ tournamentId: tournament.tournamentId, capabilityId: capability.id, phase });
  const previous = sequence > 0 ? taskIds[sequence - 1] : null;
  const implementationTarget = phase === 'IMPLEMENTATION'
    ? 'non-sovereignty files only; inspect protected modules but do not edit them'
    : 'no repository mutation';
  const deliverable = {
    EVIDENCE_RESEARCH: 'bounded evidence memo with source provenance, contradictions, and reuse decision',
    IMPLEMENTATION: 'smallest reusable code change with explicit non-sovereignty target list',
    DETERMINISTIC_TEST: 'tests that fail for the claimed defect and a clean exact-head receipt',
    INDEPENDENT_REVIEW: 'review receipt from a worker identity distinct from the implementer',
    HOSTILE_REVIEW: 'bounded adversarial result covering authority, evidence, recovery, and effect-ledger guards',
    PROMOTION_REVIEW: 'owner-review packet; no automatic merge, activation, or spend'
  }[phase];
  const phaseConstraints = phase === 'IMPLEMENTATION'
    ? ['implementation target must remain outside the protected sovereignty paths', 'reuse existing modules before adding a new subsystem']
    : [];
  return {
    taskId: id,
    taskKey: `${tournament.tournamentId}:${capability.id}:${phase}`,
    parentTaskId: previous,
    capabilityId: capability.id,
    capabilityFamily: capability.family,
    capabilityLabel: capability.label,
    sequence,
    phase,
    actor: ACTORS[phase],
    workerIdentityRule: phase === 'INDEPENDENT_REVIEW' || phase === 'HOSTILE_REVIEW'
      ? 'MUST_DIFFER_FROM_IMPLEMENTATION_WORKER'
      : 'BOUNDED_ROLE_IDENTITY_REQUIRED',
    purpose: `Advance the selected capability "${capability.label}" through ${phase.toLowerCase().replaceAll('_', ' ')}.`,
    deliverable,
    implementationTarget,
    source: {
      sourceCommit: text(tournament.sourceCommit, 120),
      tournamentId: text(tournament.tournamentId, 120),
      registryDigest: text(tournament.registryDigest, 120),
      capabilityDigest: digest(capability)
    },
    reuse: {
      state: capability.reuseState,
      existingModulePaths: capability.existingModulePaths,
      protectedModulePaths: capability.protectedModulePaths,
      instruction: 'prefer composition and provider adapters; do not create a parallel product implementation'
    },
    budget: {
      founderMinutes: capability.estimatedFounderMinutes,
      costCents: capability.estimatedCostCents,
      spendingAuthority: 'DISABLED'
    },
    review: {
      maxRepairRounds: MAX_REPAIR_ROUNDS,
      disagreement: 'ESCALATE_OWNER_AFTER_MAX_REPAIR_ROUNDS',
      selfReviewAccepted: false
    },
    constraints: unique([...COMMON_CONSTRAINTS, ...phaseConstraints, ...capability.reasonCodes.map(code => `preserve-source-reason:${code}`)], 20),
    expiresAt,
    status: 'QUEUED_FOR_OWNER_REVIEW',
    execution: 'NOT_RUN',
    externalEffectLedger: zeroEffects()
  };
}

/**
 * Compile only the selected rows of a completed capability tournament into a
 * durable task graph. The returned graph is safe to persist or hand to an
 * existing task queue, but this function itself never executes a task.
 */
export function compileUpgradeTaskPlan({ tournament, date = new Date(), maxCapabilities = MAX_COMPILED_CAPABILITIES } = {}) {
  const timestamp = iso(date);
  if (!timestamp) return failed(['valid-date-required']);
  if (!tournament || typeof tournament !== 'object' || tournament.ok !== true) {
    return failed(['completed-tournament-required'], { timestamp });
  }
  if (text(tournament.status, 80) !== 'TOURNAMENT_COMPLETE') {
    return failed(['tournament-not-complete'], { timestamp, tournamentStatus: text(tournament.status, 80) });
  }

  const sourceCommit = text(tournament.sourceCommit, 120);
  const tournamentId = text(tournament.tournamentId, 120);
  const registryDigest = text(tournament.registryDigest, 120);
  if (!sourceCommit) return failed(['source-commit-required'], { timestamp });
  if (!tournamentId) return failed(['tournament-id-required'], { timestamp });
  if (!registryDigest) return failed(['registry-digest-required'], { timestamp });

  const expiry = iso(tournament.expiresAt);
  if (!expiry) return failed(['tournament-expiry-required'], { timestamp, sourceCommit, tournamentId });
  if (Date.parse(expiry) <= Date.parse(timestamp)) {
    return failed(['tournament-expired'], { timestamp, sourceCommit, tournamentId, expiresAt: expiry });
  }

  const limit = safeInteger(maxCapabilities, { min: 1, max: MAX_COMPILED_CAPABILITIES });
  if (limit == null) return failed(['valid-capability-limit-required'], { timestamp, sourceCommit, tournamentId });
  if (!Array.isArray(tournament.selected) || tournament.selected.length === 0) {
    return failed(['selected-capabilities-required'], { timestamp, sourceCommit, tournamentId, expiresAt: expiry });
  }
  if (tournament.selected.length > MAX_COMPILED_CAPABILITIES) {
    return failed(['selected-capabilities-over-limit'], { timestamp, sourceCommit, tournamentId, selectedCount: tournament.selected.length });
  }

  const normalized = [];
  const rejected = [];
  const seen = new Set();
  for (const row of tournament.selected.slice(0, limit)) {
    const result = normalizeSelectedCapability(row);
    if (!result.ok) {
      rejected.push({ id: text(row?.id, 180) || null, reason: result.reason });
      continue;
    }
    if (seen.has(result.capability.id)) {
      rejected.push({ id: result.capability.id, reason: 'duplicate-selected-capability' });
      continue;
    }
    seen.add(result.capability.id);
    normalized.push(result.capability);
  }
  if (rejected.length > 0) {
    return failed(['invalid-selected-capability'], { timestamp, sourceCommit, tournamentId, expiresAt: expiry, rejected });
  }

  const tasks = [];
  for (const capability of normalized) {
    const taskIds = [];
    for (let sequence = 0; sequence < PHASES.length; sequence += 1) {
      const task = taskFor({ tournament: { sourceCommit, tournamentId, registryDigest }, capability, phase: PHASES[sequence], sequence, expiresAt: expiry, taskIds });
      tasks.push(task);
      taskIds.push(task.taskId);
    }
  }

  const planCore = {
    policyVersion: OVERNIGHT_UPGRADE_TASK_COMPILER_POLICY_VERSION,
    planId: `upgrade_plan_${digest({ tournamentId, registryDigest, sourceCommit, selected: normalized.map(item => item.id), expiresAt: expiry }).slice(0, 24)}`,
    generatedAt: timestamp,
    expiresAt: expiry,
    source: { sourceCommit, tournamentId, registryDigest },
    selectedCapabilityIds: normalized.map(item => item.id),
    selectedCount: normalized.length,
    taskCount: tasks.length,
    maxRepairRounds: MAX_REPAIR_ROUNDS,
    rejected,
    status: 'PLAN_ONLY_OWNER_REVIEW',
    authority: {
      repositoryMutation: 'OWNER_REVIEW_REQUIRED',
      providerCalls: 'DISABLED',
      externalActions: 'DISABLED',
      deployment: 'DISABLED',
      spend: 'DISABLED',
      credentials: 'DISABLED',
      DNS: 'DISABLED',
      sovereignty: 'UNCHANGED'
    },
    execution: {
      status: 'NOT_RUN',
      nextStep: 'OWNER_REVIEW_REQUIRED',
      queueAdmission: 'NOT_AUTHORIZED'
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    tasks
  };
  return {
    ok: true,
    ...planCore,
    planDigest: digest(planCore)
  };
}
