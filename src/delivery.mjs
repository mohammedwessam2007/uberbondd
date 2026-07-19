import { id, normalizeDomain } from './utils.mjs';

export const DELIVERY_STATES = Object.freeze([
  'delivery-queued', 'awaiting-inputs', 'ready', 'in-progress',
  'ready-for-review', 'on-hold', 'delivered', 'cancelled'
]);

export const REVISION_STATES = Object.freeze([
  'not-requested', 'requested', 'in-progress', 'completed', 'declined'
]);

const DELIVERY_STATE_SET = new Set(DELIVERY_STATES);
const REVISION_STATE_SET = new Set(REVISION_STATES);
const VERIFIED_PAYMENT_SOURCES = new Set(['verified-webhook', 'manual-owner', 'test-simulation']);
const ITEM_STATES = new Set(['pending', 'in-progress', 'completed', 'blocked']);
const INPUT_STATES = new Set(['pending', 'received', 'not-required']);
const PROOF_KINDS = new Set(['url', 'artifact', 'commit', 'document', 'note']);
const STRONG_PROOF_KINDS = new Set(['url', 'artifact', 'commit', 'document']);

const DELIVERY_TRANSITIONS = Object.freeze({
  'delivery-queued': new Set(['awaiting-inputs', 'ready', 'on-hold', 'cancelled']),
  'awaiting-inputs': new Set(['ready', 'on-hold', 'cancelled']),
  ready: new Set(['in-progress', 'on-hold', 'cancelled']),
  'in-progress': new Set(['ready-for-review', 'on-hold', 'cancelled']),
  'ready-for-review': new Set(['in-progress', 'delivered', 'on-hold', 'cancelled']),
  'on-hold': new Set(['delivery-queued', 'awaiting-inputs', 'ready', 'in-progress', 'ready-for-review', 'cancelled']),
  delivered: new Set(),
  cancelled: new Set()
});

const REVISION_TRANSITIONS = Object.freeze({
  'not-requested': new Set(['requested']),
  requested: new Set(['in-progress', 'declined']),
  'in-progress': new Set(['completed']),
  completed: new Set(['requested']),
  declined: new Set(['requested'])
});

const TEMPLATES = Object.freeze({
  diagnostic: {
    deadlineDays: 5,
    checklist: [
      ['revalidate-evidence', 'Revalidate the stored website evidence against the affected page'],
      ['review-findings', 'Review the complete evidence-backed audit and approved diagnostic scope'],
      ['prioritize-actions', 'Prepare a concise prioritized diagnostic with effort and impact context'],
      ['quality-assurance', 'Verify every delivery claim against stored evidence and remove unsupported language'],
      ['prepare-package', 'Prepare the owner-reviewed delivery package and proof record']
    ],
    inputs: [
      ['authorized-recipient', 'Confirm the customer-authorized delivery recipient'],
      ['business-priorities', 'Confirm any business priorities needed to order the recommendations']
    ]
  },
  'implementation-sprint': {
    deadlineDays: 10,
    checklist: [
      ['confirm-authorization', 'Confirm written customer authorization and exact approved implementation scope'],
      ['confirm-access', 'Confirm access, backup ownership, rollback path, and responsible customer contact'],
      ['capture-baseline', 'Capture before-state evidence for the selected issue'],
      ['implement-scope', 'Implement only the approved scope through an owner-controlled manual workflow'],
      ['quality-assurance', 'Run functional, responsive, accessibility, and regression checks'],
      ['prepare-package', 'Prepare before-and-after evidence, change notes, rollback notes, and delivery proof']
    ],
    inputs: [
      ['written-authorization', 'Written authorization for the exact customer-site change'],
      ['access-provisioned', 'Customer-provisioned least-privilege access or a customer-side implementer'],
      ['backup-and-rollback', 'Confirmed backup owner and rollback process'],
      ['brand-and-technical-constraints', 'Relevant brand, platform, compliance, and technical constraints']
    ]
  },
  monitoring: {
    deadlineDays: 3,
    checklist: [
      ['confirm-monitoring-scope', 'Confirm the approved public pages and evidence signals to monitor'],
      ['capture-baseline', 'Capture a deterministic baseline for the selected issue'],
      ['schedule-checks', 'Schedule internal public-site checks without changing the customer website'],
      ['review-results', 'Review detected changes and suppress unsupported conclusions'],
      ['prepare-package', 'Prepare the monitoring summary and proof record']
    ],
    inputs: [
      ['authorized-recipient', 'Confirm the customer-authorized monitoring recipient'],
      ['monitoring-scope', 'Confirm the approved public URLs and reporting cadence'],
      ['change-context', 'Provide known launch or maintenance windows when relevant']
    ]
  }
});

export class DeliveryError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'DeliveryError';
    this.code = code;
  }
}

function clean(value = '', maximum = 500) {
  return String(value || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function validHttpUrl(value, code) {
  const raw = clean(value, 1000);
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('unsafe');
    return raw;
  } catch {
    throw new DeliveryError(code);
  }
}

function deadline(at, days) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) throw new DeliveryError('delivery-payment-date-invalid');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function items(template = []) {
  return template.map(([itemId, title]) => ({ id: itemId, title, status: 'pending' }));
}

function matchingScreenshot(offer = {}, prospect = {}) {
  const issue = prospect.issue || {};
  const sameEvidence = clean(issue.evidenceUrl, 1000) === clean(offer.issue?.evidenceUrl, 1000)
    && clean(issue.evidenceExcerpt, 500) === clean(offer.issue?.evidenceExcerpt, 500);
  return sameEvidence ? clean(issue.screenshotReference || issue.screenshots?.desktop || issue.screenshots?.mobile, 1000) : '';
}

function assertVerifiedPayment({ offer = {}, order = {}, prospect = {} } = {}) {
  if (!offer.id || offer.paymentState !== 'paid' || offer.ownerApproval?.status !== 'approved') throw new DeliveryError('delivery-paid-offer-required');
  if (!order.id || order.offerId !== offer.id || order.paymentState !== 'paid' || order.verified !== true) throw new DeliveryError('delivery-verified-order-required');
  if (!VERIFIED_PAYMENT_SOURCES.has(order.verificationSource)) throw new DeliveryError('delivery-payment-source-invalid');
  if (order.provider !== offer.provider || Boolean(order.testMode) !== (offer.providerMode === 'test')) throw new DeliveryError('delivery-payment-mode-mismatch');
  if (Number(order.amountCents) !== Number(offer.amountCents) || String(order.currency || '').toUpperCase() !== offer.currency) {
    throw new DeliveryError('delivery-payment-value-mismatch');
  }
  if (!clean(order.providerReference, 240)) throw new DeliveryError('delivery-payment-reference-required');
  if (!prospect.id || prospect.id !== offer.prospectId || prospect.campaignId !== offer.campaignId) throw new DeliveryError('delivery-prospect-mismatch');
  if (!clean(offer.scope, 1200) || !clean(offer.issue?.title, 220) || !clean(offer.issue?.evidenceExcerpt, 500)) {
    throw new DeliveryError('delivery-scope-evidence-required');
  }
}

export function createDeliveryRecord({ offer = {}, order = {}, prospect = {}, lead = null } = {}, at = order.occurredAt || new Date().toISOString()) {
  prospect = prospect || {};
  lead = lead || null;
  assertVerifiedPayment({ offer, order, prospect });
  const template = TEMPLATES[offer.type];
  if (!template) throw new DeliveryError('delivery-offer-type-invalid');
  const company = clean(prospect.company || lead?.company, 180);
  if (!company) throw new DeliveryError('delivery-customer-required');
  const website = validHttpUrl(prospect.website || lead?.website, 'delivery-website-invalid');
  const evidenceUrl = validHttpUrl(offer.issue.evidenceUrl, 'delivery-evidence-url-invalid');
  const websiteDomain = normalizeDomain(website);
  const evidenceDomain = normalizeDomain(evidenceUrl);
  if (!websiteDomain || !evidenceDomain || (evidenceDomain !== websiteDomain && !evidenceDomain.endsWith(`.${websiteDomain}`))) {
    throw new DeliveryError('delivery-evidence-domain-mismatch');
  }
  const implementationChecklist = items(template.checklist);
  const requiredCustomerInputs = items(template.inputs);
  const exclusions = [...new Set((offer.exclusions || []).map(value => clean(value, 240)).filter(Boolean))].slice(0, 12);
  const selectedIssue = {
    title: clean(offer.issue.title, 220),
    service: clean(offer.issue.service, 160)
  };
  const evidence = {
    url: evidenceUrl,
    excerpt: clean(offer.issue.evidenceExcerpt, 500),
    screenshotReference: matchingScreenshot(offer, prospect),
    issueRef: clean(offer.issueRef, 80),
    confidence: Number(prospect.issue?.confidence || 0),
    severity: Number(prospect.issue?.severity || 0)
  };
  const deliveryId = id('delivery');
  return {
    id: deliveryId,
    offerId: offer.id,
    orderId: order.id,
    paymentEventId: clean(order.providerEventId, 240),
    campaignId: offer.campaignId,
    prospectId: offer.prospectId,
    leadId: offer.leadId || null,
    customer: { name: company, prospectId: offer.prospectId, leadId: offer.leadId || null },
    website,
    selectedIssue,
    evidence,
    approvedScope: clean(offer.scope, 1200),
    exclusions,
    amountPaid: { amountCents: Number(offer.amountCents), currency: offer.currency },
    payment: {
      provider: offer.provider,
      providerReference: clean(order.providerReference, 240),
      verificationSource: order.verificationSource,
      state: 'paid',
      testMode: order.testMode === true,
      verifiedAt: at,
      lastEventId: clean(order.providerEventId, 240)
    },
    deliveryDeadline: deadline(at, template.deadlineDays),
    implementationChecklist,
    requiredCustomerInputs,
    status: 'delivery-queued',
    statusHistory: [{ from: '', to: 'delivery-queued', source: 'verified-payment', at }],
    proofOfDelivery: { status: 'pending', references: [], deliveredAt: null },
    revision: { status: 'not-requested', count: 0, notes: [] },
    siteChangeAuthorization: {
      accessConfirmed: false,
      writtenAuthorizationConfirmed: false,
      automaticModificationAllowed: false
    },
    implementationBrief: {
      title: `${offer.name}: ${company}`,
      objective: `Address only the approved scope tied to “${selectedIssue.title}”.`,
      website,
      selectedIssue,
      evidence,
      approvedScope: clean(offer.scope, 1200),
      exclusions,
      steps: implementationChecklist.map(item => item.title),
      requiredCustomerInputs: requiredCustomerInputs.map(item => item.title),
      constraints: [
        'Do not modify the customer website without separately verified access and written authorization.',
        'Do not expand beyond the owner-approved scope or exclusions.',
        'Retain before-and-after evidence and a rollback path for implementation work.',
        'Record proof before marking delivery complete.'
      ],
      automaticCustomerSiteModification: false
    },
    ownerTask: {
      title: `Review and deliver ${offer.name} for ${company}`,
      status: 'open',
      requiresHumanAction: true
    },
    testMode: order.testMode === true,
    createdAt: at,
    updatedAt: at
  };
}

function updateItems(existing, updates, allowedStates, code) {
  if (updates === undefined) return existing;
  if (!Array.isArray(updates) || updates.length > 50) throw new DeliveryError(code);
  const byId = new Map(existing.map(item => [item.id, item]));
  for (const update of updates) {
    const allowed = new Set(['id', 'status']);
    if (!update || Object.keys(update).some(key => !allowed.has(key))) throw new DeliveryError(code);
    const itemId = clean(update.id, 120);
    const status = clean(update.status, 40).toLowerCase();
    if (!byId.has(itemId) || !allowedStates.has(status)) throw new DeliveryError(code);
    byId.set(itemId, { ...byId.get(itemId), status });
  }
  return existing.map(item => byId.get(item.id));
}

function normalizedProofReference(reference = {}) {
  const allowed = new Set(['kind', 'label', 'value']);
  if (!reference || Object.keys(reference).some(key => !allowed.has(key))) throw new DeliveryError('delivery-proof-invalid');
  const kind = clean(reference.kind, 30).toLowerCase();
  const label = clean(reference.label, 160);
  let value = clean(reference.value, 1000);
  if (!PROOF_KINDS.has(kind) || !value) throw new DeliveryError('delivery-proof-invalid');
  if (['url', 'document'].includes(kind)) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('unsafe');
      url.search = '';
      url.hash = '';
      value = url.href;
    } catch {
      throw new DeliveryError('delivery-proof-invalid');
    }
  }
  if (kind === 'artifact' && !/^artifact_[a-z0-9._:-]{3,200}$/i.test(value)) throw new DeliveryError('delivery-proof-invalid');
  if (kind === 'commit' && !/^[a-f0-9]{7,64}$/i.test(value)) throw new DeliveryError('delivery-proof-invalid');
  return { kind, label: label || kind, value };
}

function appendProof(existing = [], additions) {
  if (additions === undefined) return existing;
  if (!Array.isArray(additions) || additions.length > 12) throw new DeliveryError('delivery-proof-invalid');
  const combined = [...existing, ...additions.map(normalizedProofReference)];
  return [...new Map(combined.map(reference => [`${reference.kind}:${reference.value}`, reference])).values()].slice(-24);
}

function allResolved(itemsToCheck = [], allowed) {
  return itemsToCheck.every(item => allowed.has(item.status));
}

export function updateDeliveryRecord(record = {}, input = {}, at = new Date().toISOString()) {
  const allowed = new Set(['status', 'checklistUpdates', 'requiredInputUpdates', 'proofReferences', 'revisionStatus', 'revisionNote']);
  const unknown = Object.keys(input).filter(key => !allowed.has(key));
  if (unknown.length) throw new DeliveryError('delivery-update-unknown-field');
  const current = clean(record.status, 40).toLowerCase();
  if (!record.id || !DELIVERY_STATE_SET.has(current)) throw new DeliveryError('delivery-record-invalid');
  if (current === 'cancelled' && Object.keys(input).length) throw new DeliveryError('delivery-terminal-state');
  if (current === 'delivered' && (input.status !== undefined || input.checklistUpdates !== undefined || input.requiredInputUpdates !== undefined)) {
    throw new DeliveryError('delivery-terminal-state');
  }
  const implementationChecklist = updateItems(record.implementationChecklist || [], input.checklistUpdates, ITEM_STATES, 'delivery-checklist-update-invalid');
  const requiredCustomerInputs = updateItems(record.requiredCustomerInputs || [], input.requiredInputUpdates, INPUT_STATES, 'delivery-input-update-invalid');
  const implementationStep = implementationChecklist.find(item => item.id === 'implement-scope');
  const writtenAuthorizationInput = requiredCustomerInputs.find(item => item.id === 'written-authorization');
  const accessInput = requiredCustomerInputs.find(item => item.id === 'access-provisioned');
  if (implementationStep && ['in-progress', 'completed'].includes(implementationStep.status)
    && (writtenAuthorizationInput?.status !== 'received' || accessInput?.status !== 'received')) {
    throw new DeliveryError('delivery-site-authorization-required');
  }
  const references = appendProof(record.proofOfDelivery?.references || [], input.proofReferences);
  const next = input.status === undefined ? current : clean(input.status, 40).toLowerCase();
  if (!DELIVERY_STATE_SET.has(next)) throw new DeliveryError('delivery-status-invalid');
  if (current === 'on-hold' && record.holdReason === 'payment-disputed' && next !== current && next !== 'cancelled') {
    throw new DeliveryError('delivery-payment-hold-active');
  }
  if (next !== current && !DELIVERY_TRANSITIONS[current]?.has(next)) throw new DeliveryError('delivery-transition-invalid');
  if (['ready', 'in-progress', 'ready-for-review', 'delivered'].includes(next)
    && !allResolved(requiredCustomerInputs, new Set(['received', 'not-required']))) {
    throw new DeliveryError('delivery-required-inputs-pending');
  }
  if (next === 'delivered') {
    if (!allResolved(implementationChecklist, new Set(['completed']))) throw new DeliveryError('delivery-checklist-incomplete');
    if (!references.some(reference => STRONG_PROOF_KINDS.has(reference.kind))) throw new DeliveryError('delivery-proof-required');
  }

  let revision = { ...(record.revision || { status: 'not-requested', count: 0, notes: [] }) };
  if (!REVISION_STATE_SET.has(revision.status)) throw new DeliveryError('delivery-revision-state-invalid');
  if (input.revisionStatus !== undefined) {
    const revisionStatus = clean(input.revisionStatus, 40).toLowerCase();
    if (!REVISION_STATE_SET.has(revisionStatus)) throw new DeliveryError('delivery-revision-state-invalid');
    if (record.status !== 'delivered' && next !== 'delivered') throw new DeliveryError('delivery-revision-before-delivery');
    if (revisionStatus !== revision.status && !REVISION_TRANSITIONS[revision.status]?.has(revisionStatus)) {
      throw new DeliveryError('delivery-revision-transition-invalid');
    }
    if (revisionStatus === 'requested' && clean(input.revisionNote, 500).length < 3) throw new DeliveryError('delivery-revision-note-required');
    const notes = [...(revision.notes || [])];
    const note = clean(input.revisionNote, 500);
    if (note) notes.push({ status: revisionStatus, note, at });
    revision = {
      ...revision,
      status: revisionStatus,
      count: Number(revision.count || 0) + (revisionStatus === 'requested' && revisionStatus !== record.revision?.status ? 1 : 0),
      notes: notes.slice(-20),
      updatedAt: at
    };
  }

  const statusHistory = next === current ? [...(record.statusHistory || [])] : [
    ...(record.statusHistory || []),
    { from: current, to: next, source: 'owner-update', at }
  ].slice(-100);
  const writtenAuthorization = writtenAuthorizationInput;
  const accessProvisioned = accessInput;
  return {
    ...record,
    implementationChecklist,
    requiredCustomerInputs,
    status: next,
    statusHistory,
    proofOfDelivery: {
      status: next === 'delivered' ? 'delivered' : references.length ? 'recorded' : 'pending',
      references,
      deliveredAt: next === 'delivered' ? at : record.proofOfDelivery?.deliveredAt || null
    },
    revision,
    siteChangeAuthorization: {
      ...(record.siteChangeAuthorization || {}),
      accessConfirmed: accessProvisioned?.status === 'received',
      writtenAuthorizationConfirmed: writtenAuthorization?.status === 'received',
      automaticModificationAllowed: false
    },
    ownerTask: {
      ...(record.ownerTask || {}),
      status: next === 'delivered' && !['requested', 'in-progress'].includes(revision.status) ? 'completed' : 'open'
    },
    updatedAt: at
  };
}

export function reconcileDeliveryPayment(record = {}, state, order = {}, at = new Date().toISOString()) {
  const paymentState = clean(state, 40).toLowerCase();
  if (!['paid', 'refunded', 'disputed', 'cancelled'].includes(paymentState)) throw new DeliveryError('delivery-payment-state-invalid');
  if (record.payment?.state === paymentState && record.payment?.lastEventId === clean(order.providerEventId, 240)) return { ...record };
  let status = record.status;
  let holdReason = record.holdReason || '';
  let resumeStatus = record.resumeStatus || '';
  if (paymentState === 'disputed' && !['delivered', 'cancelled'].includes(status)) {
    resumeStatus = status;
    status = 'on-hold';
    holdReason = 'payment-disputed';
  }
  if (['refunded', 'cancelled'].includes(paymentState) && status !== 'delivered') {
    status = 'cancelled';
    holdReason = `payment-${paymentState}`;
  }
  if (paymentState === 'paid' && status === 'on-hold' && holdReason === 'payment-disputed') {
    status = DELIVERY_STATE_SET.has(resumeStatus) && !['on-hold', 'cancelled', 'delivered'].includes(resumeStatus) ? resumeStatus : 'delivery-queued';
    holdReason = '';
    resumeStatus = '';
  }
  const changed = status !== record.status;
  return {
    ...record,
    status,
    holdReason,
    resumeStatus,
    payment: {
      ...(record.payment || {}),
      state: paymentState,
      lastEventId: clean(order.providerEventId, 240) || record.payment?.lastEventId || '',
      lastStateAt: at
    },
    statusHistory: changed ? [...(record.statusHistory || []), {
      from: record.status,
      to: status,
      source: `payment-${paymentState}`,
      at
    }].slice(-100) : [...(record.statusHistory || [])],
    ownerTask: { ...(record.ownerTask || {}), status: status === 'delivered' ? record.ownerTask?.status || 'completed' : 'open' },
    updatedAt: at
  };
}

export function deliverySummary(record = {}) {
  const active = ['delivery-queued', 'awaiting-inputs', 'ready', 'in-progress', 'ready-for-review', 'on-hold'].includes(record.status);
  return {
    id: record.id,
    offerId: record.offerId,
    orderId: record.orderId,
    status: active ? 'queued' : record.status,
    workflowStatus: record.status,
    deadline: record.deliveryDeadline,
    revisionStatus: record.revision?.status || 'not-requested',
    testMode: record.testMode === true,
    updatedAt: record.updatedAt || record.createdAt || ''
  };
}
