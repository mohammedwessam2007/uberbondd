function parseTime(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : null;
}

function invalid(reason, detail = {}) {
  return { ok: false, reason, detail, events: [] };
}

function sameTime(a, b) {
  const left = parseTime(a);
  const right = parseTime(b);
  return left != null && right != null && Math.abs(left - right) < 1;
}

export async function verifyAuthorityTransitionChain({ pool, idempotencyKey }) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('pool.query is required');
  idempotencyKey = String(idempotencyKey || '').trim();
  if (!idempotencyKey) return invalid('idempotency-key-required');

  let result;
  try {
    result = await pool.query(
      `SELECT event_digest,idempotency_key,sequence_no,tenant_id,intent_digest,approval_id,
              from_status,to_status,reason,previous_event_digest,occurred_at,event,created_at,
              encode(digest(convert_to((event - 'eventDigest')::text,'UTF8'),'sha256'),'hex') AS recomputed_digest
       FROM omnia_v9_authority_transition_events
       WHERE idempotency_key=$1
       ORDER BY sequence_no ASC`,
      [idempotencyKey]
    );
  } catch (error) {
    return invalid('authority-transition-ledger-unavailable', { message: String(error?.message || error) });
  }

  const rows = result.rows || [];
  if (rows.length === 0) return invalid('authority-transition-chain-missing');

  const identity = {
    tenantId: rows[0].tenant_id,
    intentDigest: rows[0].intent_digest,
    approvalId: rows[0].approval_id
  };

  let previous = null;
  const events = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const event = row.event || {};
    const expectedSequence = index + 1;
    if (Number(row.sequence_no) !== expectedSequence) return invalid('authority-transition-sequence-gap', { expectedSequence, actualSequence: row.sequence_no });
    if (row.idempotency_key !== idempotencyKey || event.idempotencyKey !== idempotencyKey) return invalid('authority-transition-key-mismatch', { sequenceNo: expectedSequence });
    if (row.event_digest !== row.recomputed_digest || event.eventDigest !== row.event_digest) return invalid('authority-transition-digest-mismatch', { sequenceNo: expectedSequence });
    if (event.schemaVersion !== 'omnia.v9.authority-transition.p9') return invalid('authority-transition-schema-mismatch', { sequenceNo: expectedSequence });
    if (Number(event.sequenceNo) !== expectedSequence) return invalid('authority-transition-event-sequence-mismatch', { sequenceNo: expectedSequence });
    if (row.tenant_id !== identity.tenantId || event.tenantId !== identity.tenantId) return invalid('authority-transition-tenant-drift', { sequenceNo: expectedSequence });
    if (row.intent_digest !== identity.intentDigest || event.intentDigest !== identity.intentDigest) return invalid('authority-transition-intent-drift', { sequenceNo: expectedSequence });
    if (row.approval_id !== identity.approvalId || event.approvalId !== identity.approvalId) return invalid('authority-transition-approval-drift', { sequenceNo: expectedSequence });
    if (String(event.toStatus || '') !== String(row.to_status || '')) return invalid('authority-transition-to-status-mismatch', { sequenceNo: expectedSequence });
    if ((event.fromStatus ?? null) !== (row.from_status ?? null)) return invalid('authority-transition-from-status-mismatch', { sequenceNo: expectedSequence });
    if (String(event.reason || '') !== String(row.reason || '')) return invalid('authority-transition-reason-mismatch', { sequenceNo: expectedSequence });
    if (!sameTime(event.occurredAt, row.occurred_at)) return invalid('authority-transition-time-mismatch', { sequenceNo: expectedSequence });

    if (index === 0) {
      if (row.previous_event_digest != null || event.previousEventDigest != null || row.from_status != null || row.to_status !== 'PENDING') {
        return invalid('authority-transition-invalid-genesis');
      }
    } else {
      if (row.previous_event_digest !== previous.event_digest || event.previousEventDigest !== previous.event_digest) {
        return invalid('authority-transition-chain-link-mismatch', { sequenceNo: expectedSequence });
      }
      if (row.from_status !== previous.to_status) return invalid('authority-transition-state-discontinuity', { sequenceNo: expectedSequence });
    }

    previous = row;
    events.push({
      eventDigest: row.event_digest,
      idempotencyKey: row.idempotency_key,
      sequenceNo: Number(row.sequence_no),
      tenantId: row.tenant_id,
      intentDigest: row.intent_digest,
      approvalId: row.approval_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason,
      previousEventDigest: row.previous_event_digest,
      occurredAt: row.occurred_at,
      createdAt: row.created_at
    });
  }

  return { ok: true, identity, events, headDigest: previous.event_digest, currentStatus: previous.to_status };
}

export async function proveReservedBefore({ pool, idempotencyKey, boundaryAt, tenantId, intentDigest, approvalId }) {
  const boundaryMs = parseTime(boundaryAt);
  if (boundaryMs == null) return invalid('authority-transition-boundary-invalid');
  const chain = await verifyAuthorityTransitionChain({ pool, idempotencyKey });
  if (!chain.ok) return chain;
  if (tenantId && chain.identity.tenantId !== tenantId) return invalid('authority-transition-tenant-mismatch');
  if (intentDigest && chain.identity.intentDigest !== intentDigest) return invalid('authority-transition-intent-mismatch');
  if (approvalId && chain.identity.approvalId !== approvalId) return invalid('authority-transition-approval-mismatch');

  const reserved = chain.events.filter(event => event.toStatus === 'RESERVED');
  if (reserved.length !== 1) return invalid('authority-transition-reserved-cardinality', { count: reserved.length });
  const reservedAt = parseTime(reserved[0].occurredAt);
  if (reservedAt == null || reservedAt > boundaryMs) return invalid('authority-not-reserved-before-effect', { reservedAt: reserved[0].occurredAt || null });

  return { ...chain, reservedEvent: reserved[0] };
}
