// Canonical SendingDomain registry.
//
// State is derived, not stored twice: this module writes one receipt per
// event to the existing auditLog (via store.log) and computes current state
// by folding a domain's own event history -- the same append-only-receipt
// pattern src/commercial-memory.mjs and src/commercial-outcome.mjs already
// use elsewhere in this codebase. No new mutable collection, no second
// source of truth, no parallel domain table.
//
// This module never performs a network call, never registers a domain with
// a registrar, and never accepts or stores a credential. It only records
// and folds the caller's own already-verified facts.
import crypto from 'node:crypto';

export const SENDING_DOMAIN_REGISTRY_POLICY_VERSION = 'sending-domain-registry-1.0.0';

export const SENDING_DOMAIN_STATES = Object.freeze([
  'UNKNOWN', 'OWNERSHIP_UNVERIFIED', 'DNS_INCOMPLETE', 'DNS_CONTRADICTORY',
  'MAILBOX_UNVERIFIED', 'WARMUP_NOT_STARTED', 'WARMING', 'READY_FOR_DRY_RUN',
  'READY_FOR_LIMITED_OUTREACH', 'PAUSED', 'BLOCKED', 'UNCERTAIN', 'RETIRED'
]);

export const OWNERSHIP_STATUSES = Object.freeze(['OWNER_CONFIRMED', 'UNVERIFIED']);

const DOMAIN_EVENT_TYPE = 'sending_domain_event';
const DOMAIN_NAME_PATTERN = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$/i;

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function isValidDomainName(value) {
  const v = text(value, 253).toLowerCase();
  return v.length > 0 && DOMAIN_NAME_PATTERN.test(v);
}

function failed(reasonCodes, timestamp) {
  return { ok: false, policyVersion: SENDING_DOMAIN_REGISTRY_POLICY_VERSION, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], timestamp };
}

// Registers a domain the owner represents as already purchased/owned. This
// never contacts a registrar and never verifies ownership itself -- ownership
// verification (e.g. a DNS TXT challenge) is a real, separate capability not
// built this wave; ownershipStatus stays whatever the caller honestly
// supplies, defaulting to the conservative UNVERIFIED.
export function registerSendingDomain({
  store, domainId, workspaceId, domain, registrar = '', ownershipStatus = 'UNVERIFIED',
  purpose = 'outreach', provider = '', date = new Date()
} = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  const reasons = [];
  if (!text(domainId)) reasons.push('domain-id-required');
  if (!text(workspaceId)) reasons.push('workspace-id-required');
  if (!isValidDomainName(domain)) reasons.push('domain-name-invalid-or-missing');
  if (!OWNERSHIP_STATUSES.includes(ownershipStatus)) reasons.push('ownership-status-invalid');
  if (reasons.length) return failed(reasons, timestamp);

  const detail = {
    kind: 'REGISTERED',
    domainId: text(domainId, 120),
    workspaceId: text(workspaceId, 120),
    domain: text(domain, 253).toLowerCase(),
    registrar: text(registrar, 80),
    ownershipStatus,
    purpose: text(purpose, 80),
    provider: text(provider, 80),
    policyVersion: SENDING_DOMAIN_REGISTRY_POLICY_VERSION,
    timestamp
  };
  return { ok: true, policyVersion: SENDING_DOMAIN_REGISTRY_POLICY_VERSION, timestamp, domainId: detail.domainId, event: detail };
}

function domainEvent(kind, { store, domainId, date = new Date(), ...fields } = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  if (!text(domainId)) return failed(['domain-id-required'], timestamp);
  const detail = { kind, domainId: text(domainId, 120), timestamp, policyVersion: SENDING_DOMAIN_REGISTRY_POLICY_VERSION, ...fields };
  return { ok: true, policyVersion: SENDING_DOMAIN_REGISTRY_POLICY_VERSION, timestamp, domainId: detail.domainId, event: detail };
}

// dnsResult: the output of verifySendingDomainDns() (src/dns-verification.mjs).
// Only its summary fields are recorded -- public DNS record values, never a
// credential.
export function recordDomainDnsVerification({ store, domainId, dnsResult, date } = {}) {
  if (!dnsResult || typeof dnsResult !== 'object') return failed(['dns-result-required'], referenceDate(date).toISOString());
  return domainEvent('DNS_VERIFIED', {
    store, domainId, date,
    overallStatus: dnsResult.overallStatus,
    checks: dnsResult.checks,
    reasonCodes: dnsResult.reasonCodes || []
  });
}

export function recordMailboxLinked({ store, domainId, mailboxId, date } = {}) {
  if (!text(mailboxId)) return failed(['mailbox-id-required'], referenceDate(date).toISOString());
  return domainEvent('MAILBOX_LINKED', { store, domainId, date, mailboxId: text(mailboxId, 120) });
}

export function recordDomainWarmupStateChange({ store, domainId, mailboxId, warmupState, date } = {}) {
  return domainEvent('WARMUP_STATE_CHANGED', { store, domainId, date, mailboxId: text(mailboxId, 120), warmupState: text(warmupState, 60) });
}

// The ONLY event kind that can ever move a domain to READY_FOR_LIMITED_OUTREACH.
// Emitting this is an owner authorization act, not an automatic consequence
// of warm-up completing -- see docs/UBERBOND_DOMAIN_MAILBOX_READINESS.md.
export function recordOutreachAuthorized({ store, domainId, authorizedBy, date } = {}) {
  if (!text(authorizedBy)) return failed(['authorized-by-required'], referenceDate(date).toISOString());
  return domainEvent('OUTREACH_AUTHORIZED', { store, domainId, date, authorizedBy: text(authorizedBy, 120) });
}

export function recordDomainPause({ store, domainId, reasonCodes = [], scope = 'DOMAIN', ownerRequired = true, date } = {}) {
  const codes = [...new Set((Array.isArray(reasonCodes) ? reasonCodes : [reasonCodes]).map(c => text(c, 80)).filter(Boolean))];
  if (!codes.length) return failed(['pause-reason-required'], referenceDate(date).toISOString());
  return domainEvent('PAUSED', { store, domainId, date, reasonCodes: codes, scope: text(scope, 40), ownerRequired: Boolean(ownerRequired) });
}

export function recordDomainResume({ store, domainId, resumedBy, date } = {}) {
  if (!text(resumedBy)) return failed(['resumed-by-required'], referenceDate(date).toISOString());
  return domainEvent('RESUMED', { store, domainId, date, resumedBy: text(resumedBy, 120) });
}

export function recordDomainRetired({ store, domainId, reason, date } = {}) {
  return domainEvent('RETIRED', { store, domainId, date, reason: text(reason, 200) });
}

export async function logSendingDomainEvent(store, event) {
  if (!store || typeof store.log !== 'function' || !event?.kind) return null;
  return store.log(DOMAIN_EVENT_TYPE, event);
}

async function loadDomainEvents(store, domainId, { limit = 1000 } = {}) {
  if (!store || typeof store.list !== 'function') return [];
  const rows = await store.list('auditLog', { filters: { type: DOMAIN_EVENT_TYPE }, orderBy: 'createdAt', direction: 'asc', limit });
  return (Array.isArray(rows) ? rows : [])
    .map(row => row?.detail)
    .filter(detail => detail && detail.domainId === domainId);
}

function nextSafeAction(state, ctx) {
  switch (state) {
    case 'OWNERSHIP_UNVERIFIED': return 'Confirm domain ownership with the registrar/provider before anything else.';
    case 'DNS_INCOMPLETE': return 'Add the exact DNS records the provider requires, then re-run DNS verification.';
    case 'DNS_CONTRADICTORY': return 'Resolve contradictory DNS records (e.g. duplicate SPF) before proceeding -- do not add a second record.';
    case 'MAILBOX_UNVERIFIED': return 'Connect and authenticate at least one mailbox on this domain.';
    case 'WARMUP_NOT_STARTED': return 'Request native provider warm-up for the linked mailbox.';
    case 'WARMING': return `Warm-up is in progress. Cold outreach stays locked until at least ${ctx.minWarmupDays ?? 14} days have elapsed and the provider reports warm-up complete.`;
    case 'READY_FOR_DRY_RUN': return 'Warm-up requirements are met. Owner authorization is required before any real outreach.';
    case 'READY_FOR_LIMITED_OUTREACH': return 'Owner has authorized limited outreach. Respect the configured volume caps.';
    case 'PAUSED': return 'Resolve the pause reason codes, then explicitly resume.';
    case 'BLOCKED': return 'Owner action required -- see the operator action card.';
    case 'UNCERTAIN': return 'Evidence is stale. Re-run verification before trusting the last known state.';
    case 'RETIRED': return 'This domain is retired. No further action.';
    default: return 'Register this domain to begin.';
  }
}

// Pure fold over one domain's chronological event history. Deterministic:
// the same events in the same order always produce the same state.
export function computeSendingDomainState(events = [], { date = new Date(), minWarmupDays = 14, maxDnsEvidenceAgeHours = 24 } = {}) {
  const at = referenceDate(date);
  if (!Array.isArray(events) || !events.length) return null;

  const registered = events.find(e => e.kind === 'REGISTERED');
  if (!registered) return null;

  let state = registered.ownershipStatus === 'OWNER_CONFIRMED' ? 'DNS_INCOMPLETE' : 'OWNERSHIP_UNVERIFIED';
  let dns = { status: 'UNKNOWN', lastVerifiedAt: null, checks: null, reasonCodes: [] };
  let linkedMailboxIds = [];
  let warmupState = 'WARMUP_NOT_STARTED';
  let warmupMailboxId = null;
  let outreachAuthorized = false;
  let paused = false;
  let pauseReasonCodes = [];
  let retired = false;
  let statusReason = 'Domain registered; no further evidence yet.';

  for (const event of events) {
    switch (event.kind) {
      case 'DNS_VERIFIED':
        dns = { status: event.overallStatus || 'UNKNOWN', lastVerifiedAt: event.timestamp, checks: event.checks || null, reasonCodes: event.reasonCodes || [] };
        break;
      case 'MAILBOX_LINKED':
        if (event.mailboxId && !linkedMailboxIds.includes(event.mailboxId)) linkedMailboxIds.push(event.mailboxId);
        break;
      case 'WARMUP_STATE_CHANGED':
        warmupState = event.warmupState || warmupState;
        warmupMailboxId = event.mailboxId || warmupMailboxId;
        break;
      case 'OUTREACH_AUTHORIZED':
        outreachAuthorized = true;
        break;
      case 'PAUSED':
        paused = true;
        pauseReasonCodes = event.reasonCodes || [];
        break;
      case 'RESUMED':
        paused = false;
        pauseReasonCodes = [];
        break;
      case 'RETIRED':
        retired = true;
        break;
      default:
        break;
    }
  }

  if (registered.ownershipStatus !== 'OWNER_CONFIRMED') {
    state = 'OWNERSHIP_UNVERIFIED';
    statusReason = 'Domain ownership has not been confirmed.';
  } else if (dns.status === 'UNKNOWN') {
    state = 'DNS_INCOMPLETE';
    statusReason = 'DNS has not been verified yet.';
  } else if (dns.reasonCodes.some(code => String(code).includes('contradict') || String(code).includes('duplicate'))) {
    state = 'DNS_CONTRADICTORY';
    statusReason = 'DNS has contradictory or duplicate records that must be resolved manually.';
  } else if (dns.status === 'RED') {
    state = 'DNS_INCOMPLETE';
    statusReason = 'DNS verification found missing required records.';
  } else if (dns.status === 'BLOCKED') {
    state = 'DNS_INCOMPLETE';
    statusReason = 'Provider DNS requirements are unknown, so DNS cannot be verified yet.';
  } else if (!linkedMailboxIds.length) {
    state = 'MAILBOX_UNVERIFIED';
    statusReason = 'DNS looks correct, but no mailbox is connected yet.';
  } else if (warmupState === 'WARMUP_NOT_STARTED') {
    state = 'WARMUP_NOT_STARTED';
    statusReason = 'A mailbox is connected. Warm-up has not been requested yet.';
  } else if (warmupState === 'WARMUP_ACTIVE') {
    state = 'WARMING';
    statusReason = 'Warm-up is active.';
  } else if (warmupState === 'WARMUP_PAUSED' || warmupState === 'WARMUP_UNCERTAIN') {
    state = 'WARMING';
    statusReason = `Warm-up is ${warmupState === 'WARMUP_PAUSED' ? 'paused' : 'in an uncertain state'} and needs attention.`;
  } else if (warmupState === 'WARMUP_BLOCKED') {
    state = 'BLOCKED';
    statusReason = 'Warm-up is blocked -- see the operator action card.';
  } else if (warmupState === 'WARMUP_COMPLETE') {
    state = outreachAuthorized ? 'READY_FOR_LIMITED_OUTREACH' : 'READY_FOR_DRY_RUN';
    statusReason = outreachAuthorized
      ? 'Warm-up complete and outreach explicitly authorized by the owner.'
      : 'Warm-up complete. Outreach still requires explicit owner authorization.';
  }

  const evidenceAgeHours = dns.lastVerifiedAt ? (at.getTime() - Date.parse(dns.lastVerifiedAt)) / 3_600_000 : Infinity;
  const evidenceFreshness = dns.lastVerifiedAt && evidenceAgeHours <= maxDnsEvidenceAgeHours ? 'FRESH' : dns.lastVerifiedAt ? 'STALE' : 'NONE';

  if (retired) { state = 'RETIRED'; statusReason = 'This domain is retired.'; }
  else if (paused) { state = 'PAUSED'; statusReason = `Paused: ${pauseReasonCodes.join(', ') || 'unspecified reason'}.`; }
  else if (evidenceFreshness === 'STALE' && !['OWNERSHIP_UNVERIFIED', 'RETIRED', 'PAUSED', 'BLOCKED'].includes(state)) {
    state = 'UNCERTAIN';
    statusReason = `DNS evidence is stale (last verified ${dns.lastVerifiedAt}); re-verify before trusting the prior state.`;
  }

  return {
    policyVersion: SENDING_DOMAIN_REGISTRY_POLICY_VERSION,
    domainId: registered.domainId,
    workspaceId: registered.workspaceId,
    domain: registered.domain,
    registrar: registered.registrar || '',
    ownershipStatus: registered.ownershipStatus,
    purpose: registered.purpose || '',
    provider: registered.provider || '',
    state,
    dnsState: dns,
    mailboxState: { linkedMailboxIds },
    warmupState: { status: warmupState, mailboxId: warmupMailboxId },
    outreachState: outreachAuthorized ? 'AUTHORIZED' : 'LOCKED',
    trackingDomainState: 'NOT_CONFIGURED',
    lastVerifiedTimestamp: dns.lastVerifiedAt,
    evidenceFreshness,
    statusReason,
    coldOutreachBlocked: state !== 'READY_FOR_LIMITED_OUTREACH',
    nextSafeAction: nextSafeAction(state, { minWarmupDays }),
    policyVersionOfDecision: digest({ state, dns, linkedMailboxIds, warmupState, outreachAuthorized, paused, retired }).slice(0, 24)
  };
}

export async function loadSendingDomain(store, domainId, opts = {}) {
  const events = await loadDomainEvents(store, domainId);
  return computeSendingDomainState(events, opts);
}

export async function listSendingDomains(store, opts = {}) {
  if (!store || typeof store.list !== 'function') return [];
  const rows = await store.list('auditLog', { filters: { type: DOMAIN_EVENT_TYPE }, orderBy: 'createdAt', direction: 'asc', limit: 5000 });
  const byDomain = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const detail = row?.detail;
    if (!detail?.domainId) continue;
    if (!byDomain.has(detail.domainId)) byDomain.set(detail.domainId, []);
    byDomain.get(detail.domainId).push(detail);
  }
  return [...byDomain.entries()].map(([, events]) => computeSendingDomainState(events, opts)).filter(Boolean);
}
