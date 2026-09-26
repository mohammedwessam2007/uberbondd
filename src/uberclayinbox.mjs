// UberClayInbox — governed ClayInbox infrastructure adapter.
//
// Capability donor/provenance:
// - Assay (developerinlondon/assay), Apache-2.0.
// - Public donor adapter/tests observed ClayInbox response shapes on 2026-09-04.
// UberBond reimplements the capability in JavaScript and adds UberBond-specific
// approval, idempotency, secret-custody, uncertainty and evidence boundaries.
// No vendor branding/assets/source are copied into runtime behavior.
//
// IMPORTANT: ClayInbox's mailbox order legitimately contains an initial
// password. This module therefore has a dedicated mutation boundary rather
// than weakening the generic provider adapter's secret-field rejection.

import crypto from 'node:crypto';
import { redactProviderReceipt } from './provider-receipt-redaction.mjs';
import { buildEncryptedSmtpAccount } from './uberfleet.mjs';
import { buildEncryptedImapAccount } from './uberimap.mjs';

export const UBERCLAYINBOX_VERSION = 'uberbond.uberclayinbox.v1';
export const UBERCLAYINBOX_DONOR = Object.freeze({
  project: 'Assay',
  repository: 'developerinlondon/assay',
  license: 'Apache-2.0',
  observedResponseShapeDate: '2026-09-04',
  donorPaths: Object.freeze([
    'crates/assay/stdlib/clayinbox.lua',
    'crates/assay/tests/clayinbox/main.rs'
  ])
});

const DEFAULT_BASE_URL = 'https://app.clayinbox.ai/api/v1';
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const MAX_RESPONSE_BYTES = 1_000_000;
const READ_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const STOPPED_STATUSES = new Set(['cancelled','canceled','suspended','deleted','inactive','expired','terminated']);
const BILLING_PERIOD = new Map([
  ['MONTHLY','month'],['YEARLY','year'],['ANNUAL','year'],['ANNUALLY','year']
]);

const clean = (v, n = 1000) => String(v ?? '').trim().slice(0, n);
const lower = (v, n = 1000) => clean(v, n).toLowerCase();
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
const sha = v => crypto.createHash('sha256').update(String(v ?? '')).digest('hex');
const nowIso = now => {
  const d = now instanceof Date ? now : new Date(now || Date.now());
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
};

function safeBaseUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}
function unsupported(capability, reason) {
  return {
    ok: false, version: UBERCLAYINBOX_VERSION, provider: 'clayinbox',
    capability, status: 'UNSUPPORTED_CAPABILITY',
    reason: clean(reason || 'This capability is not proven by the observed public API contract.', 800),
    providerCalls: 0
  };
}
function errorResult(capability, status, reason, extra = {}) {
  return {
    ok: false, version: UBERCLAYINBOX_VERSION, provider: 'clayinbox',
    capability, status, reason: clean(reason || status, 800), ...extra
  };
}
function successResult(capability, status, data, extra = {}) {
  return {
    ok: true, version: UBERCLAYINBOX_VERSION, provider: 'clayinbox',
    capability, status, data, ...extra
  };
}
function cents(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
function authDecision({ ownerApproval, capability, estimatedCostCents = null, now = new Date() } = {}) {
  const approval = ownerApproval && typeof ownerApproval === 'object' ? ownerApproval : null;
  if (!approval?.granted || !clean(approval.grantedBy, 120)) {
    return { ok: false, status: 'OWNER_APPROVAL_REQUIRED', reason: 'ClayInbox mutation requires explicit owner approval.' };
  }
  const expiry = Date.parse(approval.expiresAt || '');
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) {
    return { ok: false, status: 'OWNER_APPROVAL_EXPIRED', reason: 'ClayInbox owner approval is missing or expired.' };
  }
  const scopes = Array.isArray(approval.scope) ? approval.scope.map(v => clean(v, 160)) : [clean(approval.scope, 160)];
  if (!scopes.some(scope => new Set(['*', capability, `clayinbox:${capability}`]).has(scope))) {
    return { ok: false, status: 'OWNER_APPROVAL_SCOPE_MISMATCH', reason: `Approval does not cover clayinbox:${capability}.` };
  }
  const estimated = Number(estimatedCostCents);
  const limit = Number(approval.spendLimitCents);
  if (Number.isFinite(estimated) && (!Number.isFinite(limit) || estimated > limit)) {
    return { ok: false, status: 'SPEND_LIMIT_EXCEEDED', reason: 'Observed ClayInbox quote exceeds the approved spend ceiling.' };
  }
  return { ok: true };
}
function mapDomain(raw = {}) {
  const domain = lower(raw.domain, 253);
  if (!domain) return null;
  return {
    id: clean(raw.domain_id || raw.domainId, 160) || null,
    domain,
    provider: 'clayinbox',
    status: lower(raw.status, 80) || 'unknown',
    workspaceType: clean(raw.workspace_type || raw.workspaceType, 80).toUpperCase() || null,
    blacklisted: typeof raw.blacklisted === 'boolean' ? raw.blacklisted : null,
    providerObservedDns: {
      spf: raw.spf === true,
      dkim: raw.dkim === true,
      dmarc: raw.dmarc === true,
      mx: raw.mx_records === true
    },
    raw: redactProviderReceipt(raw)
  };
}
function mapMailbox(raw = {}) {
  const address = lower(raw.username || raw.email || raw.address, 320);
  const nestedDomain = lower(raw.domains?.domain, 253);
  const domain = nestedDomain || address.split('@')[1] || '';
  if (!emailOk(address) || !domain || !address.endsWith(`@${domain}`)) return null;
  return {
    id: clean(raw.id || raw.mailbox_id || raw.mailboxId, 160) || null,
    address,
    domain,
    provider: 'clayinbox',
    providerType: clean(raw.type || raw.workspace_type || raw.workspaceType, 80).toUpperCase() || null,
    status: lower(raw.status, 80) || 'unknown',
    masterInbox: typeof raw.master_inbox === 'boolean' ? raw.master_inbox : null,
    costCents: cents(raw.cost),
    billingCycle: clean(raw.billing_cycle, 80).toUpperCase() || null,
    nextBillingDate: clean(raw.next_billing_date, 100) || null,
    raw: redactProviderReceipt(raw)
  };
}
function unwrap(payload) {
  return payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
    ? payload.data
    : payload;
}
function readList(data, key) {
  const value = data && typeof data === 'object' ? data[key] : null;
  return Array.isArray(value) ? value : [];
}
function generatedPassword() {
  return `Ub!${crypto.randomBytes(24).toString('base64url')}`;
}

export function createUberClayInboxAdapter({
  apiKey = '', baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch,
  now = () => new Date(), timeoutMs = 15000, maxReadAttempts = 2
} = {}) {
  const key = clean(apiKey, 1000);
  const base = safeBaseUrl(baseUrl);
  const configured = Boolean(key && base && typeof fetchImpl === 'function');

  async function request({ capability, method = 'GET', path, query = {}, body = null, mutation = false, secretRead = false } = {}) {
    const at = now();
    const timestamp = nowIso(at);
    if (!configured) return errorResult(capability, 'PROVIDER_AUTH_REQUIRED', 'ClayInbox API key or HTTPS base URL is not configured.', { providerCalls: 0, timestamp });
    if (!String(path || '').startsWith('/')) return errorResult(capability, 'ADAPTER_ROUTE_NOT_DECLARED', 'ClayInbox route must be declared by the adapter.', { providerCalls: 0, timestamp });

    const url = new URL(`${base}${path}`);
    for (const [qk, qv] of Object.entries(query || {})) {
      if (qv === undefined || qv === null || qv === '') continue;
      url.searchParams.set(qk, String(qv));
    }
    const attempts = mutation ? 1 : Math.max(1, Math.min(3, Number(maxReadAttempts) || 2));
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(250, Number(timeoutMs) || 15000));
      try {
        const response = await fetchImpl(url.toString(), {
          method,
          headers: {
            'x-api-key': key,
            Accept: 'application/json',
            'User-Agent': BROWSER_UA,
            ...(body == null ? {} : { 'Content-Type': 'application/json' }),
            ...(mutation ? { 'Idempotency-Key': clean(body?.idempotencyKey || '', 200) } : {})
          },
          body: body == null ? undefined : JSON.stringify(body.payload ?? body),
          signal: controller.signal
        });
        const statusCode = Number(response?.status) || 0;
        let raw = '';
        try {
          raw = typeof response.text === 'function'
            ? await response.text()
            : JSON.stringify(typeof response.json === 'function' ? await response.json() : response?.body ?? '');
        } catch {
          raw = '';
        }
        if (raw.length > MAX_RESPONSE_BYTES) {
          return errorResult(capability, 'PROVIDER_RESPONSE_TOO_LARGE', 'ClayInbox response exceeded the bounded response size.', { providerCalls: 1, timestamp, httpStatus: statusCode });
        }
        let payload = null;
        try { payload = JSON.parse(raw || ''); } catch {}
        if (statusCode >= 200 && statusCode < 300) {
          // ClayInbox has historically sat behind Cloudflare. A 200 HTML block
          // page must never be interpreted as an empty fleet.
          if (!payload || typeof payload !== 'object') {
            return errorResult(capability, 'PROVIDER_RESPONSE_UNREADABLE', 'ClayInbox returned HTTP success without a JSON object.', { providerCalls: 1, timestamp, httpStatus: statusCode });
          }
          return successResult(
            capability,
            'PROVIDER_RESPONSE_CONFIRMED',
            secretRead ? payload : redactProviderReceipt(payload),
            { providerCalls: 1, timestamp, httpStatus: statusCode }
          );
        }
        if (!mutation && READ_RETRY_STATUSES.has(statusCode) && attempt < attempts) continue;
        const status = statusCode === 401 || statusCode === 403 ? 'PROVIDER_AUTH_REJECTED'
          : statusCode === 429 ? 'PROVIDER_RATE_LIMITED'
            : mutation && statusCode >= 500 ? 'EXTERNAL_OUTCOME_UNKNOWN'
              : 'PROVIDER_HTTP_ERROR';
        return errorResult(capability, status, `ClayInbox returned HTTP ${statusCode || 'unknown'}.`, {
          providerCalls: 1, timestamp, httpStatus: statusCode,
          providerReceipt: redactProviderReceipt(payload)
        });
      } catch (error) {
        if (!mutation && attempt < attempts) continue;
        return errorResult(
          capability,
          mutation ? 'EXTERNAL_OUTCOME_UNKNOWN' : 'PROVIDER_UNREACHABLE',
          error?.name === 'AbortError' ? 'ClayInbox request timed out.' : 'ClayInbox request failed before a response was received.',
          { providerCalls: 1, timestamp, automaticRetryAuthorized: false }
        );
      } finally {
        clearTimeout(timer);
      }
    }
    return errorResult(capability, 'PROVIDER_UNREACHABLE', 'ClayInbox read attempts were exhausted.', { providerCalls: attempts, timestamp });
  }

  async function paged(path, keyName, mapper, { capability, search = '' } = {}) {
    const out = [];
    let seen = 0;
    let truncated = true;
    let providerCalls = 0;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await request({ capability, path, query: { limit: PAGE_SIZE, page, ...(search ? { search } : {}) } });
      providerCalls += Number(result.providerCalls || 0);
      if (!result.ok) return { ...result, providerCalls };
      const data = unwrap(result.data);
      if (!data || typeof data !== 'object') {
        return errorResult(capability, 'PROVIDER_RESPONSE_UNREADABLE', 'ClayInbox list response has no data object.', { providerCalls });
      }
      const rows = readList(data, keyName);
      seen += rows.length;
      for (const raw of rows) {
        const mapped = mapper(raw);
        if (mapped) out.push(mapped);
      }
      const total = Number(data.total_count ?? data.totalCount);
      if (rows.length === 0 || rows.length < PAGE_SIZE || (Number.isFinite(total) && page * PAGE_SIZE >= total)) {
        truncated = false;
        break;
      }
    }
    return successResult(capability, 'PROVIDER_LIST_OBSERVED', out, {
      providerCalls,
      pagination: { truncated, cap: MAX_PAGES * PAGE_SIZE, seen }
    });
  }

  const adapter = {
    providerName: 'clayinbox',
    configured,
    version: UBERCLAYINBOX_VERSION,
    donor: UBERCLAYINBOX_DONOR,

    identity: async () => successResult('identity', configured ? 'CONFIGURED_ADAPTER_READY' : 'PROVIDER_AUTH_REQUIRED', {
      provider: 'clayinbox',
      authentication: 'x-api-key',
      baseUrl: base || null,
      donor: UBERCLAYINBOX_DONOR
    }, { providerCalls: 0 }),
    authenticationMethod: async () => successResult('authenticationMethod', 'API_KEY', { header: 'x-api-key' }, { providerCalls: 0 }),
    dryRunSupported: async () => successResult('dryRunSupported', 'DRY_RUN_SUPPORTED', {}, { providerCalls: 0 }),
    liveSupported: async () => ({
      ok: configured,
      version: UBERCLAYINBOX_VERSION,
      provider: 'clayinbox',
      status: configured ? 'INFRASTRUCTURE_ADAPTER_READY_REQUIRES_POLICY_AND_OWNER_AUTHORITY' : 'PROVIDER_AUTH_REQUIRED',
      liveSendingAuthority: false,
      providerCalls: 0
    }),
    termsAndAllowedPurposes: async () => errorResult(
      'termsAndAllowedPurposes',
      'TERMS_EVIDENCE_REQUIRED',
      'Cold-email positioning is not a substitute for a fetched current ToS/AUP. Provider-purpose compatibility remains unverified until exact policy evidence is recorded.',
      { providerCalls: 0 }
    ),
    outageState: async () => successResult('outageState', 'LIVE_CHECK_REQUIRED', { outageState: 'UNKNOWN_UNTIL_PROVIDER_READ' }, { providerCalls: 0 }),

    listWorkspaces: async () => successResult('listWorkspaces', 'ACCOUNT_SCOPED', [{ id: 'clayinbox-account', name: 'ClayInbox account' }], { providerCalls: 0 }),
    createWorkspace: async () => unsupported('createWorkspace', 'No live-observed ClayInbox workspace-creation route is admitted.'),
    listDomains: async () => paged('/domain', 'domains', mapDomain, { capability: 'listDomains' }),
    listMailboxes: async ({ search = '' } = {}) => paged('/mailbox', 'mailboxes', mapMailbox, { capability: 'listMailboxes', search }),

    mailboxHealth: async ({ mailboxId = '' } = {}) => {
      const wanted = lower(mailboxId, 320);
      if (!wanted) return errorResult('mailboxHealth', 'MAILBOX_ID_REQUIRED', 'Mailbox id or exact address is required.', { providerCalls: 0 });
      const list = await adapter.listMailboxes();
      if (!list.ok) return list;
      const item = list.data.find(row => lower(row.id, 320) === wanted || lower(row.address, 320) === wanted);
      return item
        ? successResult('mailboxHealth', 'MAILBOX_OBSERVED', item, { providerCalls: list.providerCalls })
        : errorResult('mailboxHealth', 'MAILBOX_NOT_OBSERVED', 'No exact ClayInbox mailbox matched the requested id/address.', { providerCalls: list.providerCalls });
    },

    domainAvailability: async ({ domain = '' } = {}) => {
      const name = lower(domain, 253);
      if (!name) return errorResult('domainAvailability', 'DOMAIN_REQUIRED', 'Domain is required.', { providerCalls: 0 });
      const result = await request({ capability: 'domainAvailability', path: '/domain/available', query: { domain: name } });
      if (!result.ok) return result;
      const data = unwrap(result.data) || {};
      return successResult('domainAvailability', 'DOMAIN_AVAILABILITY_OBSERVED', {
        domain: name,
        available: data.available === true,
        priceCents: cents(data.price),
        raw: redactProviderReceipt(data)
      }, { providerCalls: result.providerCalls });
    },

    wallet: async () => {
      const result = await request({ capability: 'wallet', path: '/wallet' });
      if (!result.ok) return result;
      const data = unwrap(result.data) || {};
      return successResult('wallet', 'WALLET_OBSERVED', {
        availableCents: cents(data.available),
        raw: redactProviderReceipt(data)
      }, { providerCalls: result.providerCalls });
    },

    costs: async () => {
      const list = await adapter.listMailboxes();
      if (!list.ok) return list;
      const groups = new Map();
      let inactive = 0, statusUnknown = 0, unpriced = 0, earliest = null;
      for (const box of list.data) {
        const status = lower(box.status, 80);
        const period = BILLING_PERIOD.get(clean(box.billingCycle, 80).toUpperCase()) || null;
        if (status !== 'active') {
          if (STOPPED_STATUSES.has(status)) inactive += 1;
          else statusUnknown += 1;
          continue;
        }
        if (!Number.isFinite(Number(box.costCents)) || !period) {
          unpriced += 1;
          continue;
        }
        const key = `${box.costCents}/${period}`;
        const row = groups.get(key) || { kind: 'mailbox', unit: 'mailbox', quantity: 0, unitPriceCents: box.costCents, period };
        row.quantity += 1;
        groups.set(key, row);
        if (box.nextBillingDate && (!earliest || box.nextBillingDate < earliest)) earliest = box.nextBillingDate;
      }
      const wallet = await adapter.wallet();
      return successResult('costs', 'COSTS_OBSERVED', {
        items: [...groups.values()],
        meta: {
          priced: true,
          currencyKnown: false,
          inactive,
          statusUnknown,
          unpriced,
          nextBillingDate: earliest,
          walletAvailableCents: wallet.ok ? wallet.data.availableCents : null,
          walletStatus: wallet.status,
          pagination: list.pagination
        }
      }, { providerCalls: Number(list.providerCalls || 0) + Number(wallet.providerCalls || 0) });
    },

    domainDns: async ({ domainId = '' } = {}) => {
      const wanted = lower(domainId, 253);
      if (!wanted) return errorResult('domainDns', 'DOMAIN_ID_REQUIRED', 'Domain id or hostname is required.', { providerCalls: 0 });
      const list = await adapter.listDomains();
      if (!list.ok) return list;
      const item = list.data.find(row => lower(row.id, 253) === wanted || lower(row.domain, 253) === wanted);
      return item
        ? successResult('domainDns', 'PROVIDER_OBSERVED_DNS_FLAGS', {
            domain: item.domain,
            providerObservedDns: item.providerObservedDns,
            truthBoundary: 'These are ClayInbox provider observations only. UberDNS public lookups remain authoritative for independent SPF/DKIM/DMARC/MX verification.'
          }, { providerCalls: list.providerCalls })
        : errorResult('domainDns', 'DOMAIN_NOT_OBSERVED', 'No exact ClayInbox domain matched the requested id/hostname.', { providerCalls: list.providerCalls });
    },
    dnsRequirements: async () => unsupported('dnsRequirements', 'No authoritative provider DNS-requirements endpoint has been admitted from the observed contract.'),
    verifyDns: async () => unsupported('verifyDns', 'Use UberDNS public DNS observations; provider flags are not independent verification.'),
    configureDns: async () => unsupported('configureDns', 'DNS publication belongs to the registrar/DNS authority adapter.'),

    warmupCapable: async () => unsupported('warmupCapable', 'ClayInbox markets automatic warm-up, but no machine-verifiable warm-up control/status API is admitted yet.'),
    startWarmup: async () => unsupported('startWarmup', 'Warm-up purchase/control fields are not guessed from marketing copy.'),
    pauseWarmup: async () => unsupported('pauseWarmup', 'No live-observed ClayInbox warm-up pause route is admitted.'),
    warmupStatus: async () => unsupported('warmupStatus', 'No machine-verifiable ClayInbox warm-up status route is admitted.'),
    prewarmPurchase: async () => unsupported('prewarmPurchase', 'Pre-warmed mailbox purchase exists commercially, but no exact API request field/route is admitted yet.'),

    discoverSendingLimit: async () => unsupported('discoverSendingLimit', 'Mailbox count or active status is not evidence of a safe cold-send cap.'),
    bounceSignal: async () => unsupported('bounceSignal', 'Use UberBond outbound provider/reply telemetry.'),
    complaintSignal: async () => unsupported('complaintSignal', 'Use UberBond outbound provider/reputation telemetry.'),
    replySignal: async () => unsupported('replySignal', 'Use UberIMAP/Gmail provider reply ingestion.'),
    campaignStatus: async () => unsupported('campaignStatus', 'Campaign state is UberBond-owned.'),
    rateLimits: async () => successResult('rateLimits', 'UNOBSERVED', { source: 'provider documentation/live headers required' }, { providerCalls: 0 }),
    receipts: async ({ operationId = '' } = {}) => successResult('receipts', 'LOCAL_RECEIPT_REQUIRED', { operationId: clean(operationId, 200) || null }, { providerCalls: 0 }),
    configureForwarding: async () => unsupported('configureForwarding', 'No live-observed ClayInbox forwarding mutation route is admitted.'),
    exportMailboxes: async () => unsupported('exportMailboxes', 'Credentials are imported directly into UberFleet/UberIMAP only through the bounded app-password path.'),
    cancel: async () => unsupported('cancel', 'No destructive route is guessed. Reconcile provider state before any cancellation workflow.'),
    operationStatus: async () => unsupported('operationStatus', 'Reconcile uncertain orders through listMailboxes/listDomains; no separate operation-status endpoint is admitted.'),
    webhookEvents: async () => successResult('webhookEvents', 'NO_WEBHOOK_CONTRACT_ADMITTED', { authentication: 'unknown' }, { providerCalls: 0 }),
    provisionDomains: async () => unsupported('provisionDomains', 'UberBond already owns outreach domains; this adapter intentionally supports BYO-domain mailbox ordering only.'),

    provisionMailboxes: async ({
      domain = '', mailboxes = [], ownerApproval = null, idempotencyKey = '',
      quotedTotalCents = null, quoteEvidenceRef = ''
    } = {}) => {
      const at = now();
      const name = lower(domain, 253);
      const quote = Number(quotedTotalCents);
      const evidence = clean(quoteEvidenceRef, 1500);
      if (!name || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(name)) {
        return errorResult('provisionMailboxes', 'DOMAIN_REQUIRED', 'A valid BYO domain is required.', { providerCalls: 0 });
      }
      if (!Array.isArray(mailboxes) || mailboxes.length === 0) {
        return errorResult('provisionMailboxes', 'MAILBOXES_REQUIRED', 'At least one mailbox is required.', { providerCalls: 0 });
      }
      if (!clean(idempotencyKey, 200)) {
        return errorResult('provisionMailboxes', 'IDEMPOTENCY_KEY_REQUIRED', 'ClayInbox mailbox ordering requires a durable idempotency key.', { providerCalls: 0 });
      }
      if (!Number.isFinite(quote) || quote < 0 || !evidence) {
        return errorResult('provisionMailboxes', 'OBSERVED_QUOTE_REQUIRED', 'An owner-visible observed quote and evidence reference are required before ordering.', { providerCalls: 0 });
      }
      const approval = authDecision({ ownerApproval, capability: 'provisionMailboxes', estimatedCostCents: quote, now: at });
      if (!approval.ok) return errorResult('provisionMailboxes', approval.status, approval.reason, { providerCalls: 0 });

      const wanted = [];
      for (let i = 0; i < mailboxes.length; i += 1) {
        const box = mailboxes[i] || {};
        const address = lower(box.username || box.address || box.email, 320);
        if (!emailOk(address)) return errorResult('provisionMailboxes', 'FULL_EMAIL_REQUIRED', `Mailbox ${i + 1} must use a full email address.`, { providerCalls: 0 });
        if (address.split('@')[1] !== name) return errorResult('provisionMailboxes', 'DOMAIN_MISMATCH', `${address} is not on ${name}.`, { providerCalls: 0 });
        wanted.push({
          username: address,
          first_name: clean(box.firstName || box.first_name, 120),
          last_name: clean(box.lastName || box.last_name, 120),
          password: String(box.password || generatedPassword())
        });
      }

      const wallet = await adapter.wallet();
      if (!wallet.ok) return errorResult('provisionMailboxes', 'WALLET_EVIDENCE_REQUIRED', 'ClayInbox wallet balance could not be observed before ordering.', { providerCalls: wallet.providerCalls, walletStatus: wallet.status });
      if (Number.isFinite(Number(wallet.data.availableCents)) && wallet.data.availableCents < quote) {
        return errorResult('provisionMailboxes', 'INSUFFICIENT_OBSERVED_WALLET', 'Observed ClayInbox wallet balance is below the approved quote.', {
          providerCalls: wallet.providerCalls,
          walletAvailableCents: wallet.data.availableCents,
          quotedTotalCents: quote
        });
      }

      const result = await request({
        capability: 'provisionMailboxes',
        method: 'POST',
        path: '/order',
        mutation: true,
        body: {
          idempotencyKey: clean(idempotencyKey, 200),
          payload: {
            import: true,
            data: [{ domain_name: name, mailboxes: wanted }]
          }
        }
      });
      const calls = Number(wallet.providerCalls || 0) + Number(result.providerCalls || 0);
      if (!result.ok) return {
        ...result,
        providerCalls: calls,
        automaticRetryAuthorized: false,
        reconciliationRequired: result.status === 'EXTERNAL_OUTCOME_UNKNOWN'
      };
      const data = unwrap(result.data) || {};
      return successResult('provisionMailboxes', 'CLAYINBOX_BYO_ORDER_CONFIRMED', {
        orderId: clean(data.order_id || data.id, 200) || null,
        domain: name,
        mailboxCount: wanted.length,
        quoteEvidenceRef: evidence,
        quotedTotalCents: quote,
        initialPasswordsReturned: false
      }, {
        providerCalls: calls,
        automaticRetryAuthorized: false,
        idempotencyKey: clean(idempotencyKey, 200),
        providerReceipt: redactProviderReceipt(data)
      });
    },

    prepareGoogleFleetImport: async ({
      mailboxId = '',
      encryptionKey = '',
      sendingDomainId = '',
      sendingMailboxId = '',
      sendingWorkspaceId = '',
      routeEvidenceRef = '',
      routeAuthorized = false,
      termsCompatible = false,
      plannedDailyCap = 0,
      plannedHourlyCap = 0,
      minGapSeconds = 0
    } = {}) => {
      const wanted = clean(mailboxId, 320);
      if (!wanted) return errorResult('prepareGoogleFleetImport', 'MAILBOX_ID_REQUIRED', 'Exact ClayInbox mailbox id/address is required.', { providerCalls: 0 });
      if (termsCompatible !== true) {
        return errorResult('prepareGoogleFleetImport', 'PROVIDER_TERMS_EVIDENCE_REQUIRED', 'Current ClayInbox ToS/AUP compatibility must be evidenced before live-route credential import.', { providerCalls: 0 });
      }
      if (routeAuthorized !== true || !clean(routeEvidenceRef, 1500)) {
        return errorResult('prepareGoogleFleetImport', 'ROUTE_AUTHORIZATION_REQUIRED', 'Authorized route evidence is required before credential import.', { providerCalls: 0 });
      }
      const observed = await adapter.mailboxHealth({ mailboxId: wanted });
      if (!observed.ok) return observed;
      const box = observed.data;
      if (!['GOOGLE','GOOGLE_WORKSPACE','GMAIL'].includes(clean(box.providerType, 80).toUpperCase())) {
        return errorResult('prepareGoogleFleetImport', 'GOOGLE_MAILBOX_REQUIRED', 'Only the donor-proven Google app-password path is admitted. Azure/Microsoft credential assumptions are refused.', { providerCalls: observed.providerCalls });
      }
      if (box.status !== 'active') {
        return errorResult('prepareGoogleFleetImport', 'MAILBOX_NOT_ACTIVE', 'ClayInbox mailbox must be provider-observed active before credential retrieval.', { providerCalls: observed.providerCalls });
      }
      if (!box.id) {
        return errorResult('prepareGoogleFleetImport', 'PROVIDER_MAILBOX_ID_REQUIRED', 'ClayInbox mailbox row has no provider id.', { providerCalls: observed.providerCalls });
      }

      const secret = await request({
        capability: 'googleAppPassword',
        path: `/mailbox/${encodeURIComponent(box.id)}/app-password`,
        secretRead: true
      });
      const providerCalls = Number(observed.providerCalls || 0) + Number(secret.providerCalls || 0);
      if (!secret.ok) return { ...secret, providerCalls };
      const secretData = unwrap(secret.data) || {};
      const password = typeof secretData.app_password === 'string'
        ? clean(secretData.app_password, 500)
        : typeof secretData === 'string'
          ? clean(secretData, 500)
          : '';
      if (!password) {
        return errorResult('prepareGoogleFleetImport', 'CREDENTIAL_NOT_READY', 'ClayInbox app password is not ready yet; do not retry as an SMTP authentication failure.', {
          providerCalls,
          automaticRetryAuthorized: false,
          retryClass: 'ELAPSED_PROVIDER_PROVISIONING'
        });
      }

      const smtp = buildEncryptedSmtpAccount({
        email: box.address,
        provider: 'smtp-relay',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        username: box.address,
        password,
        sendingDomainId,
        sendingMailboxId,
        sendingWorkspaceId,
        routeEvidenceRef,
        routeAuthorized: true,
        termsCompatible: true,
        plannedDailyCap,
        plannedHourlyCap,
        minGapSeconds
      }, encryptionKey);
      const imap = buildEncryptedImapAccount({
        slot: `imap:${clean(sendingMailboxId || box.id, 100)}`,
        email: box.address,
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        username: box.address,
        password,
        evidenceRef: routeEvidenceRef,
        authorized: true,
        termsCompatible: true
      }, encryptionKey);
      if (!smtp.ok || !imap.ok) {
        return errorResult('prepareGoogleFleetImport', 'UBERBOND_CREDENTIAL_IMPORT_REFUSED', 'UberFleet/UberIMAP rejected the provider credential package.', {
          providerCalls,
          smtpReasonCodes: smtp.reasonCodes || [],
          imapReasonCodes: imap.reasonCodes || []
        });
      }
      const result = successResult('prepareGoogleFleetImport', 'GOOGLE_FLEET_IMPORT_READY', {
        smtpAccount: smtp.account,
        imapAccount: imap.account,
        mailbox: {
          id: box.id,
          address: box.address,
          domain: box.domain,
          providerType: box.providerType,
          status: box.status
        },
        plaintextCredentialReturned: false,
        routeEvidenceRef: clean(routeEvidenceRef, 1500)
      }, { providerCalls });
      if (JSON.stringify(result).includes(password)) {
        throw new Error('UberClayInbox invariant violation: plaintext app password escaped encrypted import result');
      }
      return result;
    }
  };

  return adapter;
}
