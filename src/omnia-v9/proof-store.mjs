import { digestObject } from './canonical.mjs';
import { approvalCoversIntent, verifyApproval, verifyIntent } from './kernel.mjs';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const PROOF_TYPES = new Set([
  'ACTION_INTENT',
  'OWNER_APPROVAL',
  'EVIDENCE_RECORD',
  'AUTHORIZATION_DECISION',
  'EXECUTION_RECEIPT'
]);
const FINAL_RESERVATION_STATES = new Set(['COMMITTED', 'UNCERTAIN', 'RELEASED', 'DENIED']);
const FINALIZABLE_OUTCOMES = new Set(['COMMITTED', 'UNCERTAIN', 'RELEASED']);
const CONTENT_DIGEST_FIELDS = new Map([
  ['ACTION_INTENT', 'intentDigest'],
  ['OWNER_APPROVAL', 'approvalDigest'],
  ['EVIDENCE_RECORD', 'evidenceDigest'],
  ['AUTHORIZATION_DECISION', 'decisionDigest'],
  ['EXECUTION_RECEIPT', 'receiptDigest']
]);
const CONTENT_ID_FIELDS = new Map([
  ['ACTION_INTENT', 'intentDigest'],
  ['OWNER_APPROVAL', 'approvalId'],
  ['EVIDENCE_RECORD', 'evidenceId'],
  ['AUTHORIZATION_DECISION', 'decisionDigest'],
  ['EXECUTION_RECEIPT', 'receiptDigest']
]);
const DIGEST_OMISSIONS = new Map([
  ['ACTION_INTENT', ['intentDigest']],
  ['OWNER_APPROVAL', ['approvalDigest', 'signature']],
  ['EVIDENCE_RECORD', ['evidenceDigest']],
  ['AUTHORIZATION_DECISION', ['decisionDigest']],
  ['EXECUTION_RECEIPT', ['receiptDigest']]
]);

export class OmniaV9ProofStoreError extends Error {
  constructor(message, code = 'OMNIA_V9_PROOF_STORE', detail = {}) {
    super(message);
    this.name = 'OmniaV9ProofStoreError';
    this.code = code;
    this.detail = detail;
  }
}

function requireString(value, name) {
  const text = String(value || '').trim();
  if (!text) throw new OmniaV9ProofStoreError(`${name} is required`, 'INVALID_INPUT', { field: name });
  return text;
}

function requireDigest(value, name = 'digest') {
  const text = requireString(value, name).toLowerCase();
  if (!SHA256_HEX.test(text)) throw new OmniaV9ProofStoreError(`${name} must be sha256 hex`, 'INVALID_INPUT', { field: name });
  return text;
}

function requireNonNegativeFinite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new OmniaV9ProofStoreError(`${name} must be finite and nonnegative`, 'INVALID_INPUT', { field: name });
  return number;
}

function requirePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new OmniaV9ProofStoreError(`${name} must be a positive integer`, 'INVALID_INPUT', { field: name });
  return number;
}

function sameMoney(a, b) {
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= 1e-9;
}

function approvalLimits(approval) {
  return {
    maxUses: requirePositiveInteger(approval?.maxUses, 'approval.maxUses'),
    maxCostUsd: requireNonNegativeFinite(approval?.maxCostUsd, 'approval.maxCostUsd'),
    maxBlastRadius: requireNonNegativeFinite(approval?.maxBlastRadius, 'approval.maxBlastRadius')
  };
}

function approvalActiveAt(approval, now) {
  const nowMs = now.getTime();
  const notBefore = Date.parse(approval?.notBefore);
  const expiresAt = Date.parse(approval?.expiresAt);
  if (!Number.isFinite(notBefore) || !Number.isFinite(expiresAt)) return { ok: false, reason: 'approval-invalid-time' };
  if (notBefore > nowMs) return { ok: false, reason: 'approval-not-yet-valid' };
  if (expiresAt <= nowMs) return { ok: false, reason: 'approval-expired' };
  return { ok: true };
}

function recomputeContentDigest(objectType, data) {
  const omissions = DIGEST_OMISSIONS.get(objectType);
  if (!omissions) throw new OmniaV9ProofStoreError(`no digest algorithm registered for ${objectType}`, 'UNSUPPORTED_PROOF_TYPE');
  try {
    return digestObject(data, omissions);
  } catch (error) {
    throw new OmniaV9ProofStoreError(`cannot canonicalize ${objectType}: ${String(error?.message || error)}`, 'DIGEST_BINDING');
  }
}

export class OmniaV9ProofStore {
  constructor({ pool, keyResolver } = {}) {
    if (!pool || typeof pool.query !== 'function') throw new OmniaV9ProofStoreError('pool.query is required', 'CONFIG');
    this.pool = pool;
    this.keyResolver = keyResolver;
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

  async putObject({ objectType, objectId, tenantId, digest, data }) {
    objectType = requireString(objectType, 'objectType');
    if (!PROOF_TYPES.has(objectType)) throw new OmniaV9ProofStoreError(`unsupported objectType ${objectType}`, 'INVALID_INPUT');
    objectId = requireString(objectId, 'objectId');
    tenantId = requireString(tenantId, 'tenantId');
    digest = requireDigest(digest);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new OmniaV9ProofStoreError('data must be an object', 'INVALID_INPUT');
    if (Object.prototype.hasOwnProperty.call(data, 'tenantId') && data.tenantId !== tenantId) {
      throw new OmniaV9ProofStoreError('database tenant must equal signed/content tenant', 'TENANT_BINDING');
    }

    const digestField = CONTENT_DIGEST_FIELDS.get(objectType);
    if (data[digestField] !== digest) throw new OmniaV9ProofStoreError(`object digest must equal data.${digestField}`, 'DIGEST_BINDING');
    const recomputed = recomputeContentDigest(objectType, data);
    if (recomputed !== digest) throw new OmniaV9ProofStoreError(`stored content does not recompute to ${digestField}`, 'DIGEST_BINDING');
    const idField = CONTENT_ID_FIELDS.get(objectType);
    if (data[idField] !== objectId) throw new OmniaV9ProofStoreError(`objectId must equal data.${idField}`, 'IDENTITY_BINDING');

    const inserted = await this.pool.query(
      `INSERT INTO omnia_v9_objects(object_type,object_id,tenant_id,digest,data)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (object_type,object_id) DO NOTHING
       RETURNING object_type,object_id,tenant_id,digest,data,created_at`,
      [objectType, objectId, tenantId, digest, JSON.stringify(data)]
    );
    if (inserted.rows?.[0]) return { inserted: true, object: inserted.rows[0] };

    const existing = await this.pool.query(
      `SELECT object_type,object_id,tenant_id,digest,data,created_at
       FROM omnia_v9_objects WHERE object_type=$1 AND object_id=$2`,
      [objectType, objectId]
    );
    const row = existing.rows?.[0];
    if (!row) throw new OmniaV9ProofStoreError('proof object conflict without existing row', 'STORE_INCONSISTENT');
    if (row.digest !== digest || row.tenant_id !== tenantId) {
      throw new OmniaV9ProofStoreError('proof object is immutable and conflicts with existing content', 'IMMUTABLE_CONFLICT', { objectType, objectId });
    }
    return { inserted: false, object: row };
  }

  async getObject(objectType, objectId) {
    const result = await this.pool.query(
      `SELECT object_type,object_id,tenant_id,digest,data,created_at
       FROM omnia_v9_objects WHERE object_type=$1 AND object_id=$2`,
      [requireString(objectType, 'objectType'), requireString(objectId, 'objectId')]
    );
    return result.rows?.[0] || null;
  }

  async revoke({ targetType, targetId, revocationId, tenantId, reason, evidenceDigest = null, revokedAt = null }) {
    targetType = requireString(targetType, 'targetType');
    if (!PROOF_TYPES.has(targetType)) throw new OmniaV9ProofStoreError(`unsupported targetType ${targetType}`, 'INVALID_INPUT');
    targetId = requireString(targetId, 'targetId');
    revocationId = requireString(revocationId, 'revocationId');
    tenantId = requireString(tenantId, 'tenantId');
    reason = requireString(reason, 'reason');
    if (evidenceDigest != null) evidenceDigest = requireDigest(evidenceDigest, 'evidenceDigest');

    return this._transaction(async client => {
      const targetResult = await client.query(
        `SELECT tenant_id FROM omnia_v9_objects WHERE object_type=$1 AND object_id=$2 FOR UPDATE`,
        [targetType, targetId]
      );
      const target = targetResult.rows?.[0];
      if (!target) throw new OmniaV9ProofStoreError('revocation target does not exist', 'TARGET_NOT_FOUND', { targetType, targetId });
      if (target.tenant_id !== tenantId) throw new OmniaV9ProofStoreError('revocation tenant does not match target tenant', 'TENANT_MISMATCH');

      const result = await client.query(
        `INSERT INTO omnia_v9_revocations(target_type,target_id,revocation_id,tenant_id,reason,evidence_digest,revoked_at)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()))
         ON CONFLICT (target_type,target_id) DO NOTHING
         RETURNING *`,
        [targetType, targetId, revocationId, tenantId, reason, evidenceDigest, revokedAt]
      );
      if (result.rows?.[0]) return { inserted: true, revocation: result.rows[0] };
      const existing = await client.query(
        `SELECT * FROM omnia_v9_revocations WHERE target_type=$1 AND target_id=$2`,
        [targetType, targetId]
      );
      return { inserted: false, revocation: existing.rows?.[0] || null };
    });
  }

  async isRevoked(targetType, targetId) {
    const result = await this.pool.query(
      `SELECT 1 FROM omnia_v9_revocations WHERE target_type=$1 AND target_id=$2 LIMIT 1`,
      [requireString(targetType, 'targetType'), requireString(targetId, 'targetId')]
    );
    return Boolean(result.rows?.length);
  }

  async getApprovalUsage(approvalId) {
    const result = await this.pool.query(
      `SELECT approval_id,tenant_id,uses,cost_usd,updated_at FROM omnia_v9_approval_usage WHERE approval_id=$1`,
      [requireString(approvalId, 'approvalId')]
    );
    const row = result.rows?.[0];
    return row ? {
      approvalId: row.approval_id,
      tenantId: row.tenant_id,
      uses: Number(row.uses),
      costUsd: Number(row.cost_usd),
      updatedAt: row.updated_at
    } : null;
  }

  async reserveAuthority({ approvalId, tenantId, intentDigest, idempotencyKey, useDelta = 1, costDeltaUsd = 0, blastRadius = 0, now = new Date() }) {
    approvalId = requireString(approvalId, 'approvalId');
    tenantId = requireString(tenantId, 'tenantId');
    intentDigest = requireDigest(intentDigest, 'intentDigest');
    idempotencyKey = requireString(idempotencyKey, 'idempotencyKey');
    useDelta = requirePositiveInteger(useDelta, 'useDelta');
    costDeltaUsd = requireNonNegativeFinite(costDeltaUsd, 'costDeltaUsd');
    blastRadius = requireNonNegativeFinite(blastRadius, 'blastRadius');
    if (useDelta !== 1) throw new OmniaV9ProofStoreError('P1 reserves exactly one action per intent', 'INVALID_INPUT');
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new OmniaV9ProofStoreError('now must be valid Date', 'INVALID_INPUT');

    return this._transaction(async client => {
      const firstInsert = await client.query(
        `INSERT INTO omnia_v9_authority_reservations(idempotency_key,intent_digest,approval_id,tenant_id,use_delta,cost_delta_usd,blast_radius,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING')
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [idempotencyKey, intentDigest, approvalId, tenantId, useDelta, costDeltaUsd, blastRadius]
      );

      if (!firstInsert.rows?.length) {
        const existing = await client.query(
          `SELECT * FROM omnia_v9_authority_reservations WHERE idempotency_key=$1 FOR UPDATE`,
          [idempotencyKey]
        );
        const row = existing.rows?.[0];
        if (!row) throw new OmniaV9ProofStoreError('idempotency conflict without row', 'STORE_INCONSISTENT');
        if (row.intent_digest !== intentDigest || row.approval_id !== approvalId || row.tenant_id !== tenantId) {
          throw new OmniaV9ProofStoreError('idempotency key already belongs to different authority reservation', 'IDEMPOTENCY_CONFLICT');
        }
        return {
          ok: row.status === 'RESERVED' || row.status === 'COMMITTED' || row.status === 'UNCERTAIN',
          duplicate: true,
          reservation: row
        };
      }

      const intentResult = await client.query(
        `SELECT tenant_id,digest,data FROM omnia_v9_objects
         WHERE object_type='ACTION_INTENT' AND object_id=$1 FOR SHARE`,
        [intentDigest]
      );
      const intentRow = intentResult.rows?.[0];
      if (!intentRow) return this._denyReservation(client, idempotencyKey, 'intent-not-found');
      if (intentRow.tenant_id !== tenantId) return this._denyReservation(client, idempotencyKey, 'intent-tenant-mismatch');
      const intent = intentRow.data;
      if (intentRow.digest !== intentDigest || intent?.intentDigest !== intentDigest) return this._denyReservation(client, idempotencyKey, 'intent-storage-digest-mismatch');
      const intentVerification = verifyIntent(intent, { now });
      if (!intentVerification.ok) return this._denyReservation(client, idempotencyKey, `intent-unverified:${intentVerification.errors.join('|')}`);
      if (intent.tenantId !== tenantId) return this._denyReservation(client, idempotencyKey, 'intent-content-tenant-mismatch');
      if (intent.idempotencyKey !== idempotencyKey) return this._denyReservation(client, idempotencyKey, 'intent-idempotency-mismatch');
      if (!sameMoney(intent.maxCostUsd, costDeltaUsd)) return this._denyReservation(client, idempotencyKey, 'intent-cost-mismatch');
      if (Number(intent.blastRadius) !== blastRadius) return this._denyReservation(client, idempotencyKey, 'intent-blast-radius-mismatch');

      const intentRevoked = await client.query(
        `SELECT 1 FROM omnia_v9_revocations
         WHERE target_type='ACTION_INTENT' AND target_id=$1 AND tenant_id=$2 LIMIT 1`,
        [intentDigest, tenantId]
      );
      if (intentRevoked.rows?.length) return this._denyReservation(client, idempotencyKey, 'intent-revoked');

      const approvalResult = await client.query(
        `SELECT tenant_id,digest,data FROM omnia_v9_objects
         WHERE object_type='OWNER_APPROVAL' AND object_id=$1 FOR SHARE`,
        [approvalId]
      );
      const approvalRow = approvalResult.rows?.[0];
      if (!approvalRow) return this._denyReservation(client, idempotencyKey, 'approval-not-found');
      if (approvalRow.tenant_id !== tenantId) return this._denyReservation(client, idempotencyKey, 'approval-tenant-mismatch');

      const approval = approvalRow.data;
      if (approvalRow.digest !== approval?.approvalDigest) return this._denyReservation(client, idempotencyKey, 'approval-storage-digest-mismatch');
      const approvalVerification = verifyApproval(approval, { now, keyResolver: this.keyResolver });
      if (!approvalVerification.ok) return this._denyReservation(client, idempotencyKey, `approval-unverified:${approvalVerification.errors.join('|')}`);
      const active = approvalActiveAt(approval, now);
      if (!active.ok) return this._denyReservation(client, idempotencyKey, active.reason);

      const revoked = await client.query(
        `SELECT 1 FROM omnia_v9_revocations
         WHERE target_type='OWNER_APPROVAL' AND target_id=$1 AND tenant_id=$2 LIMIT 1`,
        [approvalId, tenantId]
      );
      if (revoked.rows?.length) return this._denyReservation(client, idempotencyKey, 'approval-revoked');

      const limits = approvalLimits(approval);
      if (blastRadius > limits.maxBlastRadius) return this._denyReservation(client, idempotencyKey, 'blast-radius-exceeded');

      await client.query(
        `INSERT INTO omnia_v9_approval_usage(approval_id,tenant_id,uses,cost_usd)
         VALUES ($1,$2,0,0)
         ON CONFLICT (approval_id) DO NOTHING`,
        [approvalId, tenantId]
      );
      const usageResult = await client.query(
        `SELECT approval_id,tenant_id,uses,cost_usd
         FROM omnia_v9_approval_usage WHERE approval_id=$1 FOR UPDATE`,
        [approvalId]
      );
      const usage = usageResult.rows?.[0];
      if (!usage || usage.tenant_id !== tenantId) return this._denyReservation(client, idempotencyKey, 'usage-tenant-mismatch');

      const scope = approvalCoversIntent(approval, intent, { uses: Number(usage.uses), costUsd: Number(usage.cost_usd) });
      if (!scope.ok) return this._denyReservation(client, idempotencyKey, `approval-scope:${scope.errors.join('|')}`);

      const nextUses = Number(usage.uses) + 1;
      const nextCost = Number(usage.cost_usd) + Number(intent.maxCostUsd);
      if (!Number.isSafeInteger(nextUses) || nextUses > limits.maxUses) return this._denyReservation(client, idempotencyKey, 'uses-exhausted');
      if (!Number.isFinite(nextCost) || nextCost > limits.maxCostUsd + 1e-9) return this._denyReservation(client, idempotencyKey, 'cost-budget-exhausted');

      await client.query(
        `UPDATE omnia_v9_approval_usage
         SET uses=$2,cost_usd=$3,updated_at=now()
         WHERE approval_id=$1`,
        [approvalId, nextUses, nextCost]
      );
      const reserved = await client.query(
        `UPDATE omnia_v9_authority_reservations
         SET status='RESERVED',updated_at=now()
         WHERE idempotency_key=$1
         RETURNING *`,
        [idempotencyKey]
      );
      return {
        ok: true,
        duplicate: false,
        reservation: reserved.rows[0],
        usage: { uses: nextUses, costUsd: nextCost }
      };
    });
  }

  async _denyReservation(client, idempotencyKey, reason) {
    const result = await client.query(
      `UPDATE omnia_v9_authority_reservations
       SET status='DENIED',reason=$2,updated_at=now()
       WHERE idempotency_key=$1
       RETURNING *`,
      [idempotencyKey, reason]
    );
    return { ok: false, reason, reservation: result.rows?.[0] || null };
  }

  async finalizeAuthorityReservation({ idempotencyKey, outcome, reason = '' }) {
    idempotencyKey = requireString(idempotencyKey, 'idempotencyKey');
    outcome = requireString(outcome, 'outcome').toUpperCase();
    if (!FINALIZABLE_OUTCOMES.has(outcome)) throw new OmniaV9ProofStoreError(`invalid final outcome ${outcome}`, 'INVALID_INPUT');

    return this._transaction(async client => {
      const result = await client.query(
        `SELECT * FROM omnia_v9_authority_reservations WHERE idempotency_key=$1 FOR UPDATE`,
        [idempotencyKey]
      );
      const row = result.rows?.[0];
      if (!row) return { ok: false, reason: 'reservation-not-found' };
      if (FINAL_RESERVATION_STATES.has(row.status)) {
        return { ok: row.status !== 'DENIED', duplicate: true, reservation: row };
      }
      if (row.status !== 'RESERVED') throw new OmniaV9ProofStoreError(`cannot finalize reservation from ${row.status}`, 'INVALID_STATE');

      if (outcome === 'RELEASED') {
        await client.query(
          `UPDATE omnia_v9_approval_usage
           SET uses=GREATEST(0,uses-$2),cost_usd=GREATEST(0,cost_usd-$3),updated_at=now()
           WHERE approval_id=$1`,
          [row.approval_id, Number(row.use_delta), Number(row.cost_delta_usd)]
        );
      }

      const updated = await client.query(
        `UPDATE omnia_v9_authority_reservations
         SET status=$2,reason=$3,updated_at=now()
         WHERE idempotency_key=$1
         RETURNING *`,
        [idempotencyKey, outcome, reason]
      );
      return { ok: true, duplicate: false, reservation: updated.rows[0] };
    });
  }
}
