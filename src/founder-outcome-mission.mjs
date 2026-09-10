import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FOUNDER_OUTCOME_MISSION_VERSION = 'uberbond.founder-outcome-mission.v1.1';
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 8000) => String(value ?? '').trim().slice(0, max);
const uniq = values => [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fail(reasonCodes, status = 'FOUNDER_OUTCOME_MISSION_REFUSED', extra = {}) {
  return {
    ok: false,
    policyVersion: FOUNDER_OUTCOME_MISSION_VERSION,
    status,
    reasonCodes: uniq(reasonCodes),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function parseClockDeadline(raw, now, timezoneOffsetMinutes = 180) {
  const nextHours = raw.match(/\bnext\s+(\d{1,3}(?:\.\d+)?)\s*hours?\b/i);
  if (nextHours) {
    const hours = Number(nextHours[1]);
    if (Number.isFinite(hours) && hours > 0 && hours <= 168) return new Date(now.getTime() + hours * 3_600_000);
  }

  const clock = raw.match(/\b(?:until|by|before|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!clock) return null;
  let hour = Number(clock[1]);
  const minute = Number(clock[2] || 0);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (clock[3].toLowerCase() === 'pm' && hour !== 12) hour += 12;
  if (clock[3].toLowerCase() === 'am' && hour === 12) hour = 0;

  const offsetMs = Number(timezoneOffsetMinutes) * 60_000;
  const local = new Date(now.getTime() + offsetMs);
  const deadlineUtcMs = Date.UTC(
    local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute, 0, 0
  ) - offsetMs;
  let deadline = new Date(deadlineUtcMs);
  if (/\btomorrow\b/i.test(raw)) deadline = new Date(deadline.getTime() + 86_400_000);
  else if (!/\btoday\b/i.test(raw) && deadline.getTime() <= now.getTime()) deadline = new Date(deadline.getTime() + 86_400_000);
  return deadline;
}

export function classifyFounderOutcomeIntent(founderIntent) {
  const raw = text(founderIntent);
  if (!raw) return { recognized: false, missionClass: null };
  const economic = /\b(money|revenue|profit|cash|payment|paid|sales?)\b/i.test(raw)
    && /\b(make|earn|maximi[sz]e|generate|create|get|produce|bring)\b/i.test(raw);
  return {
    recognized: economic,
    missionClass: economic ? 'ECONOMIC_OUTCOME' : null,
    objectiveClass: economic ? 'MAXIMIZE_CLEARED_CONTRIBUTION_PROFIT' : null
  };
}

export function compileFounderOutcomeMission({
  founderIntent,
  now = new Date(),
  deadline = null,
  timezone = 'Africa/Cairo',
  timezoneOffsetMinutes = 180,
  sourceRevision = null,
  spendCeilingCents = null
} = {}) {
  const raw = text(founderIntent);
  const startedAt = asDate(now);
  if (!raw || !startedAt) return fail(['founder-intent-and-valid-now-required']);
  const classification = classifyFounderOutcomeIntent(raw);
  if (!classification.recognized) return fail(['recognized-outcome-mission-required']);

  const resolvedDeadline = asDate(deadline) || parseClockDeadline(raw, startedAt, timezoneOffsetMinutes);
  if (!resolvedDeadline || resolvedDeadline.getTime() <= startedAt.getTime()) {
    return fail(['future-mission-deadline-required']);
  }

  const paypalMatch = raw.match(/\bpaypal\.me\/[A-Za-z0-9._-]+\b/i);
  const explicitZeroSpend = /\b(?:\$\s*0|0\s*cents?|zero[- ]spend|spend ceiling[^\n]{0,40}\b0)\b/i.test(raw);
  const normalizedSpend = spendCeilingCents == null
    ? (explicitZeroSpend ? 0 : null)
    : Number(spendCeilingCents);
  if (normalizedSpend != null && (!Number.isSafeInteger(normalizedSpend) || normalizedSpend < 0)) {
    return fail(['valid-nonnegative-spend-ceiling-required']);
  }

  const missionCore = {
    schemaVersion: FOUNDER_OUTCOME_MISSION_VERSION,
    missionClass: classification.missionClass,
    objectiveClass: classification.objectiveClass,
    founderIntent: raw,
    startedAt: startedAt.toISOString(),
    deadlineAt: resolvedDeadline.toISOString(),
    timezone,
    nominatedPaymentDestination: paypalMatch ? paypalMatch[0] : null,
    spendCeilingCents: normalizedSpend,
    sourceRevision: text(sourceRevision, 80) || null
  };
  const missionId = `mission-${digest(missionCore).slice(0, 24)}`;
  return {
    ok: true,
    policyVersion: FOUNDER_OUTCOME_MISSION_VERSION,
    status: 'FOUNDER_OUTCOME_MISSION_ACTIVE',
    state: 'ACTIVE',
    terminal: false,
    terminalResultAllowed: false,
    missionId,
    ...missionCore,
    successMetric: 'PROVIDER_ORIGIN_CLEARED_CONTRIBUTION_PROFIT_BEFORE_DEADLINE',
    founderMinuteTarget: 0,
    authority: {
      mode: 'MISSION_SCOPED_EXISTING_GATES_ONLY',
      newSpendAuthorized: normalizedSpend === 0 ? false : null,
      outboundAuthorityInferredFromIntent: false,
      paymentAuthorityInferredFromDestination: false,
      rule: 'The outcome mission may drive planning, prioritization and already-authorized execution, but never manufactures a channel, customer, payment, credential, spend, deployment or legal authority merely from founder intent.'
    },
    businessEffectAuthority: 'MISSION_SCOPED_EXISTING_GATES_ONLY',
    externalEffectAuthority: 'MISSION_SCOPED_EXISTING_GATES_ONLY',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'This is an active founder outcome contract. It is not a result. A nominated PayPal destination is not proof of ownership, receivability or clearance. Before the deadline UberBond may report current observed money, but must not present that current value as the terminal mission outcome unless complete admissible-branch exhaustion is independently proven.'
  };
}

export function evaluateFounderOutcomeMission({
  mission,
  now = new Date(),
  clearedContributionProfitCents = null,
  providerEvidenceRefs = [],
  paymentObservationComplete = false,
  exhaustionProof = null,
  cancelled = false
} = {}) {
  if (!mission?.ok || mission.state !== 'ACTIVE' || !mission.missionId) return fail(['active-founder-outcome-mission-required']);
  const observedAt = asDate(now);
  const deadline = asDate(mission.deadlineAt);
  if (!observedAt || !deadline) return fail(['valid-observation-and-deadline-required']);
  const money = clearedContributionProfitCents == null ? null : Number(clearedContributionProfitCents);
  if (money != null && (!Number.isSafeInteger(money) || money < 0)) return fail(['valid-cleared-profit-cents-required']);
  const evidenceRefs = uniq(providerEvidenceRefs);
  const paymentObserved = paymentObservationComplete === true && evidenceRefs.length > 0;
  const monetaryResultKnown = money != null && paymentObserved;

  if (cancelled) {
    return {
      ok: true,
      policyVersion: FOUNDER_OUTCOME_MISSION_VERSION,
      status: 'FOUNDER_OUTCOME_MISSION_CANCELLED',
      state: 'TERMINAL',
      missionId: mission.missionId,
      terminal: true,
      terminalResultAllowed: monetaryResultKnown,
      observedAt: observedAt.toISOString(),
      clearedContributionProfitCents: monetaryResultKnown ? money : null,
      providerEvidenceRefs: evidenceRefs,
      paymentObservationComplete: paymentObserved,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  }

  const beforeDeadline = observedAt.getTime() < deadline.getTime();
  const exhaustionValid = Boolean(
    exhaustionProof?.complete === true
    && Number.isSafeInteger(exhaustionProof?.admissibleBranchCount)
    && exhaustionProof.admissibleBranchCount > 0
    && Array.isArray(exhaustionProof?.proofRefs)
    && exhaustionProof.proofRefs.length > 0
  );

  if (beforeDeadline && !exhaustionValid) {
    return {
      ok: true,
      policyVersion: FOUNDER_OUTCOME_MISSION_VERSION,
      status: 'FOUNDER_OUTCOME_MISSION_ACTIVE',
      state: 'ACTIVE',
      missionId: mission.missionId,
      terminal: false,
      terminalResultAllowed: false,
      missionWindowClosed: false,
      observedAt: observedAt.toISOString(),
      deadlineAt: deadline.toISOString(),
      remainingMs: deadline.getTime() - observedAt.getTime(),
      currentObservedClearedContributionProfitCents: paymentObserved ? money : null,
      providerEvidenceRefs: evidenceRefs,
      paymentObservationComplete: paymentObserved,
      businessEffectAuthority: 'MISSION_SCOPED_EXISTING_GATES_ONLY',
      externalEffectAuthority: 'MISSION_SCOPED_EXISTING_GATES_ONLY',
      externalEffectLedger: zeroEffects(),
      truthBoundary: 'The mission deadline has not arrived. Current observed profit, including a provider-observed zero, is not the terminal result. Continue every admissible dependency-satisfied lane and preserve real external blockers as blockers rather than converting them into a finished mission.'
    };
  }

  if (beforeDeadline && exhaustionValid && !monetaryResultKnown) {
    return {
      ok: true,
      policyVersion: FOUNDER_OUTCOME_MISSION_VERSION,
      status: 'FOUNDER_OUTCOME_MISSION_EXHAUSTED_RECONCILIATION_REQUIRED',
      state: 'RECONCILIATION_REQUIRED',
      missionId: mission.missionId,
      terminal: false,
      terminalResultAllowed: false,
      missionWindowClosed: true,
      observedAt: observedAt.toISOString(),
      deadlineAt: deadline.toISOString(),
      clearedContributionProfitCents: null,
      providerEvidenceRefs: evidenceRefs,
      paymentObservationComplete: paymentObserved,
      exhaustionProof: {
        complete: true,
        admissibleBranchCount: exhaustionProof.admissibleBranchCount,
        proofRefs: uniq(exhaustionProof.proofRefs)
      },
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects(),
      truthBoundary: 'Execution branches are proof-completely exhausted, but the monetary outcome is still unknown until payment state is actually observed and reconciled. Unknown is not zero.'
    };
  }

  if (beforeDeadline && exhaustionValid) {
    return {
      ok: true,
      policyVersion: FOUNDER_OUTCOME_MISSION_VERSION,
      status: 'FOUNDER_OUTCOME_MISSION_EXHAUSTED_BEFORE_DEADLINE',
      state: 'TERMINAL',
      missionId: mission.missionId,
      terminal: true,
      terminalResultAllowed: true,
      missionWindowClosed: true,
      observedAt: observedAt.toISOString(),
      deadlineAt: deadline.toISOString(),
      clearedContributionProfitCents: money,
      providerEvidenceRefs: evidenceRefs,
      paymentObservationComplete: true,
      exhaustionProof: {
        complete: true,
        admissibleBranchCount: exhaustionProof.admissibleBranchCount,
        proofRefs: uniq(exhaustionProof.proofRefs)
      },
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects(),
      truthBoundary: 'Early terminalization is permitted only because complete admissible-branch exhaustion carries explicit proof references and the monetary state was independently observed. Missing or merely model-asserted branches do not satisfy this state.'
    };
  }

  if (!monetaryResultKnown) {
    return {
      ok: true,
      policyVersion: FOUNDER_OUTCOME_MISSION_VERSION,
      status: 'FOUNDER_OUTCOME_MISSION_DEADLINE_REACHED_RECONCILIATION_REQUIRED',
      state: 'RECONCILIATION_REQUIRED',
      missionId: mission.missionId,
      terminal: false,
      terminalResultAllowed: false,
      missionWindowClosed: true,
      observedAt: observedAt.toISOString(),
      deadlineAt: deadline.toISOString(),
      clearedContributionProfitCents: null,
      providerEvidenceRefs: evidenceRefs,
      paymentObservationComplete: paymentObserved,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects(),
      truthBoundary: 'The revenue window has closed, but provider-origin money has not been observed and reconciled sufficiently to state a terminal amount. Reconcile payment truth first; silence, missing credentials, or an unread provider state are UNKNOWN, never zero.'
    };
  }

  return {
    ok: true,
    policyVersion: FOUNDER_OUTCOME_MISSION_VERSION,
    status: 'FOUNDER_OUTCOME_MISSION_DEADLINE_REACHED',
    state: 'TERMINAL',
    missionId: mission.missionId,
    terminal: true,
    terminalResultAllowed: true,
    missionWindowClosed: true,
    observedAt: observedAt.toISOString(),
    deadlineAt: deadline.toISOString(),
    clearedContributionProfitCents: money,
    providerEvidenceRefs: evidenceRefs,
    paymentObservationComplete: true,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'The deadline has arrived and provider-origin payment state was actually observed. The terminal monetary result is bounded to the supplied reconciliation evidence; no pipeline, silence or internal claim is money.'
  };
}

export function compileFounderEconomicPulsePlan({
  mission,
  now = new Date(),
  zeroMarginalDiscoveryConfigured = false,
  outboundAuthorization = null,
  paymentReconciliationAvailable = true
} = {}) {
  const state = evaluateFounderOutcomeMission({ mission, now });
  if (!state.ok) return state;
  if (state.terminal) return {
    ok: true,
    policyVersion: FOUNDER_OUTCOME_MISSION_VERSION,
    status: 'FOUNDER_ECONOMIC_PULSE_NOT_REQUIRED',
    missionId: mission.missionId,
    jobs: [],
    terminal: true,
    externalEffectLedger: zeroEffects()
  };

  if (state.missionWindowClosed) {
    return {
      ok: true,
      policyVersion: FOUNDER_OUTCOME_MISSION_VERSION,
      status: 'FOUNDER_ECONOMIC_RECONCILIATION_PULSE_PLAN_READY',
      missionId: mission.missionId,
      deadlineAt: mission.deadlineAt,
      jobs: paymentReconciliationAvailable
        ? [{ type: 'payment.reconciliation.tick', payload: { limit: 20 }, consequenceClass: 'READ_ONLY_EXTERNAL' }]
        : [],
      outboundReady: false,
      reconciliationOnly: true,
      externalEffectLedger: zeroEffects(),
      truthBoundary: 'The revenue window is closed. New monetization effects are no longer scheduled for this mission; only payment reconciliation may continue until the monetary result is observed.'
    };
  }

  const jobs = [
    { type: 'prometheus.commercial.catalog', payload: {}, consequenceClass: 'LOCAL_PREPARATION' },
    { type: 'prometheus.commercial.tournament', payload: {}, consequenceClass: 'LOCAL_PREPARATION' },
    { type: 'prometheus.commercial_memory.contradiction_scan', payload: {}, consequenceClass: 'LOCAL_PREPARATION' },
    { type: 'replies.poll', payload: {}, consequenceClass: 'READ_ONLY_EXTERNAL' },
    { type: 'monitoring.process', payload: {}, consequenceClass: 'READ_ONLY_EXTERNAL' }
  ];
  if (paymentReconciliationAvailable) jobs.push({ type: 'payment.reconciliation.tick', payload: { limit: 20 }, consequenceClass: 'READ_ONLY_EXTERNAL' });
  if (zeroMarginalDiscoveryConfigured) jobs.push({ type: 'discovery.run', payload: { missionId: mission.missionId, zeroMarginalCostOnly: true }, consequenceClass: 'CONFIGURED_EXTERNAL_READ' });

  const outboundReady = Boolean(
    outboundAuthorization?.current === true
    && text(outboundAuthorization?.channel, 200)
    && text(outboundAuthorization?.audience, 500)
    && outboundAuthorization?.senderHealthVerified === true
    && outboundAuthorization?.suppressionRecheckRequired === true
  );
  if (outboundReady) jobs.push({
    type: 'outbound.process',
    payload: { missionId: mission.missionId, authorityRef: text(outboundAuthorization.authorityRef, 1000) || null },
    consequenceClass: 'AUTHORIZED_BUSINESS_OUTBOUND'
  });

  return {
    ok: true,
    policyVersion: FOUNDER_OUTCOME_MISSION_VERSION,
    status: 'FOUNDER_ECONOMIC_PULSE_PLAN_READY',
    missionId: mission.missionId,
    deadlineAt: mission.deadlineAt,
    jobs,
    outboundReady,
    reconciliationOnly: false,
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'This plan drives already-existing economic machinery while the mission is active. Including a job is not proof it executed. Outbound is omitted unless a current named-channel, named-audience authorization plus sender-health and suppression requirements are present.'
  };
}
