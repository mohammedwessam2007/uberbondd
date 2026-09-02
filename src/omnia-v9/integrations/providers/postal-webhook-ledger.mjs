import { deriveCurrentPostalState } from './postal-webhook-evidence.mjs';

export const POSTAL_WEBHOOK_LEDGER_VERSION = 'uberbond.postal-webhook-ledger-1.0.0';

function clone(value) { return structuredClone(value); }
function normalizedRow(event) {
  return {
    occurrenceKey: event.occurrenceKey,
    provider: 'postal',
    eventName: event.eventName,
    lifecycle: event.lifecycle,
    occurredAt: event.occurredAt,
    receivedAt: event.receivedAt,
    authenticated: event.authenticated === true,
    quarantineReason: event.quarantineReason || null,
    executionTagValid: event.executionTagValid === true,
    executionTag: event.executionTag || null,
    postalMessageId: event.postalMessageId || null,
    messageId: event.messageId || null,
    to: event.to || null,
    from: event.from || null,
    subjectSha256: event.subjectSha256 || null,
    rawBodySha256: event.rawBodySha256,
    detailsDigest: event.detailsDigest,
    provenance: event.provenance,
    eligibleForReconciliation: event.eligibleForReconciliation === true
  };
}

export function createMemoryPostalWebhookLedger(seed = []) {
  const map = new Map();
  for (const row of seed) if (row?.occurrenceKey) map.set(row.occurrenceKey, normalizedRow(row));
  return {
    async append(event) {
      if (!event?.occurrenceKey) throw new Error('postal-occurrence-key-required');
      if (map.has(event.occurrenceKey)) return { ok: true, status: 'DUPLICATE', duplicate: true, occurrenceKey: event.occurrenceKey };
      map.set(event.occurrenceKey, normalizedRow(event));
      return { ok: true, status: 'PERSISTED', duplicate: false, occurrenceKey: event.occurrenceKey };
    },
    async findByTag(tag) {
      return [...map.values()].filter(row => row.executionTag === tag).map(clone);
    },
    async findByMessageId(messageId) {
      return [...map.values()].filter(row => row.messageId === messageId || row.postalMessageId === messageId).map(clone);
    },
    async lookupForReconciliation({ tag, messageId } = {}) {
      let rows = [...map.values()];
      if (tag) rows = rows.filter(row => row.executionTag === tag);
      if (messageId) rows = rows.filter(row => !row.messageId || row.messageId === messageId);
      return rows.map(clone);
    }
  };
}

export function createPostgresPostalWebhookLedger(pool) {
  if (!pool?.query) throw new Error('postgres-pool-required');
  return {
    async append(event) {
      if (!event?.occurrenceKey) throw new Error('postal-occurrence-key-required');
      const row = normalizedRow(event);
      const result = await pool.query(`INSERT INTO postal_webhook_events(
        occurrence_key,event_name,lifecycle,occurred_at,received_at,authenticated,quarantine_reason,
        execution_tag_valid,execution_tag,postal_message_id,message_id,recipient,sender,subject_sha256,
        raw_body_sha256,details_digest,provenance,eligible_for_reconciliation
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT DO NOTHING RETURNING occurrence_key`,[
        row.occurrenceKey,row.eventName,row.lifecycle,row.occurredAt,row.receivedAt,row.authenticated,row.quarantineReason,
        row.executionTagValid,row.executionTag,row.postalMessageId,row.messageId,row.to,row.from,row.subjectSha256,
        row.rawBodySha256,row.detailsDigest,row.provenance,row.eligibleForReconciliation
      ]);
      return { ok: true, status: result.rowCount === 1 ? 'PERSISTED' : 'DUPLICATE', duplicate: result.rowCount !== 1, occurrenceKey: row.occurrenceKey };
    },
    async findByTag(tag) {
      const result = await pool.query('SELECT * FROM postal_webhook_events WHERE execution_tag=$1 ORDER BY occurred_at ASC, occurrence_key ASC',[tag]);
      return result.rows.map(fromDb);
    },
    async findByMessageId(messageId) {
      const result = await pool.query('SELECT * FROM postal_webhook_events WHERE message_id=$1 OR postal_message_id=$1 ORDER BY occurred_at ASC, occurrence_key ASC',[messageId]);
      return result.rows.map(fromDb);
    },
    async lookupForReconciliation({ tag, messageId } = {}) {
      const result = await pool.query(`SELECT * FROM postal_webhook_events
        WHERE ($1::text IS NULL OR execution_tag=$1)
          AND ($2::text IS NULL OR message_id IS NULL OR message_id=$2)
        ORDER BY occurred_at ASC, occurrence_key ASC`,[tag || null,messageId || null]);
      return result.rows.map(fromDb);
    }
  };
}

function fromDb(row) {
  return {
    occurrenceKey: row.occurrence_key,
    provider: 'postal',
    eventName: row.event_name,
    lifecycle: row.lifecycle,
    occurredAt: new Date(row.occurred_at).toISOString(),
    receivedAt: new Date(row.received_at).toISOString(),
    authenticated: row.authenticated === true,
    quarantineReason: row.quarantine_reason,
    executionTagValid: row.execution_tag_valid === true,
    executionTag: row.execution_tag,
    postalMessageId: row.postal_message_id,
    messageId: row.message_id,
    to: row.recipient,
    from: row.sender,
    subjectSha256: row.subject_sha256,
    rawBodySha256: row.raw_body_sha256,
    detailsDigest: row.details_digest,
    provenance: row.provenance,
    eligibleForReconciliation: row.eligible_for_reconciliation === true
  };
}

export function createPostalReconciliationLookup(ledger) {
  if (!ledger?.lookupForReconciliation) throw new Error('postal-ledger-required');
  return async ({ tag, messageId } = {}) => {
    const rows = await ledger.lookupForReconciliation({ tag, messageId });
    const usable = rows.filter(row => row.authenticated === true && row.quarantineReason == null && row.eligibleForReconciliation === true);
    const byPostalId = new Map();
    for (const row of usable) {
      const key = String(row.postalMessageId || '');
      if (!key) continue;
      if (!byPostalId.has(key)) byPostalId.set(key, []);
      byPostalId.get(key).push(row);
    }
    const synthesized = [];
    for (const [postalId, group] of byPostalId) {
      const current = deriveCurrentPostalState(group);
      const row = current.row;
      if (!row) continue;
      synthesized.push({
        id: postalId,
        postalMessageId: postalId,
        messageId: row.messageId,
        tag: row.executionTag,
        to: row.to,
        from: row.from,
        subjectSha256: row.subjectSha256,
        status: current.state,
        provenance: row.provenance,
        contradictory: current.contradictory,
        occurredAt: row.occurredAt
      });
    }
    return synthesized.sort((a,b) => String(a.id).localeCompare(String(b.id)));
  };
}
