import { verifyAuthorizationBoundExecutionReceipt } from './authorization-bound-receipt.mjs';

export class OmniaV9AuthorizationBoundReceiptStoreError extends Error {
  constructor(message, code = 'OMNIA_V9_AUTHORIZATION_BOUND_RECEIPT_STORE', detail = {}) {
    super(message);
    this.name = 'OmniaV9AuthorizationBoundReceiptStoreError';
    this.code = code;
    this.detail = detail;
  }
}

export class OmniaV9AuthorizationBoundReceiptStore {
  constructor({ pool } = {}) {
    if (!pool || typeof pool.query !== 'function') {
      throw new OmniaV9AuthorizationBoundReceiptStoreError('pool.query is required', 'CONFIG');
    }
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

  async persistOnce({ binding, intent, authorizationDecision, executionReceipt }) {
    const verification = verifyAuthorizationBoundExecutionReceipt(binding, { intent, authorizationDecision, executionReceipt });
    if (!verification.ok) {
      throw new OmniaV9AuthorizationBoundReceiptStoreError(`authorization binding verification failed: ${verification.reason}`, 'BINDING_INVALID', verification);
    }

    return this._transaction(async client => {
      const receiptRow = await client.query(
        `SELECT reservation_id,receipt_digest,tenant_id FROM omnia_v9_execution_receipt_bindings
         WHERE reservation_id=$1 AND receipt_digest=$2 FOR SHARE`,
        [binding.consequence.reservationId, binding.consequence.receiptDigest]
      );
      const persistedReceipt = receiptRow.rows?.[0] || null;
      if (!persistedReceipt) {
        throw new OmniaV9AuthorizationBoundReceiptStoreError('underlying immutable P6 receipt binding is missing', 'RECEIPT_BINDING_MISSING');
      }
      if (persistedReceipt.tenant_id !== binding.tenantId) {
        throw new OmniaV9AuthorizationBoundReceiptStoreError('P6 receipt tenant disagrees with P7 authorization binding', 'TENANT_CONFLICT');
      }

      const inserted = await client.query(
        `INSERT INTO omnia_v9_execution_authorization_bindings(
           reservation_id,receipt_digest,binding_digest,tenant_id,intent_digest,
           authorization_decision_digest,approval_id,policy_version,policy_digest,
           constitution_digest,binding
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
         ON CONFLICT (reservation_id) DO NOTHING
         RETURNING reservation_id,receipt_digest,binding_digest,tenant_id,intent_digest,
                   authorization_decision_digest,approval_id,policy_version,policy_digest,
                   constitution_digest,binding,created_at`,
        [
          binding.consequence.reservationId,
          binding.consequence.receiptDigest,
          binding.bindingDigest,
          binding.tenantId,
          binding.intentDigest,
          binding.authorizationDecisionDigest,
          binding.approvalId,
          binding.policyVersion,
          binding.policyDigest,
          binding.constitutionDigest,
          JSON.stringify(binding)
        ]
      );

      let row = inserted.rows?.[0] || null;
      if (!row) {
        const existing = await client.query(
          `SELECT reservation_id,receipt_digest,binding_digest,tenant_id,intent_digest,
                  authorization_decision_digest,approval_id,policy_version,policy_digest,
                  constitution_digest,binding,created_at
           FROM omnia_v9_execution_authorization_bindings WHERE reservation_id=$1 FOR UPDATE`,
          [binding.consequence.reservationId]
        );
        row = existing.rows?.[0] || null;
        if (!row) {
          throw new OmniaV9AuthorizationBoundReceiptStoreError('authorization binding conflict without durable winner', 'STORE_INCONSISTENT');
        }
        if (row.binding_digest !== binding.bindingDigest) {
          throw new OmniaV9AuthorizationBoundReceiptStoreError(
            'reservation already has a different immutable authorization binding',
            'AUTHORIZATION_BINDING_CONFLICT',
            { reservationId: binding.consequence.reservationId, existingBindingDigest: row.binding_digest, attemptedBindingDigest: binding.bindingDigest }
          );
        }
        return { inserted: false, duplicate: true, binding: row };
      }

      const proofInsert = await client.query(
        `INSERT INTO omnia_v9_objects(object_type,object_id,tenant_id,digest,data)
         VALUES ('EXECUTION_AUTHORIZATION_BINDING',$1,$2,$1,$3::jsonb)
         ON CONFLICT (object_type,object_id) DO NOTHING
         RETURNING object_id,digest,tenant_id`,
        [binding.bindingDigest, binding.tenantId, JSON.stringify(binding)]
      );

      if (!proofInsert.rows?.length) {
        const existingProof = await client.query(
          `SELECT object_id,digest,tenant_id,data FROM omnia_v9_objects
           WHERE object_type='EXECUTION_AUTHORIZATION_BINDING' AND object_id=$1 FOR SHARE`,
          [binding.bindingDigest]
        );
        const proof = existingProof.rows?.[0];
        if (!proof || proof.digest !== binding.bindingDigest || proof.tenant_id !== binding.tenantId) {
          throw new OmniaV9AuthorizationBoundReceiptStoreError('generic proof ledger conflicts with authorization binding', 'PROOF_LEDGER_CONFLICT');
        }
      }

      return { inserted: true, duplicate: false, binding: row };
    });
  }

  async getByReservation(reservationId) {
    const result = await this.pool.query(
      `SELECT reservation_id,receipt_digest,binding_digest,tenant_id,intent_digest,
              authorization_decision_digest,approval_id,policy_version,policy_digest,
              constitution_digest,binding,created_at
       FROM omnia_v9_execution_authorization_bindings WHERE reservation_id=$1`,
      [String(reservationId || '')]
    );
    return result.rows?.[0] || null;
  }
}
