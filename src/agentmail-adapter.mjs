// Clean-room AgentMail adapter for UberBond's provider-neutral contract.
//
// AgentMail is an inbox API, not a private reputation network. This adapter
// owns the translation and safety boundary only: documented HTTPS calls,
// idempotent inbox/domain provisioning, message send/reply calls, bounded
// reads, redacted receipts, and explicit plan ceilings. Provider billing,
// DNS authority, deliverability, reputation, and send policy remain external.
//
// The target plan is configuration, not evidence that an account is paid or
// that its published limits are available. Live capacity is established only
// by authenticated provider receipts and UberBond reconciliation.

import { createProviderHttpAdapter } from './provider-http-adapters.mjs';
import { redactProviderReceipt } from './provider-receipt-redaction.mjs';

export const AGENTMAIL_ADAPTER_POLICY_VERSION = 'agentmail-adapter-1.0.0';
export const AGENTMAIL_DEFAULT_BASE_URL = 'https://api.agentmail.to/v0';

export const AGENTMAIL_TARGET_PLAN_LIMITS = Object.freeze({
  free: Object.freeze({
    plan: 'free',
    monthlyPriceCents: 0,
    maxInboxes: 3,
    maxCustomDomains: 0,
    monthlyEmails: 3000,
    dailyEmails: 100,
    fiveMinuteBurst: null
  }),
  developer: Object.freeze({
    plan: 'developer',
    monthlyPriceCents: 2000,
    maxInboxes: 10,
    maxCustomDomains: 10,
    monthlyEmails: 10000,
    dailyEmails: 1000,
    fiveMinuteBurst: null
  }),
  startup: Object.freeze({
    plan: 'startup',
    monthlyPriceCents: 20000,
    maxInboxes: 150,
    maxCustomDomains: 150,
    monthlyEmails: 150000,
    dailyEmails: 15000,
    fiveMinuteBurst: 1500
  })
});

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function plainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stripUndefined(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item !== undefined));
}

function idPath(prefix, value) {
  const id = text(value, 300);
  return id && !/[\r\n]/.test(id) ? prefix + encodeURIComponent(id) : '';
}

function valuesOf(value) {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function failure(context, capability, status, reason) {
  return context.providerError({
    provider: 'agentmail',
    capability,
    status,
    reason,
    timestamp: context.nowTimestamp()
  });
}

function pageResult(result, key, context) {
  const data = context.dataOf(result) || {};
  const items = Array.isArray(data[key]) ? data[key] : [];
  const count = Number(data.count);
  return {
    ...result,
    [key]: items,
    count: Number.isFinite(count) ? count : items.length,
    nextPageToken: text(data.next_page_token, 500) || null
  };
}

function inboxPayload(item, fallbackClientId = '') {
  const source = plainObject(item) ? item : {};
  const address = text(source.email || source.address, 254).toLowerCase();
  const addressParts = address.split('@');
  const username = text(source.username || source.localPart || addressParts[0], 128);
  const domain = text(source.domain || addressParts[1], 254).toLowerCase();
  const clientId = text(source.clientId || source.client_id || fallbackClientId, 240);
  const payload = stripUndefined({
    username: username || undefined,
    domain: domain || undefined,
    display_name: text(source.displayName || source.display_name, 240) || undefined,
    client_id: clientId || undefined,
    metadata: plainObject(source.metadata) ? source.metadata : undefined
  });
  return Object.keys(payload).length ? payload : null;
}

function messagePayload({
  to,
  cc,
  bcc,
  replyTo,
  subject,
  text: bodyText,
  html,
  labels,
  attachments,
  headers,
  trackOpens,
  replyAll
} = {}) {
  return stripUndefined({
    to: valuesOf(to).length ? to : undefined,
    cc: valuesOf(cc).length ? cc : undefined,
    bcc: valuesOf(bcc).length ? bcc : undefined,
    reply_to: valuesOf(replyTo).length ? replyTo : undefined,
    subject: text(subject, 998) || undefined,
    text: bodyText == null ? undefined : String(bodyText),
    html: html == null ? undefined : String(html),
    labels: Array.isArray(labels) ? labels.map(item => text(item, 80)).filter(Boolean) : undefined,
    attachments: Array.isArray(attachments) ? attachments : undefined,
    headers: plainObject(headers) ? headers : undefined,
    track_opens: trackOpens === undefined ? undefined : Boolean(trackOpens),
    reply_all: replyAll === undefined ? undefined : Boolean(replyAll)
  });
}

export function createAgentMailAdapter(config = {}, options = {}) {
  const targetPlan = text(config.targetPlan || config.plan || 'startup', 40).toLowerCase();
  const limits = AGENTMAIL_TARGET_PLAN_LIMITS[targetPlan] || AGENTMAIL_TARGET_PLAN_LIMITS.startup;
  const transportOptions = { ...options };
  delete transportOptions.extensions;

  return createProviderHttpAdapter({
    providerName: 'agentmail',
    config: {
      ...config,
      termsUrl: config.termsUrl || 'https://docs.agentmail.to/'
    },
    baseUrl: config.baseUrl || AGENTMAIL_DEFAULT_BASE_URL,
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    routes: {
      listMailboxes: '/inboxes',
      mailboxHealth: id => idPath('/inboxes/', id),
      listDomains: '/domains',
      domainDns: id => idPath('/domains/', id),
      provisionDomains: '/domains',
      provisionMailboxes: '/inboxes',
      verifyDns: id => idPath('/domains/', id) + '/verify',
      listWebhooks: '/webhooks',
      createWebhook: '/webhooks'
    },
    ...transportOptions,
    extensions: context => {
      const {
        requestJson,
        dataOf,
        normalizeMailboxList,
        normalizeDomainList,
        providerError,
        unsupported,
        nowTimestamp
      } = context;

      const readInbox = async ({ inboxId = '', capability = 'mailboxHealth' } = {}) => {
        const path = idPath('/inboxes/', inboxId);
        if (!path) return failure(context, capability, 'INBOX_ID_REQUIRED', 'An AgentMail inbox id is required.');
        return requestJson({ capability, method: 'GET', path, query: {} });
      };

      const createInbox = async ({
        payload,
        ownerApproval = null,
        idempotencyKey = '',
        estimatedCostCents = null
      } = {}) => {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          return failure(context, 'provisionMailboxes', 'INBOX_REQUEST_REQUIRED', 'An AgentMail inbox request body is required.');
        }
        const result = await requestJson({
          capability: 'provisionMailboxes',
          method: 'POST',
          path: '/inboxes',
          body: payload,
          ownerApproval,
          idempotencyKey,
          estimatedCostCents
        });
        return {
          ...result,
          inbox: dataOf(result)
        };
      };

      return {
        // AgentMail has organization/pod resources rather than UberBond
        // workspaces. Keep the contract callable without inventing a mapping.
        listWorkspaces: async () => unsupported('agentmail', 'listWorkspaces', 'AgentMail exposes organizations and pods, not an UberBond workspace resource.'),
        createWorkspace: async () => unsupported('agentmail', 'createWorkspace', 'AgentMail organizations are not created through this adapter.'),
        domainAvailability: async () => unsupported('agentmail', 'domainAvailability', 'AgentMail does not document a domain-availability endpoint.'),

        listMailboxes: async ({ limit = 100, pageToken = '', ascending = false } = {}) => {
          const result = await requestJson({
            capability: 'listMailboxes',
            method: 'GET',
            path: '/inboxes',
            query: { limit, page_token: pageToken, ascending }
          });
          return normalizeMailboxList(pageResult(result, 'inboxes', context));
        },

        mailboxHealth: async ({ mailboxId = '' } = {}) => {
          const result = await readInbox({ inboxId, capability: 'mailboxHealth' });
          return {
            ...result,
            mailbox: dataOf(result),
            mailboxState: result.ok ? 'IDENTITY_OBSERVED' : 'UNKNOWN_UNTIL_RECONCILED'
          };
        },

        dnsRequirements: async ({ domainId = '' } = {}) => {
          const path = idPath('/domains/', domainId);
          if (!path) return failure(context, 'dnsRequirements', 'DOMAIN_ID_REQUIRED', 'An AgentMail domain id is required.');
          const result = await requestJson({ capability: 'dnsRequirements', method: 'GET', path, query: {} });
          const data = dataOf(result) || {};
          const records = Array.isArray(data.records)
            ? data.records.map(record => ({
              type: text(record?.type, 40).toUpperCase(),
              name: text(record?.name, 254),
              value: text(record?.value, 1000),
              status: text(record?.status, 80).toUpperCase(),
              priority: Number.isFinite(Number(record?.priority)) ? Number(record.priority) : null
            })).filter(record => record.type || record.name || record.value)
            : [];
          return {
            ...result,
            dnsRecords: records,
            expectedRecords: records.length ? { records } : null
          };
        },

        verifyDns: async ({ domainId = '', ownerApproval = null, idempotencyKey = '' } = {}) => {
          const path = idPath('/domains/', domainId);
          if (!path) return failure(context, 'verifyDns', 'DOMAIN_ID_REQUIRED', 'An AgentMail domain id is required.');
          return requestJson({
            capability: 'verifyDns',
            method: 'POST',
            path: path + '/verify',
            body: null,
            ownerApproval,
            idempotencyKey
          });
        },

        provisionDomains: async ({
          domain = '',
          domains = [],
          body = null,
          allowConflictingProvider,
          feedbackEnabled,
          subdomainsEnabled,
          trackingEnabled,
          clientId = '',
          ownerApproval = null,
          idempotencyKey = '',
          estimatedCostCents = null
        } = {}) => {
          const values = [...new Set((Array.isArray(domains) ? domains : [domain])
            .map(item => text(item, 254).toLowerCase())
            .filter(Boolean))];
          if (body && plainObject(body)) {
            return requestJson({
              capability: 'provisionDomains',
              method: 'POST',
              path: '/domains',
              body,
              ownerApproval,
              idempotencyKey,
              estimatedCostCents
            });
          }
          if (values.length !== 1) {
            return failure(context, 'provisionDomains', values.length ? 'ONE_DOMAIN_PER_REQUEST' : 'DOMAIN_REQUIRED', 'AgentMail creates one domain per request; provide exactly one domain.');
          }
          const payload = stripUndefined({
            domain: values[0],
            allow_conflicting_provider: allowConflictingProvider === undefined ? undefined : Boolean(allowConflictingProvider),
            feedback_enabled: feedbackEnabled === undefined ? undefined : Boolean(feedbackEnabled),
            subdomains_enabled: subdomainsEnabled === undefined ? undefined : Boolean(subdomainsEnabled),
            tracking_enabled: trackingEnabled === undefined ? undefined : Boolean(trackingEnabled),
            client_id: text(clientId || idempotencyKey, 240) || undefined
          });
          return requestJson({
            capability: 'provisionDomains',
            method: 'POST',
            path: '/domains',
            body: payload,
            ownerApproval,
            idempotencyKey,
            estimatedCostCents
          });
        },

        provisionMailboxes: async ({
          mailboxes = [],
          body = null,
          ownerApproval = null,
          idempotencyKey = '',
          estimatedCostCents = null
        } = {}) => {
          const entries = Array.isArray(body?.mailboxes)
            ? body.mailboxes
            : Array.isArray(mailboxes) && mailboxes.length
              ? mailboxes
              : body && plainObject(body)
                ? [body]
                : [];
          if (!entries.length) return failure(context, 'provisionMailboxes', 'MAILBOXES_REQUIRED', 'At least one AgentMail inbox request is required.');
          if (entries.length > limits.maxInboxes) {
            return failure(context, 'provisionMailboxes', 'PROVIDER_PLAN_CEILING_EXCEEDED', 'The requested inbox batch exceeds the declared target-plan ceiling.');
          }
          if (!text(idempotencyKey, 240)) {
            return failure(context, 'provisionMailboxes', 'IDEMPOTENCY_KEY_REQUIRED', 'AgentMail inbox provisioning requires a durable idempotency key.');
          }

          const inboxes = [];
          const receipts = [];
          let lastResult = null;
          for (let index = 0; index < entries.length; index += 1) {
            const requestKey = text(idempotencyKey, 220) + ':inbox:' + String(index);
            const payload = inboxPayload(entries[index], requestKey);
            if (!payload) return failure(context, 'provisionMailboxes', 'INBOX_REQUEST_REQUIRED', 'Each AgentMail inbox request must contain address or inbox fields.');
            const result = await createInbox({
              payload,
              ownerApproval,
              idempotencyKey: requestKey,
              estimatedCostCents: estimatedCostCents == null ? null : Math.ceil(Number(estimatedCostCents) / entries.length)
            });
            lastResult = result;
            if (!result.ok) {
              return {
                ...result,
                inboxes,
                provisionedCount: inboxes.length,
                receipts
              };
            }
            const inbox = result.inbox || dataOf(result);
            if (inbox) inboxes.push(inbox);
            receipts.push({
              operationId: result.operationId || null,
              providerRequestId: result.providerRequestId || null,
              providerReceipt: result.providerReceipt || result.data || null
            });
          }

          return {
            ...lastResult,
            ok: true,
            status: 'OK',
            data: redactProviderReceipt({ inboxes }),
            inboxes,
            provisionedCount: inboxes.length,
            receipts
          };
        },

        listDomains: async ({ limit = 100, pageToken = '', ascending = false } = {}) => {
          const result = await requestJson({
            capability: 'listDomains',
            method: 'GET',
            path: '/domains',
            query: { limit, page_token: pageToken, ascending }
          });
          return normalizeDomainList(pageResult(result, 'domains', context));
        },

        sendMessage: async ({
          inboxId = '',
          to,
          cc,
          bcc,
          replyTo,
          subject = '',
          text: bodyText = '',
          html,
          labels,
          attachments,
          headers,
          trackOpens,
          ownerApproval = null,
          idempotencyKey = '',
          estimatedCostCents = null
        } = {}) => {
          const path = idPath('/inboxes/', inboxId);
          const recipientCount = valuesOf(to).length + valuesOf(cc).length + valuesOf(bcc).length;
          if (!path) return failure(context, 'sendMessage', 'INBOX_ID_REQUIRED', 'An AgentMail inbox id is required.');
          if (!recipientCount) return failure(context, 'sendMessage', 'RECIPIENT_REQUIRED', 'At least one AgentMail recipient is required.');
          if (recipientCount > 50) return failure(context, 'sendMessage', 'RECIPIENT_LIMIT_EXCEEDED', 'AgentMail allows at most 50 recipients per send.');
          return requestJson({
            capability: 'sendMessage',
            method: 'POST',
            path: path + '/messages/send',
            body: messagePayload({ to, cc, bcc, replyTo, subject, text: bodyText, html, labels, attachments, headers, trackOpens }),
            ownerApproval,
            idempotencyKey,
            estimatedCostCents
          });
        },

        replyToMessage: async ({
          inboxId = '',
          messageId = '',
          to,
          cc,
          bcc,
          replyTo,
          text: bodyText = '',
          html,
          labels,
          attachments,
          headers,
          trackOpens,
          replyAll = false,
          ownerApproval = null,
          idempotencyKey = '',
          estimatedCostCents = null
        } = {}) => {
          const inboxPath = idPath('/inboxes/', inboxId);
          const messagePath = text(messageId, 300);
          if (!inboxPath) return failure(context, 'sendMessage', 'INBOX_ID_REQUIRED', 'An AgentMail inbox id is required.');
          if (!messagePath || /[\r\n]/.test(messagePath)) return failure(context, 'sendMessage', 'MESSAGE_ID_REQUIRED', 'An AgentMail message id is required.');
          return requestJson({
            capability: 'sendMessage',
            method: 'POST',
            path: inboxPath + '/messages/' + encodeURIComponent(messagePath) + '/reply',
            body: messagePayload({ to, cc, bcc, replyTo, text: bodyText, html, labels, attachments, headers, trackOpens, replyAll }),
            ownerApproval,
            idempotencyKey,
            estimatedCostCents
          });
        },

        listMessages: async ({
          inboxId = '',
          limit = 100,
          pageToken = '',
          labels = [],
          before = '',
          after = '',
          from = '',
          to = '',
          subject = ''
        } = {}) => {
          const path = idPath('/inboxes/', inboxId);
          if (!path) return failure(context, 'listMessages', 'INBOX_ID_REQUIRED', 'An AgentMail inbox id is required.');
          const result = await requestJson({
            capability: 'listMessages',
            method: 'GET',
            path: path + '/messages',
            query: { limit, page_token: pageToken, labels, before, after, from, to, subject }
          });
          return pageResult(result, 'messages', context);
        },

        getMessage: async ({ inboxId = '', messageId = '' } = {}) => {
          const inboxPath = idPath('/inboxes/', inboxId);
          const messagePath = text(messageId, 300);
          if (!inboxPath) return failure(context, 'getMessage', 'INBOX_ID_REQUIRED', 'An AgentMail inbox id is required.');
          if (!messagePath || /[\r\n]/.test(messagePath)) return failure(context, 'getMessage', 'MESSAGE_ID_REQUIRED', 'An AgentMail message id is required.');
          return requestJson({
            capability: 'getMessage',
            method: 'GET',
            path: inboxPath + '/messages/' + encodeURIComponent(messagePath),
            query: {}
          });
        },

        listThreads: async ({ inboxId = '', limit = 100, pageToken = '' } = {}) => {
          const path = idPath('/inboxes/', inboxId);
          if (!path) return failure(context, 'listThreads', 'INBOX_ID_REQUIRED', 'An AgentMail inbox id is required.');
          const result = await requestJson({
            capability: 'listThreads',
            method: 'GET',
            path: path + '/threads',
            query: { limit, page_token: pageToken }
          });
          return pageResult(result, 'threads', context);
        },

        getThread: async ({ inboxId = '', threadId = '' } = {}) => {
          const inboxPath = idPath('/inboxes/', inboxId);
          const threadPath = text(threadId, 300);
          if (!inboxPath) return failure(context, 'getThread', 'INBOX_ID_REQUIRED', 'An AgentMail inbox id is required.');
          if (!threadPath || /[\r\n]/.test(threadPath)) return failure(context, 'getThread', 'THREAD_ID_REQUIRED', 'An AgentMail thread id is required.');
          return requestJson({
            capability: 'getThread',
            method: 'GET',
            path: inboxPath + '/threads/' + encodeURIComponent(threadPath),
            query: {}
          });
        },

        listWebhooks: async ({ inboxId = '', limit = 100, pageToken = '' } = {}) => {
          const result = await requestJson({
            capability: 'listWebhooks',
            method: 'GET',
            path: '/webhooks',
            query: { limit, page_token: pageToken, inbox_id: inboxId }
          });
          return pageResult(result, 'webhooks', context);
        },

        createWebhook: async ({
          body = null,
          url = '',
          events = [],
          inboxId = '',
          ownerApproval = null,
          idempotencyKey = ''
        } = {}) => {
          const payload = body && plainObject(body)
            ? body
            : stripUndefined({
              url: text(url, 1000) || undefined,
              events: Array.isArray(events) ? events.map(item => text(item, 100)).filter(Boolean) : undefined,
              inbox_id: text(inboxId, 300) || undefined
            });
          if (!Object.keys(payload).length) return failure(context, 'createWebhook', 'WEBHOOK_REQUEST_REQUIRED', 'Provide the provider-documented AgentMail webhook body.');
          return requestJson({
            capability: 'createWebhook',
            method: 'POST',
            path: '/webhooks',
            body: payload,
            ownerApproval,
            idempotencyKey
          });
        },

        planLimits: async () => ({
          ok: true,
          policyVersion: AGENTMAIL_ADAPTER_POLICY_VERSION,
          provider: 'agentmail',
          status: 'PLAN_CEILING_DECLARED_NOT_OBSERVED',
          observed: false,
          targetPlan: limits.plan,
          limits: { ...limits },
          liveUsableCapacity: false,
          source: 'static target-plan configuration; replace with authenticated organization and usage receipts'
        }),

        discoverSendingLimit: async () => ({
          ok: false,
          policyVersion: AGENTMAIL_ADAPTER_POLICY_VERSION,
          provider: 'agentmail',
          status: 'SENDING_LIMIT_RECEIPT_REQUIRED',
          observed: false,
          reason: 'AgentMail plan ceilings are not a mailbox-level sending-authority receipt.'
        })
      };
    }
  });
}
