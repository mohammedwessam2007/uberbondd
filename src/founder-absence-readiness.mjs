import {
  findAbandonedAgentMeshCycles,
  listTerminalAgentMeshCycleReceipts
} from './agent-mesh-cycle-receipts.mjs';
import { readEscalationDeliveryState } from './operator-escalation.mjs';

export const FOUNDER_ABSENCE_POLICY_VERSION = 'founder-absence-readiness-2.3.0';

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
  'deliveryObservation',
  // Whether a page reached a person is the archetypal claim this system cannot
  // make about itself. `ownerEscalationQueue` used to be satisfiable by the
  // queue existing, which is how a proof reached KILIMANJARO_READY at 100%
  // while nothing in the repository could reach the owner at all.
  'ownerEscalationQueue'
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_PROOF_AGE_MS = 6 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
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
    abandonedCycles: nonNegativeInt(input.abandonedCycles),
    undeliveredEscalations: nonNegativeInt(input.undeliveredEscalations),
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
  if (proof.abandonedCycles === null) reasonCodes.push('abandoned-cycle-count-required');
  if (proof.undeliveredEscalations === null) reasonCodes.push('undelivered-escalation-count-required');
  if (!proof.sourceCommit) reasonCodes.push('proof-source-commit-required');
  if (!currentSourceCommit) reasonCodes.push('current-source-commit-required');

  const requiredPolicies = [...new Set((currentPolicyVersions || []).map(value => String(value || '').trim()).filter(Boolean))];
  if (!requiredPolicies.length) reasonCodes.push('current-policy-versions-required');

  const requiredSpanMs = targetDays * DAY_MS;
  const spanMs = proof.observedFromMs !== null && proof.observedThroughMs !== null
    ? proof.observedThroughMs - proof.observedFromMs
    : null;
  if (spanMs !== null && spanMs < requiredSpanMs) reasonCodes.push('observation-window-shorter-than-target-days');
  if (spanMs !== null && spanMs < 0) reasonCodes.push('observation-window-reversed');
  if (proof.observedThroughMs !== null && proof.observedThroughMs > nowMs + FUTURE_SKEW_MS) reasonCodes.push('observation-end-in-future');

  const minimumSuccessfulTicks = targetDays + 1;
  if (proof.successfulTicks !== null && proof.successfulTicks < minimumSuccessfulTicks) reasonCodes.push('insufficient-repeated-successful-ticks');
  if (proof.failedTicks !== null && proof.recoveredTicks !== null && proof.recoveredTicks < proof.failedTicks) reasonCodes.push('unrecovered-failed-ticks-present');
  if (proof.unauthorizedEffects !== null && proof.unauthorizedEffects !== 0) reasonCodes.push('unauthorized-effects-observed');
  if (proof.openDeadLetters !== null && proof.openDeadLetters !== 0) reasonCodes.push('open-dead-letters-present');
  // A cycle that started and never terminalized is a crash nobody wrote down.
  // Until it is reconciled into a recorded failure it is not evidence of
  // anything, and it certainly is not evidence of an unbroken run.
  if (proof.abandonedCycles !== null && proof.abandonedCycles !== 0) reasonCodes.push('abandoned-mesh-cycles-present');
  // The premise of founder absence is that if something goes wrong the founder
  // finds out. An observation window with escalations nobody received is not
  // evidence of an unattended system working; it is evidence of an unattended
  // system whose alarms are disconnected, which is the same picture from the
  // inside and a different one from the outside.
  if (proof.undeliveredEscalations !== null && proof.undeliveredEscalations !== 0) reasonCodes.push('undelivered-escalations-present');

  if (proof.freshnessAtMs !== null) {
    if (proof.freshnessAtMs > nowMs + FUTURE_SKEW_MS) reasonCodes.push('proof-freshness-in-future');
    if (nowMs - proof.freshnessAtMs > maxProofAgeMs) reasonCodes.push('proof-stale');
  }
  if (proof.observedThroughMs !== null && proof.freshnessAtMs !== null && proof.freshnessAtMs < proof.observedThroughMs) {
    reasonCodes.push('freshness-precedes-observation-end');
  }

  if (currentSourceCommit && proof.sourceCommit !== currentSourceCommit) reasonCodes.push('proof-source-commit-mismatch');
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
  if (!source || !policies.length || !receipts.length) return [];
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

export function deriveFounderAbsenceObservationProof({ receipts = [], openDeadLetters = 0, abandonedCycles = 0, undeliveredEscalations = 0 } = {}) {
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
      abandonedCycles: nonNegativeInt(abandonedCycles),
      undeliveredEscalations: nonNegativeInt(undeliveredEscalations),
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
    abandonedCycles: nonNegativeInt(abandonedCycles),
    undeliveredEscalations: nonNegativeInt(undeliveredEscalations),
    sourceCommit: sourceCommits.length === 1 ? sourceCommits[0] : null,
    policyVersions: commonPolicyVersions(terminal)
  };
}

export async function evaluateFounderAbsenceReadinessFromDurableHistory({
  store,
  historyLimit = 2000,
  currentSourceCommit = null,
  currentPolicyVersions = [],
  abandonedAfterMs = 60 * 60 * 1000,
  ...options
} = {}) {
  if (!store || typeof store.list !== 'function') return fail(['durable-history-list-store-required']);
  const source = String(currentSourceCommit || '').trim();
  if (!source) return fail(['current-source-commit-required-for-durable-history']);
  const policies = [...new Set((currentPolicyVersions || []).map(value => String(value || '').trim()).filter(Boolean))];
  if (!policies.length) return fail(['current-policy-versions-required-for-durable-history']);
  const receipts = await listTerminalAgentMeshCycleReceipts({ store, limit: historyLimit });
  const qualifyingReceipts = currentIdentitySuffix(receipts, source, policies);
  const jobs = await store.list('jobs', { limit: 10000 });
  const openDeadLetters = Array.isArray(jobs) ? jobs.filter(job => job?.status === 'dead-letter').length : 0;
  const abandoned = await findAbandonedAgentMeshCycles({
    store,
    now: options.now || new Date(),
    abandonedAfterMs,
    limit: historyLimit
  });
  // Read deliverability from the durable page ledger rather than accepting it
  // as an assertion. A readiness proof that takes "the owner was reachable" on
  // trust is proving the wrong thing.
  const delivery = await readEscalationDeliveryState(store, { date: options.now || new Date() });
  const observationProof = deriveFounderAbsenceObservationProof({
    receipts: qualifyingReceipts,
    openDeadLetters,
    abandonedCycles: abandoned.length,
    // An unreadable ledger is not zero. Leaving it null makes the proof fail
    // closed on `undelivered-escalation-count-required` rather than pass on a
    // number nobody could verify.
    undeliveredEscalations: delivery.ok ? delivery.paging.undeliveredEscalations : null
  });
  const result = evaluateFounderAbsenceReadiness({
    ...options,
    currentSourceCommit: source,
    currentPolicyVersions: policies,
    observationProof
  });
  return {
    ...result,
    durableHistory: {
      terminalReceiptCount: receipts.length,
      qualifyingTerminalReceiptCount: qualifyingReceipts.length,
      openDeadLetters,
      abandonedCycles: abandoned.length,
      abandonedCycleIds: abandoned.map(receipt => receipt.cycleId).slice(0, 20),
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

  let status = 'NOT_READY';
  if (overall >= 90 && !liveMissing.length && !receiptMissing.length && !externalProofMissing.length && durationGate.ok) status = 'KILIMANJARO_READY';
  else if (overall >= 75) status = 'MULTI_DAY_REHEARSAL_READY';
  else if (overall >= 55) status = 'OVERNIGHT_REHEARSAL_READY';

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
    observationProof: {
      observedFrom: proof.observedFrom,
      observedThrough: proof.observedThrough,
      freshnessAt: proof.freshnessAt,
      successfulTicks: proof.successfulTicks,
      failedTicks: proof.failedTicks,
      recoveredTicks: proof.recoveredTicks,
      unauthorizedEffects: proof.unauthorizedEffects,
      openDeadLetters: proof.openDeadLetters,
      abandonedCycles: proof.abandonedCycles,
      undeliveredEscalations: proof.undeliveredEscalations,
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
      : durationGate.reasonCodes[0] || externalProofMissing[0] || liveMissing[0] || criticalMissing[0] || 'REVIEW'
  };
}
