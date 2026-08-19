import { verifyExecutionReceiptShadow } from './execution-receipt-shadow.mjs';

const SHA256_HEX = /^[a-f0-9]{64}$/i;

export class OmniaV9ExecutionReceiptStoreError extends Error {
  constructor(message, code = 'OMNIA_V9_EXECUTION_RECEIPT_STORE', detail = {}) {
    super(message);
    this.name = 'OmniaV9ExecutionReceiptStoreError';
    this.code = code;
    this.detail = detail;
  }
}

function requireText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new OmniaV9ExecutionReceiptStoreError(`${field} is required`, 'INVALID_INPUT', { field });
  return text;
}

function requireDigest(value, field) {
  const text = requireText(value, field).toLowerCase();
  if (!SHA256_HEX.test(text)) throw new OmniaV9ExecutionReceiptStoreError(`${field} must be sha256 hex`, 'INVALID_INPUT', { field });
  return text;
}

async function assertGenericProof(client, { receiptDigest, tenantId }) {
  const proofResult = await client.query(
    `SELECT object_id,digest,tenant_id,data FROM omnia_v9_objects
     WHERE object_type='EXECUTION_RECEIPT' AND object_id=$1 FOR SHARE`,
    [receiptDigest]
  );
  const proof = proofResult.rows?.[0];
  if (!proof || proof.digest !== receiptDigest || proof.tenant_id !== tenantId) {
    throw new OmniaV9ExecutionReceiptStoreError('generic proof ledger conflicts with receipt binding', 'PROOF_LEDGER_CONFLICT', { receiptDigest });
  }
  return proof;
}

export class OmniaV9ExecutionReceiptStore {
  constructor({ pool } = {}) {
    if (!pool || typeof pool.query !== 'function') throw new OmniaV9ExecutionReceiptStoreError('pool.query is required', 'CONFIG');
    this.pool = pool;
  }

  async _transaction(fn) {
    if (typeof this.pool.connect !== 'function') {
      await this.pool.query('BEGIN');
      try {
        const result = await fn(this.pool);
        await this.pool.query('COMMIT');
        return result;
      } catch (error) {
        await this.pool.query('ROLLBACK').catch(() => {});
        throw error;
      }
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release?.();
    }
  }

  async persistOnce({ tenantId, receipt }) {
    tenantId = requireText(tenantId, 'tenantId');
    const verification = verifyExecutionReceiptShadow(receipt);
    if (!verification.ok) {
      throw new OmniaV9ExecutionReceiptStoreError(`receipt verification failed: ${verification.reason}`, 'RECEIPT_INVALID', verification);
    }

    const reservationId = requireText(receipt?.reservation?.id, 'receipt.reservation.id');
    const receiptDigest = requireDigest(receipt?.receiptDigest, 'receipt.receiptDigest');
    const contextDigest = requireDigest(receipt?.preEffectContextDigest, 'receipt.preEffectContextDigest');
    const observationDigest = requireDigest(receipt?.preEffectObservationDigest, 'receipt.preEffectObservationDigest');
    const outcome = requireText(receipt?.outcome, 'receipt.outcome');

    return this._transaction(async client => {
      const inserted = await client.query(
        `INSERT INTO omnia_v9_execution_receipt_bindings(
           reservation_id,receipt_digest,tenant_id,outcome,
           pre_effect_context_digest,pre_effect_observation_digest,receipt
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         ON CONFLICT DO NOTHING
         RETURNING reservation_id,receipt_digest,tenant_id,outcome,pre_effect_context_digest,pre_effect_observation_digest,receipt,created_at`,
        [reservationId, receiptDigest, tenantId, outcome, contextDigest, observationDigest, JSON.stringify(receipt)]
      );

      let binding = inserted.rows?.[0] || null;
      if (!binding) {
        const existingByReservation = await client.query(
          `SELECT reservation_id,receipt_digest,tenant_id,outcome,pre_effect_context_digest,pre_effect_observation_digest,receipt,created_at
           FROM omnia_v9_execution_receipt_bindings WHERE reservation_id=$1 FOR UPDATE`,
          [reservationId]
        );
        binding = existingByReservation.rows?.[0] || null;
        if (binding) {
          if (binding.receipt_digest !== receiptDigest || binding.tenant_id !== tenantId) {
            throw new OmniaV9ExecutionReceiptStoreError(
              'reservation already has a different immutable execution receipt',
              'CONSEQUENCE_CONFLICT',
              { reservationId, existingReceiptDigest: binding.receipt_digest, attemptedReceiptDigest: receiptDigest }
            );
          }
          await assertGenericProof(client, { receiptDigest, tenantId });
          return { inserted: false, duplicate: true, binding };
        }

        const existingByDigest = await client.query(
          `SELECT reservation_id,receipt_digest,tenant_id FROM omnia_v9_execution_receipt_bindings
           WHERE receipt_digest=$1 FOR UPDATE`,
          [receiptDigest]
        );
        const digestBinding = existingByDigest.rows?.[0] || null;
        if (digestBinding) {
          throw new OmniaV9ExecutionReceiptStoreError(
            'receipt digest is already bound to a different consequence identity',
            'RECEIPT_IDENTITY_CONFLICT',
            { receiptDigest, existingReservationId: digestBinding.reservation_id, attemptedReservationId: reservationId }
          );
        }
        throw new OmniaV9ExecutionReceiptStoreError('receipt insert conflicted without resolvable binding', 'STORE_INCONSISTENT');
      }

      const proofInsert = await client.query(
        `INSERT INTO omnia_v9_objects(object_type,object_id,tenant_id,digest,data)
         VALUES ('EXECUTION_RECEIPT',$1,$2,$1,$3::jsonb)
         ON CONFLICT (object_type,object_id) DO NOTHING
         RETURNING object_id,digest,tenant_id`,
        [receiptDigest, tenantId, JSON.stringify(receipt)]
      );

      if (!proofInsert.rows?.length) await assertGenericProof(client, { receiptDigest, tenantId });
      return { inserted: true, duplicate: false, binding };
    });
  }

  async getByReservation(reservationId) {
    const result = await this.pool.query(
      `SELECT reservation_id,receipt_digest,tenant_id,outcome,pre_effect_context_digest,pre_effect_observation_digest,receipt,created_at
       FROM omnia_v9_execution_receipt_bindings WHERE reservation_id=$1`,
      [requireText(reservationId, 'reservationId')]
    );
    return result.rows?.[0] || null;
  }
}
