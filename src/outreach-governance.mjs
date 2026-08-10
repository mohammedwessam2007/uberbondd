import crypto from 'node:crypto';
import { canonicalize, sha256 } from './omnia-v9/canonical.mjs';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const EMPTY_SOURCE_EXCERPT_DIGEST = sha256('');
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const CLOCK_SKEW_MS = 5 * 60_000;
const MAX_APPROVAL_TTL_MS = 24 * 60 * 60_000;

export const OUTREACH_ROUTE_TYPES = Object.freeze([
  'SOLICITED_APPLICATION',
  'EXPLICIT_CONSENT',
  'REQUESTED_INFORMATION',
  'CONSPICUOUS_PUBLICATION',
  'PUBLIC_BUSINESS_CONTACT',
  'WARM_REFERRAL',
  'UNKNOWN'
]);

export const OUTREACH_PERMISSION_SCOPES = Object.freeze([
  'JOB_APPLICATION',
  'CONTRACTOR_APPLICATION',
  'SERVICE_INFORMATION',
  'COMMERCIAL_OUTREACH'
]);

const ROUTE_TYPE_SET = new Set(OUTREACH_ROUTE_TYPES);
const PERMISSION_SCOPE_SET = new Set(OUTREACH_PERMISSION_SCOPES);
const GMAIL_API_ALLOWED_ROUTE_TYPES = new Set([
  'SOLICITED_APPLICATION',
  'EXPLICIT_CONSENT',
  'REQUESTED_INFORMATION'
]);

const ROUTE_FIELDS = new Set([
  'schemaVersion', 'routeType', 'recipientEmail', 'sourceUrl', 'sourceExcerptDigest',
  'sourceObservedAt', 'sourceExpiresAt', 'jurisdiction', 'permissionScope',
  'relevantToRecipientRole', 'noUnsolicitedStatementPresent', 'provider',
  'evidenceNote', 'routeDigest'
]);

const APPROVAL_FIELDS = new Set([
  'schemaVersion', 'approvalId', 'prospectId', 'campaignId', 'recipientEmail',
  'provider', 'inbox', 'followup', 'routeDigest', 'messageDigest',
  'effectPayloadDigest', 'approvedBy', 'approvedAt', 'expiresAt', 'maxUses',
  'approvalDigest', 'signature'
]);

export class OutreachGovernanceError extends Error {
  constructor(message, code = 'OUTREACH_GOVERNANCE_ERROR', detail = {}) {
    super(message);
    this.name = 'OutreachGovernanceError';
    this.code = code;
    this.detail = detail;
  }
}

function text(value) {
  return String(value ?? '').trim();
}

export function normalizeOutreachEmail(value) {
  return text(value).toLowerCase();
}

function requireApprovalSecret(secret) {
  const value = String(secret || '');
  if (value.length < 32) {
    throw new OutreachGovernanceError('OUTREACH_APPROVAL_SECRET must contain at least 32 characters', 'APPROVAL_SECRET_INVALID');
  }
  return value;
}

function hmacDigest(secret, digest) {
  return crypto.createHmac('sha256', requireApprovalSecret(secret)).update(String(digest), 'utf8').digest('hex');
}

function safeHexEqual(left, right) {
  if (!SHA256_HEX.test(String(left || '')) || !SHA256_HEX.test(String(right || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function validHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validIsoMs(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : NaN;
}

function closedRecord(value, fields, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: `${name}-not-object` };
  const unknown = Object.keys(value).find(key => !fields.has(key));
  return unknown ? { ok: false, reason: `${name}-unknown-field:${unknown}` } : { ok: true };
}

export function providerRoutePolicy(provider, routeType) {
  const normalizedProvider = text(provider).toLowerCase();
  if (normalizedProvider === 'gmail-api') {
    return GMAIL_API_ALLOWED_ROUTE_TYPES.has(routeType)
      ? { ok: true, reason: 'gmail-api-solicited-or-consented-route' }
      : { ok: false, reason: 'gmail-api-prohibits-unsolicited-commercial-mail' };
  }
  if (normalizedProvider === 'fixture') {
    return ['UNKNOWN', 'PUBLIC_BUSINESS_CONTACT'].includes(routeType)
      ? { ok: false, reason: 'fixture-route-not-authorized' }
      : { ok: true, reason: 'fixture-provider' };
  }
  return { ok: false, reason: 'outbound-provider-not-approved' };
}

export function createOutreachRouteEvidence(input = {}, now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new OutreachGovernanceError('now must be a valid Date', 'INVALID_INPUT');
  const sourceExcerpt = String(input.sourceExcerpt || '');
  const suppliedExcerptDigest = String(input.sourceExcerptDigest || '').toLowerCase();
  const sourceExcerptDigest = SHA256_HEX.test(suppliedExcerptDigest)
    ? suppliedExcerptDigest
    : sourceExcerpt.trim()
      ? sha256(sourceExcerpt)
      : '';
  if (!sourceExcerptDigest || sourceExcerptDigest === EMPTY_SOURCE_EXCERPT_DIGEST) {
    throw new OutreachGovernanceError(
      'A non-empty source excerpt or its sha256 digest is required',
      'OUTREACH_SOURCE_EVIDENCE_EMPTY'
    );
  }
  const base = {
    schemaVersion: 'uberbond.outreach-route.v1',
    routeType: text(input.routeType).toUpperCase(),
    recipientEmail: normalizeOutreachEmail(input.recipientEmail),
    sourceUrl: text(input.sourceUrl),
    sourceExcerptDigest,
    sourceObservedAt: text(input.sourceObservedAt || now.toISOString()),
    sourceExpiresAt: text(input.sourceExpiresAt || new Date(now.getTime() + 7 * 86400000).toISOString()),
    jurisdiction: text(input.jurisdiction).toUpperCase(),
    permissionScope: text(input.permissionScope).toUpperCase(),
    relevantToRecipientRole: input.relevantToRecipientRole === true,
    noUnsolicitedStatementPresent: input.noUnsolicitedStatementPresent === true,
    provider: text(input.provider || 'gmail-api').toLowerCase(),
    evidenceNote: text(input.evidenceNote).slice(0, 1000)
  };
  return { ...base, routeDigest: sha256(base) };
}

export function verifyOutreachRouteEvidence({ route, recipientEmail, provider, now = new Date(), maxAgeDays = 14 } = {}) {
  const shape = closedRecord(route, ROUTE_FIELDS, 'outreach-route');
  if (!shape.ok) return shape;
  if (route.schemaVersion !== 'uberbond.outreach-route.v1') return { ok: false, reason: 'outreach-route-version-invalid' };
  if (!ROUTE_TYPE_SET.has(route.routeType)) return { ok: false, reason: 'outreach-route-type-invalid' };
  if (!PERMISSION_SCOPE_SET.has(route.permissionScope)) return { ok: false, reason: 'outreach-permission-scope-invalid' };
  if (!EMAIL_RE.test(route.recipientEmail) || route.recipientEmail !== normalizeOutreachEmail(recipientEmail)) {
    return { ok: false, reason: 'outreach-route-recipient-mismatch' };
  }
  if (!validHttpsUrl(route.sourceUrl)) return { ok: false, reason: 'outreach-route-source-url-invalid' };
  if (!SHA256_HEX.test(route.sourceExcerptDigest) || route.sourceExcerptDigest === EMPTY_SOURCE_EXCERPT_DIGEST) {
    return { ok: false, reason: 'outreach-route-source-digest-invalid' };
  }
  if (!/^[A-Z]{2}$/.test(route.jurisdiction)) return { ok: false, reason: 'outreach-route-jurisdiction-invalid' };
  if (route.relevantToRecipientRole !== true) return { ok: false, reason: 'outreach-route-role-relevance-unproven' };
  if (route.provider !== text(provider).toLowerCase()) return { ok: false, reason: 'outreach-route-provider-mismatch' };
  if (route.routeType === 'CONSPICUOUS_PUBLICATION' && route.noUnsolicitedStatementPresent === true) {
    return { ok: false, reason: 'outreach-route-published-with-no-solicitation-statement' };
  }
  const observedMs = validIsoMs(route.sourceObservedAt);
  const expiresMs = validIsoMs(route.sourceExpiresAt);
  if (!Number.isFinite(observedMs) || !Number.isFinite(expiresMs) || observedMs > expiresMs) {
    return { ok: false, reason: 'outreach-route-time-invalid' };
  }
  if (observedMs > now.getTime() + CLOCK_SKEW_MS) return { ok: false, reason: 'outreach-route-observed-in-future' };
  if (expiresMs <= now.getTime()) return { ok: false, reason: 'outreach-route-expired' };
  if (now.getTime() - observedMs > Math.max(1, Number(maxAgeDays || 14)) * 86400000) {
    return { ok: false, reason: 'outreach-route-evidence-stale' };
  }
  let recomputed;
  try {
    const base = { ...route };
    delete base.routeDigest;
    recomputed = sha256(base);
  } catch {
    return { ok: false, reason: 'outreach-route-canonicalization-failed' };
  }
  if (recomputed !== route.routeDigest) return { ok: false, reason: 'outreach-route-digest-mismatch' };
  const providerPolicy = providerRoutePolicy(provider, route.routeType);
  if (!providerPolicy.ok) return providerPolicy;
  return { ok: true, routeDigest: route.routeDigest, policyReason: providerPolicy.reason };
}

export function outreachMessageDigest({ recipientEmail, subject, body, provider, inbox, followup = 0, threadId = '', replyToId = '', listUnsubscribe = '' } = {}) {
  return sha256({
    recipientEmail: normalizeOutreachEmail(recipientEmail),
    subject: String(subject || ''),
    body: String(body || ''),
    provider: text(provider).toLowerCase(),
    inbox: text(inbox),
    followup: Number(followup || 0),
    threadId: text(threadId),
    replyToId: text(replyToId),
    listUnsubscribe: text(listUnsubscribe)
  });
}

export function createOutreachApproval(input = {}, secret) {
  const base = {
    schemaVersion: 'uberbond.outreach-approval.v1',
    approvalId: text(input.approvalId),
    prospectId: text(input.prospectId),
    campaignId: text(input.campaignId),
    recipientEmail: normalizeOutreachEmail(input.recipientEmail),
    provider: text(input.provider).toLowerCase(),
    inbox: text(input.inbox),
    followup: Number(input.followup || 0),
    routeDigest: text(input.routeDigest).toLowerCase(),
    messageDigest: text(input.messageDigest).toLowerCase(),
    effectPayloadDigest: text(input.effectPayloadDigest).toLowerCase(),
    approvedBy: text(input.approvedBy),
    approvedAt: text(input.approvedAt),
    expiresAt: text(input.expiresAt),
    maxUses: 1
  };
  if (!base.approvalId) {
    base.approvalId = `outreach-${sha256({ prospectId: base.prospectId, followup: base.followup, approvedAt: base.approvedAt, effectPayloadDigest: base.effectPayloadDigest }).slice(0, 24)}`;
  }
  const approvalDigest = sha256(base);
  return { ...base, approvalDigest, signature: hmacDigest(secret, approvalDigest) };
}

export function verifyOutreachApproval({
  approval, secret, prospectId, campaignId, recipientEmail, provider, inbox, followup = 0,
  routeDigest, messageDigest, effectPayloadDigest = null, now = new Date()
} = {}) {
  const shape = closedRecord(approval, APPROVAL_FIELDS, 'outreach-approval');
  if (!shape.ok) return shape;
  if (approval.schemaVersion !== 'uberbond.outreach-approval.v1') return { ok: false, reason: 'outreach-approval-version-invalid' };
  if (!approval.approvalId || !approval.approvedBy || approval.maxUses !== 1) return { ok: false, reason: 'outreach-approval-identity-invalid' };
  for (const field of ['routeDigest', 'messageDigest', 'effectPayloadDigest', 'approvalDigest', 'signature']) {
    if (!SHA256_HEX.test(String(approval[field] || ''))) return { ok: false, reason: `outreach-approval-${field}-invalid` };
  }
  let base;
  try {
    base = { ...approval };
    delete base.approvalDigest;
    delete base.signature;
    if (sha256(base) !== approval.approvalDigest) return { ok: false, reason: 'outreach-approval-digest-mismatch' };
  } catch {
    return { ok: false, reason: 'outreach-approval-canonicalization-failed' };
  }
  let expectedSignature;
  try { expectedSignature = hmacDigest(secret, approval.approvalDigest); }
  catch (error) { return { ok: false, reason: error.code === 'APPROVAL_SECRET_INVALID' ? 'outreach-approval-secret-invalid' : 'outreach-approval-signature-error' }; }
  if (!safeHexEqual(expectedSignature, approval.signature)) return { ok: false, reason: 'outreach-approval-signature-invalid' };
  const approvedMs = validIsoMs(approval.approvedAt);
  const expiresMs = validIsoMs(approval.expiresAt);
  if (!Number.isFinite(approvedMs) || !Number.isFinite(expiresMs) || approvedMs > expiresMs) return { ok: false, reason: 'outreach-approval-time-invalid' };
  if (expiresMs - approvedMs > MAX_APPROVAL_TTL_MS) return { ok: false, reason: 'outreach-approval-ttl-too-long' };
  if (approvedMs > now.getTime() + CLOCK_SKEW_MS) return { ok: false, reason: 'outreach-approval-issued-in-future' };
  if (expiresMs <= now.getTime()) return { ok: false, reason: 'outreach-approval-expired' };
  const exact = {
    prospectId: text(prospectId), campaignId: text(campaignId), recipientEmail: normalizeOutreachEmail(recipientEmail),
    provider: text(provider).toLowerCase(), inbox: text(inbox), followup: Number(followup || 0),
    routeDigest: text(routeDigest).toLowerCase(), messageDigest: text(messageDigest).toLowerCase()
  };
  for (const [field, expected] of Object.entries(exact)) {
    if (approval[field] !== expected) return { ok: false, reason: `outreach-approval-${field}-mismatch` };
  }
  if (effectPayloadDigest !== null && approval.effectPayloadDigest !== String(effectPayloadDigest).toLowerCase()) {
    return { ok: false, reason: 'outreach-approval-effectPayloadDigest-mismatch' };
  }
  return { ok: true, approvalId: approval.approvalId, approvalDigest: approval.approvalDigest };
}

export function selectOutreachApproval(prospect = {}, followup = 0) {
  if (Number(followup || 0) === 0) return prospect.outreachApproval || null;
  return prospect.followupApprovals?.[String(Number(followup))] || null;
}

export function evaluateOutreachGovernance({ prospect = {}, campaign = {}, cfg = {}, subject = '', body = '', followup = 0, date = new Date() } = {}) {
  const provider = text(cfg.outbound?.provider || 'gmail-api').toLowerCase();
  if (cfg.outbound?.launchPhase !== 'canary') return { ok: false, reason: 'outbound-launch-phase-not-canary' };
  const route = prospect.outreachRoute;
  const routeCheck = verifyOutreachRouteEvidence({
    route,
    recipientEmail: prospect.contact?.email,
    provider,
    now: date,
    maxAgeDays: cfg.outbound?.routeEvidenceMaxAgeDays
  });
  if (!routeCheck.ok) return routeCheck;
  const followupNumber = Number(followup || 0);
  if (!Number.isInteger(followupNumber) || followupNumber < 0 || followupNumber > 1) return { ok: false, reason: 'outreach-followup-out-of-bounds' };
  if (followupNumber === 0 && (prospect.previouslyContactedAt || prospect.priorContact?.lastContactedAt)) {
    return { ok: false, reason: 'outreach-prior-contact-requires-followup-reconciliation' };
  }
  if (followupNumber > 0 && (!prospect.sentAt || !prospect.threadId || !prospect.rfcMessageId)) {
    return { ok: false, reason: 'outreach-followup-thread-proof-missing' };
  }
  const messageDigest = outreachMessageDigest({
    recipientEmail: prospect.contact?.email,
    subject,
    body,
    provider,
    inbox: prospect.inbox,
    followup: followupNumber,
    threadId: followupNumber ? prospect.threadId : '',
    replyToId: followupNumber ? prospect.rfcMessageId : '',
    listUnsubscribe: prospect.oneClickUnsubscribeUrl
  });
  const approval = selectOutreachApproval(prospect, followupNumber);
  if (!approval) return { ok: false, reason: 'outreach-approval-missing' };
  const approvalCheck = verifyOutreachApproval({
    approval,
    secret: cfg.outbound?.approvalSecret,
    prospectId: prospect.id,
    campaignId: campaign.id,
    recipientEmail: prospect.contact?.email,
    provider,
    inbox: prospect.inbox,
    followup: followupNumber,
    routeDigest: route.routeDigest,
    messageDigest,
    now: date
  });
  if (!approvalCheck.ok) return approvalCheck;
  return {
    ok: true,
    provider,
    routeType: route.routeType,
    routeDigest: route.routeDigest,
    approvalId: approval.approvalId,
    approvalDigest: approval.approvalDigest,
    messageDigest
  };
}

export function canonicalOutreachApprovalForAudit(approval) {
  return canonicalize(approval);
}
