import crypto from 'node:crypto';

import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { advanceLeadPathSprint, LEAD_PATH_SPRINT_SKU } from './lead-path-sprint-fulfillment.mjs';

export const FIRST_CASH_PROSPECT_COMPLETION_VERSION = 'uberbond.first-cash-prospect-completion.v1.0.1';

const effects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = value => new Date(value || Date.now()).toISOString();

function blocked(reasonCodes, extra = {}) {
  return {
    ok: false,
    status: 'FIRST_CASH_PROSPECT_COMPLETION_BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: effects(),
    ...extra
  };
}

function qaEvidence(prospect = {}) {
  const audit = Array.isArray(prospect.audit) ? prospect.audit : [];
  const evidence = audit.filter(item =>
    text(item?.evidenceUrl, 1000)
    && text(item?.evidenceExcerpt, 1000)
    && Number.isFinite(Number(item?.confidence))
    && Number(item.confidence) >= 0
    && Number(item.confidence) <= 1
    && Number.isFinite(Number(item?.severity))
  );
  const dossierOk = prospect.dossier && typeof prospect.dossier === 'object' && !Array.isArray(prospect.dossier);
  const completedAt = text(prospect.completedAt, 80);
  const reasons = [];
  if (!completedAt || Number.isNaN(Date.parse(completedAt))) reasons.push('research-completion-timestamp-required');
  if (!dossierOk) reasons.push('durable-dossier-required');
  if (!evidence.length) reasons.push('at-least-one-traceable-finding-required');
  return {
    ok: reasons.length === 0,
    reasonCodes: reasons,
    evidenceCount: evidence.length,
    qaDigest: digest({
      prospectId: prospect.id,
      completedAt,
      dossier: prospect.dossier || null,
      evidence: evidence.map(item => ({
        code: item.code || null,
        evidenceUrl: item.evidenceUrl,
        evidenceExcerpt: item.evidenceExcerpt,
        confidence: Number(item.confidence),
        severity: Number(item.severity)
      }))
    })
  };
}

async function notifyOnce(store, { type, leadId, prospectId, title, detail }) {
  if (typeof store?.findOne !== 'function' || typeof store?.add !== 'function') return null;
  const existing = await store.findOne('notifications', { type, leadId });
  if (existing) return existing;
  return store.add('notifications', {
    id: `note_${crypto.randomBytes(10).toString('hex')}`,
    type,
    leadId,
    prospectId,
    title,
    status: 'unread',
    detail,
    createdAt: new Date().toISOString()
  });
}

/**
 * Route a completed prospect through exactly one completion regime.
 * Generic/public-audit prospects keep the existing RevenueEngine path.
 * Paid first-cash prospects never enter generic auto-report delivery: their
 * persisted sprint is advanced through work-complete and deterministic QA only.
 * A QA_REQUIRED state is intentionally re-enterable so newly persisted research
 * evidence can be checked again after an earlier QA miss without replaying work
 * transitions or falling through to generic delivery.
 * The terminal internal state is DELIVERY_READY. DELIVERED and
 * CUSTOMER_ACCEPTED remain separate boundaries and CUSTOMER_ACCEPTED still
 * requires customer-bound external evidence in lead-path-sprint-fulfillment.
 */
export async function routeProspectCompletion({ store, revenue, prospect, date = new Date() } = {}) {
  if (!prospect?.firstCashFulfillment) {
    if (typeof revenue?.onProspectComplete === 'function') {
      await revenue.onProspectComplete(prospect);
      return {
        ok: true,
        status: 'GENERIC_PROSPECT_COMPLETION_DELEGATED',
        businessEffectAuthority: 'NONE',
        externalEffectLedger: effects()
      };
    }
    return blocked(['revenue-completion-handler-required']);
  }

  if (!store || typeof store.get !== 'function' || typeof store.patch !== 'function' || typeof store.log !== 'function') {
    return blocked(['durable-store-required']);
  }

  const state = prospect.firstCashFulfillment;
  const leadId = text(prospect.leadId, 200);
  const prospectId = text(prospect.id, 200);
  if (!leadId || !prospectId) return blocked(['paid-sprint-lead-prospect-binding-required']);
  const lead = await store.get('leads', leadId);
  if (!lead || text(lead.prospectId, 200) !== prospectId) return blocked(['paid-sprint-durable-lead-binding-required']);
  if (text(lead.deliveryMode, 80) !== 'paid-sprint') return blocked(['paid-sprint-delivery-mode-required']);
  if (text(lead.paidSprintSku, 200) !== LEAD_PATH_SPRINT_SKU) return blocked(['paid-sprint-sku-binding-required']);
  if (text(lead.paidSprintId, 240) !== text(state.sprintId, 240)) return blocked(['paid-sprint-id-binding-mismatch']);

  if (state.status === 'DELIVERY_READY') {
    return {
      ok: true,
      status: 'FIRST_CASH_DELIVERY_ALREADY_READY',
      leadId,
      prospectId,
      sprintId: state.sprintId,
      sprintStatus: state.status,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: effects(),
      truthBoundary: 'DELIVERY_READY_IS_NOT_DELIVERED_OR_CUSTOMER_ACCEPTED'
    };
  }
  if (!['INPUT_READY', 'QA_REQUIRED'].includes(state.status)) {
    return blocked([`unexpected-paid-sprint-state:${text(state.status, 80)}`]);
  }

  const at = iso(date);
  let current = state;
  if (current.status === 'INPUT_READY') {
    for (const target of ['ANALYSIS_RUNNING', 'QA_REQUIRED']) {
      const moved = advanceLeadPathSprint({ state: current, to: target, at });
      if (!moved?.ok || !moved?.state) return blocked([`paid-sprint-transition-failed:${target}`, ...(moved?.reasonCodes || [])]);
      current = moved.state;
    }
  }

  const qa = qaEvidence(prospect);
  if (!qa.ok) {
    await store.patch('prospects', prospectId, {
      firstCashFulfillment: current,
      paidSprintDeliveryStatus: 'QA_REQUIRED',
      paidSprintQaReasonCodes: qa.reasonCodes,
      paidSprintQaCheckedAt: at
    });
    await store.patch('leads', leadId, {
      status: 'qa-required',
      deliveryMode: 'paid-sprint',
      paidSprintQaCheckedAt: at
    });
    await store.log('first_cash_fulfillment_qa_required', {
      policyVersion: FIRST_CASH_PROSPECT_COMPLETION_VERSION,
      leadId,
      prospectId,
      sprintId: current.sprintId,
      qaDigest: qa.qaDigest,
      reasonCodes: qa.reasonCodes,
      evidenceCount: qa.evidenceCount,
      externalEffects: 0
    });
    await notifyOnce(store, {
      type: 'paid_sprint_qa_required',
      leadId,
      prospectId,
      title: `Paid sprint needs QA review: ${lead.company || leadId}`,
      detail: { reasonCodes: qa.reasonCodes, sprintId: current.sprintId }
    });
    return {
      ok: false,
      status: 'FIRST_CASH_QA_REQUIRED',
      reasonCodes: qa.reasonCodes,
      leadId,
      prospectId,
      sprintId: current.sprintId,
      sprintStatus: current.status,
      qaDigest: qa.qaDigest,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: effects(),
      truthBoundary: 'FAILED_INTERNAL_QA_CANNOT_BECOME_DELIVERY_READY'
    };
  }

  const qaPass = advanceLeadPathSprint({
    state: current,
    to: 'QA_PASSED',
    qaEvidenceRef: `qa:first-cash:${qa.qaDigest}`,
    at
  });
  if (!qaPass?.ok || !qaPass?.state) return blocked(['paid-sprint-qa-pass-transition-failed', ...(qaPass?.reasonCodes || [])]);
  current = qaPass.state;
  const ready = advanceLeadPathSprint({ state: current, to: 'DELIVERY_READY', at });
  if (!ready?.ok || !ready?.state) return blocked(['paid-sprint-delivery-ready-transition-failed', ...(ready?.reasonCodes || [])]);
  current = ready.state;

  const artifactRefs = (Array.isArray(prospect.audit) ? prospect.audit : [])
    .filter(item => text(item?.evidenceUrl, 1000) && text(item?.evidenceExcerpt, 1000))
    .slice(0, 12)
    .map(item => `evidence:${digest({ code: item.code || null, url: item.evidenceUrl, excerpt: item.evidenceExcerpt }).slice(0, 32)}`);

  await store.patch('prospects', prospectId, {
    firstCashFulfillment: current,
    paidSprintDeliveryStatus: 'DELIVERY_READY',
    paidSprintQaDigest: qa.qaDigest,
    paidSprintQaReasonCodes: [],
    paidSprintQaCheckedAt: at,
    paidSprintArtifactRefs: artifactRefs,
    paidSprintDeliveryReadyAt: at
  });
  await store.patch('leads', leadId, {
    status: 'delivery-ready',
    deliveryMode: 'paid-sprint',
    paidSprintDeliveryReadyAt: at,
    paidSprintQaDigest: qa.qaDigest
  });
  await store.log('first_cash_delivery_ready', {
    policyVersion: FIRST_CASH_PROSPECT_COMPLETION_VERSION,
    leadId,
    prospectId,
    sprintId: current.sprintId,
    sku: LEAD_PATH_SPRINT_SKU,
    qaDigest: qa.qaDigest,
    evidenceCount: qa.evidenceCount,
    artifactRefs,
    sprintStatus: current.status,
    commercialDeliveryCount: Number(current.commercialDeliveryCount || 0),
    externalEffects: 0
  });
  await notifyOnce(store, {
    type: 'paid_sprint_delivery_ready',
    leadId,
    prospectId,
    title: `Paid sprint delivery ready: ${lead.company || leadId}`,
    detail: { sprintId: current.sprintId, qaDigest: qa.qaDigest, artifactRefs }
  });

  return {
    ok: true,
    status: 'FIRST_CASH_DELIVERY_READY',
    leadId,
    prospectId,
    sprintId: current.sprintId,
    sprintStatus: current.status,
    qaDigest: qa.qaDigest,
    artifactRefs,
    commercialDeliveryCount: Number(current.commercialDeliveryCount || 0),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: effects(),
    truthBoundary: 'DELIVERY_READY_IS_NOT_DELIVERED_OR_CUSTOMER_ACCEPTED'
  };
}
