import { listTerminalAgentMeshCycleReceipts } from './agent-mesh-cycle-receipts.mjs';

export const FOUNDER_ABSENCE_POLICY_VERSION = 'founder-absence-readiness-2.2.0';

const REQUIRED = Object.freeze([
  'durableState',
  'scheduler',
  'agentRelay',
  'agentWorkers',
  'boundedBudgets',
  'staleRecovery',
  'truthReceipts',
  'killSwitch',
  'paymentObservation',
  'deliveryObservation',
  'ownerEscalationQueue'
]);

const EXTERNAL_PROOF_REQUIRED = new Set([
  'scheduler',
  'agentRelay',
  'agentWorkers',
  'paymentObservation',
  'deliveryObservation'
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_PROOF_AGE_MS = 6 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// What the system has actually survived, in order. A tier is earned by durable
// terminal cycle receipts on the current code/policy identity -- never by a
// caller asserting it, and never by a fixture.
//
// The ladder exists because "is it ready?" and "how long has it run?" are
// different questions, and answering the first without the second is how a
// one-hour rehearsal ends up certified for a seven-day absence.
export const FOUNDER_ABSENCE_TIERS = Object.freeze([
  { name: 'LOCAL_REHEARSAL', minSpanMs: 0, minSuccessfulTicks: 0 },
  { name: 'ONE_REAL_TICK', minSpanMs: 0, minSuccessfulTicks: 1 },
  { name: 'MULTI_TICK', minSpanMs: 0, minSuccessfulTicks: 3 },
  { name: 'OVERNIGHT', minSpanMs: 8 * HOUR_MS, minSuccessfulTicks: 8 },
  { name: 'ONE_DAY', minSpanMs: DAY_MS, minSuccessfulTicks: 24 },
  { name: 'THREE_DAY', minSpanMs: 3 * DAY_MS, minSuccessfulTicks: 72 },
  { name: 'SEVEN_DAY_KILIMANJARO', minSpanMs: 7 * DAY_MS, minSuccessfulTicks: 168 },
  { name: 'FOURTEEN_DAY', minSpanMs: 14 * DAY_MS, minSuccessfulTicks: 336 }
]);

const TIER_INDEX = new Map(FOUNDER_ABSENCE_TIERS.map((tier, index) => [tier.name, index]));

/**
 * The highest tier the durable history actually supports.
 *
 * Any unrecovered failure, any unauthorized effect, or any open dead letter
 * drops the proof back to LOCAL_REHEARSAL however long the window is: a run
 * that ended in a state nobody resolved has not been survived, it has been
 * abandoned.
 */
export function classifyObservationTier(proof = {}) {
  const successfulTicks = Number.isSafeInteger(proof.successfulTicks) ? proof.successfulTicks : 0;
  const failedTicks = Number.isSafeInteger(proof.failedTicks) ? proof.failedTicks : 0;
  const recoveredTicks = Number.isSafeInteger(proof.recoveredTicks) ? proof.recoveredTicks : 0;
  const unauthorizedEffects = Number.isSafeInteger(proof.unauthorizedEffects) ? proof.unauthorizedEffects : 0;
  const openDeadLetters = Number.isSafeInteger(proof.openDeadLetters) ? proof.openDeadLetters : 0;
  const spanMs = proof.observedFromMs !== null && proof.observedFromMs !== undefined
    && proof.observedThroughMs !== null && proof.observedThroughMs !== undefined
    ? proof.observedThroughMs - proof.observedFromMs
    : 0;

  const integrityBroken = unauthorizedEffects !== 0 || openDeadLetters !== 0 || recoveredTicks < failedTicks;
  if (integrityBroken || spanMs < 0) {
    return { tier: 'LOCAL_REHEARSAL', tierIndex: 0, observedSpanMs: Math.max(spanMs, 0), successfulTicks, integrityBroken: true };
  }

  let index = 0;
  for (let candidate = FOUNDER_ABSENCE_TIERS.length - 1; candidate >= 0; candidate -= 1) {
    const tier = FOUNDER_ABSENCE_TIERS[candidate];
    if (spanMs >= tier.minSpanMs && successfulTicks >= tier.minSuccessfulTicks) { index = candidate; break; }
  }
  return { tier: FOUNDER_ABSENCE_TIERS[index].name, tierIndex: index, observedSpanMs: spanMs, successfulTicks, integrityBroken: false };
}

const HEALTHY_CYCLE_STATUSES = new Set(['ADVANCED', 'IDLE']);
const FAILED_CYCLE_STATUSES = new Set(['DEGRADED', 'BLOCKED']);

function fail(reasonCodes) {
  return { ok: false, policyVersion: FOUNDER_ABSENCE_POLICY_VERSION, status: 'NOT_READY', reasonCodes: [...new Set(reasonCodes.filter(Boolean))] };
}

function parseIso(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function nonNegativeInt(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeCapability(name, input = {}) {
  const evidenceRefs = Array.isArray(input.evidenceRefs)
    ? [...new Set(input.evidenceRefs.map(value => String(value || '').trim()).filter(Boolean))].slice(0, 50)
    : [];
  const typedEvidenceRefs = evidenceRefs.filter(value => /^(receipt|issue|github|deployment|test|audit|payment|delivery|doc):/i.test(value));
  return {
    name,
    status: String(input.status || 'UNKNOWN').toUpperCase(),
    evidenceRefs,
    typedEvidenceRefs,
    evidenceValid: evidenceRefs.length > 0 && evidenceRefs.length === typedEvidenceRefs.length,
    externallyVerified: input.externallyVerified === true,
    notes: String(input.notes || '').slice(0, 500)
  };
}

function normalizeObservationProof(input = {}) {
  const observedFromMs = parseIso(input.observedFrom);
  const observedThroughMs = parseIso(input.observedThrough);
  const freshnessAtMs = parseIso(input.freshnessAt);
  const sourceCommit = String(input.sourceCommit || '').trim().slice(0, 80) || null;
  const policyVersions = Array.isArray(input.policyVersions)
    ? [...new Set(input.policyVersions.map(value => String(value || '').trim()).filter(Boolean))].slice(0, 20)
    : [];
  return {
    observedFrom: observedFromMs === null ? null : new Date(observedFromMs).toISOString(),
    observedThrough: observedThroughMs === null ? null : new Date(observedThroughMs).toISOString(),
    freshnessAt: freshnessAtMs === null ? null : new Date(freshnessAtMs).toISOString(),
    observedFromMs,
    observedThroughMs,
    freshnessAtMs,
    successfulTicks: nonNegativeInt(input.successfulTicks),
    failedTicks: nonNegativeInt(input.failedTicks),
    recoveredTicks: nonNegativeInt(input.recoveredTicks),
    unauthorizedEffects: nonNegativeInt(input.unauthorizedEffects),
    openDeadLetters: nonNegativeInt(input.openDeadLetters),
    sourceCommit,
    policyVersions
  };
}

function evaluateObservationProof({ proof, targetDays, currentSourceCommit, currentPolicyVersions, nowMs, maxProofAgeMs }) {
  const reasonCodes = [];
  if (proof.observedFromMs === null) reasonCodes.push('observation-start-required');
  if (proof.observedThroughMs === null) reasonCodes.push('observation-end-required');
  if (proof.freshnessAtMs === null) reasonCodes.push('proof-freshness-required');
  if (proof.successfulTicks === null) reasonCodes.push('successful-ticks-required');
  if (proof.failedTicks === null) reasonCodes.push('failed-ticks-required');
  if (proof.recoveredTicks === null) reasonCodes.push('recovered-ticks-required');
  if (proof.unauthorizedEffects === null) reasonCodes.push('unauthorized-effects-required');
  if (proof.openDeadLetters === null) reasonCodes.push('open-dead-letters-required');
  if (!proof.sourceCommit) reasonCodes.push('proof-source-commit-required');

  const requiredSpanMs = targetDays * DAY_MS;
  const spanMs = proof.observedFromMs !== null && proof.observedThroughMs !== null
    ? proof.observedThroughMs - proof.observedFromMs
    : null;
  if (spanMs !== null && spanMs < requiredSpanMs) reasonCodes.push('observation-window-shorter-than-target-days');
  if (spanMs !== null && spanMs < 0) reasonCodes.push('observation-window-reversed');

  const minimumSuccessfulTicks = targetDays + 1;
  if (proof.successfulTicks !== null && proof.successfulTicks < minimumSuccessfulTicks) reasonCodes.push('insufficient-repeated-successful-ticks');
  if (proof.failedTicks !== null && proof.recoveredTicks !== null && proof.recoveredTicks < proof.failedTicks) reasonCodes.push('unrecovered-failed-ticks-present');
  if (proof.unauthorizedEffects !== null && proof.unauthorizedEffects !== 0) reasonCodes.push('unauthorized-effects-observed');
  if (proof.openDeadLetters !== null && proof.openDeadLetters !== 0) reasonCodes.push('open-dead-letters-present');

  if (proof.freshnessAtMs !== null) {
    if (proof.freshnessAtMs > nowMs + 5 * 60 * 1000) reasonCodes.push('proof-freshness-in-future');
    if (nowMs - proof.freshnessAtMs > maxProofAgeMs) reasonCodes.push('proof-stale');
  }
  if (proof.observedThroughMs !== null && proof.freshnessAtMs !== null && proof.freshnessAtMs < proof.observedThroughMs) {
    reasonCodes.push('freshness-precedes-observation-end');
  }

  if (currentSourceCommit && proof.sourceCommit !== currentSourceCommit) reasonCodes.push('proof-source-commit-mismatch');
  const requiredPolicies = [...new Set((currentPolicyVersions || []).map(value => String(value || '').trim()).filter(Boolean))];
  if (requiredPolicies.some(version => !proof.policyVersions.includes(version))) reasonCodes.push('proof-policy-version-mismatch');

  return {
    ok: reasonCodes.length === 0,
    reasonCodes: [...new Set(reasonCodes)],
    requiredSpanMs,
    observedSpanMs: spanMs,
    minimumSuccessfulTicks
  };
}

function ledgerHasEffects(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) return true;
  const values = Object.values(ledger);
  if (!values.length) return true;
  return values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value !== 0);
}

function commonPolicyVersions(receipts) {
  if (!receipts.length) return [];
  const first = new Set(Array.isArray(receipts[0].policyVersions) ? receipts[0].policyVersions : []);
  return [...first].filter(version => receipts.every(receipt => Array.isArray(receipt.policyVersions) && receipt.policyVersions.includes(version))).slice(0, 20);
}

function currentIdentitySuffix(receipts, currentSourceCommit, currentPolicyVersions) {
  const source = String(currentSourceCommit || '').trim();
  const policies = [...new Set((currentPolicyVersions || []).map(value => String(value || '').trim()).filter(Boolean))];
  if (!source || !receipts.length) return [];
  let start = receipts.length;
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const receipt = receipts[index];
    const matches = String(receipt?.sourceCommit || '').trim() === source
      && policies.every(version => Array.isArray(receipt?.policyVersions) && receipt.policyVersions.includes(version));
    if (!matches) break;
    start = index;
  }
  return receipts.slice(start);
}

export function deriveFounderAbsenceObservationProof({ receipts = [], openDeadLetters = 0 } = {}) {
  const terminal = (Array.isArray(receipts) ? receipts : [])
    .filter(receipt => receipt?.phase === 'TERMINAL')
    .map(receipt => ({ ...receipt, startedAtMs: parseIso(receipt.startedAt), finishedAtMs: parseIso(receipt.finishedAt) }))
    .filter(receipt => receipt.startedAtMs !== null && receipt.finishedAtMs !== null)
    .sort((a, b) => a.finishedAtMs - b.finishedAtMs);

  if (!terminal.length) {
    return {
      successfulTicks: 0,
      failedTicks: 0,
      recoveredTicks: 0,
      unauthorizedEffects: 0,
      openDeadLetters: nonNegativeInt(openDeadLetters),
      sourceCommit: null,
      policyVersions: []
    };
  }

  const healthyIndexes = terminal
    .map((receipt, index) => HEALTHY_CYCLE_STATUSES.has(String(receipt.status || '').toUpperCase()) ? index : -1)
    .filter(index => index >= 0);
  const failedIndexes = terminal
    .map((receipt, index) => FAILED_CYCLE_STATUSES.has(String(receipt.status || '').toUpperCase()) ? index : -1)
    .filter(index => index >= 0);
  const recoveredTicks = failedIndexes.filter(index => healthyIndexes.some(healthyIndex => healthyIndex > index)).length;
  const sourceCommits = [...new Set(terminal.map(receipt => String(receipt.sourceCommit || '').trim()).filter(Boolean))];
  const unauthorizedEffects = terminal.filter(receipt => receipt.businessEffectAuthority !== 'NONE' || ledgerHasEffects(receipt.externalEffectLedger)).length;

  return {
    observedFrom: new Date(Math.min(...terminal.map(receipt => receipt.startedAtMs))).toISOString(),
    observedThrough: new Date(Math.max(...terminal.map(receipt => receipt.finishedAtMs))).toISOString(),
    freshnessAt: new Date(Math.max(...terminal.map(receipt => receipt.finishedAtMs))).toISOString(),
    successfulTicks: healthyIndexes.length,
    failedTicks: failedIndexes.length,
    recoveredTicks,
    unauthorizedEffects,
    openDeadLetters: nonNegativeInt(openDeadLetters),
    sourceCommit: sourceCommits.length === 1 ? sourceCommits[0] : null,
    policyVersions: commonPolicyVersions(terminal)
  };
}

export async function evaluateFounderAbsenceReadinessFromDurableHistory({
  store,
  historyLimit = 2000,
  currentSourceCommit = null,
  currentPolicyVersions = [],
  ...options
} = {}) {
  if (!store || typeof store.list !== 'function') return fail(['durable-history-list-store-required']);
  const source = String(currentSourceCommit || '').trim();
  if (!source) return fail(['current-source-commit-required-for-durable-history']);
  const receipts = await listTerminalAgentMeshCycleReceipts({ store, limit: historyLimit });
  const qualifyingReceipts = currentIdentitySuffix(receipts, source, currentPolicyVersions);
  const jobs = await store.list('jobs', { limit: 10000 });
  const openDeadLetters = Array.isArray(jobs) ? jobs.filter(job => job?.status === 'dead-letter').length : 0;
  const observationProof = deriveFounderAbsenceObservationProof({ receipts: qualifyingReceipts, openDeadLetters });
  const result = evaluateFounderAbsenceReadiness({
    ...options,
    currentSourceCommit: source,
    currentPolicyVersions,
    observationProof
  });
  return {
    ...result,
    durableHistory: {
      terminalReceiptCount: receipts.length,
      qualifyingTerminalReceiptCount: qualifyingReceipts.length,
      openDeadLetters,
      source: 'agent_mesh_cycle_terminal'
    }
  };
}

export function evaluateFounderAbsenceReadiness({
  capabilities = {},
  targetDays = 7,
  observationProof = {},
  currentSourceCommit = null,
  currentPolicyVersions = [],
  now = new Date(),
  maxProofAgeMs = DEFAULT_MAX_PROOF_AGE_MS
} = {}) {
  const days = Number(targetDays);
  if (!Number.isInteger(days) || days < 1 || days > 30) return fail(['target-days-1-to-30-required']);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) return fail(['valid-current-time-required']);
  if (!Number.isSafeInteger(maxProofAgeMs) || maxProofAgeMs <= 0 || maxProofAgeMs > 7 * DAY_MS) return fail(['valid-proof-age-limit-required']);

  const normalized = REQUIRED.map(name => normalizeCapability(name, capabilities[name]));
  const criticalMissing = normalized.filter(item => !['VERIFIED_LIVE', 'TEST_VERIFIED'].includes(item.status));
  const liveMissing = normalized.filter(item => item.status !== 'VERIFIED_LIVE');
  const receiptMissing = normalized.filter(item => !item.evidenceValid);
  const externalProofMissing = normalized.filter(item => EXTERNAL_PROOF_REQUIRED.has(item.name) && !item.externallyVerified);
  const proof = normalizeObservationProof(observationProof);
  const durationGate = evaluateObservationProof({
    proof,
    targetDays: days,
    currentSourceCommit: String(currentSourceCommit || '').trim() || null,
    currentPolicyVersions,
    nowMs,
    maxProofAgeMs
  });

  const architectureScore = Math.round(((REQUIRED.length - criticalMissing.length) / REQUIRED.length) * 100);
  const liveScore = Math.round(((REQUIRED.length - liveMissing.length) / REQUIRED.length) * 100);
  const evidenceScore = Math.round(((REQUIRED.length - receiptMissing.length) / REQUIRED.length) * 100);
  const overall = Math.round(architectureScore * 0.45 + liveScore * 0.35 + evidenceScore * 0.20);

  const proven = classifyObservationTier(proof);

  // The prospective rungs are capped by the tier actually survived. Claiming
  // readiness to run unattended for days, having never survived a single
  // durable cycle, is the exact overclaim this module exists to prevent -- so
  // a rung may be claimed only one above what the receipts support.
  let status = 'NOT_READY';
  if (overall >= 90 && !liveMissing.length && !receiptMissing.length && !externalProofMissing.length && durationGate.ok) status = 'KILIMANJARO_READY';
  else if (overall >= 75 && proven.tierIndex >= TIER_INDEX.get('OVERNIGHT')) status = 'MULTI_DAY_REHEARSAL_READY';
  else if (overall >= 55 && proven.tierIndex >= TIER_INDEX.get('MULTI_TICK')) status = 'OVERNIGHT_REHEARSAL_READY';
  else if (overall >= 55) status = 'ARCHITECTURE_READY_DURATION_UNPROVEN';

  const nextTier = FOUNDER_ABSENCE_TIERS[Math.min(proven.tierIndex + 1, FOUNDER_ABSENCE_TIERS.length - 1)];

  return {
    ok: true,
    policyVersion: FOUNDER_ABSENCE_POLICY_VERSION,
    status,
    targetDays: days,
    scores: { architecture: architectureScore, live: liveScore, evidence: evidenceScore, overall },
    capabilities: normalized,
    criticalMissing: criticalMissing.map(item => item.name),
    liveProofMissing: liveMissing.map(item => item.name),
    externalProofMissing: externalProofMissing.map(item => item.name),
    provenTier: proven.tier,
    provenTierIndex: proven.tierIndex,
    nextTier: proven.tier === nextTier.name ? null : nextTier.name,
    nextTierRequires: proven.tier === nextTier.name
      ? null
      : { minSpanMs: nextTier.minSpanMs, minSuccessfulTicks: nextTier.minSuccessfulTicks },
    observationProof: {
      observedFrom: proof.observedFrom,
      observedThrough: proof.observedThrough,
      freshnessAt: proof.freshnessAt,
      successfulTicks: proof.successfulTicks,
      failedTicks: proof.failedTicks,
      recoveredTicks: proof.recoveredTicks,
      unauthorizedEffects: proof.unauthorizedEffects,
      openDeadLetters: proof.openDeadLetters,
      sourceCommit: proof.sourceCommit,
      policyVersions: proof.policyVersions,
      observedSpanMs: durationGate.observedSpanMs,
      requiredSpanMs: durationGate.requiredSpanMs,
      minimumSuccessfulTicks: durationGate.minimumSuccessfulTicks,
      valid: durationGate.ok,
      reasonCodes: durationGate.reasonCodes
    },
    nextGate: status === 'KILIMANJARO_READY'
      ? 'RUN_OWNER_ABSENCE_CANARY'
      : durationGate.reasonCodes[0] || externalProofMissing[0] || liveMissing[0] || criticalMissing[0]
        || (proven.tier === nextTier.name ? 'REVIEW' : `EARN_TIER_${nextTier.name}`)
  };
}
