import {
  POSTAL_PROVENANCE,
  POSTAL_EXECUTION_TAG_RE,
  isReconcilableRow,
  latestPostalRow,
  deriveCurrentPostalState
} from './postal-webhook-evidence.mjs';

/**
 * Durable storage for Postal webhook deliveries, and the one function that
 * turns them into something reconciliation is allowed to read.
 *
 * Two implementations behind one interface: an in-memory ledger for tests and
 * a PostgreSQL ledger for the route. They are deliberately the same shape so a
 * suite proving an invariant against memory is proving it about the code the
 * route runs, not about a second, simpler thing that happens to be nearby.
 *
 * `append` is idempotent on `occurrenceKey`. Postal retries a webhook until it
 * gets a 2xx, so redelivery is the normal case rather than an attack: a second
 * copy of one event must not read as a second event, or a single send would
 * appear to have been sent twice.
 */

export const POSTAL_WEBHOOK_LEDGER_VERSION = 'uberbond.postal-webhook-ledger.v1';
export const POSTAL_WEBHOOK_TABLE = 'postal_webhook_events';

function normalizeMessageId(value) {
  return String(value ?? '').trim().replace(/^</, '').replace(/>$/, '').toLowerCase();
}

function matchesLookup(row, { tag, messageId }) {
  const wantedTag = String(tag ?? '').trim();
  const wantedMessageId = normalizeMessageId(messageId);
  if (wantedTag && String(row.tag ?? '').trim() === wantedTag) return true;
  if (wantedMessageId && normalizeMessageId(row.messageHeaderId) === wantedMessageId) return true;
  return false;
}

function requireLookupSelector({ tag, messageId }) {
  const wantedTag = String(tag ?? '').trim();
  const wantedMessageId = normalizeMessageId(messageId);
  // An empty selector would match every row in the table. A reconciliation
  // lookup that returns the whole ledger is not a lookup -- it would hand the
  // adapter somebody else's send and let it be finalized under this business
  // key. Refuse rather than return everything.
  if (!wantedTag && !wantedMessageId) return null;
  return { wantedTag, wantedMessageId };
}

export function createMemoryPostalWebhookLedger() {
  const byOccurrenceKey = new Map();

  return {
    kind: 'memory',
    version: POSTAL_WEBHOOK_LEDGER_VERSION,

    async append(record) {
      const occurrenceKey = String(record?.occurrenceKey ?? '').trim();
      if (!occurrenceKey) throw new Error('postal-webhook-occurrence-key-required');
      if (byOccurrenceKey.has(occurrenceKey)) return { status: 'DUPLICATE', duplicate: true, occurrenceKey };
      byOccurrenceKey.set(occurrenceKey, { ...record });
      return { status: 'PERSISTED', duplicate: false, occurrenceKey };
    },

    async findByTag(tag) {
      const wanted = String(tag ?? '').trim();
      if (!wanted) return [];
      return [...byOccurrenceKey.values()].filter(row => String(row.tag ?? '').trim() === wanted);
    },

    /** Matches the RFC Message-ID header this system generated, not Postal's numeric id. */
    async findByMessageId(messageId) {
      const wanted = normalizeMessageId(messageId);
      if (!wanted) return [];
      return [...byOccurrenceKey.values()].filter(row => normalizeMessageId(row.messageHeaderId) === wanted);
    },

    async lookupForReconciliation({ tag, messageId } = {}) {
      if (!requireLookupSelector({ tag, messageId })) return [];
      return [...byOccurrenceKey.values()].filter(row => isReconcilableRow(row) && matchesLookup(row, { tag, messageId }));
    },

    async count() { return byOccurrenceKey.size; },
    async all() { return [...byOccurrenceKey.values()]; }
  };
}

function rowFromDatabase(row) {
  if (!row) return null;
  return {
    occurrenceKey: row.occurrence_key,
    event: row.event,
    lifecycle: row.lifecycle,
    postalMessageId: row.postal_message_id,
    messageHeaderId: row.message_header_id,
    tag: row.tag,
    executionTagValid: row.execution_tag_valid === true,
    to: row.recipient,
    from: row.sender,
    subjectSha256: row.subject_sha256,
    rawBodySha256: row.raw_body_sha256,
    statusDetail: row.status_detail,
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
    receivedAt: row.received_at instanceof Date ? row.received_at.toISOString() : String(row.received_at),
    authenticated: row.authenticated === true,
    quarantineReason: row.quarantine_reason ?? null,
    provenance: row.provenance
  };
}

const RECONCILABLE_WHERE = `authenticated = true AND quarantine_reason IS NULL AND provenance = '${POSTAL_PROVENANCE.AUTHENTICATED}'`;

export function createPostgresPostalWebhookLedger(pool) {
  if (!pool || typeof pool.query !== 'function') throw new Error('postgres-pool-required');

  return {
    kind: 'postgres',
    version: POSTAL_WEBHOOK_LEDGER_VERSION,

    async append(record) {
      const occurrenceKey = String(record?.occurrenceKey ?? '').trim();
      if (!occurrenceKey) throw new Error('postal-webhook-occurrence-key-required');
      // Untargeted ON CONFLICT on purpose, exactly as billing-webhook-repository
      // learned to do: a targeted clause names one index and raises 23505 under
      // any other, and the caller answering 503 to a duplicate teaches a
      // provider to disable the endpoint.
      const result = await pool.query(
        `INSERT INTO ${POSTAL_WEBHOOK_TABLE}(
           occurrence_key,event,lifecycle,postal_message_id,message_header_id,tag,execution_tag_valid,
           recipient,sender,subject_sha256,raw_body_sha256,status_detail,occurred_at,received_at,
           authenticated,quarantine_reason,provenance
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT DO NOTHING RETURNING occurrence_key`,
        [
          occurrenceKey, record.event ?? '', record.lifecycle, record.postalMessageId ?? '', record.messageHeaderId ?? '',
          record.tag ?? '', record.executionTagValid === true, record.to ?? '', record.from ?? '',
          record.subjectSha256 ?? '', record.rawBodySha256, record.statusDetail ?? '',
          record.occurredAt, record.receivedAt, record.authenticated === true,
          record.quarantineReason ?? null, record.provenance
        ]
      );
      const persisted = result.rowCount === 1;
      return { status: persisted ? 'PERSISTED' : 'DUPLICATE', duplicate: !persisted, occurrenceKey };
    },

    async findByTag(tag) {
      const wanted = String(tag ?? '').trim();
      if (!wanted) return [];
      const result = await pool.query(`SELECT * FROM ${POSTAL_WEBHOOK_TABLE} WHERE tag=$1 ORDER BY occurred_at ASC`, [wanted]);
      return result.rows.map(rowFromDatabase);
    },

    async findByMessageId(messageId) {
      const wanted = normalizeMessageId(messageId);
      if (!wanted) return [];
      const result = await pool.query(
        `SELECT * FROM ${POSTAL_WEBHOOK_TABLE} WHERE lower(btrim(message_header_id, '<>'))=$1 ORDER BY occurred_at ASC`,
        [wanted]
      );
      return result.rows.map(rowFromDatabase);
    },

    async lookupForReconciliation({ tag, messageId } = {}) {
      const selector = requireLookupSelector({ tag, messageId });
      if (!selector) return [];
      const result = await pool.query(
        `SELECT * FROM ${POSTAL_WEBHOOK_TABLE}
          WHERE ${RECONCILABLE_WHERE}
            AND (($1::text <> '' AND tag = $1) OR ($2::text <> '' AND lower(btrim(message_header_id, '<>')) = $2))
          ORDER BY occurred_at ASC`,
        [selector.wantedTag, selector.wantedMessageId]
      );
      return result.rows.map(rowFromDatabase);
    },

    async count() {
      const result = await pool.query(`SELECT count(*)::integer AS count FROM ${POSTAL_WEBHOOK_TABLE}`);
      return Number(result.rows[0]?.count || 0);
    }
  };
}

/**
 * The adapter's `reconciliationLookupFn`, built over either ledger.
 *
 * One synthesized row per distinct Postal message id, and never one row per
 * webhook. Postal emits several events for a single send and retries each of
 * them, so a lookup returning raw rows would hand the adapter five matches for
 * one message -- and the adapter reads "more than one match" as AMBIGUOUS,
 * which would make every normal, correctly delivered send unreconcilable.
 * Collapsing per message id keeps that signal meaningful: two rows now means
 * two genuinely different provider messages under one execution tag, which is
 * exactly the case that must not be resolved automatically.
 *
 * Every synthesized row carries `provenance: AUTHENTICATED_POSTAL_WEBHOOK`
 * because only reconcilable rows reach here; the adapter re-checks it anyway,
 * so a hand-built lookup function cannot skip the gate this one enforces.
 */
export function createPostalReconciliationLookup(ledger) {
  if (!ledger || typeof ledger.lookupForReconciliation !== 'function') throw new Error('postal-webhook-ledger-required');

  return async function postalReconciliationLookup({ tag, messageId } = {}) {
    const rows = (await ledger.lookupForReconciliation({ tag, messageId })).filter(isReconcilableRow);
    if (rows.length === 0) return [];

    const distinctMessageIds = [...new Set(rows.map(row => String(row.postalMessageId ?? '').trim()))].sort();
    const contradictory = distinctMessageIds.length > 1;

    return distinctMessageIds.map(postalMessageId => {
      const group = rows.filter(row => String(row.postalMessageId ?? '').trim() === postalMessageId);
      const state = deriveCurrentPostalState(group);
      const latest = latestPostalRow(group);
      return {
        provenance: POSTAL_PROVENANCE.AUTHENTICATED,
        id: postalMessageId,
        postalMessageId,
        tag: String(latest?.tag ?? ''),
        executionTagValid: POSTAL_EXECUTION_TAG_RE.test(String(latest?.tag ?? '')),
        messageHeaderId: String(latest?.messageHeaderId ?? ''),
        to: String(latest?.to ?? ''),
        from: String(latest?.from ?? ''),
        subjectSha256: String(latest?.subjectSha256 ?? ''),
        lifecycle: state.lifecycle,
        negativeDeliveryEvidence: state.negativeDeliveryEvidence,
        contradictory,
        eventCount: state.eventCount,
        latestOccurredAt: state.latestOccurredAt
      };
    });
  };
}
