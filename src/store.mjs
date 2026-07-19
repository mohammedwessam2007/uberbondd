import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { now, normalizeDomain } from './utils.mjs';
import { redactSensitiveText, sanitizeLogDetail } from './security.mjs';

export const COLLECTIONS = [
  'prospects', 'campaigns', 'jobs', 'messages', 'replies', 'suppressions',
  'socialTasks', 'accounts', 'auditLog', 'leads', 'orders', 'subscriptions',
  'offers', 'deliveries', 'monitoringRuns', 'notifications', 'revenueEvents', 'discoveryRuns', 'workerHeartbeats',
  'outboundReservations', 'senderHealth', 'outboundEvents', 'experiments'
];

const EMPTY = {
  version: 8,
  prospects: [], campaigns: [], jobs: [], messages: [], replies: [],
  suppressions: [], socialTasks: [], accounts: [], auditLog: [], settings: {},
  leads: [], orders: [], subscriptions: [], offers: [], deliveries: [], monitoringRuns: [], notifications: [],
  revenueEvents: [], discoveryRuns: [], workerHeartbeats: [],
  outboundReservations: [], senderHealth: [], outboundEvents: [], experiments: []
};

const MAP = {
  prospects: {
    table: 'prospects',
    columns: {
      domain: 'domain', campaignId: 'campaign_id', leadId: 'lead_id',
      monitoringRunId: 'monitoring_run_id', status: 'status',
      nextFollowupAt: 'next_followup_at', threadId: 'thread_id',
      createdAt: 'created_at', updatedAt: 'updated_at'
    }
  },
  campaigns: {
    table: 'campaigns',
    columns: { systemKey: 'system_key', approved: 'approved', autoSend: 'auto_send', createdAt: 'created_at', updatedAt: 'updated_at' }
  },
  jobs: {
    table: 'jobs',
    columns: {
      type: 'type', queue: 'queue', status: 'status', priority: 'priority', attempts: 'attempts',
      maxAttempts: 'max_attempts', scheduledAt: 'scheduled_at', runAt: 'run_at',
      lockedAt: 'locked_at', lockedBy: 'locked_by', heartbeatAt: 'heartbeat_at',
      lastError: 'last_error', dedupeKey: 'dedupe_key', singletonKey: 'singleton_key', deadLetteredAt: 'dead_lettered_at',
      startedAt: 'started_at', completedAt: 'completed_at', createdAt: 'created_at', updatedAt: 'updated_at'
    }
  },
  messages: {
    table: 'messages',
    columns: { prospectId: 'prospect_id', campaignId: 'campaign_id', inbox: 'inbox', gmailId: 'gmail_id', threadId: 'thread_id', sentAt: 'sent_at', createdAt: 'created_at', updatedAt: 'updated_at' }
  },
  replies: {
    table: 'replies',
    columns: { prospectId: 'prospect_id', gmailId: 'gmail_id', threadId: 'thread_id', receivedAt: 'received_at', createdAt: 'created_at', updatedAt: 'updated_at' }
  },
  suppressions: { table: 'suppressions', columns: { value: 'value', createdAt: 'created_at', updatedAt: 'updated_at' } },
  socialTasks: { table: 'social_tasks', columns: { prospectId: 'prospect_id', status: 'status', createdAt: 'created_at', updatedAt: 'updated_at' } },
  accounts: { table: 'accounts', columns: { slot: 'slot', connected: 'connected', createdAt: 'created_at', updatedAt: 'updated_at' } },
  auditLog: { table: 'audit_log', columns: { type: 'type', detail: 'detail', createdAt: 'created_at' } },
  leads: { table: 'leads', columns: { prospectId: 'prospect_id', accessTokenHash: 'access_token_hash', status: 'status', paymentStatus: 'payment_status', createdAt: 'created_at', updatedAt: 'updated_at' } },
  orders: { table: 'orders', columns: { provider: 'provider', providerEventId: 'provider_event_id', eventName: 'event_name', offerId: 'offer_id', leadId: 'lead_id', prospectId: 'prospect_id', status: 'status', paymentState: 'payment_state', occurredAt: 'occurred_at', createdAt: 'created_at', updatedAt: 'updated_at' } },
  subscriptions: { table: 'subscriptions', columns: { leadId: 'lead_id', prospectId: 'prospect_id', providerId: 'provider_id', status: 'status', nextRunAt: 'next_run_at', createdAt: 'created_at', updatedAt: 'updated_at' } },
  offers: { table: 'offers', columns: { campaignId: 'campaign_id', prospectId: 'prospect_id', leadId: 'lead_id', type: 'type', status: 'status', ownerApproved: 'owner_approved', createdAt: 'created_at', updatedAt: 'updated_at' } },
  deliveries: { table: 'deliveries', columns: { offerId: 'offer_id', orderId: 'order_id', campaignId: 'campaign_id', prospectId: 'prospect_id', leadId: 'lead_id', status: 'status', deliveryDeadline: 'delivery_deadline', createdAt: 'created_at', updatedAt: 'updated_at' } },
  monitoringRuns: { table: 'monitoring_runs', columns: { subscriptionId: 'subscription_id', leadId: 'lead_id', prospectId: 'prospect_id', status: 'status', createdAt: 'created_at', completedAt: 'completed_at', updatedAt: 'updated_at' } },
  notifications: { table: 'notifications', columns: { type: 'type', leadId: 'lead_id', prospectId: 'prospect_id', status: 'status', createdAt: 'created_at', updatedAt: 'updated_at' } },
  revenueEvents: { table: 'revenue_events', columns: { providerEventId: 'provider_event_id', leadId: 'lead_id', prospectId: 'prospect_id', createdAt: 'created_at' } },
  discoveryRuns: { table: 'discovery_runs', columns: { provider: 'provider', campaignId: 'campaign_id', status: 'status', runDate: 'run_date', importedCount: 'imported_count', startedAt: 'started_at', completedAt: 'completed_at', createdAt: 'created_at', updatedAt: 'updated_at' } },
  workerHeartbeats: { table: 'worker_heartbeats', columns: { role: 'role', hostname: 'hostname', pid: 'pid', version: 'version', startedAt: 'started_at', heartbeatAt: 'heartbeat_at', createdAt: 'created_at', updatedAt: 'updated_at' } },

  outboundReservations: {
    table: 'outbound_reservations',
    columns: {
      idempotencyKey: 'idempotency_key', prospectId: 'prospect_id', campaignId: 'campaign_id', inbox: 'inbox',
      recipientEmail: 'recipient_email', kind: 'kind', followup: 'followup', status: 'status',
      reservedAt: 'reserved_at', dispatchedAt: 'dispatched_at', sentAt: 'sent_at', completedAt: 'completed_at',
      createdAt: 'created_at', updatedAt: 'updated_at'
    }
  },
  senderHealth: {
    table: 'sender_health',
    columns: {
      inbox: 'inbox', paused: 'paused', hardBouncesToday: 'hard_bounces_today', complaintsToday: 'complaints_today',
      failureStreak: 'failure_streak', healthDate: 'health_date', lastEventAt: 'last_event_at',
      createdAt: 'created_at', updatedAt: 'updated_at'
    }
  },
  outboundEvents: {
    table: 'outbound_events',
    columns: {
      inbox: 'inbox', eventType: 'event_type', prospectId: 'prospect_id', recipientEmail: 'recipient_email',
      occurredAt: 'occurred_at', createdAt: 'created_at', updatedAt: 'updated_at'
    }
  },
  experiments: {
    table: 'experiments',
    columns: {
      campaignId: 'campaign_id', dimension: 'dimension', status: 'status',
      createdAt: 'created_at', updatedAt: 'updated_at'
    }
  },
};

export class StoreError extends Error {
  constructor(message, code = 'STORE_ERROR', cause) {
    super(message, { cause });
    this.name = 'StoreError';
    this.code = code;
  }
}

export class ConflictError extends StoreError {
  constructor(message, cause) { super(message, 'CONFLICT', cause); this.name = 'ConflictError'; }
}

function definition(key) {
  const def = MAP[key];
  if (!def) throw new StoreError(`Unknown collection: ${key}`, 'INVALID_COLLECTION');
  return def;
}

function dateOnly(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function crawlSlotKey(domain) {
  return `crawlRate:${crypto.createHash('sha256').update(String(domain || '').toLowerCase()).digest('hex')}`;
}

function auditCapacityKey(campaignId, date) {
  const campaignHash = crypto.createHash('sha256').update(String(campaignId || '')).digest('hex');
  return `auditCapacity:${date}:${campaignHash}`;
}

function draftCapacityKey(campaignId, date) {
  const campaignHash = crypto.createHash('sha256').update(String(campaignId || '')).digest('hex');
  return `draftCapacity:${date}:${campaignHash}`;
}

function prospectHash(prospectId) {
  return crypto.createHash('sha256').update(String(prospectId || '')).digest('hex');
}

const STOPPED_OUTBOUND_STATUSES = new Set([
  'replied', 'interested', 'meeting-requested', 'asks-for-information', 'objection',
  'not-interested', 'unsubscribed', 'suppressed', 'bounced', 'complaint', 'paid',
  'send-uncertain', 'checkout-sent', 'delivery-queued', 'delivered'
]);

function dispatchLockKeys({ prospectId = '', inbox = '', email = '', domain = '' } = {}) {
  return [...new Set([
    'outbound:global',
    inbox && `outbound:inbox:${inbox}`,
    prospectId && `outbound:prospect:${prospectId}`,
    email && `outbound:recipient:${String(email).toLowerCase()}`,
    domain && `outbound:recipient:${String(domain).toLowerCase()}`
  ].filter(Boolean))].sort();
}

function outboundStopReason({ reservation, prospect, suppressions = [], replies = [], lead, orders = [] }) {
  if (!prospect) return 'reservation-prospect-mismatch';
  const email = String(reservation?.recipientEmail || '').toLowerCase();
  const domain = String(prospect.domain || normalizeDomain(prospect.website)).toLowerCase();
  const suppressionValues = new Set(suppressions.map(item => String(item.value || '').toLowerCase()));
  if (suppressionValues.has(email) || suppressionValues.has(domain)) return 'suppressed';
  if (prospect.repliedAt || replies.length) return 'reply-received';
  if (STOPPED_OUTBOUND_STATUSES.has(prospect.status)) return `prospect-${prospect.status}`;
  if (prospect.paymentStatus === 'paid' || prospect.paidAt || lead?.paymentStatus === 'paid' || lead?.paidAt) return 'payment-received';
  if (orders.some(order => ['paid', 'order_created', 'subscription_created', 'transaction.completed'].includes(String(order.status || order.eventName || '').toLowerCase()))) return 'payment-received';
  return '';
}

function dispatchDecision(context, gate = {}) {
  const { reservation, prospect, campaign, settings = {}, health, suppressions = [], replies = [], lead, orders = [] } = context;
  if (!reservation) return { ok: false, reason: 'reservation-not-found' };
  if (reservation.status !== 'reserved') return { ok: false, reason: `reservation-${reservation.status || 'invalid'}` };
  if (!prospect || reservation.prospectId !== prospect.id) return { ok: false, reason: 'reservation-prospect-mismatch' };
  if (!campaign || reservation.campaignId !== campaign.id || prospect.campaignId !== campaign.id) return { ok: false, reason: 'reservation-campaign-mismatch' };
  if (String(reservation.recipientEmail || '').toLowerCase() !== String(prospect.contact?.email || '').toLowerCase()) return { ok: false, reason: 'reservation-recipient-mismatch' };
  if (settings.outboundPaused === true) return { ok: false, reason: 'global-outbound-paused' };
  if (health?.paused === true) return { ok: false, reason: 'sender-paused' };
  if (campaign.approved !== true || campaign.enabled === false) return { ok: false, reason: 'campaign-not-enabled' };
  const stopReason = outboundStopReason({ reservation, prospect, suppressions, replies, lead, orders });
  if (stopReason) return { ok: false, reason: stopReason };
  const followup = Number(reservation.followup || 0);
  if (followup > 0) {
    if (prospect.status !== 'sent') return { ok: false, reason: 'followup-prospect-state' };
    if (campaign.autoSend !== true) return { ok: false, reason: 'campaign-auto-send-disabled' };
    if (followup > Number(campaign.maximumFollowups ?? campaign.maxFollowups ?? 0)) return { ok: false, reason: 'followup-limit-invalidated' };
  }
  if (!followup && gate.authorization === 'owner-approved') {
    if (prospect.status !== 'scheduled' || prospect.draftApproval?.status !== 'approved') return { ok: false, reason: 'owner-approval-invalidated' };
  } else if (!followup) {
    if (!campaign.autoSend) return { ok: false, reason: 'campaign-auto-send-disabled' };
    if (!['ready', 'research-complete'].includes(prospect.status)) return { ok: false, reason: 'initial-prospect-state-invalidated' };
  }
  if (!followup && (String(prospect.draft || '') !== String(gate.draftBody || '') || String(prospect.subject || '') !== String(gate.draftSubject || ''))) {
    return { ok: false, reason: 'draft-invalidated' };
  }
  if (gate.simulation === true) {
    if (gate.systemProvider !== 'test' || gate.systemDryRun !== true || campaign.dryRun !== true) return { ok: false, reason: 'dry-run-dispatch-invalidated' };
  } else {
    if (gate.systemProvider !== 'gmail' || gate.systemEnabled !== true || gate.systemDryRun !== false || gate.systemLiveSendApproved !== true) {
      return { ok: false, reason: 'system-live-send-disabled' };
    }
    if (campaign.dryRun !== false || campaign.liveSendApproved !== true) return { ok: false, reason: 'campaign-live-send-disabled' };
  }
  return { ok: true };
}

function normalizeRecord(key, item) {
  const copy = structuredClone(item);
  if (key === 'prospects') copy.domain = String(copy.domain || '').toLowerCase();
  if (key === 'suppressions') copy.value = String(copy.value || '').toLowerCase();
  if (key === 'discoveryRuns') copy.runDate = copy.runDate || dateOnly(copy.startedAt || copy.createdAt);
  if (key === 'outboundReservations') copy.recipientEmail = String(copy.recipientEmail || '').toLowerCase();
  if (key === 'offers') {
    copy.currency = String(copy.currency || '').toUpperCase();
    copy.ownerApproved = copy.ownerApproval?.status === 'approved';
  }
  if (key === 'senderHealth') copy.healthDate = copy.healthDate || dateOnly(copy.updatedAt || copy.createdAt);
  return copy;
}

function postgresValues(key, item) {
  const def = definition(key);
  const record = normalizeRecord(key, item);
  const columns = ['id', 'data'];
  const values = [record.id, JSON.stringify(record)];
  for (const [property, column] of Object.entries(def.columns)) {
    columns.push(column);
    let value = record[property] ?? null;
    if (property === 'detail' || property === 'result') value = JSON.stringify(value || {});
    values.push(value);
  }
  return { def, record, columns, values };
}

function duplicateError(error, key, item) {
  if (error?.code === '23505') {
    return new ConflictError(`Duplicate ${key} record rejected${item?.id ? `: ${item.id}` : ''}`, error);
  }
  if (error?.code === '23503') {
    return new StoreError(`Related record is missing for ${key}`, 'FOREIGN_KEY', error);
  }
  return error;
}

class JsonTransactionStore {
  constructor(parent) { this.parent = parent; }
  async list(key, options = {}) { return this.parent._listDirect(key, options); }
  async get(key, id) { return this.parent._getDirect(key, id); }
  async findOne(key, filters = {}) { const rows = await this.list(key, { filters, limit: 1 }); return rows[0] || null; }
  async count(key, filters = {}) { return (await this.list(key, { filters })).length; }
  async add(key, item) { return this.parent._addDirect(key, item); }
  async upsert(key, item) { return this.parent._upsertDirect(key, item); }
  async patch(key, id, patch) { return this.parent._patchDirect(key, id, patch); }
  async getSettings() { return structuredClone(this.parent.data.settings || {}); }
  async setSetting(key, value) { this.parent.data.settings[key] = structuredClone(value); return value; }
  async log(type, detail = {}) { return this.add('auditLog', { id: crypto.randomUUID(), type, detail: sanitizeLogDetail(detail), createdAt: now() }); }
  async reserveDiscoveryCapacity(date, cap, requested, runId = '', scope = {}) { return this.parent._reserveDiscoveryCapacityDirect(date, cap, requested, runId, scope); }
  async reserveCrawlSlot(domain, minGapMs, at) { return this.parent._reserveCrawlSlotDirect(domain, minGapMs, at); }
  async reserveAuditCapacity(campaignId, date, cap, prospectId) { return this.parent._reserveAuditCapacityDirect(campaignId, date, cap, prospectId); }
  async reserveDraftCapacity(campaignId, date, cap, prospectId) { return this.parent._reserveDraftCapacityDirect(campaignId, date, cap, prospectId); }
  async claimProspects(limit = 1) { return this.parent._claimProspectsDirect(limit); }
  async claimProspect(id) { return this.parent._claimProspectDirect(id); }
  async claimJobs(workerId, limit = 1, lockTimeoutMs = 300000, types = []) { return this.parent._claimJobsDirect(workerId, limit, lockTimeoutMs, types); }
  async completeJob(id, result = {}, lease = {}) { return this.parent._completeJobDirect(id, result, lease); }
  async failJob(id, error, options = {}) { return this.parent._failJobDirect(id, error, options); }
  async heartbeatJob(id, workerId) { return this.parent._heartbeatJobDirect(id, workerId); }
  async recoverStaleJobs(lockTimeoutMs = 300000) { return this.parent._recoverStaleJobsDirect(lockTimeoutMs); }
  async queueStats() { return this.parent._queueStatsDirect(); }
  async reserveOutboundSend(input) { return this.parent._reserveOutboundSendDirect(input); }
  async beginOutboundDispatch(id, gate = {}) { return this.parent._beginOutboundDispatchDirect(id, gate); }
  async finalizeOutboundDispatch(id, status, reservationPatch = {}, prospectPatch = {}) { return this.parent._finalizeOutboundDispatchDirect(id, status, reservationPatch, prospectPatch); }
  async markOutboundReservation(id, status, patch = {}) { return this.parent._markOutboundReservationDirect(id, status, patch); }
  async suppressOutbound(input = {}) { return this.parent._suppressOutboundDirect(input); }
  async recordReplyAndStop(record, prospectPatch = {}) { return this.parent._recordReplyAndStopDirect(record, prospectPatch); }
  async recordOutboundEvent(input, thresholds = {}) { return this.parent._recordOutboundEventDirect(input, thresholds); }
  async transaction(fn) { return fn(this); }
  async tx(fn) { return fn(this.parent.data); }
}

export class JsonStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    this.queue = Promise.resolve();
    this.data = structuredClone(EMPTY);
  }

  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    try {
      const loaded = JSON.parse(await fs.readFile(this.file, 'utf8'));
      this.data = { ...structuredClone(EMPTY), ...loaded, version: 8 };
      for (const key of Object.keys(EMPTY)) {
        if (!(key in this.data)) this.data[key] = structuredClone(EMPTY[key]);
      }
      await this.save();
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      await this.save();
    }
  }

  async close() {}

  async save() {
    const temp = `${this.file}.tmp`;
    await fs.writeFile(temp, JSON.stringify(this.data, null, 2));
    await fs.rename(temp, this.file);
  }

  async transaction(fn) {
    const task = this.queue.then(async () => {
      const snapshot = structuredClone(this.data);
      const tx = new JsonTransactionStore(this);
      try {
        const result = await fn(tx);
        await this.save();
        return result;
      } catch (error) {
        this.data = snapshot;
        throw error;
      }
    });
    this.queue = task.catch(() => {});
    return task;
  }

  async tx(fn) { return this.transaction(async () => fn(this.data)); }

  _listDirect(key, options = {}) {
    let rows = structuredClone(this.data[key] || []);
    if (options.filters) rows = rows.filter(row => Object.entries(options.filters).every(([k, v]) => row?.[k] === v));
    if (options.orderBy) {
      const direction = options.direction === 'asc' ? 1 : -1;
      rows.sort((a, b) => String(a?.[options.orderBy] ?? '').localeCompare(String(b?.[options.orderBy] ?? '')) * direction);
    }
    if (options.offset) rows = rows.slice(options.offset);
    if (Number.isInteger(options.limit)) rows = rows.slice(0, Math.max(0, options.limit));
    return rows;
  }

  _getDirect(key, id) { return structuredClone((this.data[key] || []).find(x => x.id === id) || null); }

  _checkUnique(key, record, excludeId = '') {
    const rows = this.data[key] || [];
    const other = predicate => rows.some(item => item.id !== excludeId && predicate(item));
    if (other(item => item.id === record.id)) throw new ConflictError(`Duplicate ${key} id: ${record.id}`);
    if (key === 'prospects' && other(item => item.domain === record.domain)) throw new ConflictError(`Duplicate prospect domain: ${record.domain}`);
    if (key === 'suppressions' && other(item => item.value === record.value)) throw new ConflictError(`Duplicate suppression: ${record.value}`);
    if (key === 'replies' && record.gmailId && other(item => item.gmailId === record.gmailId)) throw new ConflictError(`Duplicate reply: ${record.gmailId}`);
    if (key === 'accounts' && other(item => item.slot === record.slot)) throw new ConflictError(`Duplicate account slot: ${record.slot}`);
    if (key === 'orders' && record.providerEventId && other(item => item.providerEventId === record.providerEventId)) throw new ConflictError(`Duplicate payment event: ${record.providerEventId}`);
    if (key === 'offers' && record.prospectId && record.type && other(item => item.prospectId === record.prospectId && item.type === record.type)) throw new ConflictError(`Duplicate offer type for prospect: ${record.type}`);
    if (key === 'deliveries' && record.orderId && other(item => item.orderId === record.orderId)) throw new ConflictError(`Duplicate delivery payment event: ${record.orderId}`);
    if (key === 'revenueEvents' && record.providerEventId && other(item => item.providerEventId === record.providerEventId)) throw new ConflictError(`Duplicate revenue event: ${record.providerEventId}`);
    if (key === 'jobs' && record.dedupeKey && other(item => item.dedupeKey === record.dedupeKey)) throw new ConflictError(`Duplicate job dedupe key: ${record.dedupeKey}`);
    if (key === 'jobs' && record.singletonKey && ['queued', 'retry', 'active'].includes(record.status) && other(item => item.singletonKey === record.singletonKey && ['queued', 'retry', 'active'].includes(item.status))) throw new ConflictError(`Active singleton job already exists: ${record.singletonKey}`);
    if (key === 'outboundReservations' && record.idempotencyKey && other(item => item.idempotencyKey === record.idempotencyKey)) throw new ConflictError(`Duplicate outbound idempotency key: ${record.idempotencyKey}`);
    if (key === 'senderHealth' && record.inbox && other(item => item.inbox === record.inbox)) throw new ConflictError(`Duplicate sender health inbox: ${record.inbox}`);
  }

  _addDirect(key, item) {
    if (!Array.isArray(this.data[key])) this.data[key] = [];
    const record = normalizeRecord(key, item);
    this._checkUnique(key, record);
    this.data[key].push(record);
    return structuredClone(record);
  }

  _upsertDirect(key, item) {
    if (!Array.isArray(this.data[key])) this.data[key] = [];
    const record = normalizeRecord(key, item);
    const index = this.data[key].findIndex(existing => existing.id === record.id);
    this._checkUnique(key, record, record.id);
    if (index >= 0) this.data[key][index] = record;
    else this.data[key].push(record);
    return structuredClone(record);
  }

  _patchDirect(key, id, patch) {
    const item = (this.data[key] || []).find(existing => existing.id === id);
    if (!item) return null;
    const record = normalizeRecord(key, { ...item, ...patch, updatedAt: now() });
    this._checkUnique(key, record, id);
    Object.assign(item, record);
    return structuredClone(item);
  }

  _reserveDiscoveryCapacityDirect(date, cap, requested, runId = '', scope = {}) {
    const eligible = (this.data.discoveryRuns || [])
      .filter(run => run.id !== runId && run.runDate === date && run.status !== 'error');
    const used = eligible.reduce((sum, run) => sum + Number(run.importedCount || 0), 0);
    const campaignId = String(scope.campaignId || '');
    const campaignUsed = campaignId
      ? eligible.filter(run => run.campaignId === campaignId).reduce((sum, run) => sum + Number(run.importedCount || 0), 0)
      : used;
    const campaignCap = Number.isFinite(Number(scope.campaignCap)) ? Number(scope.campaignCap) : Number(cap || 0);
    const allowed = Math.max(0, Math.min(
      Number(requested || 0),
      Number(cap || 0) - used,
      campaignCap - campaignUsed
    ));
    const current = (this.data.discoveryRuns || []).find(run => run.id === runId);
    if (current) { current.importedCount = allowed; current.capacityReserved = allowed; current.updatedAt = now(); }
    return allowed;
  }

  _reserveCrawlSlotDirect(domain, minGapMs = 1000, at = now()) {
    const requestedAt = new Date(at);
    if (Number.isNaN(requestedAt.getTime())) throw new StoreError('Invalid crawl reservation time', 'INVALID_INPUT');
    const gap = Math.max(0, Math.min(3600000, Number(minGapMs || 0)));
    const key = crawlSlotKey(domain);
    const existing = this.data.settings[key] || {};
    const previousNext = Date.parse(existing.nextAllowedAt || 0);
    const reservedMs = Math.max(requestedAt.getTime(), Number.isFinite(previousNext) ? previousNext : 0);
    const reservation = {
      domainHash: key.slice('crawlRate:'.length),
      reservedAt: new Date(reservedMs).toISOString(),
      nextAllowedAt: new Date(reservedMs + gap).toISOString(),
      updatedAt: now()
    };
    this.data.settings[key] = reservation;
    return { ...reservation, waitMs: Math.max(0, reservedMs - requestedAt.getTime()) };
  }

  _reserveAuditCapacityDirect(campaignId, date, cap, prospectId) {
    const limit = Math.max(0, Math.min(100, Number(cap || 0)));
    const key = auditCapacityKey(campaignId, date);
    const hash = prospectHash(prospectId);
    const existing = this.data.settings[key] || { count: 0, prospectHashes: [] };
    if ((existing.prospectHashes || []).includes(hash)) return { ok: true, duplicate: true, remaining: Math.max(0, limit - Number(existing.count || 0)) };
    if (Number(existing.count || 0) >= limit) return { ok: false, reason: 'campaign-daily-audit-cap', remaining: 0 };
    const record = {
      count: Number(existing.count || 0) + 1,
      prospectHashes: [...(existing.prospectHashes || []), hash].slice(-100),
      updatedAt: now()
    };
    this.data.settings[key] = record;
    return { ok: true, duplicate: false, remaining: Math.max(0, limit - record.count) };
  }

  _reserveDraftCapacityDirect(campaignId, date, cap, prospectId) {
    const limit = Math.max(0, Math.min(100, Number(cap || 0)));
    const key = draftCapacityKey(campaignId, date);
    const hash = prospectHash(prospectId);
    const existing = this.data.settings[key] || { count: 0, prospectHashes: [] };
    if ((existing.prospectHashes || []).includes(hash)) return { ok: true, duplicate: true, remaining: Math.max(0, limit - Number(existing.count || 0)) };
    if (Number(existing.count || 0) >= limit) return { ok: false, reason: 'campaign-daily-draft-cap', remaining: 0 };
    const record = {
      count: Number(existing.count || 0) + 1,
      prospectHashes: [...(existing.prospectHashes || []), hash].slice(-100),
      updatedAt: now()
    };
    this.data.settings[key] = record;
    return { ok: true, duplicate: false, remaining: Math.max(0, limit - record.count) };
  }

  _claimProspectsDirect(limit = 1) {
    const claimed = (this.data.prospects || [])
      .filter(prospect => ['queued', 'new', 'retry', 'error'].includes(prospect.status))
      .filter(prospect => !prospect.nextCrawlAt || Date.parse(prospect.nextCrawlAt) <= Date.now())
      .slice(0, Math.max(0, limit));
    for (const prospect of claimed) {
      prospect.status = 'claimed';
      prospect.claimedAt = now();
      prospect.updatedAt = now();
    }
    return structuredClone(claimed);
  }

  _claimProspectDirect(id) {
    const prospect = (this.data.prospects || []).find(item =>
      item.id === id && ['queued', 'new', 'retry', 'error'].includes(item.status)
      && (!item.nextCrawlAt || Date.parse(item.nextCrawlAt) <= Date.now())
    );
    if (!prospect) return null;
    prospect.status = 'claimed';
    prospect.claimedAt = now();
    prospect.updatedAt = now();
    return structuredClone(prospect);
  }

  _recoverStaleJobsDirect(lockTimeoutMs = 300000) {
    const cutoff = Date.now() - Math.max(1000, Number(lockTimeoutMs || 300000));
    let recovered = 0;
    let deadLettered = 0;
    for (const job of this.data.jobs || []) {
      if (job.status !== 'active') continue;
      const stamp = Date.parse(job.heartbeatAt || job.lockedAt || job.startedAt || 0);
      if (!Number.isFinite(stamp) || stamp > cutoff) continue;
      if (Number(job.attempts || 0) >= Number(job.maxAttempts || 5)) {
        job.status = 'dead-letter';
        job.deadLetteredAt = now();
        deadLettered += 1;
      } else {
        job.status = 'queued';
        job.runAt = now();
        recovered += 1;
      }
      job.lockedAt = null;
      job.lockedBy = null;
      job.heartbeatAt = null;
      job.updatedAt = now();
    }
    return { recovered, deadLettered };
  }

  _claimJobsDirect(workerId, limit = 1, lockTimeoutMs = 300000, types = []) {
    this._recoverStaleJobsDirect(lockTimeoutMs);
    const current = Date.now();
    const allowedTypes = new Set((Array.isArray(types) ? types : [])
      .map(value => String(value || '').trim()).filter(Boolean).slice(0, 20));
    const jobs = (this.data.jobs || [])
      .filter(job => ['queued', 'retry'].includes(job.status) && Date.parse(job.runAt || job.scheduledAt || job.createdAt || 0) <= current)
      .filter(job => !allowedTypes.size || allowedTypes.has(job.type) || allowedTypes.has(job.queue))
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
      .slice(0, Math.max(0, limit));
    for (const job of jobs) {
      job.status = 'active';
      job.attempts = Number(job.attempts || 0) + 1;
      job.lockedBy = workerId;
      job.lockedAt = now();
      job.heartbeatAt = job.lockedAt;
      job.startedAt = job.startedAt || job.lockedAt;
      job.updatedAt = now();
    }
    return structuredClone(jobs);
  }

  _completeJobDirect(id, result = {}, lease = {}) {
    const job = (this.data.jobs || []).find(item => item.id === id && item.status === 'active'
      && item.lockedBy === lease.workerId && item.lockedAt === lease.lockedAt);
    if (!job) return null;
    Object.assign(job, { status: 'completed', result, completedAt: now(), lockedAt: null, lockedBy: null, heartbeatAt: null, lastError: '', updatedAt: now() });
    return structuredClone(job);
  }

  _failJobDirect(id, error, options = {}) {
    const job = (this.data.jobs || []).find(item => item.id === id && item.status === 'active'
      && item.lockedBy === options.workerId && item.lockedAt === options.lockedAt);
    if (!job) return null;
    const attempts = Number(job.attempts || 0);
    const maxAttempts = Number(options.maxAttempts || job.maxAttempts || 5);
    const message = redactSensitiveText(error?.message || error || 'Unknown job failure').slice(0, 2000);
    if (attempts >= maxAttempts) {
      Object.assign(job, { status: 'dead-letter', deadLetteredAt: now(), lastError: message, lockedAt: null, lockedBy: null, heartbeatAt: null, updatedAt: now() });
    } else {
      const base = Math.max(1000, Number(options.baseDelayMs || 30000));
      const delay = Math.min(Number(options.maxDelayMs || 3600000), base * (2 ** Math.max(0, attempts - 1)));
      Object.assign(job, { status: 'retry', runAt: new Date(Date.now() + delay).toISOString(), lastError: message, lockedAt: null, lockedBy: null, heartbeatAt: null, updatedAt: now() });
    }
    return structuredClone(job);
  }

  _heartbeatJobDirect(id, workerId) {
    const job = (this.data.jobs || []).find(item => item.id === id && item.status === 'active' && item.lockedBy === workerId);
    if (!job) return null;
    job.heartbeatAt = now();
    job.updatedAt = now();
    return structuredClone(job);
  }

  _queueStatsDirect() {
    const counts = {};
    for (const job of this.data.jobs || []) counts[job.status || 'unknown'] = (counts[job.status || 'unknown'] || 0) + 1;
    const next = (this.data.jobs || []).filter(job => ['queued', 'retry'].includes(job.status)).sort((a, b) => String(a.runAt || '').localeCompare(String(b.runAt || '')))[0];
    return { counts, nextRunAt: next?.runAt || null, total: (this.data.jobs || []).length };
  }


  _reserveOutboundSendDirect(input = {}) {
    const current = new Date(input.now || Date.now());
    const timestamp = current.toISOString();
    const day = timestamp.slice(0, 10);
    const hour = timestamp.slice(0, 13);
    if (this.data.settings?.outboundPaused === true) return { ok: false, reason: 'global-outbound-paused' };
    const health = (this.data.senderHealth || []).find(item => item.inbox === input.inbox);
    if (health?.paused) return { ok: false, reason: 'sender-paused', health: structuredClone(health) };
    const existing = (this.data.outboundReservations || []).find(item => item.idempotencyKey === input.idempotencyKey);
    if (existing) return { ok: false, reason: `duplicate-${existing.status || 'reservation'}`, reservation: structuredClone(existing) };
    const active = (this.data.outboundReservations || []).filter(item => item.inbox === input.inbox && ['reserved','dispatching','sent','uncertain'].includes(item.status));
    const daily = active.filter(item => String(item.reservedAt || '').startsWith(day)).length;
    const hourly = active.filter(item => String(item.reservedAt || '').startsWith(hour)).length;
    if (daily >= Number(input.dailyCap || 0)) return { ok: false, reason: 'daily-cap', daily };
    if (hourly >= Number(input.hourlyCap || 0)) return { ok: false, reason: 'hourly-cap', hourly };
    const latest = active.map(item => Date.parse(item.reservedAt || 0)).filter(Number.isFinite).sort((a,b)=>b-a)[0] || 0;
    const gapMs = Math.max(0, Number(input.minGapSeconds || 0) * 1000);
    if (latest && current.getTime() - latest < gapMs) return { ok: false, reason: 'cadence-gap', retryAt: new Date(latest + gapMs).toISOString() };
    const reservation = normalizeRecord('outboundReservations', {
      id: input.id || crypto.randomUUID(), idempotencyKey: input.idempotencyKey,
      prospectId: input.prospectId || null, campaignId: input.campaignId || null,
      inbox: input.inbox, recipientEmail: input.recipientEmail, kind: input.kind || 'initial',
      followup: Number(input.followup || 0), status: 'reserved', reservedAt: timestamp,
      createdAt: timestamp, updatedAt: timestamp
    });
    this._addDirect('outboundReservations', reservation);
    return { ok: true, reservation };
  }

  _beginOutboundDispatchDirect(id, gate = {}) {
    const reservation = (this.data.outboundReservations || []).find(item => item.id === id);
    const prospect = reservation ? (this.data.prospects || []).find(item => item.id === reservation.prospectId) : null;
    const campaign = prospect ? (this.data.campaigns || []).find(item => item.id === prospect.campaignId) : null;
    const context = {
      reservation, prospect, campaign, settings: this.data.settings || {},
      health: reservation ? (this.data.senderHealth || []).find(item => item.inbox === reservation.inbox) : null,
      suppressions: this.data.suppressions || [],
      replies: prospect ? (this.data.replies || []).filter(item => item.prospectId === prospect.id) : [],
      lead: prospect?.leadId ? (this.data.leads || []).find(item => item.id === prospect.leadId) : null,
      orders: prospect ? (this.data.orders || []).filter(item => item.prospectId === prospect.id) : []
    };
    const decision = dispatchDecision(context, gate);
    if (!decision.ok) {
      if (reservation?.status === 'reserved') this._markOutboundReservationDirect(id, 'cancelled', { cancelReason: decision.reason });
      return { ...decision, reservation: reservation ? structuredClone(reservation) : null };
    }
    return { ok: true, reservation: this._markOutboundReservationDirect(id, 'dispatching') };
  }

  _finalizeOutboundDispatchDirect(id, status, reservationPatch = {}, prospectPatch = {}) {
    if (!['sent', 'uncertain'].includes(status)) throw new StoreError('Invalid outbound finalization status', 'INVALID_OUTBOUND_STATE');
    const reservation = (this.data.outboundReservations || []).find(item => item.id === id && item.status === 'dispatching');
    if (!reservation) return { ok: false, reason: 'reservation-not-dispatching' };
    const prospect = (this.data.prospects || []).find(item => item.id === reservation.prospectId) || null;
    const context = {
      reservation, prospect, suppressions: this.data.suppressions || [],
      replies: prospect ? (this.data.replies || []).filter(item => item.prospectId === prospect.id) : [],
      lead: prospect?.leadId ? (this.data.leads || []).find(item => item.id === prospect.leadId) : null,
      orders: prospect ? (this.data.orders || []).filter(item => item.prospectId === prospect.id) : []
    };
    const stopReason = outboundStopReason(context);
    const finalizedReservation = this._markOutboundReservationDirect(id, status, reservationPatch);
    let finalizedProspect = null;
    if (prospect) {
      const safePatch = { ...prospectPatch };
      if (stopReason) {
        delete safePatch.status;
        safePatch.nextFollowupAt = null;
        safePatch.sendSafety = { ...(prospect.sendSafety || {}), ...(safePatch.sendSafety || {}), terminalStopReason: stopReason };
      }
      finalizedProspect = this._patchDirect('prospects', prospect.id, safePatch);
    }
    return { ok: true, reservation: finalizedReservation, prospect: finalizedProspect, stopReason };
  }

  _suppressOutboundDirect(input = {}) {
    const values = [...new Set((input.values || []).map(value => String(value || '').trim().toLowerCase()).filter(Boolean))].sort();
    for (const value of values) {
      if ((this.data.suppressions || []).some(item => item.value === value)) continue;
      this._addDirect('suppressions', { id: crypto.randomUUID(), value, reason: String(input.reason || 'suppressed'), createdAt: now() });
    }
    const prospect = input.prospectId ? this._patchDirect('prospects', input.prospectId, {
      status: input.status || 'suppressed', nextFollowupAt: null, ...(input.prospectPatch || {})
    }) : null;
    return { ok: true, values, prospect };
  }

  _recordReplyAndStopDirect(record, prospectPatch = {}) {
    const reply = this._addDirect('replies', record);
    const prospect = record.prospectId ? this._patchDirect('prospects', record.prospectId, { ...prospectPatch, nextFollowupAt: null }) : null;
    return { reply, prospect };
  }

  _markOutboundReservationDirect(id, status, patch = {}) {
    return this._patchDirect('outboundReservations', id, {
      ...patch, status,
      ...(status === 'dispatching' ? { dispatchedAt: now() } : {}),
      ...(['sent','uncertain','cancelled'].includes(status) ? { completedAt: now() } : {})
    });
  }

  _recordOutboundEventDirect(input = {}, thresholds = {}) {
    const timestamp = input.occurredAt || now();
    const today = String(timestamp).slice(0, 10);
    const recipientHash = input.recipientEmail ? crypto.createHash('sha256').update(String(input.recipientEmail).trim().toLowerCase()).digest('hex') : '';
    this._addDirect('outboundEvents', {
      id: input.id || crypto.randomUUID(), inbox: input.inbox || '', eventType: input.eventType,
      prospectId: input.prospectId || null, recipientEmail: '', recipientHash,
      detail: input.detail || {}, occurredAt: timestamp, createdAt: timestamp, updatedAt: timestamp
    });
    let health = (this.data.senderHealth || []).find(item => item.inbox === input.inbox);
    if (!health) {
      health = { id: `sender_${input.inbox}`, inbox: input.inbox, paused: false, hardBouncesToday: 0, complaintsToday: 0, failureStreak: 0, healthDate: today, createdAt: timestamp };
      this._addDirect('senderHealth', health);
      health = (this.data.senderHealth || []).find(item => item.inbox === input.inbox);
    }
    if (health.healthDate !== today) {
      health.healthDate = today; health.hardBouncesToday = 0; health.complaintsToday = 0;
    }
    if (input.eventType === 'sent') health.failureStreak = 0;
    if (input.eventType === 'send_uncertain') health.failureStreak = Number(health.failureStreak || 0) + 1;
    if (input.eventType === 'hard_bounce') health.hardBouncesToday = Number(health.hardBouncesToday || 0) + 1;
    if (input.eventType === 'complaint') health.complaintsToday = Number(health.complaintsToday || 0) + 1;
    const pauseReason = Number(health.complaintsToday || 0) >= Number(thresholds.complaintPauseThreshold || 1) ? 'complaint-threshold'
      : Number(health.hardBouncesToday || 0) >= Number(thresholds.hardBouncePauseThreshold || 2) ? 'hard-bounce-threshold'
      : Number(health.failureStreak || 0) >= Number(thresholds.failurePauseThreshold || 3) ? 'send-failure-threshold' : '';
    if (pauseReason) { health.paused = true; health.pauseReason = pauseReason; health.pausedAt = timestamp; }
    health.lastEventAt = timestamp; health.updatedAt = timestamp;
    return structuredClone(health);
  }

  async putArtifact() { return null; }
  async getArtifact() { return null; }
  async deleteExpiredArtifacts() { return 0; }

  async list(key, options = {}) { return this._listDirect(key, options); }
  async get(key, id) { return this._getDirect(key, id); }
  async findOne(key, filters = {}) { const rows = await this.list(key, { filters, limit: 1 }); return rows[0] || null; }
  async count(key, filters = {}) { return (await this.list(key, { filters })).length; }
  async add(key, item) { return this.transaction(tx => tx.add(key, item)); }
  async upsert(key, item) { return this.transaction(tx => tx.upsert(key, item)); }
  async patch(key, id, patch) { return this.transaction(tx => tx.patch(key, id, patch)); }
  async getSettings() { return structuredClone(this.data.settings || {}); }
  async setSetting(key, value) { return this.transaction(tx => tx.setSetting(key, value)); }
  async log(type, detail = {}) { return this.add('auditLog', { id: crypto.randomUUID(), type, detail: sanitizeLogDetail(detail), createdAt: now() }); }
  async reserveDiscoveryCapacity(date, cap, requested, runId = '', scope = {}) { return this.transaction(tx => tx.reserveDiscoveryCapacity(date, cap, requested, runId, scope)); }
  async reserveCrawlSlot(domain, minGapMs, at = now()) { return this.transaction(tx => tx.reserveCrawlSlot(domain, minGapMs, at)); }
  async reserveAuditCapacity(campaignId, date, cap, prospectId) { return this.transaction(tx => tx.reserveAuditCapacity(campaignId, date, cap, prospectId)); }
  async reserveDraftCapacity(campaignId, date, cap, prospectId) { return this.transaction(tx => tx.reserveDraftCapacity(campaignId, date, cap, prospectId)); }
  async claimProspects(limit = 1) { return this.transaction(tx => tx.claimProspects(limit)); }
  async claimProspect(id) { return this.transaction(tx => tx.claimProspect(id)); }
  async claimJobs(workerId, limit = 1, lockTimeoutMs = 300000, types = []) { return this.transaction(tx => tx.claimJobs(workerId, limit, lockTimeoutMs, types)); }
  async completeJob(id, result = {}, lease = {}) { return this.transaction(tx => tx.completeJob(id, result, lease)); }
  async failJob(id, error, options = {}) { return this.transaction(tx => tx.failJob(id, error, options)); }
  async heartbeatJob(id, workerId) { return this.transaction(tx => tx.heartbeatJob(id, workerId)); }
  async recoverStaleJobs(lockTimeoutMs = 300000) { return this.transaction(tx => tx.recoverStaleJobs(lockTimeoutMs)); }
  async queueStats() { return this._queueStatsDirect(); }
  async reserveOutboundSend(input) { return this.transaction(tx => tx.reserveOutboundSend(input)); }
  async beginOutboundDispatch(id, gate = {}) { return this.transaction(tx => tx.beginOutboundDispatch(id, gate)); }
  async finalizeOutboundDispatch(id, status, reservationPatch = {}, prospectPatch = {}) { return this.transaction(tx => tx.finalizeOutboundDispatch(id, status, reservationPatch, prospectPatch)); }
  async markOutboundReservation(id, status, patch = {}) { return this.transaction(tx => tx.markOutboundReservation(id, status, patch)); }
  async suppressOutbound(input = {}) { return this.transaction(tx => tx.suppressOutbound(input)); }
  async recordReplyAndStop(record, prospectPatch = {}) { return this.transaction(tx => tx.recordReplyAndStop(record, prospectPatch)); }
  async recordOutboundEvent(input, thresholds = {}) { return this.transaction(tx => tx.recordOutboundEvent(input, thresholds)); }
  async setOutboundPaused(paused, reason = '') { await this.setSetting('outboundPaused', Boolean(paused)); await this.setSetting('outboundPauseReason', String(reason || '')); return { paused: Boolean(paused), reason }; }
  async setSenderPaused(inbox, paused, reason = '') {
    const existing = await this.findOne('senderHealth', { inbox });
    const record = { ...(existing || { id: `sender_${inbox}`, inbox, hardBouncesToday: 0, complaintsToday: 0, failureStreak: 0, healthDate: dateOnly() }), paused: Boolean(paused), pauseReason: String(reason || ''), updatedAt: now(), createdAt: existing?.createdAt || now() };
    return this.upsert('senderHealth', record);
  }
}

export class PostgresStore {
  constructor({ databaseUrl, ssl = true, pool } = {}) {
    if (!databaseUrl && !pool) throw new StoreError('DATABASE_URL is required for the PostgreSQL store', 'CONFIG');
    this.pool = pool || new Pool({ connectionString: databaseUrl, ssl: ssl ? { rejectUnauthorized: false } : false, max: 10 });
    this.ownsPool = !pool;
  }

  async init() { await this.migrate(); }
  async close() { if (this.ownsPool) await this.pool.end(); }

  async migrate() {
    const client = await this.pool.connect();
    const lockName = 'uberbond:schema-migrations';
    let locked = false;
    try {
      await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockName]);
      locked = true;
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      const appliedRows = await client.query('SELECT version FROM schema_migrations');
      const applied = new Set(appliedRows.rows.map(row => row.version));
      const dir = path.resolve('migrations');
      const files = (await fs.readdir(dir)).filter(name => name.endsWith('.sql')).sort();
      for (const file of files) {
        const version = file.replace(/\.sql$/i, '');
        if (applied.has(version)) continue;
        const sql = await fs.readFile(path.join(dir, file), 'utf8');
        await client.query(sql);
        applied.add(version);
      }
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockName]).catch(() => {});
      client.release();
    }
  }

  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const scoped = new PostgresStore({ pool: client });
      scoped.ownsPool = false;
      const result = await fn(scoped);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async tx(fn) { return this.transaction(fn); }

  async list(key, options = {}) {
    const def = definition(key);
    const values = [];
    const where = [];
    for (const [property, value] of Object.entries(options.filters || {})) {
      const column = property === 'id' ? 'id' : def.columns[property];
      if (!column) throw new StoreError(`Unsupported filter ${property} for ${key}`, 'INVALID_FILTER');
      values.push(value);
      where.push(`${column} = $${values.length}`);
    }
    const orderProperty = options.orderBy || 'createdAt';
    const orderColumn = orderProperty === 'id' ? 'id' : (def.columns[orderProperty] || 'created_at');
    const direction = options.direction === 'asc' ? 'ASC' : 'DESC';
    let sql = `SELECT data FROM ${def.table}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${orderColumn} ${direction} NULLS LAST`;
    if (Number.isInteger(options.limit)) { values.push(Math.max(0, options.limit)); sql += ` LIMIT $${values.length}`; }
    if (Number.isInteger(options.offset) && options.offset > 0) { values.push(options.offset); sql += ` OFFSET $${values.length}`; }
    const result = await this.pool.query(sql, values);
    return result.rows.map(row => row.data);
  }

  async get(key, id) {
    const def = definition(key);
    const result = await this.pool.query(`SELECT data FROM ${def.table} WHERE id = $1`, [id]);
    return result.rows[0]?.data || null;
  }

  async findOne(key, filters = {}) {
    const rows = await this.list(key, { filters, limit: 1 });
    return rows[0] || null;
  }

  async count(key, filters = {}) {
    const def = definition(key);
    const values = [];
    const where = [];
    for (const [property, value] of Object.entries(filters)) {
      const column = property === 'id' ? 'id' : def.columns[property];
      if (!column) throw new StoreError(`Unsupported filter ${property} for ${key}`, 'INVALID_FILTER');
      values.push(value);
      where.push(`${column} = $${values.length}`);
    }
    const result = await this.pool.query(`SELECT count(*)::int AS count FROM ${def.table}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`, values);
    return result.rows[0].count;
  }

  async add(key, item) {
    const { def, record, columns, values } = postgresValues(key, item);
    const placeholders = values.map((_, index) => `$${index + 1}`);
    try {
      await this.pool.query(`INSERT INTO ${def.table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`, values);
      return record;
    } catch (error) { throw duplicateError(error, key, record); }
  }

  async upsert(key, item) {
    const { def, record, columns, values } = postgresValues(key, item);
    const placeholders = values.map((_, index) => `$${index + 1}`);
    const updates = columns.filter(column => column !== 'id').map(column => `${column} = EXCLUDED.${column}`);
    try {
      await this.pool.query(`INSERT INTO ${def.table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`, values);
      return record;
    } catch (error) { throw duplicateError(error, key, record); }
  }

  async patch(key, id, patch) {
    return this.transaction(async tx => {
      const def = definition(key);
      const result = await tx.pool.query(`SELECT data FROM ${def.table} WHERE id = $1 FOR UPDATE`, [id]);
      const existing = result.rows[0]?.data;
      if (!existing) return null;
      return tx.upsert(key, { ...existing, ...patch, updatedAt: now() });
    });
  }

  async getSettings() {
    const result = await this.pool.query('SELECT key, value FROM settings');
    return Object.fromEntries(result.rows.map(row => [row.key, row.value]));
  }

  async setSetting(key, value) {
    await this.pool.query('INSERT INTO settings(key, value, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()', [key, JSON.stringify(value)]);
    return value;
  }

  async log(type, detail = {}) {
    return this.add('auditLog', { id: crypto.randomUUID(), type, detail: sanitizeLogDetail(detail), createdAt: now() });
  }

  async reserveDiscoveryCapacity(date, cap, requested, runId = '', scope = {}) {
    return this.transaction(async tx => {
      await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`discovery-cap:${date}`]);
      const campaignId = String(scope.campaignId || '');
      const result = await tx.pool.query(`
        SELECT
          COALESCE(sum(imported_count), 0)::int AS used,
          COALESCE(sum(imported_count) FILTER (WHERE campaign_id = $3), 0)::int AS campaign_used
        FROM discovery_runs
        WHERE run_date = $1::date AND status <> 'error' AND id <> $2
      `, [date, runId, campaignId]);
      const used = Number(result.rows[0].used || 0);
      const campaignUsed = campaignId ? Number(result.rows[0].campaign_used || 0) : used;
      const campaignCap = Number.isFinite(Number(scope.campaignCap)) ? Number(scope.campaignCap) : Number(cap || 0);
      const allowed = Math.max(0, Math.min(
        Number(requested || 0),
        Number(cap || 0) - used,
        campaignCap - campaignUsed
      ));
      if (runId) {
        const row = await tx.pool.query('SELECT data FROM discovery_runs WHERE id = $1 FOR UPDATE', [runId]);
        if (row.rows[0]) {
          const data = { ...row.rows[0].data, importedCount: allowed, capacityReserved: allowed, updatedAt: now() };
          await tx.pool.query('UPDATE discovery_runs SET imported_count = $2, updated_at = now(), data = $3::jsonb WHERE id = $1', [runId, allowed, JSON.stringify(data)]);
        }
      }
      return allowed;
    });
  }

  async reserveCrawlSlot(domain, minGapMs = 1000, at = now()) {
    return this.transaction(async tx => {
      const requestedAt = new Date(at);
      if (Number.isNaN(requestedAt.getTime())) throw new StoreError('Invalid crawl reservation time', 'INVALID_INPUT');
      const gap = Math.max(0, Math.min(3600000, Number(minGapMs || 0)));
      const key = crawlSlotKey(domain);
      await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      const row = await tx.pool.query('SELECT value FROM settings WHERE key = $1 FOR UPDATE', [key]);
      const existing = row.rows[0]?.value || {};
      const previousNext = Date.parse(existing.nextAllowedAt || 0);
      const reservedMs = Math.max(requestedAt.getTime(), Number.isFinite(previousNext) ? previousNext : 0);
      const reservation = {
        domainHash: key.slice('crawlRate:'.length),
        reservedAt: new Date(reservedMs).toISOString(),
        nextAllowedAt: new Date(reservedMs + gap).toISOString(),
        updatedAt: now()
      };
      await tx.pool.query(`
        INSERT INTO settings(key, value, updated_at) VALUES ($1, $2::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `, [key, JSON.stringify(reservation)]);
      return { ...reservation, waitMs: Math.max(0, reservedMs - requestedAt.getTime()) };
    });
  }

  async reserveAuditCapacity(campaignId, date, cap, prospectId) {
    return this.transaction(async tx => {
      const limit = Math.max(0, Math.min(100, Number(cap || 0)));
      const key = auditCapacityKey(campaignId, date);
      const hash = prospectHash(prospectId);
      await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      const row = await tx.pool.query('SELECT value FROM settings WHERE key = $1 FOR UPDATE', [key]);
      const existing = row.rows[0]?.value || { count: 0, prospectHashes: [] };
      if ((existing.prospectHashes || []).includes(hash)) return { ok: true, duplicate: true, remaining: Math.max(0, limit - Number(existing.count || 0)) };
      if (Number(existing.count || 0) >= limit) return { ok: false, reason: 'campaign-daily-audit-cap', remaining: 0 };
      const record = {
        count: Number(existing.count || 0) + 1,
        prospectHashes: [...(existing.prospectHashes || []), hash].slice(-100),
        updatedAt: now()
      };
      await tx.pool.query(`
        INSERT INTO settings(key, value, updated_at) VALUES ($1, $2::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `, [key, JSON.stringify(record)]);
      return { ok: true, duplicate: false, remaining: Math.max(0, limit - record.count) };
    });
  }

  async reserveDraftCapacity(campaignId, date, cap, prospectId) {
    return this.transaction(async tx => {
      const limit = Math.max(0, Math.min(100, Number(cap || 0)));
      const key = draftCapacityKey(campaignId, date);
      const hash = prospectHash(prospectId);
      await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      const row = await tx.pool.query('SELECT value FROM settings WHERE key = $1 FOR UPDATE', [key]);
      const existing = row.rows[0]?.value || { count: 0, prospectHashes: [] };
      if ((existing.prospectHashes || []).includes(hash)) return { ok: true, duplicate: true, remaining: Math.max(0, limit - Number(existing.count || 0)) };
      if (Number(existing.count || 0) >= limit) return { ok: false, reason: 'campaign-daily-draft-cap', remaining: 0 };
      const record = {
        count: Number(existing.count || 0) + 1,
        prospectHashes: [...(existing.prospectHashes || []), hash].slice(-100),
        updatedAt: now()
      };
      await tx.pool.query(`
        INSERT INTO settings(key, value, updated_at) VALUES ($1, $2::jsonb, now())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `, [key, JSON.stringify(record)]);
      return { ok: true, duplicate: false, remaining: Math.max(0, limit - record.count) };
    });
  }

  async claimProspects(limit = 1) {
    return this.transaction(async tx => {
      const result = await tx.pool.query(`
        WITH candidates AS (
          SELECT id FROM prospects
          WHERE status = ANY($1::text[])
            AND COALESCE((data->>'nextCrawlAt')::timestamptz, now()) <= now()
          ORDER BY created_at ASC NULLS FIRST
          FOR UPDATE SKIP LOCKED
          LIMIT $2
        )
        UPDATE prospects p
        SET status = 'claimed',
            updated_at = now(),
            data = jsonb_set(jsonb_set(p.data, '{status}', '"claimed"'::jsonb), '{claimedAt}', to_jsonb(now()::text))
        FROM candidates c
        WHERE p.id = c.id
        RETURNING p.data
      `, [['queued', 'new', 'retry', 'error'], Math.max(0, limit)]);
      return result.rows.map(row => row.data);
    });
  }

  async claimProspect(id) {
    const result = await this.pool.query(`
      UPDATE prospects
      SET status='claimed', updated_at=now(),
          data=jsonb_set(jsonb_set(data,'{status}','"claimed"'::jsonb),'{claimedAt}',to_jsonb(now()::text))
      WHERE id=$1 AND status=ANY($2::text[])
        AND COALESCE((data->>'nextCrawlAt')::timestamptz, now()) <= now()
      RETURNING data
    `, [id, ['queued', 'new', 'retry', 'error']]);
    return result.rows[0]?.data || null;
  }


  async recoverStaleJobs(lockTimeoutMs = 300000) {
    const seconds = Math.max(1, Math.ceil(Number(lockTimeoutMs || 300000) / 1000));
    return this.transaction(async tx => {
      const result = await tx.pool.query(`
        WITH stale AS (
          SELECT id, attempts, max_attempts FROM jobs
          WHERE status = 'active'
            AND COALESCE(heartbeat_at, locked_at, started_at, created_at, now()) < now() - ($1::text || ' seconds')::interval
          FOR UPDATE SKIP LOCKED
        ), updated AS (
          UPDATE jobs j
          SET status = CASE WHEN s.attempts >= s.max_attempts THEN 'dead-letter' ELSE 'queued' END,
              run_at = CASE WHEN s.attempts >= s.max_attempts THEN j.run_at ELSE now() END,
              dead_lettered_at = CASE WHEN s.attempts >= s.max_attempts THEN now() ELSE j.dead_lettered_at END,
              locked_at = NULL, locked_by = NULL, heartbeat_at = NULL, updated_at = now(),
              data = j.data || jsonb_build_object(
                'status', CASE WHEN s.attempts >= s.max_attempts THEN 'dead-letter' ELSE 'queued' END,
                'runAt', CASE WHEN s.attempts >= s.max_attempts THEN j.data->>'runAt' ELSE now()::text END,
                'deadLetteredAt', CASE WHEN s.attempts >= s.max_attempts THEN now()::text ELSE j.data->>'deadLetteredAt' END,
                'lockedAt', NULL, 'lockedBy', NULL, 'heartbeatAt', NULL, 'updatedAt', now()::text
              )
          FROM stale s WHERE j.id = s.id
          RETURNING j.status
        )
        SELECT count(*) FILTER (WHERE status='queued')::int AS recovered,
               count(*) FILTER (WHERE status='dead-letter')::int AS dead_lettered
        FROM updated
      `, [String(seconds)]);
      return { recovered: result.rows[0]?.recovered || 0, deadLettered: result.rows[0]?.dead_lettered || 0 };
    });
  }

  async claimJobs(workerId, limit = 1, lockTimeoutMs = 300000, types = []) {
    await this.recoverStaleJobs(lockTimeoutMs);
    const allowedTypes = (Array.isArray(types) ? types : [])
      .map(value => String(value || '').trim()).filter(Boolean).slice(0, 20);
    return this.transaction(async tx => {
      const result = await tx.pool.query(`
        WITH candidates AS (
          SELECT id FROM jobs
          WHERE status = ANY($1::text[])
            AND COALESCE(run_at, scheduled_at, created_at, now()) <= now()
            AND ($4::text[] IS NULL OR type = ANY($4::text[]) OR queue = ANY($4::text[]))
          ORDER BY priority DESC, created_at ASC NULLS FIRST
          FOR UPDATE SKIP LOCKED
          LIMIT $2
        )
        UPDATE jobs j
        SET status = 'active', attempts = COALESCE(j.attempts,0) + 1,
            locked_by = $3::text, locked_at = now(), heartbeat_at = now(),
            started_at = COALESCE(j.started_at, now()), updated_at = now(),
            data = j.data || jsonb_build_object(
              'status','active','attempts',COALESCE(j.attempts,0)+1,'lockedBy',$3::text,
              'lockedAt',now()::text,'heartbeatAt',now()::text,
              'startedAt',COALESCE(j.started_at,now())::text,'updatedAt',now()::text
            )
        FROM candidates c
        WHERE j.id = c.id
        RETURNING j.data
      `, [['queued', 'retry'], Math.max(0, Number(limit || 0)), String(workerId), allowedTypes.length ? allowedTypes : null]);
      return result.rows.map(row => row.data);
    });
  }

  async completeJob(id, result = {}, lease = {}) {
    const query = await this.pool.query(`
      UPDATE jobs SET status='completed', result=$2::jsonb, completed_at=now(),
        locked_at=NULL, locked_by=NULL, heartbeat_at=NULL, last_error=NULL, updated_at=now(),
        data=data || jsonb_build_object('status','completed','result',$2::jsonb,'completedAt',now()::text,
          'lockedAt',NULL,'lockedBy',NULL,'heartbeatAt',NULL,'lastError','','updatedAt',now()::text)
      WHERE id=$1 AND status='active' AND locked_by=$3::text AND locked_at=$4::timestamptz RETURNING data
    `, [id, JSON.stringify(result || {}), String(lease.workerId || ''), lease.lockedAt || null]);
    return query.rows[0]?.data || null;
  }

  async failJob(id, error, options = {}) {
    return this.transaction(async tx => {
      const row = await tx.pool.query("SELECT attempts,max_attempts,data FROM jobs WHERE id=$1 AND status='active' AND locked_by=$2::text AND locked_at=$3::timestamptz FOR UPDATE", [id, String(options.workerId || ''), options.lockedAt || null]);
      if (!row.rows[0]) return null;
      const attempts = Number(row.rows[0].attempts || 0);
      const maxAttempts = Number(options.maxAttempts || row.rows[0].max_attempts || 5);
      const message = redactSensitiveText(error?.message || error || 'Unknown job failure').slice(0, 2000);
      const dead = attempts >= maxAttempts;
      const base = Math.max(1000, Number(options.baseDelayMs || 30000));
      const maxDelay = Math.max(base, Number(options.maxDelayMs || 3600000));
      const delay = Math.min(maxDelay, base * (2 ** Math.max(0, attempts - 1)));
      const result = await tx.pool.query(`
        UPDATE jobs SET status=$2::text, run_at=CASE WHEN $2::text='retry' THEN now()+($3::text||' milliseconds')::interval ELSE run_at END,
          dead_lettered_at=CASE WHEN $2::text='dead-letter' THEN now() ELSE dead_lettered_at END,
          last_error=$4::text, locked_at=NULL, locked_by=NULL, heartbeat_at=NULL, updated_at=now(),
          data=data || jsonb_build_object('status',$2::text,'runAt',CASE WHEN $2::text='retry' THEN (now()+($3::text||' milliseconds')::interval)::text ELSE data->>'runAt' END,
            'deadLetteredAt',CASE WHEN $2::text='dead-letter' THEN now()::text ELSE data->>'deadLetteredAt' END,
            'lastError',$4::text,'lockedAt',NULL,'lockedBy',NULL,'heartbeatAt',NULL,'updatedAt',now()::text)
        WHERE id=$1 RETURNING data
      `, [id, dead ? 'dead-letter' : 'retry', String(delay), message]);
      return result.rows[0]?.data || null;
    });
  }

  async heartbeatJob(id, workerId) {
    const result = await this.pool.query(`
      UPDATE jobs SET heartbeat_at=now(), updated_at=now(),
        data=data || jsonb_build_object('heartbeatAt',now()::text,'updatedAt',now()::text)
      WHERE id=$1 AND status='active' AND locked_by=$2::text RETURNING data
    `, [id, String(workerId)]);
    return result.rows[0]?.data || null;
  }

  async reserveOutboundSend(input = {}) {
    return this.transaction(async tx => {
      const timestamp = new Date(input.now || Date.now());
      const inbox = String(input.inbox || '');
      await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`outbound:${inbox}`]);
      const paused = await tx.pool.query("SELECT value FROM settings WHERE key='outboundPaused'");
      if (paused.rows[0]?.value === true) return { ok: false, reason: 'global-outbound-paused' };
      const health = await tx.pool.query('SELECT data FROM sender_health WHERE inbox=$1 FOR UPDATE', [inbox]);
      if (health.rows[0]?.data?.paused) return { ok: false, reason: 'sender-paused', health: health.rows[0].data };
      const duplicate = await tx.pool.query('SELECT data FROM outbound_reservations WHERE idempotency_key=$1 FOR UPDATE', [input.idempotencyKey]);
      if (duplicate.rows[0]) return { ok: false, reason: `duplicate-${duplicate.rows[0].data.status || 'reservation'}`, reservation: duplicate.rows[0].data };
      const counts = await tx.pool.query(`
        SELECT
          count(*) FILTER (WHERE reserved_at >= date_trunc('day',$2::timestamptz))::int AS daily,
          count(*) FILTER (WHERE reserved_at >= date_trunc('hour',$2::timestamptz))::int AS hourly,
          max(reserved_at) AS latest
        FROM outbound_reservations
        WHERE inbox=$1 AND status=ANY($3::text[])
      `, [inbox, timestamp.toISOString(), ['reserved','dispatching','sent','uncertain']]);
      const row = counts.rows[0] || {};
      if (Number(row.daily || 0) >= Number(input.dailyCap || 0)) return { ok: false, reason: 'daily-cap', daily: Number(row.daily || 0) };
      if (Number(row.hourly || 0) >= Number(input.hourlyCap || 0)) return { ok: false, reason: 'hourly-cap', hourly: Number(row.hourly || 0) };
      const latest = row.latest ? new Date(row.latest).getTime() : 0;
      const gapMs = Math.max(0, Number(input.minGapSeconds || 0) * 1000);
      if (latest && timestamp.getTime() - latest < gapMs) return { ok: false, reason: 'cadence-gap', retryAt: new Date(latest + gapMs).toISOString() };
      const reservation = {
        id: input.id || crypto.randomUUID(), idempotencyKey: input.idempotencyKey,
        prospectId: input.prospectId || null, campaignId: input.campaignId || null, inbox,
        recipientEmail: String(input.recipientEmail || '').toLowerCase(), kind: input.kind || 'initial',
        followup: Number(input.followup || 0), status: 'reserved', reservedAt: timestamp.toISOString(),
        createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString()
      };
      await tx.add('outboundReservations', reservation);
      return { ok: true, reservation };
    });
  }

  async beginOutboundDispatch(id, gate = {}) {
    return this.transaction(async tx => {
      const reservationRow = await tx.pool.query('SELECT data FROM outbound_reservations WHERE id=$1 FOR UPDATE', [id]);
      const reservation = reservationRow.rows[0]?.data || null;
      if (!reservation) return { ok: false, reason: 'reservation-not-found', reservation: null };
      const preliminary = await tx.pool.query('SELECT data FROM prospects WHERE id=$1', [reservation.prospectId]);
      const preliminaryProspect = preliminary.rows[0]?.data || null;
      const email = String(reservation.recipientEmail || '').toLowerCase();
      const domain = String(preliminaryProspect?.domain || normalizeDomain(preliminaryProspect?.website)).toLowerCase();
      for (const key of dispatchLockKeys({ prospectId: reservation.prospectId, inbox: reservation.inbox, email, domain })) {
        await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      }
      const [prospectRow, settingsRow, healthRow, suppressionRows, replyRows, orderRows] = await Promise.all([
        tx.pool.query('SELECT data FROM prospects WHERE id=$1 FOR UPDATE', [reservation.prospectId]),
        tx.pool.query("SELECT key,value FROM settings WHERE key='outboundPaused'"),
        tx.pool.query('SELECT data FROM sender_health WHERE inbox=$1 FOR UPDATE', [reservation.inbox]),
        tx.pool.query('SELECT data FROM suppressions WHERE value=ANY($1::text[])', [[email, domain].filter(Boolean)]),
        tx.pool.query('SELECT data FROM replies WHERE prospect_id=$1', [reservation.prospectId]),
        tx.pool.query('SELECT data FROM orders WHERE prospect_id=$1', [reservation.prospectId])
      ]);
      const prospect = prospectRow.rows[0]?.data || null;
      const campaignRow = prospect
        ? await tx.pool.query('SELECT data FROM campaigns WHERE id=$1 FOR UPDATE', [prospect.campaignId])
        : { rows: [] };
      const leadRow = prospect?.leadId
        ? await tx.pool.query('SELECT data FROM leads WHERE id=$1', [prospect.leadId])
        : { rows: [] };
      const decision = dispatchDecision({
        reservation, prospect, campaign: campaignRow.rows[0]?.data || null,
        settings: Object.fromEntries(settingsRow.rows.map(row => [row.key, row.value])),
        health: healthRow.rows[0]?.data || null,
        suppressions: suppressionRows.rows.map(row => row.data),
        replies: replyRows.rows.map(row => row.data),
        lead: leadRow.rows[0]?.data || null,
        orders: orderRows.rows.map(row => row.data)
      }, gate);
      const timestamp = now();
      const updated = {
        ...reservation,
        status: decision.ok ? 'dispatching' : 'cancelled',
        ...(decision.ok ? { dispatchedAt: timestamp } : { cancelReason: decision.reason, completedAt: timestamp }),
        updatedAt: timestamp
      };
      await tx.upsert('outboundReservations', updated);
      return { ...decision, reservation: updated };
    });
  }

  async finalizeOutboundDispatch(id, status, reservationPatch = {}, prospectPatch = {}) {
    if (!['sent', 'uncertain'].includes(status)) throw new StoreError('Invalid outbound finalization status', 'INVALID_OUTBOUND_STATE');
    return this.transaction(async tx => {
      const reservationRow = await tx.pool.query('SELECT data FROM outbound_reservations WHERE id=$1 FOR UPDATE', [id]);
      const reservation = reservationRow.rows[0]?.data || null;
      if (!reservation || reservation.status !== 'dispatching') return { ok: false, reason: 'reservation-not-dispatching' };
      const preliminary = await tx.pool.query('SELECT data FROM prospects WHERE id=$1', [reservation.prospectId]);
      const preliminaryProspect = preliminary.rows[0]?.data || null;
      const email = String(reservation.recipientEmail || '').toLowerCase();
      const domain = String(preliminaryProspect?.domain || normalizeDomain(preliminaryProspect?.website)).toLowerCase();
      for (const key of dispatchLockKeys({ prospectId: reservation.prospectId, inbox: reservation.inbox, email, domain })) {
        await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      }
      const [prospectRow, suppressionRows, replyRows, orderRows] = await Promise.all([
        tx.pool.query('SELECT data FROM prospects WHERE id=$1 FOR UPDATE', [reservation.prospectId]),
        tx.pool.query('SELECT data FROM suppressions WHERE value=ANY($1::text[])', [[email, domain].filter(Boolean)]),
        tx.pool.query('SELECT data FROM replies WHERE prospect_id=$1', [reservation.prospectId]),
        tx.pool.query('SELECT data FROM orders WHERE prospect_id=$1', [reservation.prospectId])
      ]);
      const prospect = prospectRow.rows[0]?.data || null;
      const leadRow = prospect?.leadId
        ? await tx.pool.query('SELECT data FROM leads WHERE id=$1', [prospect.leadId])
        : { rows: [] };
      const stopReason = outboundStopReason({
        reservation, prospect,
        suppressions: suppressionRows.rows.map(row => row.data),
        replies: replyRows.rows.map(row => row.data),
        lead: leadRow.rows[0]?.data || null,
        orders: orderRows.rows.map(row => row.data)
      });
      const timestamp = now();
      const finalizedReservation = {
        ...reservation, ...reservationPatch, status, completedAt: timestamp,
        ...(status === 'sent' && !reservationPatch.sentAt ? { sentAt: timestamp } : {}),
        updatedAt: timestamp
      };
      await tx.upsert('outboundReservations', finalizedReservation);
      let finalizedProspect = null;
      if (prospect) {
        const safePatch = { ...prospectPatch };
        if (stopReason) {
          delete safePatch.status;
          safePatch.nextFollowupAt = null;
          safePatch.sendSafety = { ...(prospect.sendSafety || {}), ...(safePatch.sendSafety || {}), terminalStopReason: stopReason };
        }
        finalizedProspect = { ...prospect, ...safePatch, updatedAt: timestamp };
        await tx.upsert('prospects', finalizedProspect);
      }
      return { ok: true, reservation: finalizedReservation, prospect: finalizedProspect, stopReason };
    });
  }

  async suppressOutbound(input = {}) {
    return this.transaction(async tx => {
      const values = [...new Set((input.values || []).map(value => String(value || '').trim().toLowerCase()).filter(Boolean))].sort();
      const locks = [...new Set(['outbound:global', input.prospectId && `outbound:prospect:${input.prospectId}`, ...values.map(value => `outbound:recipient:${value}`)].filter(Boolean))].sort();
      for (const key of locks) await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      for (const value of values) {
        try { await tx.add('suppressions', { id: crypto.randomUUID(), value, reason: String(input.reason || 'suppressed'), createdAt: now() }); }
        catch (error) { if (!(error instanceof ConflictError)) throw error; }
      }
      let prospect = null;
      if (input.prospectId) {
        const row = await tx.pool.query('SELECT data FROM prospects WHERE id=$1 FOR UPDATE', [input.prospectId]);
        if (row.rows[0]?.data) {
          prospect = { ...row.rows[0].data, status: input.status || 'suppressed', nextFollowupAt: null, ...(input.prospectPatch || {}), updatedAt: now() };
          await tx.upsert('prospects', prospect);
        }
      }
      return { ok: true, values, prospect };
    });
  }

  async recordReplyAndStop(record, prospectPatch = {}) {
    return this.transaction(async tx => {
      for (const key of dispatchLockKeys({ prospectId: record.prospectId, inbox: record.inbox })) {
        await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      }
      const reply = await tx.add('replies', record);
      let prospect = null;
      if (record.prospectId) {
        const row = await tx.pool.query('SELECT data FROM prospects WHERE id=$1 FOR UPDATE', [record.prospectId]);
        if (row.rows[0]?.data) {
          prospect = { ...row.rows[0].data, ...prospectPatch, nextFollowupAt: null, updatedAt: now() };
          await tx.upsert('prospects', prospect);
        }
      }
      return { reply, prospect };
    });
  }

  async markOutboundReservation(id, status, patch = {}) {
    return this.patch('outboundReservations', id, {
      ...patch, status,
      ...(status === 'dispatching' ? { dispatchedAt: now() } : {}),
      ...(['sent','uncertain','cancelled'].includes(status) ? { completedAt: now() } : {})
    });
  }

  async recordOutboundEvent(input = {}, thresholds = {}) {
    return this.transaction(async tx => {
      const timestamp = input.occurredAt || now();
      const today = String(timestamp).slice(0, 10);
      const inbox = String(input.inbox || '');
      const recipientHash = input.recipientEmail ? crypto.createHash('sha256').update(String(input.recipientEmail).trim().toLowerCase()).digest('hex') : '';
      await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`outbound:inbox:${inbox}`]);
      await tx.add('outboundEvents', {
        id: input.id || crypto.randomUUID(), inbox, eventType: input.eventType,
        prospectId: input.prospectId || null, recipientEmail: '', recipientHash, detail: input.detail || {},
        occurredAt: timestamp, createdAt: timestamp, updatedAt: timestamp
      });
      const result = await tx.pool.query('SELECT data FROM sender_health WHERE inbox=$1 FOR UPDATE', [inbox]);
      let health = result.rows[0]?.data || {
        id: `sender_${inbox}`, inbox, paused: false, hardBouncesToday: 0, complaintsToday: 0,
        failureStreak: 0, healthDate: today, createdAt: timestamp
      };
      if (health.healthDate !== today) health = { ...health, healthDate: today, hardBouncesToday: 0, complaintsToday: 0 };
      if (input.eventType === 'sent') health.failureStreak = 0;
      if (input.eventType === 'send_uncertain') health.failureStreak = Number(health.failureStreak || 0) + 1;
      if (input.eventType === 'hard_bounce') health.hardBouncesToday = Number(health.hardBouncesToday || 0) + 1;
      if (input.eventType === 'complaint') health.complaintsToday = Number(health.complaintsToday || 0) + 1;
      const pauseReason = Number(health.complaintsToday || 0) >= Number(thresholds.complaintPauseThreshold || 1) ? 'complaint-threshold'
        : Number(health.hardBouncesToday || 0) >= Number(thresholds.hardBouncePauseThreshold || 2) ? 'hard-bounce-threshold'
        : Number(health.failureStreak || 0) >= Number(thresholds.failurePauseThreshold || 3) ? 'send-failure-threshold' : '';
      if (pauseReason) health = { ...health, paused: true, pauseReason, pausedAt: timestamp };
      health = { ...health, lastEventAt: timestamp, updatedAt: timestamp };
      await tx.upsert('senderHealth', health);
      return health;
    });
  }

  async setOutboundPaused(paused, reason = '') {
    await this.transaction(async tx => {
      await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['outbound:global']);
      await tx.setSetting('outboundPaused', Boolean(paused));
      await tx.setSetting('outboundPauseReason', String(reason || ''));
    });
    return { paused: Boolean(paused), reason };
  }

  async setSenderPaused(inbox, paused, reason = '') {
    return this.transaction(async tx => {
      await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`outbound:inbox:${inbox}`]);
      const result = await tx.pool.query('SELECT data FROM sender_health WHERE inbox=$1 FOR UPDATE', [inbox]);
      const existing = result.rows[0]?.data || null;
      const record = {
        ...(existing || { id: `sender_${inbox}`, inbox, hardBouncesToday: 0, complaintsToday: 0, failureStreak: 0, healthDate: dateOnly() }),
        paused: Boolean(paused), pauseReason: String(reason || ''), updatedAt: now(), createdAt: existing?.createdAt || now()
      };
      return tx.upsert('senderHealth', record);
    });
  }

  async putArtifact({ id, contentType = 'application/octet-stream', content, sha256 = '', expiresAt = null, metadata = {} }) {
    if (!id || !Buffer.isBuffer(content)) throw new StoreError('Artifact id and Buffer content are required', 'INVALID_ARTIFACT');
    const digest = sha256 || crypto.createHash('sha256').update(content).digest('hex');
    const result = await this.pool.query(`
      INSERT INTO artifacts(id, content_type, byte_size, sha256, expires_at, metadata, content)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
      ON CONFLICT (id) DO UPDATE SET content_type=EXCLUDED.content_type, byte_size=EXCLUDED.byte_size,
        sha256=EXCLUDED.sha256, expires_at=EXCLUDED.expires_at, metadata=EXCLUDED.metadata, content=EXCLUDED.content
      RETURNING id,content_type,byte_size,sha256,created_at,expires_at,metadata
    `, [id, String(contentType), content.length, digest, expiresAt, JSON.stringify(metadata || {}), content]);
    return result.rows[0] || null;
  }

  async getArtifact(id) {
    const result = await this.pool.query(`
      SELECT id,content_type,byte_size,sha256,created_at,expires_at,metadata,content
      FROM artifacts
      WHERE id=$1 AND (expires_at IS NULL OR expires_at > now())
    `, [id]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id, contentType: row.content_type, byteSize: Number(row.byte_size), sha256: row.sha256,
      createdAt: row.created_at, expiresAt: row.expires_at, metadata: row.metadata, content: row.content
    };
  }

  async deleteExpiredArtifacts() {
    const result = await this.pool.query('DELETE FROM artifacts WHERE expires_at IS NOT NULL AND expires_at <= now()');
    return result.rowCount || 0;
  }

  async queueStats() {
    const [counts, next] = await Promise.all([
      this.pool.query('SELECT status,count(*)::int AS count FROM jobs GROUP BY status'),
      this.pool.query("SELECT run_at FROM jobs WHERE status=ANY($1::text[]) ORDER BY run_at ASC NULLS FIRST LIMIT 1", [['queued','retry']])
    ]);
    return { counts: Object.fromEntries(counts.rows.map(row => [row.status, row.count])), nextRunAt: next.rows[0]?.run_at?.toISOString?.() || next.rows[0]?.run_at || null, total: counts.rows.reduce((sum,row)=>sum+row.count,0) };
  }
}

// Backward-compatible test/development name.
export class Store extends JsonStore {}

export function createStore(config) {
  if (config.storeBackend === 'postgres') {
    return new PostgresStore({ databaseUrl: config.databaseUrl, ssl: config.databaseSsl });
  }
  return new JsonStore(config.dataDir);
}
