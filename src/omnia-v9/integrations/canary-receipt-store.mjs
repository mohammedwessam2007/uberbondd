const SHA256_HEX = /^[a-f0-9]{64}$/i;

export class CanaryReceiptStoreError extends Error {
  constructor(message, code = 'CANARY_RECEIPT_STORE_ERROR', detail = {}) {
    super(message);
    this.name = 'CanaryReceiptStoreError';
    this.code = code;
    this.detail = detail;
  }
}

function requireText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new CanaryReceiptStoreError(`${field} is required`, 'INVALID_INPUT', { field });
  return text;
}

function requireDigest(value, field) {
  const text = requireText(value, field).toLowerCase();
  if (!SHA256_HEX.test(text)) throw new CanaryReceiptStoreError(`${field} must be sha256 hex`, 'INVALID_INPUT', { field });
  return text;
}

/**
 * Durable, real-Postgres-backed store for null-sink receipts. One row per
 * reservation ID, enforced by a real primary key -- concurrent attempts to
 * persist a receipt for the same reservation are resolved atomically by
 * the database, not by application-level locking.
 */
export class CanaryReceiptStore {
  constructor({ pool } = {}) {
    if (!pool || typeof pool.query !== 'function') throw new CanaryReceiptStoreError('pool.query is required', 'CONFIG');
    this.pool = pool;
  }

  /**
   * Persists a receipt once per reservation. If a row already exists for
   * this reservationId:
   *  - identical receiptDigest AND authorizationDigest -> idempotent replay,
   *    returns the existing row (this is what a retried allowed action
   *    converges to -- one logical consequence, no duplicate).
   *  - different receiptDigest -> throws CONTRADICTORY_RECEIPT (two
   *    different simulated results for the same consequence).
   *  - different authorizationDigest -> throws CONFLICTING_AUTHORIZATION
   *    (two different authorization histories bound to the same
   *    consequence).
   */
  async persistOnce({ reservationId, intentDigest, authorizationDigest, tenantId, actionClass, result, receiptDigest, attemptedAt }) {
    reservationId = requireText(reservationId, 'reservationId');
    intentDigest = requireDigest(intentDigest, 'intentDigest');
    authorizationDigest = requireText(authorizationDigest, 'authorizationDigest');
    tenantId = requireText(tenantId, 'tenantId');
    actionClass = requireText(actionClass, 'actionClass');
    result = requireText(result, 'result');
    receiptDigest = requireDigest(receiptDigest, 'receiptDigest');
    attemptedAt = requireText(attemptedAt, 'attemptedAt');

    const inserted = await this.pool.query(
      `INSERT INTO omnia_v9_canary_null_receipts(
         reservation_id,intent_digest,authorization_digest,tenant_id,action_class,result,receipt_digest,attempted_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (reservation_id) DO NOTHING
       RETURNING *`,
      [reservationId, intentDigest, authorizationDigest, tenantId, actionClass, result, receiptDigest, attemptedAt]
    );
    if (inserted.rows?.[0]) return { inserted: true, duplicate: false, receipt: inserted.rows[0] };

    const existing = await this.pool.query(`SELECT * FROM omnia_v9_canary_null_receipts WHERE reservation_id=$1`, [reservationId]);
    const row = existing.rows?.[0];
    if (!row) throw new CanaryReceiptStoreError('receipt conflict without existing row', 'STORE_INCONSISTENT');
    if (row.receipt_digest !== receiptDigest) {
      throw new CanaryReceiptStoreError('contradictory receipt for the same reservation', 'CONTRADICTORY_RECEIPT', { reservationId, existing: row.receipt_digest, attempted: receiptDigest });
    }
    if (row.authorization_digest !== authorizationDigest) {
      throw new CanaryReceiptStoreError('conflicting authorization bound to the same reservation', 'CONFLICTING_AUTHORIZATION', { reservationId, existing: row.authorization_digest, attempted: authorizationDigest });
    }
    return { inserted: false, duplicate: true, receipt: row };
  }

  async getByReservationId(reservationId) {
    const result = await this.pool.query(`SELECT * FROM omnia_v9_canary_null_receipts WHERE reservation_id=$1`, [requireText(reservationId, 'reservationId')]);
    return result.rows?.[0] || null;
  }
}
