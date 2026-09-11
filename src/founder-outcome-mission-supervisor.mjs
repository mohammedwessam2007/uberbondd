import { compileFounderEconomicPulsePlan } from './founder-outcome-mission.mjs';
import { reconcilePaymentRenewalTruth } from './payment-renewal-truth.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FOUNDER_OUTCOME_MISSION_SUPERVISOR_VERSION = 'uberbond.founder-outcome-mission-supervisor.v1';
const MISSION_AUDIT_TYPE = 'founder_outcome_mission';
const PULSE_AUDIT_TYPE = 'founder_outcome_mission_pulse';
const NEXT_PULSE_MS = 60_000;
const cloneZero = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function rowTime(row) {
  const value = row?.createdAt || row?.timestamp || row?.updatedAt || row?.detail?.timestamp || row?.detail?.createdAt || null;
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

async function auditRows(store, type, limit = 2000) {
  if (!store || typeof store.list !== 'function') return [];
  const rows = await store.list('auditLog', { filters: { type }, limit });
  return Array.isArray(rows) ? rows : [];
}

export async function loadFounderOutcomeMission(store, missionId) {
  const id = text(missionId, 200);
  if (!id) return null;
  const rows = await auditRows(store, MISSION_AUDIT_TYPE, 1000);
  const matches = rows.filter(row => row?.detail?.missionId === id);
  const latest = matches.sort((a, b) => Date.parse(a?.createdAt || 0) - Date.parse(b?.createdAt || 0)).at(-1);
  if (!latest?.detail) return null;
  return { ok: true, ...latest.detail, state: latest.detail.state || 'ACTIVE' };
}

export async function observeFounderOutcomeClearedCash(store, mission, { now = new Date() } = {}) {
  if (!store || typeof store.list !== 'function' || !mission?.missionId) {
    return { clearedCashEvidenceComplete: false, netProviderClearedRevenueCents: null, currency: null, providerEvidenceRefs: [], reasonCodes: ['store-and-mission-required'] };
  }
  const startedAt = Date.parse(mission.startedAt || '');
  const deadlineAt = Date.parse(mission.deadlineAt || '');
  const observedAt = Math.min(now.getTime(), Number.isFinite(deadlineAt) ? deadlineAt : now.getTime());
  if (!Number.isFinite(startedAt) || !Number.isFinite(observedAt)) {
    return { clearedCashEvidenceComplete: false, netProviderClearedRevenueCents: null, currency: null, providerEvidenceRefs: [], reasonCodes: ['valid-mission-window-required'] };
  }

  const [orders, revenueEvents, auditLog] = await Promise.all([
    store.list('orders'), store.list('revenueEvents'), store.list('auditLog')
  ]);
  const missionRevenue = (Array.isArray(revenueEvents) ? revenueEvents : []).filter(row => {
    const at = rowTime(row);
    return at !== null && at >= startedAt && at <= observedAt;
  });
  if (!missionRevenue.length) {
    return {
      clearedCashEvidenceComplete: false,
      netProviderClearedRevenueCents: null,
      currency: null,
      providerEvidenceRefs: [],
      reasonCodes: ['no-provider-cleared-witness-in-mission-window'],
      truthBoundary: 'No canonical mission-window payment witness is not proof of zero. Provider-wide observation coverage is still required to claim a terminal zero.'
    };
  }

  const eventRefs = new Set(missionRevenue.map(row => text(row?.providerEventId, 400)).filter(Boolean));
  const leadIds = new Set(missionRevenue.map(row => text(row?.leadId, 200)).filter(Boolean));
  const missionOrders = (Array.isArray(orders) ? orders : []).filter(row => eventRefs.has(text(row?.providerEventId, 400)) || leadIds.has(text(row?.leadId, 200)));
  const missionAudit = (Array.isArray(auditLog) ? auditLog : []).filter(row => {
    const detail = row?.detail && typeof row.detail === 'object' ? row.detail : row;
    if (row?.type === 'payment_classification' || detail?.type === 'payment_classification') {
      const ref = `${text(detail?.eventName, 120)}:${text(detail?.eventId, 200)}`;
      return eventRefs.has(ref);
    }
    if (row?.type === 'payment_retention_risk' || detail?.type === 'payment_retention_risk') {
      return leadIds.has(text(detail?.leadId, 200));
    }
    return false;
  });
  const truth = reconcilePaymentRenewalTruth({ orders: missionOrders, revenueEvents: missionRevenue, auditLog: missionAudit });
  const refs = Array.isArray(truth?.verifiedProviderEventRefs) ? truth.verifiedProviderEventRefs.map(ref => `payment:${ref}`) : [];
  const net = Number(truth?.economics?.netProviderClearedRevenueCents);
  const proven = truth?.status === 'PROVIDER_CLEARED_PAYMENT_PROVEN'
    && Number.isSafeInteger(net)
    && refs.length > 0
    && (!Array.isArray(truth?.contradictions) || truth.contradictions.length === 0);
  return {
    clearedCashEvidenceComplete: proven,
    netProviderClearedRevenueCents: proven ? net : null,
    currency: proven ? (truth?.economics?.currency || null) : null,
    providerEvidenceRefs: proven ? refs : [],
    paymentTruthStatus: truth?.status || null,
    paymentTruthDigest: truth?.truthDigest || null,
    reasonCodes: proven ? [] : ['mission-window-provider-cleared-money-not-proven'],
    truthBoundary: proven
      ? 'This is canonical provider-cleared cash observed inside the mission window. It is not automatically contribution profit; unknown variable costs must not be silently treated as zero.'
      : 'Unproven or contradictory payment state remains UNKNOWN, never zero.'
  };
}

export async function runFounderOutcomeMissionSupervisor({
  store,
  enqueueJob,
  missionId,
  now = new Date(),
  zeroMarginalDiscoveryConfigured = false,
  outboundAuthorization = null,
  paymentReconciliationAvailable = true
} = {}) {
  if (!store || typeof store.log !== 'function' || typeof enqueueJob !== 'function') {
    return { ok:false, status:'FOUNDER_OUTCOME_MISSION_SUPERVISOR_REFUSED', reasonCodes:['store-and-enqueue-required'], externalEffectLedger:cloneZero() };
  }
  const mission = await loadFounderOutcomeMission(store, missionId);
  if (!mission || mission.state !== 'ACTIVE') {
    return { ok:true, status:'NO_ACTIVE_FOUNDER_OUTCOME_MISSION', missionId:text(missionId,200)||null, jobsQueued:[], externalEffectLedger:cloneZero() };
  }

  const cash = await observeFounderOutcomeClearedCash(store, mission, { now });
  const plan = compileFounderEconomicPulsePlan({ mission, now, zeroMarginalDiscoveryConfigured, outboundAuthorization, paymentReconciliationAvailable });
  if (!plan.ok) return plan;

  const jobsQueued = [];
  const jobFailures = [];
  const bucket = Math.floor(now.getTime() / 60_000);
  for (const job of plan.jobs) {
    try {
      const queued = await enqueueJob(job.type, { ...(job.payload || {}), missionId: mission.missionId }, {
        maxAttempts: job.type === 'payment.reconciliation.tick' ? 5 : 3,
        dedupeKey: `founder-mission:${mission.missionId}:${job.type}:${bucket}`,
        priority: 100
      });
      jobsQueued.push({ type:job.type, consequenceClass:job.consequenceClass, jobId:queued?.id || null });
    } catch (error) {
      jobFailures.push({ type:job.type, reason:text(error?.message,300) || 'enqueue-failed' });
    }
  }

  let nextPulse = null;
  try {
    const nextAt = new Date(now.getTime() + NEXT_PULSE_MS);
    const queued = await enqueueJob('founder.outcome.mission.pulse', { missionId:mission.missionId }, {
      runAt: nextAt,
      maxAttempts: 3,
      priority: 110,
      dedupeKey: `founder-mission:${mission.missionId}:pulse:${Math.floor(nextAt.getTime()/60_000)}`
    });
    nextPulse = { jobId:queued?.id || null, runAt:nextAt.toISOString() };
  } catch (error) {
    jobFailures.push({ type:'founder.outcome.mission.pulse', reason:text(error?.message,300) || 'next-pulse-enqueue-failed' });
  }

  const receipt = {
    ok:true,
    policyVersion:FOUNDER_OUTCOME_MISSION_SUPERVISOR_VERSION,
    status:nextPulse ? 'FOUNDER_OUTCOME_MISSION_SUPERVISOR_CONTINUING' : 'FOUNDER_OUTCOME_MISSION_SUPERVISOR_DEGRADED',
    missionId:mission.missionId,
    observedAt:now.toISOString(),
    deadlineAt:mission.deadlineAt,
    missionWindowClosed:now.getTime() >= Date.parse(mission.deadlineAt || ''),
    observedNetProviderClearedRevenueCents:cash.netProviderClearedRevenueCents,
    observedCurrency:cash.currency,
    providerEvidenceRefs:cash.providerEvidenceRefs,
    clearedCashEvidenceComplete:cash.clearedCashEvidenceComplete,
    jobsQueued,
    jobFailures,
    nextPulse,
    terminal:false,
    externalEffectLedger:cloneZero(),
    truthBoundary:'The supervisor keeps an unresolved founder outcome mission alive and repeatedly drives existing economic machinery. A scheduled pulse is not an economic outcome. Provider-cleared cash is surfaced only from canonical witnesses, and missing observation never becomes zero.'
  };
  await store.log(PULSE_AUDIT_TYPE, receipt);
  return receipt;
}
