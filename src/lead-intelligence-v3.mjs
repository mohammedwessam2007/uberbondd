import { sha256 } from './omnia-v9/canonical.mjs';
import { normalizeDomain } from './utils.mjs';
import {
  ENRICHMENT_FIELDS,
  LEAD_GENERATION_POLICY,
  buildLeadGenerationWorkspace,
  buildLeadSignalStack,
  normalizeLeadQuery,
  scoreLeadCandidate
} from './lead-generation.mjs';
import {
  LEAD_OPERATIONS_POLICY,
  buildLeadControlTower,
  buildLeadFieldLedger,
  normalizeTargetProfile
} from './lead-operations.mjs';

export const LEAD_INTELLIGENCE_VERSION = 'uberbond.lead-intelligence.v3';

export const LEAD_INTAKE_KINDS = Object.freeze([
  'form_submission', 'first_party_inquiry', 'visitor_event', 'owner_import',
  'licensed_import', 'provider_export'
]);

export const LEAD_TASK_TYPES = Object.freeze([
  'owner_response', 'review_first_party_intent', 'resolve_conflict',
  'verify_contact', 'refresh_evidence', 'research_signal', 'run_local_enrichment',
  'approve_handoff', 'review_account'
]);

export const LEAD_INTELLIGENCE_POLICY = Object.freeze({
  ...LEAD_GENERATION_POLICY,
  ...LEAD_OPERATIONS_POLICY,
  version: LEAD_INTELLIGENCE_VERSION,
  intakeRule: 'First-party events are captured with notice/permission metadata and remain owner-reviewable until a human resolves them.',
  visitorRule: 'Anonymous or visitor activity is account-level only. UberBond never turns a weak visit signal into an inferred person identity.',
  enrichmentRule: 'Local enrichment may read existing UberBond fields and source-backed observations; provider steps remain explicit, budgeted and disabled until configured.',
  taskRule: 'The queue recommends the next reversible owner action. It never sends, books, charges, suppresses or marks payment as cleared by itself.',
  learningRule: 'Outcome feedback is descriptive until enough observed outcomes exist for an owner-approved scoring change.',
  privacyRule: 'Do not retain IP addresses, cookies, session identifiers or raw secrets in lead-intelligence records.'
});

const KIND_SET = new Set(LEAD_INTAKE_KINDS);
const TASK_SET = new Set(LEAD_TASK_TYPES);
const FIELD_SET = new Set(ENRICHMENT_FIELDS);
const SOURCE_TYPES = new Set(['first_party_export', 'owner_import', 'licensed_export', 'provider_api', 'public_website', 'csv_import']);
const CONSENT_STATES = new Set(['explicit', 'not_required', 'unknown', 'withdrawn']);
const VERIFIED_EMAIL_STATES = new Set(['valid', 'verified', 'deliverable']);
const FREE_EMAIL_DOMAINS = new Set(['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'proton.me', 'protonmail.com']);

function text(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function lower(value, max = 500) { return text(value, max).toLowerCase(); }
function unique(values, max = 30) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 160)).filter(Boolean))].slice(0, max);
}
function iso(value, fallback = new Date()) {
  const parsed = new Date(value || fallback);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date(fallback).toISOString();
}
function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function validHttps(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}
function emailDomain(email) { return String(email || '').split('@')[1]?.toLowerCase() || ''; }
function emailOf(prospect) { return lower(prospect?.contact?.email || prospect?.email, 320); }
function domainOf(prospect) { return normalizeDomain(prospect?.domain || prospect?.website || prospect?.organizationDomain || ''); }
function ageDays(value, now = new Date()) {
  const stamp = Date.parse(value || '');
  if (!Number.isFinite(stamp)) return Infinity;
  return Math.max(0, (new Date(now).getTime() - stamp) / 86400000);
}
function rate(numerator, denominator) { return denominator ? Number((numerator / denominator * 100).toFixed(1)) : 0; }
function eventCore(event) {
  return {
    kind: event.kind, sourceType: event.sourceType, accountKey: event.accountKey,
    fields: event.fields, sourceUrl: event.sourceUrl, privacy: event.privacy,
    observedAt: event.observedAt, idempotencyKey: event.idempotencyKey || ''
  };
}

function normalizeUtm(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(['source', 'medium', 'campaign', 'content', 'term']
    .map(key => [key, text(source[key], 120)])
    .filter(([, value]) => value));
}

function normalizeKind(input) {
  const value = lower(input, 60);
  const aliases = new Map([
    ['form', 'form_submission'], ['form-submit', 'form_submission'], ['form_submission', 'form_submission'],
    ['inquiry', 'first_party_inquiry'], ['first-party-inquiry', 'first_party_inquiry'], ['first_party_inquiry', 'first_party_inquiry'],
    ['visit', 'visitor_event'], ['visitor', 'visitor_event'], ['visitor_event', 'visitor_event'],
    ['owner', 'owner_import'], ['owner_import', 'owner_import'],
    ['licensed', 'licensed_import'], ['licensed_import', 'licensed_import'],
    ['provider', 'provider_export'], ['provider_export', 'provider_export']
  ]);
  return aliases.get(value) || value;
}

export function normalizeLeadIntake(input = {}, { now = new Date() } = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const kind = normalizeKind(raw.kind || raw.eventType || raw.type || 'form_submission');
  if (!KIND_SET.has(kind)) throw new Error(`Unsupported lead-intake kind: ${kind || 'empty'}`);
  const sourceType = lower(raw.sourceType || (kind === 'visitor_event' ? 'public_website' : kind === 'licensed_import' ? 'licensed_export' : kind === 'provider_export' ? 'provider_api' : kind === 'owner_import' ? 'owner_import' : 'first_party_export'), 60);
  if (!SOURCE_TYPES.has(sourceType)) throw new Error(`Unsupported lead-intake source type: ${sourceType}`);

  const company = text(raw.company || raw.companyName || raw.organization, 180);
  const website = text(raw.website || raw.companyWebsite || '', 600);
  const pageUrl = text(raw.pageUrl || raw.sourceUrl || raw.url || '', 600);
  if (website && !validHttps(website)) throw new Error('Lead-intake website must be an HTTPS URL');
  if (pageUrl && !validHttps(pageUrl)) throw new Error('Lead-intake pageUrl must be an HTTPS URL');
  const email = lower(raw.email || raw.businessEmail || raw.workEmail, 320);
  if (email && !validEmail(email)) throw new Error('Lead-intake email is invalid');
  if (!company && !website && !email && !pageUrl) throw new Error('Lead-intake needs a company, website, business email or HTTPS page URL');

  const consentState = lower(raw.consentState || raw.consent || (kind === 'visitor_event' ? 'not_required' : 'unknown'), 40);
  if (!CONSENT_STATES.has(consentState)) throw new Error(`Unsupported consent state: ${consentState}`);
  const noticeUrl = text(raw.noticeUrl || raw.privacyUrl, 600);
  if (noticeUrl && !validHttps(noticeUrl)) throw new Error('Lead-intake noticeUrl must be an HTTPS URL');
  const observedAt = iso(raw.observedAt || raw.occurredAt, now);
  const sourceUrl = pageUrl || website;
  const accountKey = normalizeDomain(website || (email && !FREE_EMAIL_DOMAINS.has(emailDomain(email)) ? emailDomain(email) : '')) || '';
  const identityMode = email ? 'exact-person' : 'account-only';
  const privacy = {
    noticeUrl, noticeVersion: text(raw.noticeVersion, 80), consentState,
    consentCapturedAt: raw.consentCapturedAt ? iso(raw.consentCapturedAt, now) : null,
    identityMode
  };
  const fields = {
    company, website, email, role: text(raw.role || raw.jobTitle || raw.title, 160),
    message: text(raw.message || raw.inquiry || raw.body, 2000),
    eventName: text(raw.eventName || raw.event || raw.pageName, 160),
    pageUrl, referrer: validHttps(raw.referrer) ? text(raw.referrer, 600) : '',
    utm: normalizeUtm(raw.utm || raw.utmParams)
  };
  const idempotencyKey = text(raw.idempotencyKey || raw.eventId || raw.submissionId, 180);
  const digest = sha256(eventCore({ kind, sourceType, accountKey, fields, sourceUrl, privacy, observedAt, idempotencyKey }));
  const status = consentState === 'withdrawn' ? 'blocked-withdrawn' : kind === 'visitor_event' ? 'account-activity' : 'needs_owner_review';
  return {
    version: LEAD_INTELLIGENCE_VERSION,
    id: `intake_${(idempotencyKey ? sha256(idempotencyKey) : digest).slice(0, 24)}`,
    digest, idempotencyKey, kind, sourceType, accountKey, company, website, email,
    sourceUrl, fields, privacy, status, observedAt, createdAt: iso(now, now), updatedAt: iso(now, now),
    authority: {
      basis: text(raw.permissionBasis || raw.authorityNote || (kind === 'visitor_event' ? 'first-party account activity' : 'first-party intake'), 240),
      sourceLicense: text(raw.sourceLicense, 200),
      sourceRecordId: text(raw.sourceRecordId, 160)
    },
    policy: LEAD_INTELLIGENCE_POLICY,
    providerCalls: 0, externalEffects: 0
  };
}

export function buildLeadIntakeRecord(input = {}, { now = new Date(), prospectId = '' } = {}) {
  const normalized = normalizeLeadIntake(input, { now });
  return {
    ...normalized,
    prospectId: text(prospectId, 120),
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt
  };
}

function sourceForProspect(prospect) {
  return lower(prospect?.contact?.source || prospect?.source || 'local_prospect', 80);
}
function sourceUrlForProspect(prospect) {
  return text(prospect?.contact?.sourceUrl || prospect?.sourceUrl || prospect?.issue?.evidenceUrl || prospect?.website, 600);
}
function observedForProspect(prospect, now) {
  return iso(prospect?.contact?.observedAt || prospect?.issue?.evidenceObservedAt || prospect?.completedAt || prospect?.updatedAt || prospect?.createdAt, now);
}
function localFieldResult(field, status, value, prospect, now, extra = {}) {
  const sourceType = sourceForProspect(prospect);
  const sourceUrl = sourceUrlForProspect(prospect);
  return {
    field, status, value: value === undefined || value === null ? null : String(value).slice(0, 2000),
    sourceType, sourceUrl, observedAt: observedForProspect(prospect, now),
    exact: extra.exact !== false, inferred: extra.inferred === true,
    verified: extra.verified === true, confidence: Number(number(extra.confidence, 0.5, 0, 1).toFixed(3)),
    validator: extra.validator || 'local-source-presence', reason: extra.reason || '', details: extra.details || null,
    provider: 'local-evidence', providerCalls: 0, externalEffects: 0
  };
}

function localSignals(prospect, signals = []) {
  const embedded = Array.isArray(prospect?.leadSignals) ? prospect.leadSignals : Array.isArray(prospect?.signals) ? prospect.signals : [];
  return [...signals.filter(signal => signal?.prospectId === prospect.id), ...embedded].filter(Boolean);
}

export function runLocalEnrichment({ prospect = {}, fields = ENRICHMENT_FIELDS, signals = [], now = new Date() } = {}) {
  const requestedFields = unique(Array.isArray(fields) && fields.length ? fields : ENRICHMENT_FIELDS, 20).map(value => value.toLowerCase()).filter(field => FIELD_SET.has(field));
  const contact = prospect.contact || {};
  const email = emailOf(prospect);
  const signalRows = localSignals(prospect, signals);
  const results = [];
  for (const field of requestedFields) {
    if (field === 'company_profile') {
      const value = prospect.company || prospect.name || domainOf(prospect);
      results.push(value ? localFieldResult(field, 'found', value, prospect, now, { confidence: 0.9, validator: 'company-identity-present', details: { domain: domainOf(prospect), industry: prospect.industry || prospect.niche || '', country: prospect.country || '' } }) : localFieldResult(field, 'missing', null, prospect, now, { reason: 'company identity is absent' }));
    } else if (field === 'website_evidence') {
      const issue = prospect.issue || {};
      const hasEvidence = Boolean(issue.evidenceUrl && (issue.evidenceExcerpt || issue.excerpt));
      results.push(hasEvidence
        ? localFieldResult(field, 'found', issue.title || issue.code || 'Observed website issue', prospect, now, { confidence: Number(issue.confidence ?? 0.75), validator: 'https-evidence-and-excerpt', details: { evidenceUrl: issue.evidenceUrl, excerpt: issue.evidenceExcerpt || issue.excerpt } })
        : prospect.website ? localFieldResult(field, 'partial', prospect.website, prospect, now, { confidence: 0.35, validator: 'https-website-present', reason: 'website exists but no material issue excerpt is recorded' })
          : localFieldResult(field, 'missing', null, prospect, now, { reason: 'website evidence is absent' }));
    } else if (field === 'work_email') {
      const exact = contact.exact !== false && contact.inferred !== true;
      results.push(email && validEmail(email) && exact
        ? localFieldResult(field, 'found', email, prospect, now, { exact: true, confidence: contact.verified && contact.verified !== 'unknown' ? 1 : 0.7, validator: 'exact-business-email-presence' })
        : email ? localFieldResult(field, 'blocked', email, prospect, now, { exact, inferred: !exact, confidence: 0, validator: 'exact-contact-required', reason: 'inferred or non-exact contact cannot reach handoff' })
          : localFieldResult(field, 'missing', null, prospect, now, { reason: 'no selected business email' }));
    } else if (field === 'email_verification') {
      const verification = lower(contact.verified || contact.verificationStatus, 40);
      results.push(VERIFIED_EMAIL_STATES.has(verification)
        ? localFieldResult(field, 'found', verification, prospect, now, { verified: true, confidence: 1, validator: 'owner-or-provider-verification-state' })
        : email && ['invalid', 'undeliverable', 'bounced'].includes(verification)
          ? localFieldResult(field, 'blocked', verification, prospect, now, { confidence: 0, validator: 'negative-verification-state', reason: 'contact is marked invalid or undeliverable' })
          : email ? localFieldResult(field, 'needs_verification', 'unknown', prospect, now, { confidence: 0.2, validator: 'verification-state-required', reason: 'email exists but no positive verification state is recorded' })
            : localFieldResult(field, 'missing', null, prospect, now, { reason: 'email is absent' }));
    } else if (field === 'phone') {
      const phone = contact.phone || prospect.phone;
      results.push(phone ? localFieldResult(field, 'found', phone, prospect, now, { confidence: contact.phoneVerified ? 1 : 0.5, validator: contact.phoneVerified ? 'source-and-verification-state' : 'source-presence' }) : localFieldResult(field, 'missing', null, prospect, now, { reason: 'phone is absent' }));
    } else if (field === 'technology') {
      const technologies = Array.isArray(prospect.technologies) ? prospect.technologies.filter(Boolean) : prospect.technology ? [prospect.technology] : [];
      results.push(technologies.length ? localFieldResult(field, 'found', technologies.join(', '), prospect, now, { confidence: 0.75, validator: 'source-backed-technology-list', details: { values: technologies } }) : localFieldResult(field, 'missing', null, prospect, now, { reason: 'technology observation is absent' }));
    } else {
      const matching = signalRows.filter(signal => signal.type === field || signal.type === `${field}_change`);
      const latest = matching.sort((a, b) => String(b.observedAt || '').localeCompare(String(a.observedAt || '')))[0];
      results.push(latest
        ? localFieldResult(field, 'found', latest.title || latest.excerpt, prospect, now, { confidence: latest.confidence ?? 0.5, validator: 'source-backed-signal', details: { signalId: latest.id || '', sourceUrl: latest.sourceUrl || '', excerpt: latest.excerpt || '' } })
        : localFieldResult(field, 'missing', null, prospect, now, { reason: `no ${field} signal is recorded` }));
    }
  }
  const found = results.filter(row => ['found', 'partial'].includes(row.status));
  const blockers = results.filter(row => ['blocked', 'needs_verification', 'missing'].includes(row.status));
  const observations = found.filter(row => row.value !== null).map(row => ({
    field: `enrichment.${row.field}`, value: row.value, sourceType: row.sourceType,
    sourceUrl: row.sourceUrl, observedAt: row.observedAt, confidence: row.confidence,
    verified: row.verified, exact: row.exact, inferred: row.inferred
  }));
  return {
    version: LEAD_INTELLIGENCE_VERSION, prospectId: text(prospect.id, 120), company: text(prospect.company || prospect.name, 180),
    requestedFields, results, observations, summary: { requested: results.length, found: found.length, blockers: blockers.length, missing: results.filter(row => row.status === 'missing').length, needsVerification: results.filter(row => row.status === 'needs_verification').length },
    status: blockers.length ? 'needs_owner_review' : 'locally_complete', generatedAt: iso(now, now),
    policy: LEAD_INTELLIGENCE_POLICY, providerCalls: 0, externalEffects: 0
  };
}

function isSuppressed(prospect, suppressions) {
  const values = new Set((suppressions || []).map(item => lower(item?.value, 320)).filter(Boolean));
  const email = emailOf(prospect); const domain = domainOf(prospect);
  return Boolean((email && values.has(email)) || (domain && values.has(domain)));
}
function isCommerciallyActive(prospect) {
  const status = lower(prospect?.status, 60);
  return Boolean(prospect?.repliedAt || prospect?.opportunityStage || ['sent', 'replied', 'opportunity', 'paid', 'recurring'].includes(status));
}
function priorityFor(stage, score, taskType) {
  const stageBase = { decision: 90, 'active-research': 70, research: 45, awareness: 25, unknown: 15 }[stage] || 15;
  const taskBase = { owner_response: 20, review_first_party_intent: 18, resolve_conflict: 12, verify_contact: 8, refresh_evidence: 7, research_signal: 5, run_local_enrichment: 4, approve_handoff: 2, review_account: 1 }[taskType] || 0;
  return Math.max(1, Math.min(100, Math.round(stageBase + taskBase + Number(score || 0) * 0.1)));
}
function slaFor(stage, taskType) {
  if (taskType === 'owner_response' || taskType === 'review_first_party_intent') return 15;
  return { decision: 60, 'active-research': 240, research: 1440, awareness: 4320, unknown: 10080 }[stage] || 1440;
}
function taskForProspect({ prospect, score, ledger, now }) {
  const stage = score.signalStack?.stage || 'unknown';
  const replyLabel = lower(prospect.replyLabel || prospect.latestReply?.label, 40);
  let taskType = 'review_account';
  let reason = 'Review the account dossier and choose the next commercial action.';
  if (replyLabel || prospect.repliedAt || ['replied', 'positive'].includes(lower(prospect.status, 30))) {
    taskType = 'owner_response'; reason = 'A reply or reply classification needs an owner response.';
  } else if (stage === 'decision' || score.intent >= 10) {
    taskType = 'review_first_party_intent'; reason = 'A decision-stage or high-intent signal deserves rapid owner review.';
  } else if (ledger.conflicts.length) {
    taskType = 'resolve_conflict'; reason = 'Conflicting source values block high-confidence handoff.';
  } else if (ledger.blockers.some(blocker => blocker.includes('email') || blocker.includes('inferred'))) {
    taskType = 'verify_contact'; reason = 'Resolve the exact business-contact and verification gap before handoff.';
  } else if (ledger.blockers.some(blocker => blocker.includes('evidence'))) {
    taskType = 'refresh_evidence'; reason = 'Refresh or complete source-backed website evidence before making a claim.';
  } else if (!score.signalStack?.signalCount) {
    taskType = 'research_signal'; reason = 'Add an independent public or first-party why-now signal, or keep the lead in research.';
  } else if (score.eligible) {
    taskType = 'approve_handoff'; reason = 'The local lead gates pass; owner review can create a governed outreach plan.';
  } else {
    taskType = 'run_local_enrichment'; reason = 'Fill the highest-value local fields before deciding on a provider.';
  }
  const blocked = isCommerciallyActive(prospect) ? false : Boolean(ledger.conflicts.length || ledger.blockers.length || !score.eligible);
  const priority = priorityFor(stage, score.total, taskType);
  const dueAt = new Date(new Date(now).getTime() + slaFor(stage, taskType) * 60000).toISOString();
  const dedupeKey = `prospect:${prospect.id}:${taskType}`;
  return {
    id: `leadtask_${sha256(dedupeKey).slice(0, 24)}`, dedupeKey, taskType, status: blocked ? 'blocked' : 'ready',
    priority, dueAt, slaMinutes: slaFor(stage, taskType), prospectId: text(prospect.id, 120), accountKey: domainOf(prospect) || text(prospect.id, 120),
    company: text(prospect.company || prospect.name || 'Unknown company', 180), stage, score: score.total, intentScore: score.intent,
    blocks: score.blocks, ledgerBlockers: ledger.blockers, reason, nextAction: reason, createdAt: iso(now, now), updatedAt: iso(now, now),
    policy: LEAD_INTELLIGENCE_POLICY, providerCalls: 0, externalEffects: 0
  };
}

export function buildLeadActionQueue({ prospects = [], signals = [], suppressions = [], intakeEvents = [], profile = {}, now = new Date(), limit = 100 } = {}) {
  const normalizedProfile = normalizeTargetProfile(profile || {});
  const query = { ...normalizedProfile.query, minScore: 0, minEvidenceScore: 0, minIntentScore: 0, requireEvidence: false, requireContact: false, skipOwned: false };
  const tasks = [];
  for (const prospect of prospects || []) {
    if (isSuppressed(prospect, suppressions)) continue;
    const candidateSignals = signals.filter(signal => signal?.prospectId === prospect.id);
    const score = scoreLeadCandidate({ candidate: prospect, query, signals: candidateSignals, suppressions, now });
    const ledger = buildLeadFieldLedger({ prospect, signals: candidateSignals, now, freshWithinDays: normalizedProfile.freshWithinDays });
    tasks.push(taskForProspect({ prospect, score, ledger, now }));
  }
  for (const event of intakeEvents || []) {
    if (['handled', 'dismissed', 'converted', 'blocked-withdrawn'].includes(lower(event.status, 60))) continue;
    const taskType = event.kind === 'visitor_event' ? 'review_first_party_intent' : event.email ? 'owner_response' : 'review_account';
    const dedupeKey = `intake:${event.id}:${taskType}`;
    const stage = event.kind === 'visitor_event' ? 'active-research' : 'decision';
    tasks.push({
      id: `leadtask_${sha256(dedupeKey).slice(0, 24)}`, dedupeKey, taskType, status: event.privacy?.consentState === 'unknown' ? 'blocked' : 'ready',
      priority: priorityFor(stage, event.kind === 'visitor_event' ? 60 : 80, taskType),
      dueAt: new Date(new Date(event.observedAt || now).getTime() + slaFor(stage, taskType) * 60000).toISOString(),
      slaMinutes: slaFor(stage, taskType), prospectId: text(event.prospectId, 120), accountKey: event.accountKey || '',
      company: event.company || event.accountKey || 'Unknown account', stage, score: event.kind === 'visitor_event' ? 60 : 80, intentScore: event.kind === 'visitor_event' ? 8 : 12,
      blocks: event.privacy?.consentState === 'unknown' ? ['privacy-basis-review'] : [], ledgerBlockers: [], reason: event.kind === 'visitor_event' ? 'Review first-party account activity without inferring a person.' : 'Review the first-party inquiry and choose the next owner action.',
      nextAction: event.kind === 'visitor_event' ? 'Review account activity and attach only an exact authorized contact.' : 'Open the intake record and respond or route locally.',
      intakeEventId: event.id, createdAt: iso(now, now), updatedAt: iso(now, now), policy: LEAD_INTELLIGENCE_POLICY, providerCalls: 0, externalEffects: 0
    });
  }
  const uniqueTasks = [...new Map(tasks.map(task => [task.dedupeKey, task])).values()];
  uniqueTasks.sort((a, b) => b.priority - a.priority || String(a.dueAt).localeCompare(String(b.dueAt)) || a.company.localeCompare(b.company));
  const selected = uniqueTasks.slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
  return {
    version: LEAD_INTELLIGENCE_VERSION, generatedAt: iso(now, now), tasks: selected,
    summary: {
      total: uniqueTasks.length, returned: selected.length, ready: uniqueTasks.filter(task => task.status === 'ready').length,
      blocked: uniqueTasks.filter(task => task.status === 'blocked').length, dueWithinHour: uniqueTasks.filter(task => Date.parse(task.dueAt) <= new Date(now).getTime() + 3600000).length,
      byType: Object.fromEntries(LEAD_TASK_TYPES.map(type => [type, uniqueTasks.filter(task => task.taskType === type).length]).filter(([, count]) => count)),
      byStage: Object.fromEntries([...new Set(uniqueTasks.map(task => task.stage))].map(stage => [stage, uniqueTasks.filter(task => task.stage === stage).length]))
    },
    policy: LEAD_INTELLIGENCE_POLICY, providerCalls: 0, externalEffects: 0
  };
}

function commercialStage(prospect) {
  const status = lower(prospect?.status, 60);
  const payment = lower(prospect?.paymentStatus || prospect?.revenueState, 60);
  if (['recurring', 'active_subscription'].includes(status) || ['recurring', 'active'].includes(payment) || prospect?.subscriptionStatus === 'active') return 'recurring';
  if (['paid', 'settled', 'cleared', 'payment_cleared'].includes(status) || ['paid', 'settled', 'cleared'].includes(payment) || prospect?.paymentClearedAt) return 'cleared_payment';
  if (['opportunity', 'qualified'].includes(status) || ['opportunity', 'qualified'].includes(lower(prospect?.opportunityStage, 60))) return 'opportunity';
  if (['replied', 'positive'].includes(status) || prospect?.repliedAt || prospect?.replyLabel) return 'replied';
  if (['sent', 'delivered', 'active'].includes(status) || prospect?.sentAt || prospect?.sequenceState?.lastSentAt) return 'contacted';
  if (prospect?.issue || prospect?.audit || prospect?.completedAt) return 'researched';
  return 'captured';
}

export function buildLeadAttributionSnapshot({ prospects = [], intakeEvents = [], signals = [], now = new Date() } = {}) {
  const sourceByProspect = new Map();
  for (const event of intakeEvents || []) if (event.prospectId && event.sourceType) sourceByProspect.set(event.prospectId, event.sourceType);
  const rows = (prospects || []).map(prospect => ({
    prospectId: prospect.id, company: prospect.company || prospect.name || '', source: sourceByProspect.get(prospect.id) || prospect.source || 'local_prospect',
    stage: commercialStage(prospect), observedAt: prospect.updatedAt || prospect.createdAt || now
  }));
  const stages = ['captured', 'researched', 'contacted', 'replied', 'opportunity', 'cleared_payment', 'recurring'];
  const funnel = Object.fromEntries(stages.map(stage => [stage, rows.filter(row => stages.indexOf(row.stage) >= stages.indexOf(stage)).length]));
  const sources = [...new Set(rows.map(row => row.source))];
  const bySource = sources.map(source => {
    const sourceRows = rows.filter(row => row.source === source);
    const counts = Object.fromEntries(stages.map(stage => [stage, sourceRows.filter(row => stages.indexOf(row.stage) >= stages.indexOf(stage)).length]));
    return { source, records: sourceRows.length, counts, replyRate: rate(counts.replied, counts.contacted), opportunityRate: rate(counts.opportunity, counts.contacted), clearedPaymentRate: rate(counts.cleared_payment, counts.contacted), recurringRate: rate(counts.recurring, counts.contacted) };
  }).sort((a, b) => b.clearedPaymentRate - a.clearedPaymentRate || b.records - a.records);
  const successfulSignalTypes = {};
  for (const row of rows.filter(item => ['replied', 'opportunity', 'cleared_payment', 'recurring'].includes(item.stage))) {
    for (const signal of signals.filter(signal => signal.prospectId === row.prospectId)) successfulSignalTypes[signal.type] = (successfulSignalTypes[signal.type] || 0) + 1;
  }
  return {
    version: LEAD_INTELLIGENCE_VERSION, generatedAt: iso(now, now), totalProspects: rows.length, funnel, bySource,
    successfulSignalTypes: Object.entries(successfulSignalTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count })),
    learning: { status: rows.length >= 30 ? 'descriptive-learning-ready' : 'insufficient-outcomes-for-calibration', minimumOutcomeRecommendation: 30, note: 'Do not change scoring weights from this snapshot without owner review and a held-out comparison.' },
    policy: LEAD_INTELLIGENCE_POLICY, providerCalls: 0, externalEffects: 0
  };
}

export function buildLeadCaptureSpec({ publicRoute = '/api/public/lead-capture', enabled = false } = {}) {
  return {
    version: LEAD_INTELLIGENCE_VERSION, route: publicRoute, method: 'POST', enabled,
    eventKinds: ['form_submission', 'first_party_inquiry', 'visitor_event'],
    required: ['kind', 'idempotencyKey/eventId/submissionId for deduplication', 'company/website/businessEmail/pageUrl'],
    optional: ['company', 'businessEmail', 'role', 'message', 'eventName', 'noticeUrl', 'noticeVersion', 'consentState', 'utm'],
    response: { accepted: true, stored: true, matchedProspect: false, externalEffects: 0, providerCalls: 0 },
    privacy: ['Do not send IP addresses, cookies, session identifiers or secrets.', 'Visitor events remain account-level unless an exact first-party contact is supplied.', 'Unknown or withdrawn permission remains blocked or owner-reviewable.'],
    policy: LEAD_INTELLIGENCE_POLICY
  };
}

export function buildLeadIntelligenceWorkspace({ prospects = [], leadLists = [], searches = [], signals = [], enrichmentRuns = [], suppressions = [], intakeEvents = [], fieldResults = [], targetProfiles = [], profile = null, now = new Date() } = {}) {
  const generation = buildLeadGenerationWorkspace({ prospects, leadLists, searches, signals, enrichmentRuns, suppressions, now });
  const controlTower = buildLeadControlTower({ prospects, signals, suppressions, searches, enrichmentRuns, targetProfiles, profile, now });
  const actionQueue = buildLeadActionQueue({ prospects, signals, suppressions, intakeEvents, profile: controlTower.profile, now, limit: 100 });
  const attribution = buildLeadAttributionSnapshot({ prospects, intakeEvents, signals, now });
  const intakeByKind = Object.fromEntries(LEAD_INTAKE_KINDS.map(kind => [kind, intakeEvents.filter(event => event.kind === kind).length]).filter(([, count]) => count));
  const fieldRunSummary = {
    runs: fieldResults.length,
    found: fieldResults.filter(item => ['found', 'partial'].includes(item.status)).length,
    blocked: fieldResults.filter(item => ['blocked', 'needs_verification'].includes(item.status)).length,
    missing: fieldResults.filter(item => item.status === 'missing').length
  };
  return {
    version: LEAD_INTELLIGENCE_VERSION, generatedAt: iso(now, now), generation, controlTower, actionQueue, attribution,
    intake: { total: intakeEvents.length, pending: intakeEvents.filter(event => !['handled', 'dismissed', 'converted', 'blocked-withdrawn'].includes(event.status)).length, byKind: intakeByKind, recent: [...intakeEvents].sort((a, b) => String(b.observedAt || '').localeCompare(String(a.observedAt || ''))).slice(0, 12) },
    enrichment: { ...fieldRunSummary, recent: [...fieldResults].sort((a, b) => String(b.observedAt || '').localeCompare(String(a.observedAt || ''))).slice(0, 12) }, nextBestAction: actionQueue.tasks[0] || null,
    policy: LEAD_INTELLIGENCE_POLICY, providerCalls: 0, externalEffects: 0
  };
}

export function isSupportedLeadTaskType(value) { return TASK_SET.has(String(value || '').trim()); }
