import crypto from 'node:crypto';

export const POSTAL_SENDER_EVIDENCE_CONSUMER_VERSION = 'uberbond.postal-sender-evidence-consumer-1.0.0';

function normalizeDomain(value) {
  const domain = String(value || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  return domain && /^[a-z0-9.-]+$/.test(domain) && !domain.includes('..') ? domain : null;
}

function domainFromAccount(account = {}) {
  const explicit = normalizeDomain(account.domain || account.senderDomain || account.mailDomain);
  if (explicit) return explicit;
  const email = String(account.email || account.address || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  return at > 0 ? normalizeDomain(email.slice(at + 1)) : null;
}

function compactDns(dns = {}) {
  return {
    spfStatus: dns.spfStatus || null,
    dkimStatus: dns.dkimStatus || null,
    mxStatus: dns.mxStatus || null,
    returnPathStatus: dns.returnPathStatus || null,
    spfErrorDigest: dns.spfErrorDigest || null,
    dkimErrorDigest: dns.dkimErrorDigest || null,
    mxErrorDigest: dns.mxErrorDigest || null,
    returnPathErrorDigest: dns.returnPathErrorDigest || null
  };
}

function deterministicEventId(event, inbox) {
  return `postal_dns_${crypto.createHash('sha256').update(`${event.occurrenceKey || ''}:${inbox}`).digest('hex').slice(0, 32)}`;
}

export function classifyPostalSenderEvidence(event = {}) {
  const reasons = [];
  if (event.provider !== 'postal') reasons.push('provider-not-postal');
  if (event.authenticated !== true) reasons.push('postal-sender-evidence-unauthenticated');
  if (event.quarantineReason != null) reasons.push('postal-sender-evidence-quarantined');
  if (event.eligibleForSenderEvidence !== true) reasons.push('postal-sender-evidence-not-eligible');
  if (event.eligibleForReconciliation === true) reasons.push('sender-evidence-must-not-be-reconciliation-evidence');
  if (event.lifecycle !== 'DNS_ERROR') reasons.push('postal-sender-evidence-not-dns-error');
  const domain = normalizeDomain(event.domain);
  if (!domain) reasons.push('postal-sender-evidence-domain-required');
  return {
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'AUTHENTICATED_NEGATIVE_SENDER_EVIDENCE' : 'REFUSED',
    domain,
    reasonCodes: reasons
  };
}

/**
 * Consume authenticated Postal DomainDNSError evidence into UberBond's existing
 * canonical sender-health model. This function is intentionally one-way:
 * negative DNS evidence may pause matching sender inboxes, but no Postal DNS
 * webhook can establish readiness or unpause a sender.
 *
 * The caller must pass the canonical Store/PostgresStore interface. No provider
 * call or external communication occurs here.
 */
export async function consumePostalSenderEvidence({ event, store, accounts = null } = {}) {
  const classification = classifyPostalSenderEvidence(event);
  if (!classification.ok) {
    return { ok: false, status: 'REFUSED', reasonCodes: classification.reasonCodes, pausedInboxes: [] };
  }
  if (!store || typeof store.list !== 'function' || typeof store.recordOutboundEvent !== 'function' || typeof store.setSenderPaused !== 'function') {
    return { ok: false, status: 'REFUSED', reasonCodes: ['canonical-store-required'], pausedInboxes: [] };
  }

  const sourceAccounts = Array.isArray(accounts) ? accounts : await store.list('accounts');
  const matching = sourceAccounts
    .filter(account => account && account.connected !== false)
    .filter(account => domainFromAccount(account) === classification.domain)
    .filter(account => String(account.slot || account.inbox || '').trim());

  if (!matching.length) {
    return {
      ok: true,
      status: 'NO_MATCHING_SENDER',
      reasonCodes: ['authenticated-dns-error-no-matching-sender'],
      domain: classification.domain,
      pausedInboxes: []
    };
  }

  const dns = compactDns(event.dns || {});
  const pausedInboxes = [];
  for (const account of matching) {
    const inbox = String(account.slot || account.inbox).trim();
    await store.recordOutboundEvent({
      id: deterministicEventId(event, inbox),
      inbox,
      eventType: 'sender_dns_error',
      occurredAt: event.occurredAt,
      detail: {
        provider: 'postal',
        provenance: event.provenance,
        occurrenceKey: event.occurrenceKey,
        domain: classification.domain,
        dns
      }
    });
    await store.setSenderPaused(inbox, true, 'postal-domain-dns-error');
    pausedInboxes.push(inbox);
  }

  return {
    ok: true,
    status: 'SENDERS_PAUSED_FROM_AUTHENTICATED_DNS_ERROR',
    reasonCodes: ['authenticated-postal-dns-error'],
    domain: classification.domain,
    pausedInboxes: [...new Set(pausedInboxes)].sort()
  };
}
