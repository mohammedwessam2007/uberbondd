import crypto from 'node:crypto';

export const UBERMAIL_AGENT_API_VERSION = 'uberbond.ubermail-agent-api.v1';
export const UBERMAIL_AGENT_API_SCHEMA = 'ubermail.agent-api.state.v1';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const DIRECTIONS = new Set(['send', 'receive', 'reply']);
const LIST_TYPES = new Set(['allow', 'block']);
const DEFAULT_PERMISSIONS = Object.freeze({
  inbox_read: true,
  inbox_create: true,
  inbox_update: true,
  inbox_delete: true,
  message_read: true,
  message_send: true,
  message_update: true,
  message_delete: true,
  draft_read: true,
  draft_create: true,
  draft_update: true,
  draft_delete: true,
  draft_send: true,
  webhook_read: true,
  webhook_create: true,
  webhook_update: true,
  webhook_delete: true,
  domain_read: true,
  domain_create: true,
  domain_update: true,
  domain_delete: true,
  list_entry_read: true,
  list_entry_create: true,
  list_entry_delete: true,
  metrics_read: true,
  api_key_read: true,
  api_key_create: true,
  api_key_update: true,
  api_key_delete: true,
  pod_read: true,
  pod_create: true,
  pod_delete: true
});

function clone(value) { return value == null ? value : structuredClone(value); }
function text(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }
function iso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('invalid-date');
  return date.toISOString();
}
function hash(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function random(prefix) { return prefix + '_' + crypto.randomBytes(12).toString('hex'); }
function uniq(values = []) { return [...new Set((Array.isArray(values) ? values : [values]).map(v => text(v, 500)).filter(Boolean))]; }
function array(value) { return value == null ? [] : Array.isArray(value) ? value : [value]; }
function email(value, field = 'email') {
  const out = text(value, 320).toLowerCase();
  if (!EMAIL_RE.test(out) || /[\r\n]/.test(out)) throw new UberMailError(field + '-invalid', 400);
  return out;
}
function id(value, field) {
  const out = text(value, 300);
  if (!out || /[\r\n/]/.test(out)) throw new UberMailError(field + '-required', 400);
  return out;
}
function safeObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function permissionMap(input = DEFAULT_PERMISSIONS) {
  const source = safeObject(input);
  return Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map(key => [key, Boolean(source[key])]));
}
function publicApiKey(row) {
  if (!row) return null;
  const { secretHash, ...rest } = row;
  return clone(rest);
}
function publicWebhook(row) {
  if (!row) return null;
  const { secretDigest, headers, ...rest } = row;
  return { ...clone(rest), header_names: Object.keys(safeObject(headers)).sort() };
}
function emptyState() {
  return {
    schemaVersion: UBERMAIL_AGENT_API_SCHEMA,
    pods: {},
    inboxes: {},
    domains: {},
    messages: {},
    threads: {},
    drafts: {},
    webhooks: {},
    apiKeys: {},
    listEntries: {},
    events: [],
    idempotency: {},
    metrics: { sent: 0, received: 0, draftSent: 0, webhookAttempts: 0, webhookFailures: 0 }
  };
}
function normalizeState(value) {
  const state = { ...emptyState(), ...clone(safeObject(value)) };
  for (const key of ['pods','inboxes','domains','messages','threads','drafts','webhooks','apiKeys','listEntries','idempotency','metrics']) {
    state[key] = safeObject(state[key]);
  }
  state.events = Array.isArray(state.events) ? state.events : [];
  state.schemaVersion = UBERMAIL_AGENT_API_SCHEMA;
  return state;
}
function sortNewest(rows, field = 'created_at') {
  return rows.sort((a, b) => String(b?.[field] || '').localeCompare(String(a?.[field] || '')));
}
function page(rows, { limit = 100, pageToken = '' } = {}) {
  const bounded = Math.max(1, Math.min(100, Number(limit) || 100));
  const offset = pageToken && /^p:\d+$/.test(pageToken) ? Number(pageToken.slice(2)) : 0;
  const items = rows.slice(offset, offset + bounded);
  const next = offset + bounded < rows.length ? 'p:' + String(offset + bounded) : null;
  return { items, count: items.length, limit: bounded, next_page_token: next };
}
function matchEntry(entry, address) {
  const candidate = String(address || '').toLowerCase();
  const needle = String(entry || '').toLowerCase();
  return needle.startsWith('@') ? candidate.endsWith(needle) : candidate === needle || candidate.endsWith('@' + needle);
}
function attachmentRows(items = []) {
  return array(items).map(item => {
    const source = safeObject(item);
    const attachment_id = text(source.attachment_id || source.attachmentId, 300) || random('att');
    const rawContentBase64 = source.contentBase64 ?? source.content_base64;
    const contentBase64 = rawContentBase64 == null ? null : String(rawContentBase64);
    return {
      attachment_id,
      filename: text(source.filename, 500) || null,
      content_type: text(source.content_type || source.contentType, 200) || 'application/octet-stream',
      content_disposition: text(source.content_disposition || source.contentDisposition, 40) || 'attachment',
      content_id: text(source.content_id || source.contentId, 500) || null,
      size: Number.isFinite(Number(source.size)) ? Number(source.size) : contentBase64 ? Buffer.from(contentBase64, 'base64').length : 0,
      object_key: text(source.object_key || source.objectKey, 1000) || null,
      content_base64: contentBase64
    };
  });
}
function publicAttachment(row) {
  if (!row) return null;
  const { content_base64, ...rest } = row;
  return clone(rest);
}
function messagePublic(row) {
  if (!row) return null;
  return { ...clone(row), attachments: array(row.attachments).map(publicAttachment) };
}
function draftPublic(row) {
  if (!row) return null;
  return { ...clone(row), attachments: array(row.attachments).map(publicAttachment) };
}

export class UberMailError extends Error {
  constructor(code, status = 400, detail = null) {
    super(code);
    this.name = 'UberMailError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export function createMemoryUberMailRepository(seed = null) {
  let state = normalizeState(seed || emptyState());
  return {
    async load() { return clone(state); },
    async save(next) { state = normalizeState(next); return clone(state); },
    async snapshot() { return clone(state); }
  };
}

export function createUberMailAgentApi({
  repository = createMemoryUberMailRepository(),
  sendTransport = null,
  domainVerifier = null,
  webhookDispatcher = null,
  webhookMasterSecret = '',
  now = () => new Date(),
  requireEffectApproval = true,
  enforceSendAllowList = false,
  maxEvents = 10000
} = {}) {
  let mutationTail = Promise.resolve();
  const at = () => iso(now());

  async function read(fn) {
    const state = normalizeState(await repository.load());
    return fn(state);
  }
  async function mutate(fn) {
    const run = mutationTail.then(async () => {
      const state = normalizeState(await repository.load());
      const result = await fn(state);
      await repository.save(state);
      return result;
    });
    mutationTail = run.catch(() => undefined);
    return run;
  }
  function replay(state, key) { return key ? clone(state.idempotency[key] || null) : null; }
  function remember(state, key, value) { if (key) state.idempotency[key] = clone(value); return value; }
  function approvalOk(approval) {
    if (!requireEffectApproval) return true;
    if (!approval?.granted || !text(approval.grantedBy, 200)) return false;
    const expires = Date.parse(approval.expiresAt || '');
    if (!Number.isFinite(expires) || expires <= now().getTime()) return false;
    const scopes = new Set(array(approval.scope).map(v => text(v, 200)));
    return scopes.has('*') || scopes.has('email.send') || scopes.has('ubermail:send');
  }
  function requireApproval(approval) { if (!approvalOk(approval)) throw new UberMailError('effect-approval-required', 403); }

  async function authContext(state, auth = {}, permission = null, target = {}) {
    if (auth?.system === true) return { type: 'system', key: null };
    const raw = text(auth?.apiKey || auth?.token, 1000);
    if (!raw) throw new UberMailError('api-key-required', 401);
    const digest = hash(raw);
    const key = Object.values(state.apiKeys).find(row => row.secretHash === digest && row.revoked !== true);
    if (!key) throw new UberMailError('api-key-invalid', 401);
    if (key.expires_at && Date.parse(key.expires_at) <= now().getTime()) throw new UberMailError('api-key-expired', 401);
    if (permission && key.permissions?.[permission] !== true) throw new UberMailError('permission-denied:' + permission, 403);
    if (key.inbox_id && target.inboxId && key.inbox_id !== target.inboxId) throw new UberMailError('api-key-inbox-scope-mismatch', 403);
    if (key.pod_id && target.podId && key.pod_id !== target.podId) throw new UberMailError('api-key-pod-scope-mismatch', 403);
    if (key.pod_id && target.inboxId) {
      const targetInbox = state.inboxes[target.inboxId];
      if (targetInbox && targetInbox.pod_id !== key.pod_id) throw new UberMailError('api-key-pod-scope-mismatch', 403);
    }
    if (key.pod_id && target.domainId) {
      const targetDomain = state.domains[target.domainId];
      if (targetDomain && targetDomain.pod_id !== key.pod_id) throw new UberMailError('api-key-pod-scope-mismatch', 403);
    }
    if (key.inbox_id && target.podId) {
      const ownInbox = state.inboxes[key.inbox_id];
      if (!ownInbox || ownInbox.pod_id !== target.podId) throw new UberMailError('api-key-inbox-scope-mismatch', 403);
    }
    key.used_at = at();
    return { type: 'api-key', key };
  }

  function scopedInboxRows(state, context, rows) {
    const key = context?.key;
    if (!key) return rows;
    if (key.inbox_id) return rows.filter(row => row.inbox_id === key.inbox_id);
    if (key.pod_id) return rows.filter(row => state.inboxes[row.inbox_id]?.pod_id === key.pod_id || row.pod_id === key.pod_id);
    return rows;
  }
  function scopedDomainRows(state, context, rows) {
    const key = context?.key;
    if (!key) return rows;
    if (key.inbox_id) {
      const own = state.inboxes[key.inbox_id];
      return rows.filter(row => row.domain_id === own?.domain_id);
    }
    if (key.pod_id) return rows.filter(row => row.pod_id === key.pod_id);
    return rows;
  }
  function scopedApiKeyRows(context, rows) {
    const key = context?.key;
    if (!key) return rows;
    if (key.inbox_id) return rows.filter(row => row.inbox_id === key.inbox_id || row.api_key_id === key.api_key_id);
    if (key.pod_id) return rows.filter(row => row.pod_id === key.pod_id || row.api_key_id === key.api_key_id);
    return rows;
  }
  function webhookVisibleTo(state, context, row) {
    const key = context?.key;
    if (!key) return true;
    if (key.inbox_id) return array(row.inbox_ids).includes(key.inbox_id);
    if (key.pod_id) {
      if (array(row.pod_ids).includes(key.pod_id)) return true;
      return array(row.inbox_ids).some(inboxId => state.inboxes[inboxId]?.pod_id === key.pod_id);
    }
    return true;
  }
  function eventVisibleTo(state, context, event) {
    const key = context?.key;
    if (!key) return true;
    const data = safeObject(event?.data);
    if (key.inbox_id) return data.inbox_id === key.inbox_id;
    if (key.pod_id) {
      if (data.pod_id === key.pod_id) return true;
      return data.inbox_id ? state.inboxes[data.inbox_id]?.pod_id === key.pod_id : false;
    }
    return true;
  }

  function eventPayload(event) {
    return { id: event.event_id, type: event.type, created_at: event.created_at, data: clone(event.data) };
  }
  async function emit(state, type, data) {
    const event = { event_id: random('evt'), type, created_at: at(), data: clone(data) };
    state.events.push(event);
    if (state.events.length > maxEvents) state.events.splice(0, state.events.length - maxEvents);
    const targets = Object.values(state.webhooks).filter(row => row.enabled !== false && array(row.event_types).includes(type) && (!row.inbox_ids?.length || !data?.inbox_id || row.inbox_ids.includes(data.inbox_id)) && (!row.pod_ids?.length || !data?.pod_id || row.pod_ids.includes(data.pod_id)));
    if (typeof webhookDispatcher === 'function') {
      for (const hook of targets) {
        state.metrics.webhookAttempts = Number(state.metrics.webhookAttempts || 0) + 1;
        try {
          const body = JSON.stringify(eventPayload(event));
          const secret = webhookMasterSecret ? crypto.createHmac('sha256', webhookMasterSecret).update(hook.webhook_id).digest('hex') : '';
          const signature = secret ? crypto.createHmac('sha256', secret).update(body).digest('hex') : '';
          await webhookDispatcher({ webhook: { ...publicWebhook(hook), headers: clone(hook.headers) }, event: eventPayload(event), signature, body });
          hook.last_delivery_at = at();
          hook.last_delivery_status = 'DELIVERED';
        } catch (error) {
          state.metrics.webhookFailures = Number(state.metrics.webhookFailures || 0) + 1;
          hook.last_delivery_at = at();
          hook.last_delivery_status = 'FAILED';
          hook.last_delivery_error = text(error?.message || error, 500);
        }
      }
    }
    return event;
  }
  function requireInbox(state, inboxId) {
    const row = state.inboxes[id(inboxId, 'inbox-id')];
    if (!row) throw new UberMailError('inbox-not-found', 404);
    return row;
  }
  function requireMessage(state, inboxId, messageId) {
    requireInbox(state, inboxId);
    const row = state.messages[id(messageId, 'message-id')];
    if (!row || row.inbox_id !== inboxId) throw new UberMailError('message-not-found', 404);
    return row;
  }
  function requireThread(state, threadId, inboxId = null) {
    const row = state.threads[id(threadId, 'thread-id')];
    if (!row || (inboxId && row.inbox_id !== inboxId)) throw new UberMailError('thread-not-found', 404);
    return row;
  }
  function requireDraft(state, inboxId, draftId) {
    requireInbox(state, inboxId);
    const row = state.drafts[id(draftId, 'draft-id')];
    if (!row || row.inbox_id !== inboxId) throw new UberMailError('draft-not-found', 404);
    return row;
  }
  function requirePod(state, podId) {
    const row = state.pods[id(podId, 'pod-id')];
    if (!row) throw new UberMailError('pod-not-found', 404);
    return row;
  }
  function requireDomain(state, domainId) {
    const row = state.domains[id(domainId, 'domain-id')];
    if (!row) throw new UberMailError('domain-not-found', 404);
    return row;
  }
  function threadSnapshot(state, thread) {
    const messages = thread.message_ids.map(messageId => state.messages[messageId]).filter(Boolean).map(messagePublic);
    const last = messages.at(-1) || null;
    return {
      ...clone(thread),
      last_message_id: last?.message_id || null,
      message_count: messages.length,
      size: messages.reduce((sum, row) => sum + Buffer.byteLength(String(row.text || row.html || '')), 0),
      timestamp: last?.timestamp || thread.updated_at,
      preview: text(last?.text || '', 200) || null,
      subject: last?.subject || null,
      messages
    };
  }
  function recipients(payload) { return uniq([...array(payload.to), ...array(payload.cc), ...array(payload.bcc)].map(v => email(v, 'recipient'))); }
  function sendPolicy(state, inbox, recipientList, relationship = 'USER_INITIATED') {
    if (!recipientList.length) throw new UberMailError('recipient-required', 400);
    if (recipientList.length > 50) throw new UberMailError('recipient-limit-exceeded', 400);
    if (inbox.paused === true) throw new UberMailError('inbox-paused', 409);
    const entries = Object.values(state.listEntries).filter(row => !row.inbox_id || row.inbox_id === inbox.inbox_id).filter(row => row.direction === 'send');
    for (const recipient of recipientList) {
      if (entries.some(row => row.list_type === 'block' && matchEntry(row.entry, recipient))) throw new UberMailError('recipient-blocked', 403, recipient);
      const allows = entries.filter(row => row.list_type === 'allow');
      if (enforceSendAllowList && allows.length && !allows.some(row => matchEntry(row.entry, recipient))) throw new UberMailError('recipient-not-allowlisted', 403, recipient);
    }
    const allowedRelationships = new Set(['TRANSACTIONAL','USER_INITIATED','EXPLICIT_OPT_IN']);
    if (!allowedRelationships.has(text(relationship, 80).toUpperCase())) throw new UberMailError('relationship-not-permitted', 403);
  }
  function buildMessage(state, { inbox, payload, direction, threadId = null, inReplyTo = null, forwardOf = null, providerReferenceId = null, receivedAt = null }) {
    const message_id = random('msg');
    const timestamp = receivedAt ? iso(receivedAt) : at();
    let thread = threadId ? state.threads[threadId] : null;
    if (!thread) {
      thread = {
        inbox_id: inbox.inbox_id,
        thread_id: random('thread'),
        labels: [],
        message_ids: [],
        created_at: timestamp,
        updated_at: timestamp
      };
      state.threads[thread.thread_id] = thread;
    }
    const row = {
      inbox_id: inbox.inbox_id,
      message_id,
      thread_id: thread.thread_id,
      direction,
      labels: uniq(payload.labels),
      from: direction === 'received' ? email(payload.from, 'from') : inbox.email,
      to: array(payload.to).map(v => email(v, 'to')),
      cc: array(payload.cc).map(v => email(v, 'cc')),
      bcc: array(payload.bcc).map(v => email(v, 'bcc')),
      reply_to: array(payload.reply_to || payload.replyTo).map(v => email(v, 'reply-to')),
      subject: text(payload.subject, 998),
      text: payload.text == null ? null : String(payload.text),
      html: payload.html == null ? null : String(payload.html),
      headers: clone(safeObject(payload.headers)),
      attachments: attachmentRows(payload.attachments),
      in_reply_to: inReplyTo || null,
      forward_of: forwardOf || null,
      provider_reference_id: providerReferenceId || null,
      timestamp,
      created_at: timestamp,
      updated_at: timestamp
    };
    state.messages[row.message_id] = row;
    thread.message_ids.push(row.message_id);
    thread.updated_at = timestamp;
    return row;
  }
  async function dispatchSend(state, { inbox, payload, relationship, approval, idempotencyKey = '', inReplyTo = null, forwardOf = null, threadId = null, source = 'send' }) {
    const existing = replay(state, idempotencyKey);
    if (existing) return existing;
    requireApproval(approval);
    const recipientList = recipients(payload);
    sendPolicy(state, inbox, recipientList, relationship);
    if (typeof sendTransport !== 'function') throw new UberMailError('send-transport-not-configured', 503);
    const transportPayload = {
      inboxId: inbox.inbox_id,
      from: inbox.email,
      to: array(payload.to).map(v => email(v, 'to')),
      cc: array(payload.cc).map(v => email(v, 'cc')),
      bcc: array(payload.bcc).map(v => email(v, 'bcc')),
      replyTo: array(payload.reply_to || payload.replyTo).map(v => email(v, 'reply-to')),
      subject: text(payload.subject, 998),
      text: payload.text == null ? '' : String(payload.text),
      html: payload.html == null ? null : String(payload.html),
      attachments: attachmentRows(payload.attachments).map(publicAttachment),
      headers: clone(safeObject(payload.headers)),
      inReplyTo,
      forwardOf,
      idempotencyKey
    };
    let outcome;
    try { outcome = await sendTransport(transportPayload); }
    catch (error) { throw new UberMailError('send-outcome-unknown', 502, text(error?.message || error, 500)); }
    if (!outcome || outcome.ok !== true) {
      if (outcome?.uncertain === true) throw new UberMailError('send-outcome-unknown', 502);
      throw new UberMailError('send-rejected', Number(outcome?.status) || 502, outcome?.reason || null);
    }
    const row = buildMessage(state, { inbox, payload, direction: 'sent', threadId, inReplyTo, forwardOf, providerReferenceId: text(outcome.providerReferenceId || outcome.messageId, 500) || null });
    state.metrics.sent = Number(state.metrics.sent || 0) + 1;
    await emit(state, 'message.sent', messagePublic(row));
    const result = { message_id: row.message_id, thread_id: row.thread_id, provider_reference_id: row.provider_reference_id, source };
    return remember(state, idempotencyKey, result);
  }

  const api = {
    version: UBERMAIL_AGENT_API_VERSION,
    async health() { return { ok: true, version: UBERMAIL_AGENT_API_VERSION, transportConfigured: typeof sendTransport === 'function', domainVerifierConfigured: typeof domainVerifier === 'function', persistence: 'repository-adapter' }; },

    async bootstrapRootKey({ name = 'UberMail Root', permissions = DEFAULT_PERMISSIONS, expiresAt = null } = {}) {
      return mutate(async state => {
        if (Object.keys(state.apiKeys).length) throw new UberMailError('bootstrap-root-key-already-exists', 409);
        const secret = 'ubm_' + crypto.randomBytes(24).toString('base64url');
        const row = { type: 'bearer', api_key_id: random('key'), prefix: secret.slice(0, 12), name: text(name, 200), pod_id: null, inbox_id: null, permissions: permissionMap(permissions), created_at: at(), updated_at: at(), used_at: null, expires_at: expiresAt ? iso(expiresAt) : null, secretHash: hash(secret), revoked: false };
        state.apiKeys[row.api_key_id] = row;
        return { ...publicApiKey(row), api_key: secret };
      });
    },

    async createApiKey({ auth, name = '', type = 'bearer', permissions = DEFAULT_PERMISSIONS, podId = null, inboxId = null, expiresAt = null, idempotencyKey = '' } = {}) {
      return mutate(async state => {
        await authContext(state, auth, 'api_key_create', { podId, inboxId });
        const prior = idempotencyKey ? state.idempotency[idempotencyKey] : null;
        if (prior?.kind === 'api_key') {
          const priorRow = state.apiKeys[prior.api_key_id];
          if (!priorRow) throw new UberMailError('idempotency-target-missing', 409);
          return { ...publicApiKey(priorRow), api_key: null, secret_replay_unavailable: true };
        }
        if (podId) requirePod(state, podId); if (inboxId) requireInbox(state, inboxId);
        const keyType=text(type,40).toLowerCase() || 'bearer'; if(keyType!=='bearer')throw new UberMailError('api-key-type-unsupported',400);
        const secret = 'ubm_' + crypto.randomBytes(24).toString('base64url');
        const row = { type: keyType, api_key_id: random('key'), prefix: secret.slice(0, 12), name: text(name, 200) || null, pod_id: podId || null, inbox_id: inboxId || null, permissions: permissionMap(permissions), created_at: at(), updated_at: at(), used_at: null, expires_at: expiresAt ? iso(expiresAt) : null, secretHash: hash(secret), revoked: false };
        state.apiKeys[row.api_key_id] = row;
        if (idempotencyKey) state.idempotency[idempotencyKey] = { kind: 'api_key', api_key_id: row.api_key_id };
        return { ...publicApiKey(row), api_key: secret };
      });
    },
    async listApiKeys({ auth, type = '', limit = 100, pageToken = '' } = {}) {
      return mutate(async state => {
        const context = await authContext(state, auth, 'api_key_read');
        let rows = scopedApiKeyRows(context, Object.values(state.apiKeys)).filter(row => !type || row.type === type).map(publicApiKey);
        rows = sortNewest(rows);
        const out = page(rows, { limit, pageToken });
        return { count: out.count, api_keys: out.items, next_page_token: out.next_page_token };
      });
    },
    async getApiKey({ auth, apiKeyId } = {}) { return mutate(async state => { await authContext(state, auth, 'api_key_read'); const row = state.apiKeys[id(apiKeyId,'api-key-id')]; if (!row) throw new UberMailError('api-key-not-found',404); return publicApiKey(row); }); },
    async updateApiKey({ auth, apiKeyId, name, permissions, expiresAt } = {}) { return mutate(async state => { await authContext(state, auth,'api_key_update'); const row=state.apiKeys[id(apiKeyId,'api-key-id')]; if(!row) throw new UberMailError('api-key-not-found',404); if(name!==undefined) row.name=text(name,200)||null; if(permissions!==undefined) row.permissions=permissionMap(permissions); if(expiresAt!==undefined) row.expires_at=expiresAt?iso(expiresAt):null; row.updated_at=at(); return publicApiKey(row); }); },
    async deleteApiKey({ auth, apiKeyId } = {}) { return mutate(async state => { await authContext(state,auth,'api_key_delete'); const row=state.apiKeys[id(apiKeyId,'api-key-id')]; if(!row) throw new UberMailError('api-key-not-found',404); row.revoked=true; row.updated_at=at(); return { deleted:true, api_key_id:row.api_key_id }; }); },

    async createPod({ auth, name = '', clientId = '', idempotencyKey = '' } = {}) { return mutate(async state => { await authContext(state,auth,'pod_create'); const prior=replay(state,idempotencyKey); if(prior)return prior; if(clientId){ const found=Object.values(state.pods).find(r=>r.client_id===clientId); if(found)return found; } const row={pod_id:random('pod'),name:text(name,200)||'UberMail Pod',client_id:text(clientId,300)||null,created_at:at(),updated_at:at()}; state.pods[row.pod_id]=row; await emit(state,'pod.created',row); return remember(state,idempotencyKey,clone(row)); }); },
    async listPods({ auth, limit=100, pageToken='', ascending=false }={}) { return mutate(async state=>{ await authContext(state,auth,'pod_read'); let rows=Object.values(state.pods).map(clone); rows.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))*(ascending?1:-1)); const out=page(rows,{limit,pageToken}); return{count:out.count,pods:out.items,limit:out.limit,next_page_token:out.next_page_token}; }); },
    async getPod({ auth,podId }={}) { return mutate(async state=>{ await authContext(state,auth,'pod_read',{podId}); return clone(requirePod(state,podId)); }); },
    async deletePod({ auth,podId }={}) { return mutate(async state=>{ await authContext(state,auth,'pod_delete',{podId}); requirePod(state,podId); if(Object.values(state.inboxes).some(r=>r.pod_id===podId)) throw new UberMailError('pod-not-empty',409); delete state.pods[podId]; await emit(state,'pod.deleted',{pod_id:podId}); return{deleted:true,pod_id:podId}; }); },

    async createDomain({ auth, domain, podId=null, clientId='', metadata={}, subdomainsEnabled=false, idempotencyKey='' }={}) { return mutate(async state=>{
      const context=await authContext(state,auth,'domain_create',{podId});
      const prior=replay(state,idempotencyKey); if(prior)return prior;
      if(context.key?.inbox_id)throw new UberMailError('inbox-scoped-key-cannot-create-domain',403);
      const effectivePodId=podId||context.key?.pod_id||null;
      const name=text(domain,253).toLowerCase();
      if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(name))throw new UberMailError('domain-invalid',400);
      if(effectivePodId)requirePod(state,effectivePodId);
      const existing=Object.values(state.domains).find(r=>r.domain===name); if(existing)return clone(existing);
      const row={domain_id:random('domain'),domain:name,pod_id:effectivePodId,client_id:text(clientId,300)||null,metadata:clone(safeObject(metadata)),subdomains_enabled:Boolean(subdomainsEnabled),status:'pending',records:[],created_at:at(),updated_at:at()};
      state.domains[row.domain_id]=row; await emit(state,'domain.created',row); return remember(state,idempotencyKey,clone(row));
    }); },
    async listDomains({ auth, podId=null, limit=100,pageToken='',ascending=false }={}) { return mutate(async state=>{
      const context=await authContext(state,auth,'domain_read',{podId});
      let rows=scopedDomainRows(state,context,Object.values(state.domains));
      if(podId)rows=rows.filter(r=>r.pod_id===podId);
      rows=rows.map(clone); rows.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))*(ascending?1:-1));
      const out=page(rows,{limit,pageToken}); return{count:out.count,domains:out.items,limit:out.limit,next_page_token:out.next_page_token};
    }); },
    async getDomain({ auth,domainId }={}) { return mutate(async state=>{ await authContext(state,auth,'domain_read',{domainId}); return clone(requireDomain(state,domainId)); }); },
    async updateDomain({ auth,domainId,metadata,subdomainsEnabled }={}) { return mutate(async state=>{
      await authContext(state,auth,'domain_update',{domainId}); const row=requireDomain(state,domainId);
      if(metadata!==undefined)row.metadata=clone(safeObject(metadata)); if(subdomainsEnabled!==undefined)row.subdomains_enabled=Boolean(subdomainsEnabled);
      row.updated_at=at(); return clone(row);
    }); },
    async verifyDomain({ auth,domainId,idempotencyKey='' }={}) { return mutate(async state=>{ await authContext(state,auth,'domain_update',{domainId}); const prior=replay(state,idempotencyKey); if(prior)return prior; const row=requireDomain(state,domainId); if(typeof domainVerifier!=='function') throw new UberMailError('domain-verifier-not-configured',503); const evidence=await domainVerifier({domain:row.domain,domainId:row.domain_id,records:clone(row.records),subdomainsEnabled:Boolean(row.subdomains_enabled)}); row.records=array(evidence?.records).map(clone); row.status=evidence?.verified===true?'verified':'pending'; row.verified_at=evidence?.verified===true?at():null; row.updated_at=at(); if(row.status==='verified')await emit(state,'domain.verified',row); return remember(state,idempotencyKey,clone(row)); }); },
    async deleteDomain({ auth,domainId }={}) { return mutate(async state=>{ await authContext(state,auth,'domain_delete',{domainId}); const row=requireDomain(state,domainId); if(Object.values(state.inboxes).some(i=>i.domain_id===domainId)) throw new UberMailError('domain-in-use',409); delete state.domains[row.domain_id]; await emit(state,'domain.deleted',{domain_id:row.domain_id,domain:row.domain}); return{deleted:true,domain_id:row.domain_id}; }); },

    async createInbox({ auth, username='',domain='',displayName='',clientId='',metadata={},podId=null,idempotencyKey='' }={}) { return mutate(async state=>{
      const context=await authContext(state,auth,'inbox_create',{podId}); const prior=replay(state,idempotencyKey); if(prior)return prior;
      if(context.key?.inbox_id)throw new UberMailError('inbox-scoped-key-cannot-create-inbox',403);
      const effectivePodId=podId||context.key?.pod_id||null; if(effectivePodId)requirePod(state,effectivePodId);
      const local=text(username,64).toLowerCase()||crypto.randomBytes(5).toString('hex'); if(!/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(local)) throw new UberMailError('username-invalid',400);
      const domainName=text(domain,253).toLowerCase()||'uberbond.local';
      let domainRow=Object.values(state.domains).find(r=>r.domain===domainName)||null;
      if(!domainRow&&domain){domainRow=Object.values(state.domains).filter(r=>r.status==='verified'&&r.subdomains_enabled===true&&domainName.endsWith('.'+r.domain)).sort((a,b)=>b.domain.length-a.domain.length)[0]||null;}
      if(domain&&(!domainRow||domainRow.status!=='verified'))throw new UberMailError('verified-domain-required',409);
      if(effectivePodId&&domainRow?.pod_id&&domainRow.pod_id!==effectivePodId)throw new UberMailError('domain-pod-scope-mismatch',409);
      const address=email(local+'@'+domainName,'inbox'); if(Object.values(state.inboxes).some(r=>r.email===address))throw new UberMailError('inbox-conflict',409);
      if(clientId){const found=Object.values(state.inboxes).find(r=>r.client_id===clientId); if(found)return clone(found);}
      const row={pod_id:effectivePodId||domainRow?.pod_id||null,inbox_id:random('inbox'),email:address,display_name:text(displayName,300)||null,client_id:text(clientId,300)||null,metadata:clone(safeObject(metadata)),domain_id:domainRow?.domain_id||null,paused:false,created_at:at(),updated_at:at()};
      state.inboxes[row.inbox_id]=row; await emit(state,'inbox.created',row); return remember(state,idempotencyKey,clone(row));
    }); },
    async listInboxes({ auth,podId=null,limit=100,pageToken='',ascending=false }={}) { return mutate(async state=>{
      const context=await authContext(state,auth,'inbox_read',{podId}); let rows=scopedInboxRows(state,context,Object.values(state.inboxes));
      if(podId)rows=rows.filter(r=>r.pod_id===podId); rows=rows.map(clone);
      rows.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))*(ascending?1:-1)); const out=page(rows,{limit,pageToken}); return{count:out.count,inboxes:out.items,limit:out.limit,next_page_token:out.next_page_token};
    }); },
    async searchInboxes({ auth,q,podId=null,limit=100,pageToken='' }={}) { return mutate(async state=>{
      const context=await authContext(state,auth,'inbox_read',{podId}); const query=text(q,256).toLowerCase(); if(query.length<2)throw new UberMailError('search-query-too-short',400);
      const terms=query.split(/\s+/).filter(Boolean); let rows=scopedInboxRows(state,context,Object.values(state.inboxes)); if(podId)rows=rows.filter(r=>r.pod_id===podId);
      rows=rows.filter(r=>{const words=(r.email+' '+(r.display_name||'')).toLowerCase().split(/[^a-z0-9@._+-]+/).filter(Boolean);return terms.every(term=>r.email===term||words.some(w=>w.startsWith(term)));}).sort((a,b)=>(a.email===query?-1:b.email===query?1:0));
      const out=page(rows,{limit,pageToken}); return{count:out.count,inboxes:out.items,limit:out.limit,next_page_token:out.next_page_token};
    }); },
    async getInbox({ auth,inboxId }={}) { return mutate(async state=>{ await authContext(state,auth,'inbox_read',{inboxId}); return clone(requireInbox(state,inboxId)); }); },
    async updateInbox({ auth,inboxId,displayName,metadata,paused }={}) { return mutate(async state=>{ await authContext(state,auth,'inbox_update',{inboxId}); const row=requireInbox(state,inboxId); if(displayName!==undefined)row.display_name=text(displayName,300)||null; if(metadata!==undefined)row.metadata=clone(safeObject(metadata)); if(paused!==undefined)row.paused=Boolean(paused); row.updated_at=at(); await emit(state,'inbox.updated',row); return clone(row); }); },
    async deleteInbox({ auth,inboxId }={}) { return mutate(async state=>{ await authContext(state,auth,'inbox_delete',{inboxId}); const row=requireInbox(state,inboxId); for(const key of Object.keys(state.messages))if(state.messages[key].inbox_id===inboxId)delete state.messages[key]; for(const key of Object.keys(state.threads))if(state.threads[key].inbox_id===inboxId)delete state.threads[key]; for(const key of Object.keys(state.drafts))if(state.drafts[key].inbox_id===inboxId)delete state.drafts[key]; delete state.inboxes[inboxId]; await emit(state,'inbox.deleted',{inbox_id:inboxId,email:row.email}); return{deleted:true,inbox_id:inboxId}; }); },

    async sendMessage({ auth,inboxId,to,cc,bcc,replyTo,subject='',text:bodyText='',html=null,labels=[],attachments=[],headers={},relationship='USER_INITIATED',approval=null,idempotencyKey='' }={}) { return mutate(async state=>{ await authContext(state,auth,'message_send',{inboxId}); const inbox=requireInbox(state,inboxId); return dispatchSend(state,{inbox,payload:{to,cc,bcc,reply_to:replyTo,subject,text:bodyText,html,labels,attachments,headers},relationship,approval,idempotencyKey}); }); },
    async replyToMessage({ auth,inboxId,messageId,to=null,cc=null,bcc=null,replyTo=null,text:bodyText='',html=null,labels=[],attachments=[],headers={},replyAll=false,relationship='USER_INITIATED',approval=null,idempotencyKey='' }={}) { return mutate(async state=>{ await authContext(state,auth,'message_send',{inboxId}); const original=requireMessage(state,inboxId,messageId); const inbox=requireInbox(state,inboxId); let resolvedTo=to; let resolvedCc=cc; if(replyAll){resolvedTo=resolvedTo||uniq([original.from,...original.to].filter(x=>x&&x!==inbox.email)); resolvedCc=resolvedCc||original.cc;} else resolvedTo=resolvedTo||[original.from]; return dispatchSend(state,{inbox,payload:{to:resolvedTo,cc:resolvedCc,bcc,reply_to:replyTo,subject:original.subject,text:bodyText,html,labels,attachments,headers},relationship,approval,idempotencyKey,inReplyTo:original.message_id,threadId:original.thread_id,source:'reply'}); }); },
    async forwardMessage({ auth,inboxId,messageId,to,cc,bcc,replyTo,text:bodyText='',html=null,labels=[],attachments=[],headers={},relationship='USER_INITIATED',approval=null,idempotencyKey='' }={}) { return mutate(async state=>{ await authContext(state,auth,'message_send',{inboxId}); const original=requireMessage(state,inboxId,messageId); const inbox=requireInbox(state,inboxId); const mergedAttachments=[...array(original.attachments),...array(attachments)]; return dispatchSend(state,{inbox,payload:{to,cc,bcc,reply_to:replyTo,subject:'Fwd: '+text(original.subject,950),text:bodyText||original.text||'',html:html||original.html,labels,attachments:mergedAttachments,headers},relationship,approval,idempotencyKey,forwardOf:original.message_id,source:'forward'}); }); },
    async listMessages({ auth,inboxId,limit=100,pageToken='',labels=[],before='',after='',from='',to='',subject='' }={}) { return mutate(async state=>{ await authContext(state,auth,'message_read',{inboxId}); requireInbox(state,inboxId); let rows=Object.values(state.messages).filter(r=>r.inbox_id===inboxId); const labelSet=new Set(array(labels)); if(labelSet.size)rows=rows.filter(r=>[...labelSet].every(l=>r.labels.includes(l))); if(before)rows=rows.filter(r=>r.timestamp<iso(before)); if(after)rows=rows.filter(r=>r.timestamp>iso(after)); if(from)rows=rows.filter(r=>r.from===String(from).toLowerCase()); if(to)rows=rows.filter(r=>r.to.includes(String(to).toLowerCase())); if(subject)rows=rows.filter(r=>String(r.subject).toLowerCase().includes(String(subject).toLowerCase())); rows=sortNewest(rows,'timestamp').map(messagePublic); const out=page(rows,{limit,pageToken}); return{count:out.count,messages:out.items,limit:out.limit,next_page_token:out.next_page_token}; }); },
    async searchMessages({ auth,q,limit=100,pageToken='',inboxId=null,podId=null,before='',after='' }={}) { return mutate(async state=>{ const context=await authContext(state,auth,'message_read',{inboxId,podId}); const query=text(q,500).toLowerCase(); if(!query)throw new UberMailError('search-query-required',400); let rows=scopedInboxRows(state,context,Object.values(state.messages)); if(inboxId){requireInbox(state,inboxId);rows=rows.filter(r=>r.inbox_id===inboxId);}if(podId)rows=rows.filter(r=>state.inboxes[r.inbox_id]?.pod_id===podId); rows=rows.filter(r=>[r.subject,r.from,...r.to,...r.cc,r.text,r.html].join(' ').toLowerCase().includes(query)); if(before)rows=rows.filter(r=>r.timestamp<iso(before));if(after)rows=rows.filter(r=>r.timestamp>iso(after));rows=sortNewest(rows,'timestamp').map(messagePublic);const out=page(rows,{limit,pageToken});return{count:out.count,messages:out.items,limit:out.limit,next_page_token:out.next_page_token}; }); },
    async getMessage({ auth,inboxId,messageId }={}) { return mutate(async state=>{ await authContext(state,auth,'message_read',{inboxId}); return messagePublic(requireMessage(state,inboxId,messageId)); }); },
    async updateMessage({ auth,inboxId,messageId,addLabels=[],removeLabels=[] }={}) { return mutate(async state=>{ await authContext(state,auth,'message_update',{inboxId}); const row=requireMessage(state,inboxId,messageId); row.labels=uniq([...row.labels,...array(addLabels)]).filter(v=>!new Set(array(removeLabels)).has(v)); row.updated_at=at(); return{message_id:row.message_id,labels:clone(row.labels)}; }); },
    async deleteMessage({ auth,inboxId,messageId }={}) { return mutate(async state=>{ await authContext(state,auth,'message_delete',{inboxId}); const row=requireMessage(state,inboxId,messageId); delete state.messages[messageId]; const thread=state.threads[row.thread_id]; if(thread){thread.message_ids=thread.message_ids.filter(x=>x!==messageId);if(!thread.message_ids.length)delete state.threads[thread.thread_id];} return{deleted:true,message_id:messageId}; }); },
    async getMessageAttachment({ auth,inboxId,messageId,attachmentId }={}) { return mutate(async state=>{ await authContext(state,auth,'message_read',{inboxId}); const row=requireMessage(state,inboxId,messageId); const att=row.attachments.find(a=>a.attachment_id===attachmentId); if(!att)throw new UberMailError('attachment-not-found',404); return clone(att); }); },

    async listThreads({ auth,inboxId=null,podId=null,limit=100,pageToken='',labels=[],before='',after='',ascending=false }={}) { return mutate(async state=>{ const context=await authContext(state,auth,'message_read',{inboxId,podId}); let rows=scopedInboxRows(state,context,Object.values(state.threads)); if(inboxId){requireInbox(state,inboxId);rows=rows.filter(r=>r.inbox_id===inboxId);}if(podId)rows=rows.filter(r=>state.inboxes[r.inbox_id]?.pod_id===podId); const labelSet=new Set(array(labels)); if(labelSet.size)rows=rows.filter(r=>[...labelSet].every(l=>r.labels.includes(l))); rows=rows.map(r=>threadSnapshot(state,r)); if(before)rows=rows.filter(r=>r.timestamp<iso(before)); if(after)rows=rows.filter(r=>r.timestamp>iso(after)); rows.sort((a,b)=>String(a.timestamp).localeCompare(String(b.timestamp))*(ascending?1:-1)); const out=page(rows,{limit,pageToken}); return{count:out.count,threads:out.items,limit:out.limit,next_page_token:out.next_page_token}; }); },
    async getThread({ auth,threadId,inboxId=null }={}) { return mutate(async state=>{ await authContext(state,auth,'message_read',{inboxId}); return threadSnapshot(state,requireThread(state,threadId,inboxId)); }); },
    async searchThreads({ auth,q,limit=100,pageToken='',before='',after='' }={}) { return mutate(async state=>{ await authContext(state,auth,'message_read'); const query=text(q,500).toLowerCase(); if(!query)throw new UberMailError('search-query-required',400); let rows=Object.values(state.threads).map(r=>threadSnapshot(state,r)).filter(r=>{const hay=[r.subject,r.preview,...r.messages.flatMap(m=>[m.from,...m.to,m.text,m.html])].join(' ').toLowerCase();return hay.includes(query);}); if(before)rows=rows.filter(r=>r.timestamp<iso(before));if(after)rows=rows.filter(r=>r.timestamp>iso(after)); const out=page(rows,{limit,pageToken}); return{count:out.count,threads:out.items,limit:out.limit,next_page_token:out.next_page_token}; }); },
    async updateThread({ auth,threadId,inboxId=null,addLabels=[],removeLabels=[] }={}) { return mutate(async state=>{ await authContext(state,auth,'message_update',{inboxId});const row=requireThread(state,threadId,inboxId);row.labels=uniq([...row.labels,...array(addLabels)]).filter(v=>!new Set(array(removeLabels)).has(v));row.updated_at=at();return threadSnapshot(state,row);}); },
    async deleteThread({ auth,threadId,inboxId=null }={}) { return mutate(async state=>{ await authContext(state,auth,'message_delete',{inboxId});const row=requireThread(state,threadId,inboxId);for(const messageId of row.message_ids)delete state.messages[messageId];delete state.threads[row.thread_id];return{deleted:true,thread_id:row.thread_id};}); },
    async getThreadAttachment({ auth,threadId,attachmentId,inboxId=null }={}) { return mutate(async state=>{ await authContext(state,auth,'message_read',{inboxId}); const thread=requireThread(state,threadId,inboxId); for(const messageId of thread.message_ids){const att=state.messages[messageId]?.attachments?.find(a=>a.attachment_id===attachmentId);if(att)return clone(att);} throw new UberMailError('attachment-not-found',404); }); },

    async createDraft({ auth,inboxId,to=[],cc=[],bcc=[],replyTo=[],subject='',text:bodyText='',html=null,labels=[],attachments=[],inReplyTo=null,forwardOf=null,replyAll=false,sendAt=null,clientId='',idempotencyKey='' }={}) { return mutate(async state=>{ await authContext(state,auth,'draft_create',{inboxId}); const prior=replay(state,idempotencyKey);if(prior)return prior;requireInbox(state,inboxId);if(clientId){const found=Object.values(state.drafts).find(r=>r.client_id===clientId&&r.inbox_id===inboxId);if(found)return draftPublic(found);} const row={inbox_id:inboxId,draft_id:random('draft'),labels:uniq(labels),reply_to:array(replyTo).map(v=>email(v,'reply-to')),to:array(to).map(v=>email(v,'to')),cc:array(cc).map(v=>email(v,'cc')),bcc:array(bcc).map(v=>email(v,'bcc')),subject:text(subject,998)||null,text:bodyText==null?null:String(bodyText),html:html==null?null:String(html),attachments:attachmentRows(attachments),in_reply_to:inReplyTo||null,forward_of:forwardOf||null,reply_all:Boolean(replyAll),send_status:sendAt?'scheduled':'draft',send_at:sendAt?iso(sendAt):null,client_id:text(clientId,300)||null,created_at:at(),updated_at:at()};state.drafts[row.draft_id]=row;await emit(state,'draft.created',draftPublic(row));return remember(state,idempotencyKey,draftPublic(row));}); },
    async createReplyDraft({ auth,inboxId,messageId,to=null,cc=null,bcc=[],replyTo=[],text:bodyText='',html=null,labels=[],attachments=[],replyAll=false,sendAt=null,clientId='',idempotencyKey='' }={}) { return mutate(async state=>{
      await authContext(state,auth,'draft_create',{inboxId}); const prior=replay(state,idempotencyKey); if(prior)return prior;
      const original=requireMessage(state,inboxId,messageId); const inbox=requireInbox(state,inboxId);
      const resolvedTo=to||(replyAll?uniq([original.from,...original.to].filter(x=>x&&x!==inbox.email)):[original.from]); const resolvedCc=cc||(replyAll?original.cc:[]);
      const row={inbox_id:inboxId,draft_id:random('draft'),labels:uniq(labels),reply_to:array(replyTo).map(v=>email(v,'reply-to')),to:array(resolvedTo).map(v=>email(v,'to')),cc:array(resolvedCc).map(v=>email(v,'cc')),bcc:array(bcc).map(v=>email(v,'bcc')),subject:text(original.subject,998)||null,text:bodyText==null?null:String(bodyText),html:html==null?null:String(html),attachments:attachmentRows(attachments),in_reply_to:original.message_id,forward_of:null,reply_all:Boolean(replyAll),send_status:sendAt?'scheduled':'draft',send_at:sendAt?iso(sendAt):null,client_id:text(clientId,300)||null,created_at:at(),updated_at:at()}; state.drafts[row.draft_id]=row; await emit(state,'draft.created',draftPublic(row)); return remember(state,idempotencyKey,draftPublic(row));
    }); },
    async createForwardDraft({ auth,inboxId,messageId,to=[],cc=[],bcc=[],replyTo=[],text:bodyText='',html=null,labels=[],attachments=[],sendAt=null,clientId='',idempotencyKey='' }={}) { return mutate(async state=>{
      await authContext(state,auth,'draft_create',{inboxId}); const prior=replay(state,idempotencyKey); if(prior)return prior;
      const original=requireMessage(state,inboxId,messageId); requireInbox(state,inboxId);
      const mergedAttachments=[...array(original.attachments),...array(attachments)];
      const row={inbox_id:inboxId,draft_id:random('draft'),labels:uniq(labels),reply_to:array(replyTo).map(v=>email(v,'reply-to')),to:array(to).map(v=>email(v,'to')),cc:array(cc).map(v=>email(v,'cc')),bcc:array(bcc).map(v=>email(v,'bcc')),subject:'Fwd: '+text(original.subject,950),text:bodyText||original.text||'',html:html||original.html,attachments:attachmentRows(mergedAttachments),in_reply_to:null,forward_of:original.message_id,reply_all:false,send_status:sendAt?'scheduled':'draft',send_at:sendAt?iso(sendAt):null,client_id:text(clientId,300)||null,created_at:at(),updated_at:at()}; state.drafts[row.draft_id]=row; await emit(state,'draft.created',draftPublic(row)); return remember(state,idempotencyKey,draftPublic(row));
    }); },
    async listDrafts({ auth,inboxId=null,podId=null,limit=100,pageToken='',labels=[],before='',after='',ascending=false }={}) { return mutate(async state=>{ const context=await authContext(state,auth,'draft_read',{inboxId,podId});let rows=scopedInboxRows(state,context,Object.values(state.drafts));if(inboxId){requireInbox(state,inboxId);rows=rows.filter(r=>r.inbox_id===inboxId);}if(podId)rows=rows.filter(r=>state.inboxes[r.inbox_id]?.pod_id===podId);const labelSet=new Set(array(labels));if(labelSet.size)rows=rows.filter(r=>[...labelSet].every(l=>r.labels.includes(l)));if(before)rows=rows.filter(r=>r.updated_at<iso(before));if(after)rows=rows.filter(r=>r.updated_at>iso(after));rows.sort((a,b)=>String(a.updated_at).localeCompare(String(b.updated_at))*(ascending?1:-1));const out=page(rows.map(draftPublic),{limit,pageToken});return{count:out.count,drafts:out.items,limit:out.limit,next_page_token:out.next_page_token};}); },
    async getDraft({ auth,inboxId,draftId }={}) { return mutate(async state=>{ await authContext(state,auth,'draft_read',{inboxId});return draftPublic(requireDraft(state,inboxId,draftId));}); },
    async updateDraft({ auth,inboxId,draftId,replyTo,to,cc,bcc,subject,text:bodyText,html,addAttachments=[],removeAttachments=[],addLabels=[],removeLabels=[],sendAt }={}) { return mutate(async state=>{ await authContext(state,auth,'draft_update',{inboxId});const row=requireDraft(state,inboxId,draftId);if(row.send_status==='sending')throw new UberMailError('draft-being-sent',409);if(replyTo!==undefined)row.reply_to=array(replyTo).map(v=>email(v,'reply-to'));if(to!==undefined)row.to=array(to).map(v=>email(v,'to'));if(cc!==undefined)row.cc=array(cc).map(v=>email(v,'cc'));if(bcc!==undefined)row.bcc=array(bcc).map(v=>email(v,'bcc'));if(subject!==undefined)row.subject=subject==null?null:text(subject,998);if(bodyText!==undefined)row.text=bodyText==null?null:String(bodyText);if(html!==undefined)row.html=html==null?null:String(html);if(addAttachments.length)row.attachments.push(...attachmentRows(addAttachments));if(removeAttachments.length)row.attachments=row.attachments.filter(a=>!new Set(removeAttachments).has(a.attachment_id));row.labels=uniq([...row.labels,...array(addLabels)]).filter(v=>!new Set(array(removeLabels)).has(v));if(sendAt!==undefined){row.send_at=sendAt?iso(sendAt):null;row.send_status=sendAt?'scheduled':'draft';}row.updated_at=at();return draftPublic(row);}); },
    async deleteDraft({ auth,inboxId,draftId }={}) { return mutate(async state=>{ await authContext(state,auth,'draft_delete',{inboxId});requireDraft(state,inboxId,draftId);delete state.drafts[draftId];await emit(state,'draft.deleted',{inbox_id:inboxId,draft_id:draftId});return{deleted:true,draft_id:draftId};}); },
    async sendDraft({ auth,inboxId,draftId,addLabels=[],removeLabels=[],relationship='USER_INITIATED',approval=null,idempotencyKey='' }={}) { return mutate(async state=>{ await authContext(state,auth,'draft_send',{inboxId});const row=requireDraft(state,inboxId,draftId);const inbox=requireInbox(state,inboxId);row.send_status='sending';try{const result=await dispatchSend(state,{inbox,payload:{to:row.to,cc:row.cc,bcc:row.bcc,reply_to:row.reply_to,subject:row.subject||'',text:row.text||'',html:row.html,labels:uniq([...row.labels,...array(addLabels)]).filter(v=>!new Set(array(removeLabels)).has(v)),attachments:row.attachments},relationship,approval,idempotencyKey,inReplyTo:row.in_reply_to,forwardOf:row.forward_of,threadId:row.in_reply_to?state.messages[row.in_reply_to]?.thread_id:null,source:'draft'});delete state.drafts[draftId];state.metrics.draftSent=Number(state.metrics.draftSent||0)+1;await emit(state,'draft.sent',{inbox_id:inboxId,draft_id:draftId,message_id:result.message_id,thread_id:result.thread_id});return result;}catch(error){row.send_status=row.send_at?'scheduled':'draft';throw error;}}); },
    async getDraftAttachment({ auth,inboxId,draftId,attachmentId }={}) { return mutate(async state=>{ await authContext(state,auth,'draft_read',{inboxId});const row=requireDraft(state,inboxId,draftId);const att=row.attachments.find(a=>a.attachment_id===attachmentId);if(!att)throw new UberMailError('attachment-not-found',404);return clone(att);}); },
    async runScheduledDrafts({ auth={system:true},approval=null,relationship='USER_INITIATED',limit=100 }={}) { const due=await read(state=>Object.values(state.drafts).filter(r=>r.send_status==='scheduled'&&r.send_at&&Date.parse(r.send_at)<=now().getTime()).sort((a,b)=>String(a.send_at).localeCompare(String(b.send_at))).slice(0,Math.max(1,Math.min(100,Number(limit)||100))).map(r=>({inboxId:r.inbox_id,draftId:r.draft_id})));const results=[];for(const row of due){try{results.push({ok:true,...await api.sendDraft({auth,inboxId:row.inboxId,draftId:row.draftId,approval,relationship,idempotencyKey:'scheduled:'+row.draftId})});}catch(error){results.push({ok:false,inbox_id:row.inboxId,draft_id:row.draftId,error:error.code||error.message});}}return{count:results.length,results}; },

    async createWebhook({ auth,url,eventTypes,inboxIds=[],podIds=[],headers={},clientId='',idempotencyKey='' }={}) { return mutate(async state=>{ const context=await authContext(state,auth,'webhook_create',{inboxId:array(inboxIds)[0]||null,podId:array(podIds)[0]||null});if(context.key?.inbox_id&&!inboxIds.length)inboxIds=[context.key.inbox_id];if(context.key?.pod_id&&!podIds.length&&!inboxIds.length)podIds=[context.key.pod_id];const prior=idempotencyKey?state.idempotency[idempotencyKey]:null;if(prior?.kind==='webhook'){const priorRow=state.webhooks[prior.webhook_id];if(!priorRow)throw new UberMailError('idempotency-target-missing',409);return{...publicWebhook(priorRow),secret:null,secret_replay_unavailable:true};}if(!webhookMasterSecret)throw new UberMailError('webhook-master-secret-required',503);let parsed;try{parsed=new URL(String(url||''));}catch{throw new UberMailError('webhook-url-invalid',400);}if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new UberMailError('webhook-url-invalid',400);const events=uniq(eventTypes);if(!events.length)throw new UberMailError('webhook-event-types-required',400);if(inboxIds.length>10||podIds.length>10)throw new UberMailError('webhook-scope-limit-exceeded',400);for(const x of inboxIds)requireInbox(state,x);for(const x of podIds)requirePod(state,x);const webhook_id=random('webhook');const secret=crypto.createHmac('sha256',webhookMasterSecret).update(webhook_id).digest('hex');const row={webhook_id,url:parsed.href,enabled:true,event_types:events,inbox_ids:uniq(inboxIds),pod_ids:uniq(podIds),headers:clone(safeObject(headers)),client_id:text(clientId,300)||null,created_at:at(),updated_at:at(),secretDigest:hash(secret),last_delivery_at:null,last_delivery_status:null};state.webhooks[webhook_id]=row;if(idempotencyKey)state.idempotency[idempotencyKey]={kind:'webhook',webhook_id};return{...publicWebhook(row),secret};}); },
    async listWebhooks({ auth,inboxId=null,podId=null,limit=100,pageToken='' }={}) { return mutate(async state=>{ const context=await authContext(state,auth,'webhook_read',{inboxId,podId});let raw=Object.values(state.webhooks).filter(row=>webhookVisibleTo(state,context,row));if(inboxId)raw=raw.filter(row=>array(row.inbox_ids).includes(inboxId));if(podId)raw=raw.filter(row=>array(row.pod_ids).includes(podId)||array(row.inbox_ids).some(id=>state.inboxes[id]?.pod_id===podId));const rows=sortNewest(raw.map(publicWebhook));const out=page(rows,{limit,pageToken});return{count:out.count,webhooks:out.items,next_page_token:out.next_page_token};}); },
    async getWebhook({ auth,webhookId }={}) { return mutate(async state=>{ await authContext(state,auth,'webhook_read');const row=state.webhooks[id(webhookId,'webhook-id')];if(!row)throw new UberMailError('webhook-not-found',404);return publicWebhook(row);}); },
    async updateWebhook({ auth,webhookId,url,headers,eventTypes,addInboxIds=[],removeInboxIds=[],addPodIds=[],removePodIds=[],enabled }={}) { return mutate(async state=>{ await authContext(state,auth,'webhook_update');const row=state.webhooks[id(webhookId,'webhook-id')];if(!row)throw new UberMailError('webhook-not-found',404);if(url!==undefined){let parsed;try{parsed=new URL(String(url));}catch{throw new UberMailError('webhook-url-invalid',400);}if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new UberMailError('webhook-url-invalid',400);row.url=parsed.href;}if(headers!==undefined)row.headers=clone(safeObject(headers));if(eventTypes!==undefined&&array(eventTypes).length)row.event_types=uniq(eventTypes);row.inbox_ids=uniq([...row.inbox_ids,...array(addInboxIds)]).filter(x=>!new Set(array(removeInboxIds)).has(x));row.pod_ids=uniq([...row.pod_ids,...array(addPodIds)]).filter(x=>!new Set(array(removePodIds)).has(x));if(row.inbox_ids.length>10||row.pod_ids.length>10)throw new UberMailError('webhook-scope-limit-exceeded',400);if(enabled!==undefined)row.enabled=Boolean(enabled);row.updated_at=at();return publicWebhook(row);}); },
    async deleteWebhook({ auth,webhookId }={}) { return mutate(async state=>{ await authContext(state,auth,'webhook_delete');const key=id(webhookId,'webhook-id');if(!state.webhooks[key])throw new UberMailError('webhook-not-found',404);delete state.webhooks[key];return{deleted:true,webhook_id:key};}); },

    async createListEntry({ auth,direction,type,entry,reason='',inboxId=null,podId=null,idempotencyKey='' }={}) { return mutate(async state=>{ await authContext(state,auth,'list_entry_create',{inboxId,podId});const prior=replay(state,idempotencyKey);if(prior)return prior;if(!DIRECTIONS.has(direction))throw new UberMailError('list-direction-invalid',400);if(!LIST_TYPES.has(type))throw new UberMailError('list-type-invalid',400);if(inboxId)requireInbox(state,inboxId);if(podId)requirePod(state,podId);const clean=text(entry,320).toLowerCase();if(!clean)throw new UberMailError('list-entry-required',400);const row={list_entry_id:random('list'),direction,list_type:type,entry:clean,entry_type:clean.includes('@')?'email':'domain',reason:text(reason,500)||null,inbox_id:inboxId||null,pod_id:podId||null,read_only:false,created_at:at()};state.listEntries[row.list_entry_id]=row;return remember(state,idempotencyKey,clone(row));}); },
    async listEntries({ auth,direction='',type='',inboxId=null,podId=null,limit=100,pageToken='' }={}) { return mutate(async state=>{ await authContext(state,auth,'list_entry_read',{inboxId,podId});let rows=Object.values(state.listEntries);if(direction)rows=rows.filter(r=>r.direction===direction);if(type)rows=rows.filter(r=>r.list_type===type);if(inboxId)rows=rows.filter(r=>r.inbox_id===inboxId);if(podId)rows=rows.filter(r=>r.pod_id===podId);const out=page(sortNewest(rows),{limit,pageToken});return{count:out.count,entries:out.items,next_page_token:out.next_page_token};}); },
    async deleteListEntry({ auth,listEntryId }={}) { return mutate(async state=>{ await authContext(state,auth,'list_entry_delete');const key=id(listEntryId,'list-entry-id');const row=state.listEntries[key];if(!row)throw new UberMailError('list-entry-not-found',404);if(row.read_only)throw new UberMailError('list-entry-read-only',403);delete state.listEntries[key];return{deleted:true,list_entry_id:key};}); },

    async ingestReceivedMessage({ auth={system:true},inboxId,from,to=[],cc=[],subject='',text:bodyText='',html=null,labels=[],attachments=[],headers={},providerMessageId='',threadId=null,receivedAt=null }={}) { return mutate(async state=>{ await authContext(state,auth,null,{inboxId});const inbox=requireInbox(state,inboxId);const sender=email(from,'from');const blocks=Object.values(state.listEntries).filter(r=>(!r.inbox_id||r.inbox_id===inboxId)&&r.direction==='receive'&&r.list_type==='block');if(blocks.some(r=>matchEntry(r.entry,sender)))throw new UberMailError('sender-blocked',403);let resolvedThread=threadId;if(!resolvedThread){const refs=uniq([headers?.['in-reply-to'],headers?.['In-Reply-To'],...array(headers?.references)]);const parent=refs.map(ref=>Object.values(state.messages).find(m=>m.provider_reference_id===ref||m.message_id===ref)).find(Boolean);resolvedThread=parent?.thread_id||null;}const row=buildMessage(state,{inbox,payload:{from:sender,to:array(to).length?to:[inbox.email],cc,subject,text:bodyText,html,labels,attachments,headers},direction:'received',threadId:resolvedThread,providerReferenceId:text(providerMessageId,500)||null,receivedAt});state.metrics.received=Number(state.metrics.received||0)+1;await emit(state,'message.received',messagePublic(row));return messagePublic(row);}); },
    async pollEvents({ auth,cursor=0,limit=100,eventTypes=[] }={}) { return mutate(async state=>{ const context=await authContext(state,auth,'message_read');const start=Math.max(0,Number(cursor)||0);const cap=Math.max(1,Math.min(500,Number(limit)||100));const filter=new Set(array(eventTypes));const rows=[];let position=Math.min(start,state.events.length);while(position<state.events.length&&rows.length<cap){const event=state.events[position];position+=1;if(filter.size&&!filter.has(event.type))continue;if(!eventVisibleTo(state,context,event))continue;rows.push(event);}return{events:rows.map(eventPayload),cursor:position,has_more:position<state.events.length};}); },
    async *streamEvents({ auth,cursor=0,limit=100,eventTypes=[],pollIntervalMs=250,signal=null }={}) { let position=Math.max(0,Number(cursor)||0);const delay=Math.max(10,Math.min(30000,Number(pollIntervalMs)||250));while(!signal?.aborted){const batch=await api.pollEvents({auth,cursor:position,limit,eventTypes});position=batch.cursor;for(const event of batch.events){if(signal?.aborted)return;yield event;}if(batch.has_more)continue;await new Promise(resolve=>{const timer=setTimeout(resolve,delay);if(signal?.addEventListener)signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});});} },
    async metrics({ auth }={}) { return mutate(async state=>{ const context=await authContext(state,auth,'metrics_read');const inboxes=scopedInboxRows(state,context,Object.values(state.inboxes));const inboxIds=new Set(inboxes.map(r=>r.inbox_id));const domains=scopedDomainRows(state,context,Object.values(state.domains));const webhooks=Object.values(state.webhooks).filter(row=>webhookVisibleTo(state,context,row));const apiKeys=scopedApiKeyRows(context,Object.values(state.apiKeys)).filter(r=>!r.revoked);const scoped=Boolean(context.key?.pod_id||context.key?.inbox_id);return{...(scoped?{}:clone(state.metrics)),scope:context.key?.inbox_id?'inbox':context.key?.pod_id?'pod':'organization',inboxes:inboxes.length,domains:domains.length,pods:context.key?.pod_id?1:context.key?.inbox_id?(state.inboxes[context.key.inbox_id]?.pod_id?1:0):Object.keys(state.pods).length,messages:Object.values(state.messages).filter(r=>inboxIds.has(r.inbox_id)).length,threads:Object.values(state.threads).filter(r=>inboxIds.has(r.inbox_id)).length,drafts:Object.values(state.drafts).filter(r=>inboxIds.has(r.inbox_id)).length,webhooks:webhooks.length,api_keys:apiKeys.length,list_entries:Object.values(state.listEntries).filter(r=>!scoped||!r.inbox_id&&!r.pod_id||(context.key?.inbox_id&&r.inbox_id===context.key.inbox_id)||(context.key?.pod_id&&(r.pod_id===context.key.pod_id||(r.inbox_id&&state.inboxes[r.inbox_id]?.pod_id===context.key.pod_id)))).length};}); },
    async capabilityMatrix() { return {version:UBERMAIL_AGENT_API_VERSION,owned:true,externalSaasRequired:false,capabilities:{apiKeys:true,pods:true,domains:true,inboxes:true,inboxSearch:true,messages:true,messageSearch:true,replies:true,forwards:true,threads:true,threadSearch:true,drafts:true,scheduledDrafts:true,attachments:true,webhooks:true,allowBlockLists:true,inboundIngestion:true,eventPolling:true,realtimeEventStream:true,scopedResources:true,subdomainInboxes:true,writeOnlyWebhookHeaders:true,replyForwardDrafts:true,metrics:true,durableRepository:'adapter',sendTransport:'pluggable-governed'}}; },
    async snapshot({ auth={system:true} }={}) { return mutate(async state=>{ await authContext(state,auth);const safe=clone(state);safe.apiKeys=Object.fromEntries(Object.entries(safe.apiKeys).map(([k,v])=>[k,publicApiKey(v)]));safe.webhooks=Object.fromEntries(Object.entries(safe.webhooks).map(([k,v])=>[k,publicWebhook(v)]));safe.messages=Object.fromEntries(Object.entries(safe.messages).map(([k,v])=>[k,messagePublic(v)]));safe.drafts=Object.fromEntries(Object.entries(safe.drafts).map(([k,v])=>[k,draftPublic(v)]));return safe;}); }
  };

  return api;
}

export function uberMailHttpError(error) {
  const status = error instanceof UberMailError ? error.status : 500;
  return { status, body: { error: error instanceof UberMailError ? error.code : 'internal-error', detail: error instanceof UberMailError ? error.detail : null } };
}
