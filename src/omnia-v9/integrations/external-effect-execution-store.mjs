import { isLegalTransition, isTerminal } from './external-effect-state-machine.mjs';

const SHA256_HEX = /^[a-f0-9]{64}$/i;

export class ExternalEffectExecutionStoreError extends Error {
  constructor(message, code = 'EXTERNAL_EFFECT_EXECUTION_STORE_ERROR', detail = {}) {
    super(message);
    this.name = 'ExternalEffectExecutionStoreError';
    this.code = code;
    this.detail = detail;
  }
}

function requireText(value, field) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw new ExternalEffectExecutionStoreError(`${field} is required`, 'INVALID_INPUT', { field });
  return text;
}

function requireDigest(value, field) {
  const text = requireText(value, field).toLowerCase();
  if (!SHA256_HEX.test(text)) throw new ExternalEffectExecutionStoreError(`${field} must be sha256 hex`, 'INVALID_INPUT', { field });
  return text;
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    executionId: row.execution_id,
    actionIntentDigest: row.action_intent_digest,
    authorizationDigest: row.authorization_digest,
    tenantId: row.tenant_id,
    operation: row.operation,
    resource: row.resource,
    businessKey: row.business_key,
    provider: row.provider,
    providerEffectIdentity: row.provider_effect_identity,
    attemptNumber: Number(row.attempt_number),
    status: row.status,
    constitutionDigest: row.constitution_digest,
    policyDigest: row.policy_digest,
    approvalId: row.approval_id,
    consequenceClass: row.consequence_class,
    providerReferenceId: row.provider_reference_id,
    reason: row.reason,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

/**
 * Durable, real-Postgres-backed store for external-effect execution objects.
 * Every write either succeeds exactly as requested or is rejected -- by a
 * unique constraint (duplicate business key while a prior attempt is still
 * active/unresolved), by the database transition-guard trigger (illegal
 * from->to), or by this class's own optimistic-concurrency check
 * (expectedFromStatus mismatch). There is no path in this class that
 * silently overwrites or reinterprets a durable execution's history.
 */
export class ExternalEffectExecutionStore {
  constructor({ pool } = {}) {
    if (!pool || typeof pool.query !== 'function') throw new ExternalEffectExecutionStoreError('pool.query is required', 'CONFIG');
    this.pool = pool;
  }

  /**
   * Persists the durable execution-intent object in PREPARED state. This is
   * the object that must exist before any provider call is even possible
   * (V9_EXTERNAL_EFFECT_PROTOCOL.md). Throws BUSINESS_KEY_ALREADY_ACTIVE if
   * an unresolved or already-dispatched execution already owns this
   * business key -- this is what makes "at most one active external effect
   * per logical consequence" a database-enforced fact, not an application
   * promise.
   */
  async prepare({
    executionId, actionIntentDigest, authorizationDigest, tenantId, operation, resource,
    businessKey, provider, providerEffectIdentity, approvalId, constitutionDigest, policyDigest,
    consequenceClass, attemptNumber = 1
  }) {
    executionId = requireText(executionId, 'executionId');
    actionIntentDigest = requireDigest(actionIntentDigest, 'actionIntentDigest');
    authorizationDigest = requireText(authorizationDigest, 'authorizationDigest');
    tenantId = requireText(tenantId, 'tenantId');
    operation = requireText(operation, 'operation');
    resource = requireText(resource, 'resource');
    businessKey = requireText(businessKey, 'businessKey');
    provider = requireText(provider, 'provider');
    providerEffectIdentity = requireText(providerEffectIdentity, 'providerEffectIdentity');
    approvalId = requireText(approvalId, 'approvalId');
    constitutionDigest = requireText(constitutionDigest, 'constitutionDigest');
    policyDigest = requireText(policyDigest, 'policyDigest');
    consequenceClass = requireText(consequenceClass, 'consequenceClass');

    try {
      const result = await this.pool.query(
        `INSERT INTO omnia_v9_external_effect_executions(
           execution_id,action_intent_digest,authorization_digest,tenant_id,operation,resource,
           business_key,provider,provider_effect_identity,attempt_number,status,
           constitution_digest,policy_digest,approval_id,consequence_class
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PREPARED',$11,$12,$13,$14)
         RETURNING *`,
        [executionId, actionIntentDigest, authorizationDigest, tenantId, operation, resource,
          businessKey, provider, providerEffectIdentity, attemptNumber,
          constitutionDigest, policyDigest, approvalId, consequenceClass]
      );
      return normalizeRow(result.rows[0]);
    } catch (error) {
      if (error?.code === '23505') {
        throw new ExternalEffectExecutionStoreError(
          'an active execution already exists for this business key',
          'BUSINESS_KEY_ALREADY_ACTIVE',
          { businessKey }
        );
      }
      throw error;
    }
  }

  /**
   * Transitions an execution's status. expectedFromStatus is an optimistic
   * lock: if the row's current status does not match, this returns
   * {applied:false, current} rather than throwing, so callers (including
   * concurrent recovery workers) can decide what to do with a state that
   * moved out from under them. The database trigger is the final backstop
   * against illegal transitions even if a caller computes expectedFromStatus
   * incorrectly.
   */
  async transition({ executionId, toStatus, reason = '', expectedFromStatus, providerReferenceId }) {
    executionId = requireText(executionId, 'executionId');
    toStatus = requireText(toStatus, 'toStatus');
    if (expectedFromStatus !== undefined && !isLegalTransition(expectedFromStatus, toStatus)) {
      throw new ExternalEffectExecutionStoreError(
        `illegal transition requested: ${expectedFromStatus} -> ${toStatus}`,
        'ILLEGAL_TRANSITION',
        { from: expectedFromStatus, to: toStatus }
      );
    }
    const params = [executionId, toStatus, reason];
    let query = `UPDATE omnia_v9_external_effect_executions SET status=$2, reason=$3`;
    if (providerReferenceId !== undefined) {
      query += `, provider_reference_id=$4 WHERE execution_id=$1`;
      params.push(providerReferenceId);
    } else {
      query += ` WHERE execution_id=$1`;
    }
    if (expectedFromStatus !== undefined) {
      query += ` AND status=$${params.length + 1}`;
      params.push(expectedFromStatus);
    }
    query += ' RETURNING *';
    const result = await this.pool.query(query, params);
    if (result.rows[0]) return { applied: true, execution: normalizeRow(result.rows[0]) };
    const current = await this.getById(executionId);
    return { applied: false, execution: current };
  }

  async getById(executionId) {
    const result = await this.pool.query(
      `SELECT * FROM omnia_v9_external_effect_executions WHERE execution_id=$1`,
      [requireText(executionId, 'executionId')]
    );
    return normalizeRow(result.rows[0]);
  }

  async findActiveByBusinessKey(businessKey) {
    const result = await this.pool.query(
      `SELECT * FROM omnia_v9_external_effect_executions WHERE business_key=$1 AND status <> 'ABORTED_BEFORE_DISPATCH'`,
      [requireText(businessKey, 'businessKey')]
    );
    return normalizeRow(result.rows[0]);
  }

  /**
   * Claims a bounded batch of unresolved executions for recovery, using
   * FOR UPDATE SKIP LOCKED so that concurrent recovery workers naturally
   * partition the unresolved set instead of racing on the same rows --
   * this is the concurrency primitive behind "recovery is idempotent under
   * concurrent workers" (V9_EXECUTION_RECOVERY_REPORT.md). The caller must
   * process and commit its own transition for each returned row promptly;
   * this method itself does not hold the lock beyond the query if not
   * wrapped in an explicit transaction by the caller.
   */
  async claimUnresolvedForRecovery({ statuses, limit = 50 }) {
    const result = await this.pool.query(
      `SELECT * FROM omnia_v9_external_effect_executions
       WHERE status = ANY($1::text[])
       ORDER BY updated_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [statuses, limit]
    );
    return result.rows.map(normalizeRow);
  }

  isTerminal(status) {
    return isTerminal(status);
  }

  /**
   * Runs `fn` against a store instance bound to one dedicated client inside
   * an explicit BEGIN/COMMIT. Required for claimUnresolvedForRecovery's
   * `FOR UPDATE SKIP LOCKED` to actually hold a row lock across the
   * claim-then-process sequence: a bare pool.query() releases its row locks
   * the instant that single statement completes, which would make
   * concurrent recovery workers race rather than partition. Only
   * meaningful when this.pool is a real pg Pool (has .connect()); throws
   * otherwise so a misuse is loud rather than silently unsafe.
   */
  async withTransaction(fn) {
    if (typeof this.pool.connect !== 'function') {
      throw new ExternalEffectExecutionStoreError('withTransaction requires a pg Pool (pool.connect)', 'CONFIG');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const scoped = new ExternalEffectExecutionStore({ pool: client });
      const result = await fn(scoped, client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
