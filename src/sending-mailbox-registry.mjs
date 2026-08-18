// Canonical SendingMailbox registry. Same append-only-receipt-over-auditLog
// pattern as src/sending-domain-registry.mjs -- see that file's header.
//
// Hard invariant: this module never stores a password, OAuth token, API key,
// or any other credential. Registration is REJECTED outright (not silently
// stripped) if the caller passes anything shaped like a secret, so a caller
// mistake surfaces immediately instead of a secret quietly landing in
// auditLog.
import crypto from 'node:crypto';

export const SENDING_MAILBOX_REGISTRY_POLICY_VERSION = 'sending-mailbox-registry-1.0.0';

export const MAILBOX_AUTHENTICATION_STATUSES = Object.freeze([
  'UNKNOWN', 'UNAUTHENTICATED', 'AUTHENTICATED', 'AUTHENTICATION_LOST'
]);

const MAILBOX_EVENT_TYPE = 'sending_mailbox_event';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Field-name-based secret detector. Deliberately broad (over-rejects rather
// than under-rejects) -- a false positive just means a caller renames a
// field; a false negative means a real credential lands in the audit log.
const SECRET_FIELD_PATTERN = /password|passwd|secret|token|apikey|api_key|refreshtoken|refresh_token|accesstoken|access_token|clientsecret|client_secret|privatekey|private_key|smtp.?pass/i;

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function failed(reasonCodes, timestamp) {
  return { ok: false, policyVersion: SENDING_MAILBOX_REGISTRY_POLICY_VERSION, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], timestamp };
}

// Scans every key in a caller-supplied object (recursively, bounded depth)
// for a secret-shaped field name. Returns the offending field paths.
export function detectSecretFields(value, path = '', depth = 0) {
  if (depth > 4 || value == null || typeof value !== 'object') return [];
  const hits = [];
  for (const [key, v] of Object.entries(value)) {
    const at = path ? `${path}.${key}` : key;
    if (SECRET_FIELD_PATTERN.test(key)) hits.push(at);
    if (v && typeof v === 'object') hits.push(...detectSecretFields(v, at, depth + 1));
  }
  return hits;
}

export function registerSendingMailbox({
  store, mailboxId, workspaceId, address, sendingDomainId, provider = '', providerAccountId = '',
  plannedDailyCap = 0, date = new Date(), ...rest
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const secretFields = detectSecretFields(rest);
  const reasons = [];
  if (!text(mailboxId)) reasons.push('mailbox-id-required');
  if (!text(workspaceId)) reasons.push('workspace-id-required');
  if (!EMAIL_PATTERN.test(text(address, 254))) reasons.push('sending-address-invalid-or-missing');
  if (!text(sendingDomainId)) reasons.push('sending-domain-id-required');
  if (secretFields.length) reasons.push(`secret-field-rejected:${secretFields.join(',')}`);
  if (plannedDailyCap != null && (!Number.isFinite(Number(plannedDailyCap)) || Number(plannedDailyCap) < 0)) reasons.push('planned-daily-cap-invalid');
  if (reasons.length) return failed(reasons, timestamp);

  const detail = {
    kind: 'REGISTERED',
    mailboxId: text(mailboxId, 120),
    workspaceId: text(workspaceId, 120),
    address: text(address, 254).toLowerCase(),
    sendingDomainId: text(sendingDomainId, 120),
    provider: text(provider, 80),
    providerAccountId: text(providerAccountId, 120),
    plannedDailyCap: Math.max(0, Math.floor(Number(plannedDailyCap) || 0)),
    policyVersion: SENDING_MAILBOX_REGISTRY_POLICY_VERSION,
    timestamp
  };
  return { ok: true, policyVersion: SENDING_MAILBOX_REGISTRY_POLICY_VERSION, timestamp, mailboxId: detail.mailboxId, event: detail };
}

function mailboxEvent(kind, { store, mailboxId, date = new Date(), ...fields } = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  if (!text(mailboxId)) return failed(['mailbox-id-required'], timestamp);
  const secretFields = detectSecretFields(fields);
  if (secretFields.length) return failed([`secret-field-rejected:${secretFields.join(',')}`], timestamp);
  const detail = { kind, mailboxId: text(mailboxId, 120), timestamp, policyVersion: SENDING_MAILBOX_REGISTRY_POLICY_VERSION, ...fields };
  return { ok: true, policyVersion: SENDING_MAILBOX_REGISTRY_POLICY_VERSION, timestamp, mailboxId: detail.mailboxId, event: detail };
}

export function recordMailboxAuthentication({ store, mailboxId, authenticationStatus, mxStatus, spfStatus, dkimStatus, dmarcStatus, alignmentStatus, date } = {}) {
  if (!MAILBOX_AUTHENTICATION_STATUSES.includes(authenticationStatus)) return failed(['authentication-status-invalid'], referenceDate(date).toISOString());
  return mailboxEvent('AUTHENTICATION_CHECKED', {
    store, mailboxId, date, authenticationStatus, mxStatus: text(mxStatus, 20), spfStatus: text(spfStatus, 20),
    dkimStatus: text(dkimStatus, 20), dmarcStatus: text(dmarcStatus, 20), alignmentStatus: text(alignmentStatus, 20)
  });
}

export function recordMailboxWarmupStatus({ store, mailboxId, warmupStatus, warmupStartTime, currentDailyCap, currentHourlyCap, date } = {}) {
  return mailboxEvent('WARMUP_STATUS_CHANGED', {
    store, mailboxId, date, warmupStatus: text(warmupStatus, 60),
    warmupStartTime: warmupStartTime ? new Date(warmupStartTime).toISOString() : null,
    currentDailyCap: currentDailyCap != null ? Math.max(0, Math.floor(Number(currentDailyCap) || 0)) : null,
    // Hourly cap is never derived/guessed from the daily cap -- it is only
    // ever a real value a provider reported, or explicitly null (UNKNOWN).
    currentHourlyCap: currentHourlyCap != null ? Math.max(0, Math.floor(Number(currentHourlyCap) || 0)) : null
  });
}

// providerReceipt: a REDACTED provider status snapshot only -- opaque
// reference ids and counters, never a credential. See
// src/provider-adapter-contract.mjs#redactProviderReceipt.
export function recordMailboxProviderHealthCheck({ store, mailboxId, providerReceipt, date } = {}) {
  return mailboxEvent('PROVIDER_HEALTH_CHECKED', { store, mailboxId, date, providerReceipt: providerReceipt || null });
}

export function recordMailboxSignal({ store, mailboxId, signal, count = 1, date } = {}) {
  if (!['bounce', 'complaint', 'reply', 'rate_limit'].includes(signal)) return failed(['unknown-signal-type'], referenceDate(date).toISOString());
  return mailboxEvent('SIGNAL_RECORDED', { store, mailboxId, date, signal, count: Math.max(1, Math.floor(Number(count) || 1)) });
}

export function recordMailboxPause({ store, mailboxId, reasonCodes = [], ownerRequired = true, date } = {}) {
  const codes = [...new Set((Array.isArray(reasonCodes) ? reasonCodes : [reasonCodes]).map(c => text(c, 80)).filter(Boolean))];
  if (!codes.length) return failed(['pause-reason-required'], referenceDate(date).toISOString());
  return mailboxEvent('PAUSED', { store, mailboxId, date, reasonCodes: codes, ownerRequired: Boolean(ownerRequired) });
}

export function recordMailboxResume({ store, mailboxId, resumedBy, date } = {}) {
  if (!text(resumedBy)) return failed(['resumed-by-required'], referenceDate(date).toISOString());
  return mailboxEvent('RESUMED', { store, mailboxId, date, resumedBy: text(resumedBy, 120) });
}

export async function logSendingMailboxEvent(store, event) {
  if (!store || typeof store.log !== 'function' || !event?.kind) return null;
  const secretFields = detectSecretFields(event);
  if (secretFields.length) throw new Error(`refusing to log mailbox event containing secret-shaped fields: ${secretFields.join(',')}`);
  return store.log(MAILBOX_EVENT_TYPE, event);
}

async function loadMailboxEvents(store, mailboxId, { limit = 1000 } = {}) {
  if (!store || typeof store.list !== 'function') return [];
  const rows = await store.list('auditLog', { filters: { type: MAILBOX_EVENT_TYPE }, orderBy: 'createdAt', direction: 'asc', limit });
  return (Array.isArray(rows) ? rows : [])
    .map(row => row?.detail)
    .filter(detail => detail && detail.mailboxId === mailboxId);
}

function warmupAgeDays(warmupStartTime, at) {
  if (!warmupStartTime) return null;
  const ms = at.getTime() - Date.parse(warmupStartTime);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

export function computeSendingMailboxState(events = [], { date = new Date() } = {}) {
  const at = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  if (!Array.isArray(events) || !events.length) return null;
  const registered = events.find(e => e.kind === 'REGISTERED');
  if (!registered) return null;

  let authenticationStatus = 'UNKNOWN';
  let mxStatus = 'UNKNOWN'; let spfStatus = 'UNKNOWN'; let dkimStatus = 'UNKNOWN'; let dmarcStatus = 'UNKNOWN'; let alignmentStatus = 'UNKNOWN';
  let warmupStatus = 'WARMUP_NOT_STARTED'; let warmupStartTime = null; let currentDailyCap = 0; let currentHourlyCap = null;
  let lastProviderReceipt = null; let lastProviderHealthCheckAt = null;
  let bounceCount = 0; let complaintCount = 0; let replyCount = 0; let rateLimited = false;
  let paused = false; let pauseReasonCodes = [];

  for (const event of events) {
    switch (event.kind) {
      case 'AUTHENTICATION_CHECKED':
        authenticationStatus = event.authenticationStatus || authenticationStatus;
        mxStatus = event.mxStatus || mxStatus; spfStatus = event.spfStatus || spfStatus;
        dkimStatus = event.dkimStatus || dkimStatus; dmarcStatus = event.dmarcStatus || dmarcStatus;
        alignmentStatus = event.alignmentStatus || alignmentStatus;
        break;
      case 'WARMUP_STATUS_CHANGED':
        warmupStatus = event.warmupStatus || warmupStatus;
        if (event.warmupStartTime) warmupStartTime = event.warmupStartTime;
        if (event.currentDailyCap != null) currentDailyCap = event.currentDailyCap;
        if (event.currentHourlyCap != null) currentHourlyCap = event.currentHourlyCap;
        break;
      case 'PROVIDER_HEALTH_CHECKED':
        lastProviderReceipt = event.providerReceipt || lastProviderReceipt;
        lastProviderHealthCheckAt = event.timestamp;
        break;
      case 'SIGNAL_RECORDED':
        if (event.signal === 'bounce') bounceCount += event.count || 1;
        else if (event.signal === 'complaint') complaintCount += event.count || 1;
        else if (event.signal === 'reply') replyCount += event.count || 1;
        else if (event.signal === 'rate_limit') rateLimited = true;
        break;
      case 'PAUSED':
        paused = true; pauseReasonCodes = event.reasonCodes || [];
        break;
      case 'RESUMED':
        paused = false; pauseReasonCodes = [];
        break;
      default:
        break;
    }
  }

  return {
    policyVersion: SENDING_MAILBOX_REGISTRY_POLICY_VERSION,
    mailboxId: registered.mailboxId,
    workspaceId: registered.workspaceId,
    address: registered.address,
    sendingDomainId: registered.sendingDomainId,
    provider: registered.provider || '',
    providerAccountId: registered.providerAccountId || '',
    authenticationStatus, mxStatus, spfStatus, dkimStatus, dmarcStatus, alignmentStatus,
    warmupStatus, warmupStartTime, warmupAgeDays: warmupAgeDays(warmupStartTime, at),
    currentDailyCap, currentHourlyCap, plannedDailyCap: registered.plannedDailyCap || 0,
    lastProviderHealthCheckAt, lastExternalReceipt: lastProviderReceipt,
    bounceCount, complaintCount, replyCount, providerRateLimited: rateLimited,
    paused, pauseReasonCodes,
    ownerAuthorizationReference: null
  };
}

export async function loadSendingMailbox(store, mailboxId, opts = {}) {
  const events = await loadMailboxEvents(store, mailboxId);
  return computeSendingMailboxState(events, opts);
}

export async function listSendingMailboxesForDomain(store, sendingDomainId, opts = {}) {
  if (!store || typeof store.list !== 'function') return [];
  const rows = await store.list('auditLog', { filters: { type: MAILBOX_EVENT_TYPE }, orderBy: 'createdAt', direction: 'asc', limit: 5000 });
  const byMailbox = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const detail = row?.detail;
    if (!detail?.mailboxId) continue;
    if (!byMailbox.has(detail.mailboxId)) byMailbox.set(detail.mailboxId, []);
    byMailbox.get(detail.mailboxId).push(detail);
  }
  return [...byMailbox.entries()]
    .map(([, events]) => computeSendingMailboxState(events, opts))
    .filter(state => state && (!sendingDomainId || state.sendingDomainId === sendingDomainId));
}
