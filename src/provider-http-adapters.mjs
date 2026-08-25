// Provider-neutral HTTP adapters for mailbox/domain infrastructure vendors.
//
// This is the software layer UberBond can own: authenticated reads, bounded
// provisioning calls, DNS snapshots, mailbox status, warm-up reconciliation,
// idempotency, receipts, and recovery classification. It is deliberately not
// a private-mail-provider or reputation network. Real provider accounts,
// credentials, billing, DNS authority, and provider policy remain external.
//
// Every write is approval-gated and requires an idempotency key. A timeout or
// 5xx after a write is EXTERNAL_OUTCOME_UNKNOWN; it is never blindly retried.
// Reads may be retried a small number of times. Tests inject fetchImpl so the
// module never needs live credentials or live provider traffic to be proven.

import crypto from 'node:crypto';
import { redactProviderReceipt } from './provider-receipt-redaction.mjs';

export const PROVIDER_HTTP_ADAPTER_POLICY_VERSION = 'provider-http-adapter-1.0.0';
export const PROVIDER_HTTP_MAX_RESPONSE_BYTES = 1_000_000;
export const PROVIDER_HTTP_DEFAULT_TIMEOUT_MS = 10_000;

const READ_METHODS = new Set(['GET', 'HEAD']);
const MAX_READ_ATTEMPTS = 2;
const RETRYABLE_READ_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MUTATING_CAPABILITIES = new Set([
  'createWorkspace', 'provisionDomains', 'provisionMailboxes', 'configureDns',
  'configureForwarding', 'exportMailboxes', 'prewarmPurchase', 'cancel'
]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SECRET_FIELD_PATTERN = /password|passwd|secret|token|apikey|api_key|refresh|access|authorization|cookie|private/i;

function nowDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function safeNumber(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function secretFields(value, path = '', depth = 0) {
  if (depth > 4 || value == null || typeof value !== 'object') return [];
  const hits = [];
  for (const [key, child] of Object.entries(value)) {
    const at = path ? `${path}.${key}` : key;
    if (SECRET_FIELD_PATTERN.test(key)) hits.push(at);
    if (child && typeof child === 'object') hits.push(...secretFields(child, at, depth + 1));
  }
  return hits;
}

function operationId(provider, capability, idempotencyKey = '') {
  const source = `${provider}:${capability}:${idempotencyKey || crypto.randomUUID()}`;
  return `op_${crypto.createHash('sha256').update(source).digest('hex').slice(0, 32)}`;
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return text(headers.get(name) || headers.get(name.toLowerCase()), 200);
  const wanted = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted) return text(value, 200);
  }
  return '';
}

function retryAfterSeconds(headers) {
  const value = safeNumber(headerValue(headers, 'retry-after'));
  return value != null && value >= 0 ? Math.min(3600, Math.floor(value)) : null;
}

function safeBaseUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function joinPath(base, path) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`;
  return `${base}${normalizedPath}`;
}

function appendQuery(url, query = {}) {
  const result = new URL(url);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach(item => result.searchParams.append(key, String(item)));
    else result.searchParams.set(key, String(value));
  }
  return result.toString();
}

function parseJsonLike(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return { text: text(value, 500) }; }
}

async function readResponsePayload(response) {
  if (!response) return null;
  if (typeof response.json === 'function') {
    try { return await response.json(); } catch { return null; }
  }
  if (typeof response.text === 'function') {
    try {
      const raw = await response.text();
      return parseJsonLike(raw);
    } catch { return null; }
  }
  if ('body' in response) return parseJsonLike(response.body);
  return null;
}

function responseStatus(response) {
  const status = Number(response?.status);
  return Number.isFinite(status) && status > 0 ? status : 0;
}

function providerError({ provider, capability, status, httpStatus = null, reason, timestamp, operation = null, payload = null, headers = null }) {
  return {
    ok: false,
    policyVersion: PROVIDER_HTTP_ADAPTER_POLICY_VERSION,
    provider,
    capability,
    status,
    httpStatus,
    reason: text(reason || status, 500),
    timestamp,
    operationId: operation,
    retryAfterSeconds: retryAfterSeconds(headers),
    providerReceipt: redactProviderReceipt(payload)
  };
}

function successfulResult({ provider, capability, httpStatus, payload, timestamp, operation = null, headers = null, status = 'OK' }) {
  return {
    ok: true,
    policyVersion: PROVIDER_HTTP_ADAPTER_POLICY_VERSION,
    provider,
    capability,
    status,
    httpStatus,
    timestamp,
    operationId: operation,
    providerRequestId: headerValue(headers, 'x-request-id') || headerValue(headers, 'x-correlation-id') || null,
    retryAfterSeconds: retryAfterSeconds(headers),
    data: redactProviderReceipt(payload)
  };
}

function dataOf(result) {
  return result?.data?.data ?? result?.data ?? null;
}

function arrayOf(value, keys = []) {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return [];
}

function normalizeWorkspaceList(result) {
  const data = dataOf(result);
  const items = arrayOf(data, ['workspaces', 'items', 'results']);
  return {
    ...result,
    workspaces: items.map(item => ({
      id: text(item?.id || item?.workspace_id || item?.workspaceId, 160),
      name: text(item?.name, 160),
      slug: text(item?.slug, 160)
    })).filter(item => item.id || item.name)
  };
}

function isApproved({ provider, capability, ownerApproval, now, estimatedCostCents = null } = {}) {
  const approval = ownerApproval && typeof ownerApproval === 'object' ? ownerApproval : null;
  if (!approval?.granted || !text(approval.grantedBy, 120)) return { ok: false, status: 'OWNER_APPROVAL_REQUIRED', reason: 'This provider mutation needs explicit owner approval.' };
  const expiresAt = Date.parse(approval.expiresAt || '');
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return { ok: false, status: 'OWNER_APPROVAL_EXPIRED', reason: 'The owner approval is missing or expired.' };
  const scopes = Array.isArray(approval.scope) ? approval.scope.map(item => text(item, 160)) : [text(approval.scope, 160)];
  const accepted = new Set([`${provider}:${capability}`, capability, '*']);
  if (!scopes.some(scope => accepted.has(scope))) return { ok: false, status: 'OWNER_APPROVAL_SCOPE_MISMATCH', reason: `Approval does not cover ${provider}:${capability}.` };
  const cost = safeNumber(estimatedCostCents);
  const limit = safeNumber(approval.spendLimitCents);
  if (cost != null && (limit == null || cost > limit)) return { ok: false, status: 'SPEND_LIMIT_EXCEEDED', reason: 'The estimated provider charge exceeds the approved spend limit.' };
  return { ok: true };
}

function unsupported(provider, capability, reason = 'The provider does not expose this capability through its documented API.') {
  return {
    ok: false,
    policyVersion: PROVIDER_HTTP_ADAPTER_POLICY_VERSION,
    provider,
    capability,
    status: 'UNSUPPORTED_CAPABILITY',
    reason: text(reason, 500)
  };
}

function safeMailboxId(value) {
  const id = text(value, 160);
  return id && !/[\r\n]/.test(id) ? id : '';
}

function normalizeProviderStatus(value) {
  return text(value, 80).toUpperCase().replace(/[\s-]+/g, '_');
}

function providerDnsExpectedRecords({ provider, data }) {
  const source = dataOf({ data });
  const candidate = source?.expectedRecords || source?.requirements || source?.dnsRequirements || null;
  if (!candidate || typeof candidate !== 'object') {
    return { provider, status: 'REQUIREMENTS_UNKNOWN', expectedRecords: null };
  }
  // Only pass through explicit provider fields. We never invent a DKIM
  // selector or SPF include from a hostname guess.
  return {
    provider,
    status: 'REQUIREMENTS_OBSERVED',
    expectedRecords: {
      dkimSelector: text(candidate.dkimSelector || candidate.selector, 120) || undefined,
      spfIncludes: Array.isArray(candidate.spfIncludes) ? candidate.spfIncludes.map(item => text(item, 180)).filter(Boolean) : undefined,
      mxHostSuffixes: Array.isArray(candidate.mxHostSuffixes) ? candidate.mxHostSuffixes.map(item => text(item, 180)).filter(Boolean) : undefined,
      dmarcMinPolicy: text(candidate.dmarcMinPolicy || candidate.minimumDmarcPolicy, 40).toLowerCase() || undefined,
      trackingCname: candidate.trackingCname && typeof candidate.trackingCname === 'object'
        ? { host: text(candidate.trackingCname.host, 240), target: text(candidate.trackingCname.target, 240) }
        : undefined
    }
  };
}

function normalizeMailboxList(result) {
  const data = dataOf(result);
  const items = arrayOf(data, ['mailboxes', 'items', 'results']);
  return {
    ...result,
    mailboxes: items.map(item => ({
      id: text(item?.id || item?.mailbox_id || item?.mailboxId, 160),
      address: text(item?.email || item?.username || item?.address, 254).toLowerCase(),
      domainId: text(item?.domain_id || item?.domainId, 160),
      status: normalizeProviderStatus(item?.status),
      forwardingStatus: normalizeProviderStatus(item?.forwarding_status || item?.forwardingStatus),
      providerAccountId: text(item?.account_id || item?.accountId, 160),
      currentDailyCap: safeNumber(item?.daily_cap ?? item?.dailyCap),
      warmupState: normalizeProviderStatus(item?.warmup_state || item?.warmupState),
      // Credentials are intentionally never returned, even if a provider
      // accepted a with_credentials/include_credentials query.
      credentialsAvailable: Boolean(item?.credentials || item?.smtp_password || item?.password)
    })).filter(item => item.id || item.address)
  };
}

function normalizeDomainList(result) {
  const data = dataOf(result);
  const items = arrayOf(data, ['domains', 'items', 'results']);
  return {
    ...result,
    domains: items.map(item => ({
      id: text(item?.id || item?.domain_id || item?.domainId, 160),
      domain: text(item?.domain || item?.name, 254).toLowerCase(),
      status: normalizeProviderStatus(item?.status),
      workspaceId: text(item?.workspace_id || item?.workspaceId, 160),
      priceCents: safeNumber(item?.price_cents ?? item?.priceCents),
      expiresAt: text(item?.expires_at || item?.expiresAt, 80) || null
    })).filter(item => item.id || item.domain)
  };
}

function normalizeStatus(result, kind) {
  const data = dataOf(result) || {};
  return {
    ...result,
    [`${kind}State`]: normalizeProviderStatus(data?.status || data?.state || data?.warmup_state || data?.warmupState),
    currentDailyCap: safeNumber(data?.current_daily_cap ?? data?.currentDailyCap ?? data?.daily_cap ?? data?.dailyCap),
    providerReference: text(data?.id || data?.job_id || data?.jobId || data?.export_id || data?.exportId, 160) || null
  };
}

function operationBody({ body, workspaceId, domains, mailboxes, contactDetails, domainId, mailboxId, forwardingEmail } = {}) {
  if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  if (domains) return { workspaceId, domains, ...(contactDetails && typeof contactDetails === 'object' ? { contactDetails } : {}) };
  if (mailboxes) return { mailboxes };
  if (domainId && forwardingEmail) return { domainId, forwardingEmail };
  if (mailboxId) return { mailboxId };
  return null;
}

function makeConfigIdentity(providerName, config, baseUrl) {
  return {
    ok: true,
    policyVersion: PROVIDER_HTTP_ADAPTER_POLICY_VERSION,
    provider: providerName,
    status: 'CONFIGURED_ADAPTER_READY',
    authentication: 'server-side-api-key',
    baseUrl,
    workspaceId: text(config?.workspaceId, 160) || null,
    liveExternalEffects: 'requires-explicit-owner-approval-and-v9-admission'
  };
}

/**
 * Create a safe, generic provider adapter. `routes` owns only documented
 * endpoint paths; callers cannot supply arbitrary URL fragments through a
 * capability call. `fetchImpl` and `sleep` are injected in tests.
 */
export function createProviderHttpAdapter({
  providerName,
  config = {},
  baseUrl: suppliedBaseUrl,
  authHeader = 'Authorization',
  routes = {},
  fetchImpl = globalThis.fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = () => new Date(),
  timeoutMs = PROVIDER_HTTP_DEFAULT_TIMEOUT_MS,
  maxReadAttempts = MAX_READ_ATTEMPTS
} = {}) {
  const provider = text(providerName, 80).toLowerCase() || 'unknown';
  const baseUrl = safeBaseUrl(suppliedBaseUrl);
  const apiKey = text(config.apiKey || config.key, 500);
  const configured = Boolean(apiKey && baseUrl && typeof fetchImpl === 'function');

  const requestJson = async ({ capability, method = 'GET', path, query, body = null, idempotencyKey = '', ownerApproval = null, estimatedCostCents = null, readOnly = false } = {}) => {
    const at = nowDate(now());
    const timestamp = at.toISOString();
    const verb = String(method || 'GET').toUpperCase();
    const mutation = !readOnly && (!READ_METHODS.has(verb) || MUTATING_CAPABILITIES.has(capability));
    const operation = operationId(provider, capability, idempotencyKey);
    if (!configured) return providerError({ provider, capability, status: 'PROVIDER_AUTH_REQUIRED', reason: 'Provider adapter is not configured with a valid server-side API key and HTTPS base URL.', timestamp, operation });
    if (!path || !Object.values(routes).includes(path) && !String(path).startsWith('/')) return providerError({ provider, capability, status: 'ADAPTER_ROUTE_NOT_DECLARED', reason: 'The requested provider route is not declared by this adapter.', timestamp, operation });
    const secretPayloadFields = secretFields(body);
    if (secretPayloadFields.length) return providerError({ provider, capability, status: 'SECRET_FIELD_REJECTED', reason: `Provider request body contains secret-shaped fields: ${secretPayloadFields.join(',')}`, timestamp, operation });
    if (mutation) {
      const approval = isApproved({ provider, capability, ownerApproval, now: at, estimatedCostCents });
      if (!approval.ok) return providerError({ provider, capability, status: approval.status, reason: approval.reason, timestamp, operation });
      if (!text(idempotencyKey, 200)) return providerError({ provider, capability, status: 'IDEMPOTENCY_KEY_REQUIRED', reason: 'Provider mutations require a durable idempotency key.', timestamp, operation });
    }
    if (typeof fetchImpl !== 'function') return providerError({ provider, capability, status: 'HTTP_TRANSPORT_UNAVAILABLE', reason: 'No fetch implementation was supplied.', timestamp, operation });

    let url;
    try { url = appendQuery(joinPath(baseUrl, path), query); } catch {
      return providerError({ provider, capability, status: 'ADAPTER_URL_INVALID', reason: 'The provider route or query could not be converted to a safe URL.', timestamp, operation });
    }

    const headers = {
      Accept: 'application/json',
      [authHeader]: apiKey
    };
    if (body != null) headers['Content-Type'] = 'application/json';
    if (mutation) headers['Idempotency-Key'] = text(idempotencyKey, 200);

    const attempts = mutation ? 1 : Math.max(1, Math.min(3, Number(maxReadAttempts) || MAX_READ_ATTEMPTS));
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(100, Number(timeoutMs) || PROVIDER_HTTP_DEFAULT_TIMEOUT_MS));
      try {
        const response = await fetchImpl(url, {
          method: verb,
          headers,
          body: body == null ? undefined : JSON.stringify(body),
          signal: controller.signal
        });
        const httpStatus = responseStatus(response);
        const payload = await readResponsePayload(response);
        const responseHeaders = response.headers;
        if (httpStatus >= 200 && httpStatus < 300) {
          return successfulResult({ provider, capability, httpStatus, payload, timestamp, operation, headers: responseHeaders });
        }
        const retryableRead = !mutation && RETRYABLE_READ_STATUSES.has(httpStatus) && attempt < attempts;
        if (retryableRead) {
          const retrySeconds = retryAfterSeconds(responseHeaders);
          const delayMs = Math.min(1000, Math.max(25, (retrySeconds ?? attempt) * 100));
          await sleep(delayMs);
          continue;
        }
        const status = mutation && httpStatus >= 500 ? 'EXTERNAL_OUTCOME_UNKNOWN' : httpStatus === 401 || httpStatus === 403 ? 'PROVIDER_AUTH_REJECTED' : httpStatus === 402 ? 'PAYMENT_REQUIRED' : httpStatus === 409 ? 'PROVIDER_CONFLICT' : httpStatus === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_HTTP_ERROR';
        return providerError({ provider, capability, status, httpStatus, reason: `Provider returned HTTP ${httpStatus || 'unknown'}.`, timestamp, operation, payload, headers: responseHeaders });
      } catch (error) {
        const aborted = error?.name === 'AbortError';
        if (!mutation && attempt < attempts) {
          await sleep(Math.min(1000, Math.max(25, attempt * 100)));
          continue;
        }
        return providerError({
          provider,
          capability,
          status: mutation ? 'EXTERNAL_OUTCOME_UNKNOWN' : 'PROVIDER_UNREACHABLE',
          reason: aborted ? 'Provider request timed out.' : 'Provider request failed before a response was received.',
          timestamp,
          operation
        });
      } finally {
        clearTimeout(timer);
      }
    }
    return providerError({ provider, capability, status: 'PROVIDER_UNREACHABLE', reason: 'Provider read attempts were exhausted.', timestamp, operation });
  };

  const adapter = {
    providerName: provider,
    configured,
    policyVersion: PROVIDER_HTTP_ADAPTER_POLICY_VERSION,
    identity: async () => makeConfigIdentity(provider, config, baseUrl),
    authenticationMethod: async () => ({ ok: true, provider, status: 'API_KEY', authentication: authHeader }),
    dryRunSupported: async () => ({ ok: true, provider, status: 'DRY_RUN_SUPPORTED' }),
    liveSupported: async () => ({ ok: configured, provider, status: configured ? 'INFRASTRUCTURE_ADAPTER_READY_REQUIRES_V9' : 'PROVIDER_AUTH_REQUIRED', liveSendingAuthority: false }),
    termsAndAllowedPurposes: async () => ({ ok: true, provider, status: 'TERMS_MUST_BE_REVIEWED_BY_OWNER', termsUrl: text(config.termsUrl, 500) || null, allowedPurposes: ['owner-authorized-infrastructure-management'], prohibitedAssumption: 'This adapter does not certify that a campaign is lawful or permitted.' }),
    outageState: async () => ({ ok: true, provider, status: 'LIVE_CHECK_REQUIRED', outageState: 'UNKNOWN_UNTIL_PROVIDER_READ' }),

    // Raw, provider-shaped read helpers are kept behind this adapter. They are
    // returned as bounded/redacted snapshots, never as credentials.
    listWorkspaces: async ({ page = 1, limit = 50, search = '' } = {}) => normalizeWorkspaceList(await requestJson({ capability: 'listWorkspaces', method: 'GET', path: routes.listWorkspaces, query: { page, limit, search } })),
    listMailboxes: async ({ page = 1, limit = 50, search = '', domainId = '', workspaceId = '', includeCredentials = false } = {}) => {
      if (includeCredentials) return providerError({ provider, capability: 'listMailboxes', status: 'SECRET_RETRIEVAL_BLOCKED', reason: 'UberBond never returns provider mailbox credentials through this adapter.', timestamp: nowDate(now()).toISOString() });
      const result = await requestJson({ capability: 'listMailboxes', method: 'GET', path: routes.listMailboxes, query: { page, limit, search, domainId, workspaceId, with_credentials: false } });
      return normalizeMailboxList(result);
    },
    mailboxHealth: async ({ mailboxId } = {}) => {
      const id = safeMailboxId(mailboxId);
      if (!id) return providerError({ provider, capability: 'mailboxHealth', status: 'MAILBOX_ID_REQUIRED', reason: 'A mailbox id is required.', timestamp: nowDate(now()).toISOString() });
      return normalizeStatus(await requestJson({ capability: 'mailboxHealth', method: 'GET', path: routes.mailboxHealth(id), query: {} }), 'mailbox');
    },
    dnsRequirements: async ({ domainId } = {}) => {
      const id = text(domainId, 160);
      if (!id) return providerError({ provider, capability: 'dnsRequirements', status: 'DOMAIN_ID_REQUIRED', reason: 'A domain id is required.', timestamp: nowDate(now()).toISOString() });
      const result = await requestJson({ capability: 'dnsRequirements', method: 'GET', path: routes.domainDns(id), query: {} });
      return { ...result, ...providerDnsExpectedRecords({ provider, data: result }) };
    },
    verifyDns: async ({ domainId } = {}) => {
      const id = text(domainId, 160);
      if (!id) return providerError({ provider, capability: 'verifyDns', status: 'DOMAIN_ID_REQUIRED', reason: 'A domain id is required.', timestamp: nowDate(now()).toISOString() });
      return requestJson({ capability: 'verifyDns', method: 'GET', path: routes.domainDns(id), query: {} });
    },
    warmupCapable: async ({ mailboxId = '', domainId = '' } = {}) => {
      if (!routes.warmupStatus) return unsupported(provider, 'warmupCapable', 'This provider requires a separate warm-up product or does not document a native warm-up endpoint.');
      return requestJson({ capability: 'warmupCapable', method: 'GET', path: routes.warmupStatus, query: { mailbox_id: mailboxId, domain_id: domainId } });
    },
    startWarmup: async ({ mailboxId = '', domainId = '', providerPayload = null, ownerApproval = null, idempotencyKey = '' } = {}) => {
      if (!routes.startWarmup) return unsupported(provider, 'startWarmup', 'No native warm-up start endpoint is documented for this provider.');
      if (!providerPayload || typeof providerPayload !== 'object' || Array.isArray(providerPayload)) return providerError({ provider, capability: 'startWarmup', status: 'PROVIDER_REQUEST_SHAPE_REQUIRED', reason: 'Supply the provider-documented warm-up payload; UberBond will not guess a purchase or activation body.', timestamp: nowDate(now()).toISOString() });
      return normalizeStatus(await requestJson({ capability: 'startWarmup', method: 'POST', path: routes.startWarmup, body: providerPayload, ownerApproval, idempotencyKey }), 'warmup');
    },
    pauseWarmup: async () => unsupported(provider, 'pauseWarmup', 'Pause must be performed through the provider capability documented for the selected account; no guessed endpoint is used.'),
    warmupStatus: async ({ mailboxId = '', domainId = '' } = {}) => {
      if (!routes.warmupStatus) return unsupported(provider, 'warmupStatus', 'This provider requires a separate warm-up product or does not document a warm-up status endpoint.');
      return normalizeStatus(await requestJson({ capability: 'warmupStatus', method: 'GET', path: routes.warmupStatus, query: { mailbox_id: mailboxId, domain_id: domainId } }), 'warmup');
    },
    discoverSendingLimit: async ({ mailboxId = '' } = {}) => {
      const id = safeMailboxId(mailboxId);
      if (!id) return providerError({ provider, capability: 'discoverSendingLimit', status: 'MAILBOX_ID_REQUIRED', reason: 'A mailbox id is required.', timestamp: nowDate(now()).toISOString() });
      return normalizeStatus(await requestJson({ capability: 'discoverSendingLimit', method: 'GET', path: routes.mailboxHealth(id), query: {} }), 'mailbox');
    },
    bounceSignal: async () => unsupported(provider, 'bounceSignal', 'Use the provider webhook/event adapter or authorized sending platform; the infrastructure API does not certify recipient outcomes.'),
    complaintSignal: async () => unsupported(provider, 'complaintSignal', 'Use the provider webhook/event adapter or authorized sending platform; the infrastructure API does not certify complaint outcomes.'),
    replySignal: async () => unsupported(provider, 'replySignal', 'Use the provider inbox/event adapter; provisioning APIs do not certify reply outcomes.'),
    campaignStatus: async () => unsupported(provider, 'campaignStatus', 'Infrastructure providers do not own UberBond campaign state.'),
    rateLimits: async () => ({ ok: true, provider, status: 'READ_RESPONSE_HEADERS_AND_PROVIDER_DOCS', rateLimitSource: 'provider-response-headers-or-official-documentation' }),
    receipts: async ({ operationId: requestedOperationId = '' } = {}) => ({ ok: true, provider, status: 'LOCAL_RECEIPT_REQUIRED', operationId: text(requestedOperationId, 160) || null }),
    cancel: async ({ path = '', ownerApproval = null, idempotencyKey = '', body = null } = {}) => {
      if (!path || !routes.cancelPrefix || !String(path).startsWith(routes.cancelPrefix)) return unsupported(provider, 'cancel', 'Destructive provider routes are not guessed or accepted outside the adapter declaration.');
      return requestJson({ capability: 'cancel', method: 'DELETE', path, body, ownerApproval, idempotencyKey });
    },

    createWorkspace: async ({ name, ownerApproval = null, idempotencyKey = '' } = {}) => {
      if (!text(name, 160)) return providerError({ provider, capability: 'createWorkspace', status: 'WORKSPACE_NAME_REQUIRED', reason: 'Workspace name is required.', timestamp: nowDate(now()).toISOString() });
      return requestJson({ capability: 'createWorkspace', method: 'POST', path: routes.createWorkspace, body: { name: text(name, 160) }, ownerApproval, idempotencyKey });
    },
    domainAvailability: async ({ domain = '', domains = [] } = {}) => {
      const values = [...new Set((Array.isArray(domains) ? domains : [domain]).map(item => text(item, 254).toLowerCase()).filter(Boolean))];
      if (!values.length) return providerError({ provider, capability: 'domainAvailability', status: 'DOMAIN_REQUIRED', reason: 'At least one domain is required.', timestamp: nowDate(now()).toISOString() });
      const result = routes.bulkDomainAvailability
        ? await requestJson({ capability: 'domainAvailability', method: 'POST', path: routes.bulkDomainAvailability, body: { domains: values }, idempotencyKey: `read:${crypto.createHash('sha256').update(values.join(',')).digest('hex').slice(0, 24)}`, readOnly: true })
        : await requestJson({ capability: 'domainAvailability', method: 'GET', path: routes.domainAvailability, query: { domain: values[0] } });
      return normalizeDomainList(result);
    },
    listDomains: async ({ page = 1, limit = 50, status = '', search = '', workspaceId = '' } = {}) => normalizeDomainList(await requestJson({ capability: 'listDomains', method: 'GET', path: routes.listDomains, query: { page, limit, status, search, workspaceId } })),
    domainDns: async ({ domainId } = {}) => {
      const id = text(domainId, 160);
      if (!id) return providerError({ provider, capability: 'domainDns', status: 'DOMAIN_ID_REQUIRED', reason: 'A domain id is required.', timestamp: nowDate(now()).toISOString() });
      return requestJson({ capability: 'domainDns', method: 'GET', path: routes.domainDns(id), query: {} });
    },
    provisionDomains: async ({ workspaceId = '', domains = [], contactDetails = null, body = null, ownerApproval = null, idempotencyKey = '', estimatedCostCents = null } = {}) => {
      const cleanDomains = (Array.isArray(domains) ? domains : []).map(item => text(item, 254).toLowerCase()).filter(Boolean);
      if (!cleanDomains.length && !body) return providerError({ provider, capability: 'provisionDomains', status: 'DOMAIN_REQUIRED', reason: 'At least one approved domain is required.', timestamp: nowDate(now()).toISOString() });
      return requestJson({ capability: 'provisionDomains', method: 'POST', path: routes.provisionDomains, body: operationBody({ body, workspaceId, domains: cleanDomains, contactDetails }), ownerApproval, idempotencyKey, estimatedCostCents });
    },
    provisionMailboxes: async ({ mailboxes = [], body = null, ownerApproval = null, idempotencyKey = '', estimatedCostCents = null } = {}) => {
      const clean = (Array.isArray(mailboxes) ? mailboxes : []).map(item => ({
        email: text(item?.email || item?.username, 254).toLowerCase(),
        firstName: text(item?.firstName, 100),
        lastName: text(item?.lastName, 100),
        forwardingEmail: EMAIL_PATTERN.test(text(item?.forwardingEmail, 254)) ? text(item.forwardingEmail, 254).toLowerCase() : undefined,
        signature: text(item?.signature, 500)
      })).filter(item => EMAIL_PATTERN.test(item.email));
      if (!clean.length && !body) return providerError({ provider, capability: 'provisionMailboxes', status: 'MAILBOXES_REQUIRED', reason: 'At least one valid mailbox request is required.', timestamp: nowDate(now()).toISOString() });
      return requestJson({ capability: 'provisionMailboxes', method: 'POST', path: routes.provisionMailboxes, body: operationBody({ body, mailboxes: clean }), ownerApproval, idempotencyKey, estimatedCostCents });
    },
    configureDns: async ({ domainId, records, body = null, ownerApproval = null, idempotencyKey = '' } = {}) => {
      const id = text(domainId, 160);
      if (!id || (!Array.isArray(records) && !body)) return providerError({ provider, capability: 'configureDns', status: 'DNS_PAYLOAD_REQUIRED', reason: 'A domain id and provider-supplied DNS payload are required.', timestamp: nowDate(now()).toISOString() });
      return requestJson({ capability: 'configureDns', method: 'PUT', path: routes.configureDns(id), body: body || { records }, ownerApproval, idempotencyKey });
    },
    configureForwarding: async ({ domainId = '', mailboxIds = [], forwardingEmail = '', body = null, ownerApproval = null, idempotencyKey = '' } = {}) => {
      if (!body && !EMAIL_PATTERN.test(text(forwardingEmail, 254))) return providerError({ provider, capability: 'configureForwarding', status: 'FORWARDING_EMAIL_REQUIRED', reason: 'A verified forwarding destination is required.', timestamp: nowDate(now()).toISOString() });
      const route = mailboxIds.length && routes.bulkForward ? routes.bulkForward : routes.domainForward;
      if (!route) return unsupported(provider, 'configureForwarding');
      return requestJson({ capability: 'configureForwarding', method: route.method || 'PATCH', path: typeof route.path === 'function' ? route.path(domainId) : route.path || route, body: body || { includedIds: mailboxIds, domainId, forwardingEmail: text(forwardingEmail, 254).toLowerCase() }, ownerApproval, idempotencyKey });
    },
    exportMailboxes: async ({ mailboxIds = [], destination = '', body = null, ownerApproval = null, idempotencyKey = '' } = {}) => {
      if (!routes.exportMailboxes) return unsupported(provider, 'exportMailboxes', 'This infrastructure provider does not expose a documented export endpoint.');
      if (!body && (!mailboxIds.length || !text(destination, 120))) return providerError({ provider, capability: 'exportMailboxes', status: 'EXPORT_REQUEST_REQUIRED', reason: 'Mailbox ids and a destination are required.', timestamp: nowDate(now()).toISOString() });
      return requestJson({ capability: 'exportMailboxes', method: 'POST', path: routes.exportMailboxes, body: body || { mailbox_ids: mailboxIds, destination }, ownerApproval, idempotencyKey });
    },
    prewarmPurchase: async ({ body = null, ownerApproval = null, idempotencyKey = '', estimatedCostCents = null } = {}) => {
      if (!routes.prewarmPurchase) return unsupported(provider, 'prewarmPurchase');
      if (!body) return providerError({ provider, capability: 'prewarmPurchase', status: 'PROVIDER_REQUEST_SHAPE_REQUIRED', reason: 'Supply the provider-documented pre-warm purchase payload; UberBond will not guess a billable body.', timestamp: nowDate(now()).toISOString() });
      return requestJson({ capability: 'prewarmPurchase', method: 'POST', path: routes.prewarmPurchase, body, ownerApproval, idempotencyKey, estimatedCostCents });
    },
    operationStatus: async ({ operationId: requestedOperationId = '', path = '' } = {}) => {
      if (!path || !routes.operationStatusPrefix || !String(path).startsWith(routes.operationStatusPrefix)) return unsupported(provider, 'operationStatus', 'A provider-specific operation status route is required.');
      return requestJson({ capability: 'operationStatus', method: 'GET', path, query: { id: requestedOperationId } });
    },
    webhookEvents: async () => ({ ok: true, provider, status: 'WEBHOOK_INGESTION_IS_UBERBOND_OWNED', authentication: 'provider-specific-signature-required-before-persistence' })
  };

  return adapter;
}

export function createIcemailAdapter(config = {}, options = {}) {
  return createProviderHttpAdapter({
    providerName: 'icemail',
    config: { ...config, termsUrl: config.termsUrl || 'https://docs.icemail.ai/' },
    baseUrl: config.baseUrl || 'https://app.icemail.ai/api/v1',
    authHeader: 'x-api-key',
    routes: {
      listWorkspaces: '/workspace',
      createWorkspace: '/workspace',
      listMailboxes: '/mailbox',
      mailboxHealth: id => `/mailbox/${encodeURIComponent(id)}/auth`,
      listDomains: '/domain',
      domainAvailability: '/domain/available',
      domainDns: id => `/domain/${encodeURIComponent(id)}/dns-records`,
      provisionDomains: '/order',
      provisionMailboxes: '/order',
      configureDns: id => `/domain/${encodeURIComponent(id)}/dns-records`,
      domainForward: { method: 'PUT', path: '/domain/forwarding' },
      bulkForward: { method: 'PUT', path: '/domain/forwarding' },
      warmupStatus: '/prewarm',
      startWarmup: '/prewarm/buy',
      prewarmPurchase: '/prewarm/buy',
      exportMailboxes: '/export',
      operationStatus: id => `/export/${encodeURIComponent(id)}`,
      operationStatusPrefix: '/export/'
    },
    ...options
  });
}

export function createMailforgeAdapter(config = {}, options = {}) {
  return createProviderHttpAdapter({
    providerName: 'mailforge',
    config: { ...config, termsUrl: config.termsUrl || 'https://www.mailforge.ai/terms' },
    baseUrl: config.baseUrl || 'https://api.mailforge.ai/public',
    authHeader: 'Authorization',
    routes: {
      listWorkspaces: '/workspaces',
      createWorkspace: '/workspaces',
      domainAvailability: '/check-domain-availability',
      bulkDomainAvailability: '/check-domain-availability-bulk',
      listDomains: '/domains',
      domainDns: id => `/domains/${encodeURIComponent(id)}/dns`,
      provisionDomains: '/domains',
      provisionMailboxes: '/mailboxes',
      listMailboxes: '/mailboxes',
      mailboxHealth: id => `/mailboxes/${encodeURIComponent(id)}`,
      configureDns: id => `/domains/${encodeURIComponent(id)}/dns`,
      domainForward: { method: 'PATCH', path: '/domains/forwards' },
      bulkForward: { method: 'POST', path: '/mailboxes/bulk-forward' },
      cancelPrefix: '/mailboxes/'
    },
    ...options
  });
}

export function createUnsupportedProviderAdapter(providerName, reason = 'No adapter is implemented for this provider.') {
  const provider = text(providerName, 80).toLowerCase() || 'unknown';
  return {
    providerName: provider,
    configured: false,
    identity: async () => ({ ok: false, provider, status: 'UNSUPPORTED_PROVIDER', reason }),
    authenticationMethod: async () => ({ ok: false, provider, status: 'UNSUPPORTED_PROVIDER', reason }),
    liveSupported: async () => ({ ok: false, provider, status: 'UNSUPPORTED_PROVIDER', reason }),
    dryRunSupported: async () => ({ ok: true, provider, status: 'DRY_RUN_ONLY' }),
    termsAndAllowedPurposes: async () => ({ ok: false, provider, status: 'UNSUPPORTED_PROVIDER', reason }),
    outageState: async () => ({ ok: false, provider, status: 'UNSUPPORTED_PROVIDER', reason })
  };
}
