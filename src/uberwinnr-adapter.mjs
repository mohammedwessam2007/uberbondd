import crypto from 'node:crypto';

export const UBERWINNR_VERSION = 'uberbond.uberwinnr.v1';
export const WINNR_API_BASE = 'https://api.winnr.app/v1';

const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const lower = (value, max = 2000) => clean(value, max).toLowerCase();
const emailOk = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

function redactToken(token = '') {
  const value = clean(token, 300);
  if (!value) return null;
  return value.length <= 10 ? 'REDACTED' : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function safeJson(value) {
  try { return JSON.stringify(value); } catch { return ''; }
}

function responseReceipt({ method, path, status, requestId = null, body = null }) {
  const digest = crypto.createHash('sha256').update(safeJson(body)).digest('hex');
  return Object.freeze({
    provider: 'winnr',
    method,
    path,
    httpStatus: status,
    requestId,
    responseDigest: `sha256:${digest}`
  });
}

function requestPath(path = '') {
  const value = clean(path, 1500);
  if (!value.startsWith('/')) throw new Error('winnr-path-must-start-with-slash');
  if (value.includes('://')) throw new Error('winnr-path-must-be-relative');
  return value;
}

function readHeader(headers = {}, name = '') {
  const wanted = lower(name, 100);
  if (typeof headers?.get === 'function') return headers.get(name) || headers.get(wanted) || '';
  for (const [key, value] of Object.entries(headers || {})) {
    if (lower(key, 100) === wanted) return Array.isArray(value) ? value.join(',') : String(value ?? '');
  }
  return '';
}

export function verifyWinnrWebhookSignature({
  rawBody = '',
  headers = {},
  secret = '',
  now = Date.now(),
  toleranceSeconds = 300
} = {}) {
  const timestamp = clean(readHeader(headers, 'x-winnr-timestamp'), 50);
  const signatureHeader = clean(readHeader(headers, 'x-winnr-signature'), 2000);
  const key = clean(secret, 500);
  const ts = Number(timestamp);
  const nowSeconds = Number(now) / 1000;
  if (!timestamp || !Number.isFinite(ts) || !Number.isFinite(nowSeconds)) {
    return { ok: false, reason: 'invalid-timestamp' };
  }
  if (Math.abs(nowSeconds - ts) > Number(toleranceSeconds || 300)) {
    return { ok: false, reason: 'stale-signature' };
  }
  if (!key || !signatureHeader) return { ok: false, reason: 'signature-or-secret-missing' };

  const expected = crypto
    .createHmac('sha256', key)
    .update(`${timestamp}.`)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'))
    .digest('hex');

  const matched = signatureHeader.split(',').some(part => {
    const value = part.trim();
    if (!value.startsWith('v1=')) return false;
    const candidate = value.slice(3);
    if (candidate.length !== expected.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
    } catch {
      return false;
    }
  });

  return { ok: matched, reason: matched ? null : 'signature-mismatch' };
}

export function normalizeWinnrEvent(event = {}) {
  const type = clean(event.type, 120);
  const id = clean(event.id, 240);
  const created = clean(event.created, 80);
  const data = event?.data && typeof event.data === 'object' ? event.data : {};
  const base = {
    provider: 'winnr',
    eventId: id || null,
    eventType: type || null,
    createdAt: created || null,
    externalEffectAuthority: 'NONE'
  };

  if (type === 'email.received') {
    return Object.freeze({
      ...base,
      factType: 'INBOUND_EMAIL_OBSERVED',
      sender: lower(data.sender, 320) || null,
      recipient: lower(data.recipient, 320) || null,
      subject: clean(data.subject, 998) || null,
      inReplyTo: clean(data.in_reply_to || data.inReplyTo, 500) || null
    });
  }
  if (type === 'email.bounced') {
    return Object.freeze({
      ...base,
      factType: 'BOUNCE_OBSERVED',
      recipient: lower(data.recipient, 320) || null,
      bounceType: clean(data.bounce_type || data.bounceType, 120) || null,
      diagnostic: clean(data.diagnostic, 2000) || null
    });
  }
  if (type === 'email.complained') {
    return Object.freeze({
      ...base,
      factType: 'COMPLAINT_OBSERVED',
      recipient: lower(data.recipient, 320) || null,
      sender: lower(data.sender, 320) || null
    });
  }
  if (type === 'message.relayed') {
    return Object.freeze({
      ...base,
      factType: 'MESSAGE_ID_MAPPING_OBSERVED',
      originalMessageId: clean(data.original_message_id || data.originalMessageId, 500) || null,
      providerMessageId: clean(data.provider_message_id || data.providerMessageId, 500) || null,
      upstreamProvider: clean(data.provider, 120) || null,
      recipient: lower(data.recipient, 320) || null,
      sender: lower(data.sender, 320) || null,
      sendingDomain: lower(data.sending_domain || data.sendingDomain, 253) || null
    });
  }
  if (type === 'domain.ready' || type === 'domain.dns_failed' || type === 'domain.created') {
    return Object.freeze({
      ...base,
      factType: type === 'domain.ready' ? 'DOMAIN_READY_OBSERVED' : type === 'domain.dns_failed' ? 'DOMAIN_DNS_FAILURE_OBSERVED' : 'DOMAIN_CREATED_OBSERVED',
      domain: lower(data.domain || data.name, 253) || null
    });
  }
  if (type === 'email_user.created' || type === 'email_user.deleted') {
    return Object.freeze({
      ...base,
      factType: type === 'email_user.created' ? 'MAILBOX_CREATED_OBSERVED' : 'MAILBOX_DELETED_OBSERVED',
      email: lower(data.email || data.address, 320) || null
    });
  }
  return Object.freeze({ ...base, factType: 'WINNR_EVENT_OBSERVED', dataDigest: `sha256:${crypto.createHash('sha256').update(safeJson(data)).digest('hex')}` });
}

export function createWinnrApiClient({
  token = '',
  authorized = false,
  termsCompatible = false,
  evidenceRef = '',
  fetchImpl = globalThis.fetch
} = {}) {
  const reasons = [];
  const rawToken = clean(token, 500);
  if (!rawToken.startsWith('wnr_')) reasons.push('winnr-api-token-required');
  if (authorized !== true) reasons.push('provider-account-authorization-required');
  if (termsCompatible !== true) reasons.push('provider-terms-compatibility-required');
  if (!clean(evidenceRef, 1500)) reasons.push('provider-evidence-ref-required');
  if (typeof fetchImpl !== 'function') reasons.push('fetch-implementation-required');
  if (reasons.length) {
    return Object.freeze({
      ok: false,
      status: 'UBERWINNR_CLIENT_REFUSED',
      reasonCodes: reasons,
      providerCalls: 0,
      token: redactToken(rawToken)
    });
  }

  async function request(method, path, { body = undefined, writeAuthorized = false } = {}) {
    const verb = clean(method, 10).toUpperCase();
    const relative = requestPath(path);
    const isWrite = !['GET', 'HEAD'].includes(verb);
    if (isWrite && writeAuthorized !== true) {
      return {
        ok: false,
        status: 'UBERWINNR_WRITE_REFUSED',
        reasonCodes: ['explicit-write-authorization-required'],
        providerCalls: 0,
        path: relative
      };
    }

    const headers = {
      Authorization: `Bearer ${rawToken}`,
      Accept: 'application/json'
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await fetchImpl(`${WINNR_API_BASE}${relative}`, {
        method: verb,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      return {
        ok: false,
        status: isWrite ? 'UBERWINNR_WRITE_OUTCOME_UNCERTAIN' : 'UBERWINNR_READ_FAILED',
        reasonCodes: ['provider-network-error'],
        providerCalls: 1,
        automaticRetryAuthorized: false,
        error: clean(error?.message || error, 500)
      };
    }

    const requestId = response?.headers?.get?.('x-request-id') || response?.headers?.get?.('request-id') || null;
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
    const receipt = responseReceipt({ method: verb, path: relative, status: response.status, requestId, body: parsed });

    if (response.status === 429) {
      return {
        ok: false,
        status: 'UBERWINNR_RATE_LIMITED',
        reasonCodes: ['provider-rate-limit'],
        retryAfterSeconds: Number(response.headers?.get?.('retry-after') || 0) || null,
        providerCalls: 1,
        automaticRetryAuthorized: false,
        receipt
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: isWrite ? 'UBERWINNR_WRITE_REFUSED_OR_FAILED' : 'UBERWINNR_READ_FAILED',
        reasonCodes: [clean(parsed?.error?.code || `http-${response.status}`, 160)],
        providerCalls: 1,
        automaticRetryAuthorized: false,
        receipt
      };
    }
    return {
      ok: true,
      status: isWrite ? 'UBERWINNR_WRITE_CONFIRMED' : 'UBERWINNR_READ_CONFIRMED',
      providerCalls: 1,
      data: parsed?.data ?? parsed,
      meta: parsed?.meta ?? null,
      receipt
    };
  }

  return Object.freeze({
    ok: true,
    status: 'UBERWINNR_CLIENT_READY',
    version: UBERWINNR_VERSION,
    token: redactToken(rawToken),
    evidenceRef: clean(evidenceRef, 1500),
    listDomains: () => request('GET', '/domains'),
    getDomain: ({ domainId } = {}) => request('GET', `/domains/${encodeURIComponent(clean(domainId, 240))}`),
    getDnsRecords: ({ domainId } = {}) => request('GET', `/domains/${encodeURIComponent(clean(domainId, 240))}/dns-records`),
    connectOwnedDomains: ({ domains = [], manualDns = true, writeAuthorized = false } = {}) => request('POST', '/domains/connect', {
      body: {
        domains: (Array.isArray(domains) ? domains : []).slice(0, 100).map(domain => lower(domain, 253)).filter(Boolean),
        ...(manualDns ? { manual_dns: true } : {})
      },
      writeAuthorized
    }),
    verifyDns: ({ domainId, writeAuthorized = false } = {}) => request('POST', `/domains/${encodeURIComponent(clean(domainId, 240))}/verify-dns`, {
      writeAuthorized
    }),
    checkNameservers: ({ domains = [], writeAuthorized = false } = {}) => request('POST', '/domains/check-ns', {
      body: { domains: (Array.isArray(domains) ? domains : []).slice(0, 100).map(domain => lower(domain, 253)).filter(Boolean) },
      writeAuthorized
    }),
    listMailboxes: ({ domain = '' } = {}) => request('GET', `/email-users?filter[domain]=${encodeURIComponent(lower(domain, 253))}`),
    createMailbox: ({ domain, username, name, writeAuthorized = false } = {}) => request('POST', '/email-users', {
      body: { domain: lower(domain, 253), username: lower(username, 120), name: clean(name, 200) },
      writeAuthorized
    }),
    createMailboxesBulk: ({ domain, users = [], writeAuthorized = false } = {}) => request('POST', '/email-users/bulk', {
      body: {
        domain: lower(domain, 253),
        users: (Array.isArray(users) ? users : []).slice(0, 100).map(user => typeof user === 'string'
          ? lower(user, 120)
          : {
              username: lower(user?.username, 120),
              name: clean(user?.name, 200),
              ...(clean(user?.footer, 4000) ? { footer: clean(user.footer, 4000) } : {})
            })
      },
      writeAuthorized
    }),
    getJob: ({ jobId } = {}) => request('GET', `/jobs/${encodeURIComponent(clean(jobId, 240))}`),
    listExportFormats: () => request('GET', '/export/formats'),
    exportMailboxes: ({ format = 'default', domains = [], emails = [], allDomains = false, writeAuthorized = false } = {}) => {
      const body = { format: lower(format || 'default', 80) || 'default' };
      const domainRows = (Array.isArray(domains) ? domains : []).map(domain => lower(domain, 253)).filter(Boolean);
      const emailRows = (Array.isArray(emails) ? emails : []).map(email => lower(email, 320)).filter(emailOk);
      if (domainRows.length) body.domains = domainRows;
      if (emailRows.length) body.emails = emailRows;
      if (allDomains === true) body.getAllDomains = true;
      return request('POST', '/export', { body, writeAuthorized });
    },
    createWebhook: ({ url, events = [], description = '', writeAuthorized = false } = {}) => request('POST', '/webhooks', {
      body: { url: clean(url, 1500), events: (Array.isArray(events) ? events : []).map(x => clean(x, 120)).filter(Boolean), description: clean(description, 500) || undefined },
      writeAuthorized
    }),
    lookupMessage: ({ messageId } = {}) => request('GET', `/messages/lookup?message_id=${encodeURIComponent(clean(messageId, 500))}`),
    rawRequest: request,
    truthBoundary: 'This adapter calls only the documented Winnr API after explicit account authorization and terms evidence. Writes never retry automatically because a network error after a consequential request is an uncertain outcome until reconciled.'
  });
}

export function compileWinnrPostPurchaseChecklist({
  plan = 'Startup',
  expectedMonthlyUsd = 69,
  domains = [],
  mailboxesPerDomain = 1
} = {}) {
  const domainRows = (Array.isArray(domains) ? domains : []).map(domain => lower(domain, 253)).filter(Boolean);
  return Object.freeze({
    version: UBERWINNR_VERSION,
    provider: 'winnr',
    plan,
    expectedMonthlyUsd: Number(expectedMonthlyUsd),
    providerWarmupAddonRequired: false,
    domainCount: domainRows.length,
    mailboxesPerDomain: Math.max(1, Math.floor(Number(mailboxesPerDomain) || 1)),
    phases: [
      'VERIFY_PAID_PLAN_ENTITLEMENT',
      'CREATE_READ_ONLY_API_TOKEN_AND_CAPTURE_ACCOUNT_STATE',
      'CONNECT_ONE_NON_CORE_BYO_DOMAIN',
      'VERIFY_DNS_AUTHENTICATION_AND_DOMAIN_READY_EVENT',
      'CREATE_ONE_MAILBOX',
      'EXPORT_OR_READ_SMTP_IMAP_CREDENTIALS_INTO_PROTECTED_UBERFLEET',
      'REGISTER_SIGNED_WEBHOOK_FOR_RELAY_REPLY_BOUNCE_COMPLAINT_EVENTS',
      'OWNER_CONTROLLED_SMTP_TO_SEED_CANARY',
      'VERIFY_HEADERS_PLACEMENT_REPLY_AND_IMAP_INGESTION',
      'ENABLE_UBERWARM2_EVIDENCE_RAMP',
      'EXPAND_5_TO_10_TO_20_TO_50_MAILBOXES_ONLY_AFTER_GREEN_EVIDENCE'
    ],
    domains: domainRows,
    externalEffectAuthority: 'NONE',
    spendAuthorized: false,
    truthBoundary: 'This checklist prepares the post-purchase activation sequence. It does not purchase a plan, create a token, mutate DNS, provision mailboxes, send messages or claim provider entitlement before those actions are observed.'
  });
}
