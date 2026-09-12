import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileCognitiveEvent } from './uberbond-cognitive-bus.mjs';

export const AUTONOMIC_CIRCULATION_VERSION = 'uberbond.autonomic-circulation.v1.1';
const SHA40 = /^[a-f0-9]{40}$/i;
const FIVE_MINUTES = 5 * 60_000;
const THIRTY_MINUTES = 30 * 60_000;
const zero = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
const digest = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const when = value => {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : null;
};
const stale = (receipt, nowMs, maxAgeMs) => {
  const observed = when(receipt?.observedAt || receipt?.generatedAt);
  return observed == null || nowMs - observed > maxAgeMs;
};
const uniqueJobs = jobs => {
  const seen = new Set();
  return jobs.filter(job => {
    const key = `${job.type}:${job.dedupeKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const job = (type, dedupeKey, payload = {}, priority = 50) => ({
  type,
  dedupeKey,
  payload,
  priority,
  maxAttempts: 3,
  consequenceClass: 'LOCAL_PREPARATION',
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE'
});
function fail(reasonCodes, status = 'AUTONOMIC_CIRCULATION_REFUSED') {
  return { ok:false, policyVersion:AUTONOMIC_CIRCULATION_VERSION, status, reasonCodes:[...new Set(reasonCodes)], businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zero() };
}
function cognitiveDigest(receipt) {
  if (!receipt?.cycleDigest || !receipt?.sourceCommit) return null;
  return digest({ sourceCommit:receipt.sourceCommit, cycleDigest:receipt.cycleDigest, targetCounts:receipt.targetCounts || {}, eventCount:receipt.eventCount || 0, activationCount:receipt.activationCount || 0 });
}
function hasEffects(receipt) {
  const ledger=receipt?.externalEffectLedger;
  return ledger && typeof ledger==='object' && Object.values(ledger).some(value=>Number(value)>0);
}
function zeroAuthorityReceipt(receipt) {
  if (!receipt) return true;
  const business=String(receipt.businessEffectAuthority || 'NONE').toUpperCase();
  const external=String(receipt.externalEffectAuthority || 'NONE').toUpperCase();
  return business==='NONE' && external==='NONE' && !hasEffects(receipt);
}

export function compileAutonomicCirculationPlan({
  sourceCommit,
  cognitive = null,
  metabolism = null,
  revenue = null,
  capabilityPlan = null,
  commercialCatalog = null,
  contradictionScan = null,
  feedback = null,
  now = new Date()
} = {}) {
  const source = text(sourceCommit, 40)?.toLowerCase();
  if (!source || !SHA40.test(source)) return fail(['exact-source-commit-required']);
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) return fail(['valid-now-required']);
  const nowMs = date.getTime();
  const jobs = [];
  const cognitiveCurrent = cognitive?.sourceCommit === source && zeroAuthorityReceipt(cognitive) && !stale(cognitive, nowMs, FIVE_MINUTES);
  if (!cognitiveCurrent) {
    jobs.push(job('autonomic.cognitive.refresh', `cognitive:${source}:${Math.floor(nowMs / FIVE_MINUTES)}`, { sourceCommit:source }, 100));
  }

  const cycleIdentity = cognitiveCurrent ? cognitiveDigest(cognitive) : null;
  if (cycleIdentity) {
    const targets = cognitive?.targetCounts && typeof cognitive.targetCounts === 'object' ? cognitive.targetCounts : {};
    const target = id => Number(targets[id] || 0);
    const metabolismDemand = target('genesis-metabolism') + target('wallbreaker') + target('max-council') + target('genesis');
    if (metabolismDemand > 0 && metabolism?.inputDigest !== cycleIdentity) {
      jobs.push(job('autonomic.metabolism.plan', `metabolism:${cycleIdentity}`, {
        sourceCommit:source,
        cognitiveDigest:cycleIdentity,
        objective:'Convert current cognitive activations and blockers into the highest-value reversible evidence-producing strategy without widening authority.',
        targetCounts:targets,
        eventSummaries:Array.isArray(cognitive.eventSummaries) ? cognitive.eventSummaries.slice(0, 24) : []
      }, 90));
    }
    if (target('capability-genome') > 0 && capabilityPlan?.inputDigest !== cycleIdentity) {
      jobs.push(job('prometheus.capability_genome.plan', `capability:${cycleIdentity}`, { budget:{ maxSources:20, maxRecordsPerSource:100 }, autonomicInputDigest:cycleIdentity }, 65));
    }
    if (target('economic-memory') > 0 && contradictionScan?.inputDigest !== cycleIdentity) {
      jobs.push(job('prometheus.commercial_memory.contradiction_scan', `contradictions:${cycleIdentity}`, { autonomicInputDigest:cycleIdentity }, 60));
    }
    const commercialDemand = target('business-genome') + target('opportunity-factory') + target('event-horizon') + target('economic-memory');
    if (commercialDemand > 0 && commercialCatalog?.inputDigest !== cycleIdentity) {
      jobs.push(job('prometheus.commercial.catalog', `catalog:${cycleIdentity}`, { date:date.toISOString(), autonomicInputDigest:cycleIdentity }, 70));
    }
  }

  const revenueCurrent = revenue?.sourceCommit === source && zeroAuthorityReceipt(revenue) && !stale(revenue, nowMs, THIRTY_MINUTES);
  if (!revenueCurrent) {
    jobs.push(job('autonomic.revenue.paper', `revenue:${source}:${Math.floor(nowMs / THIRTY_MINUTES)}`, { sourceCommit:source }, 75));
  }

  const feedbackNeedsRefresh = feedback?.sourceCommit !== source
    || feedback?.cognitiveDigest !== (cycleIdentity || null)
    || feedback?.metabolismReceiptId !== (metabolism?.receiptId || null)
    || feedback?.revenueReceiptId !== (revenue?.receiptId || null);
  if (feedbackNeedsRefresh && (metabolism?.receiptId || revenue?.receiptId)) {
    jobs.push(job('autonomic.feedback.compile', `feedback:${digest({source,cycleIdentity,metabolism:metabolism?.receiptId||null,revenue:revenue?.receiptId||null})}`, {
      sourceCommit:source,
      cognitiveDigest:cycleIdentity,
      metabolismReceiptId:metabolism?.receiptId || null,
      revenueReceiptId:revenue?.receiptId || null
    }, 85));
  }

  const plan = {
    schemaVersion:AUTONOMIC_CIRCULATION_VERSION,
    observedAt:date.toISOString(),
    sourceCommit:source,
    cognitiveCurrent,
    cognitiveDigest:cycleIdentity,
    revenueCurrent,
    jobs:uniqueJobs(jobs),
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    externalEffectLedger:zero(),
    truthBoundary:'Autonomic circulation may schedule only existing local-preparation or read/reconciliation work. It cannot create messaging, payment, deployment, credential, customer, production-mutation or founder-identity authority.'
  };
  plan.planDigest = digest(plan);
  return { ok:true, status:plan.jobs.length ? 'AUTONOMIC_CIRCULATION_WORK_READY' : 'AUTONOMIC_CIRCULATION_STABLE', plan, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zero() };
}

export function compileAutonomicFeedback({ sourceCommit, cognitive = null, metabolism = null, revenue = null, observedAt = new Date() } = {}) {
  const source = text(sourceCommit, 40)?.toLowerCase();
  if (!source || !SHA40.test(source)) return fail(['exact-source-commit-required'], 'AUTONOMIC_FEEDBACK_REFUSED');
  const date = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (!Number.isFinite(date.getTime())) return fail(['valid-observed-at-required'], 'AUTONOMIC_FEEDBACK_REFUSED');
  if (metabolism?.receiptId && !zeroAuthorityReceipt(metabolism)) return fail(['zero-authority-metabolism-receipt-required'],'AUTONOMIC_FEEDBACK_REFUSED');
  if (revenue?.receiptId && !zeroAuthorityReceipt(revenue)) return fail(['zero-authority-revenue-receipt-required'],'AUTONOMIC_FEEDBACK_REFUSED');
  const events = [];
  if (metabolism?.receiptId) {
    const event = compileCognitiveEvent({
      kind:'METABOLISM_UPDATE',
      sourceNodeId:'genesis-metabolism',
      subjectType:'AUTONOMIC_METABOLISM',
      subjectId:metabolism.receiptId,
      summary:`Autonomic metabolism ${metabolism.status || 'updated'}; selected=${metabolism.selectedCandidateId || 'none'}; missing strategy families=${(metabolism.missingFamilies || []).join(',') || 'none'}.`,
      evidenceRefs:[`receipt:autonomic-metabolism:${metabolism.receiptId}`],
      truthClass:'VERIFIED_LOCAL_RECEIPT',
      observedAt:date
    });
    if (!event.ok) return fail(['metabolism-feedback-event-invalid', ...(event.reasonCodes || [])], 'AUTONOMIC_FEEDBACK_REFUSED');
    events.push(event);
  }
  if (revenue?.receiptId) {
    const event = compileCognitiveEvent({
      kind:'ECONOMIC_LEARNING',
      sourceNodeId:'economic-memory',
      subjectType:'REVENUE_METHOD_PORTFOLIO',
      subjectId:revenue.receiptId,
      summary:`Revenue Method Exchange paper canaries: ${(revenue.canaries || []).join(',') || 'none'}; forecasts remain hypotheses until cleared payment plus accepted delivery.`,
      evidenceRefs:[`receipt:autonomic-revenue:${revenue.receiptId}`],
      truthClass:'RESEARCH_ASSET',
      observedAt:date
    });
    if (!event.ok) return fail(['revenue-feedback-event-invalid', ...(event.reasonCodes || [])], 'AUTONOMIC_FEEDBACK_REFUSED');
    events.push(event);
  }
  const bundle = {
    schemaVersion:'uberbond.autonomic-feedback-events.v1',
    observedAt:date.toISOString(),
    sourceCommit:source,
    cognitiveDigest:cognitive?.cycleDigest || null,
    metabolismReceiptId:metabolism?.receiptId || null,
    revenueReceiptId:revenue?.receiptId || null,
    events,
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    externalEffectLedger:zero()
  };
  bundle.feedbackDigest = digest(bundle);
  return { ok:true, status:'AUTONOMIC_FEEDBACK_READY', bundle, businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:zero() };
}
