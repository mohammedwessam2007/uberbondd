import { sha256 } from '../canonical.mjs';

export class ExternalEffectEvidenceStoreError extends Error {
  constructor(message, code = 'EXTERNAL_EFFECT_EVIDENCE_STORE_ERROR', detail = {}) {
    super(message);
    this.name = 'ExternalEffectEvidenceStoreError';
    this.code = code;
    this.detail = detail;
  }
}

function requireText(value, field) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw new ExternalEffectEvidenceStoreError(`${field} is required`, 'INVALID_INPUT', { field });
  return text;
}

const VALID_EVIDENCE_TYPES = new Set(['DISPATCH_RESPONSE', 'RECONCILIATION_LOOKUP', 'OWNER_ASSERTION']);
const VALID_LIFECYCLES = new Set(['ACCEPTED', 'REJECTED', 'UNCERTAIN', 'RECONCILED_ACCEPTED', 'RECONCILED_REJECTED', 'NOT_FOUND', 'AMBIGUOUS']);

function normalizeRow(row) {
  if (!row) return null;
  return {
    evidenceId: row.evidence_id,
    executionId: row.execution_id,
    provider: row.provider,
    accountIdentity: row.account_identity,
    businessIdentity: row.business_identity,
    providerReferenceId: row.provider_reference_id,
    observedAt: row.observed_at instanceof Date ? row.observed_at.toISOString() : String(row.observed_at),
    evidenceType: row.evidence_type,
    acquisitionMethod: row.acquisition_method,
    reconciliationSource: row.reconciliation_source,
    lifecycle: row.lifecycle,
    detail: row.detail,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
}

/**
 * Append-only store for provider evidence -- every fact this system has
 * ever learned about what a provider actually did, kept forever, never
 * overwritten. This is the durable record that lets recovery distinguish
 * "we know the provider accepted this" from "we have no idea" without ever
 * trusting a bare caller-supplied boolean (V9_EXECUTION_RECEIPT_SEMANTICS.md,
 * "provider receipt provenance"). Two contradictory pieces of evidence for
 * the same execution are both kept -- that contradiction is itself the
 * signal that routes to OWNER_REVIEW_REQUIRED, not something to resolve by
 * deleting one of them.
 */
export class ExternalEffectEvidenceStore {
  constructor({ pool } = {}) {
    if (!pool || typeof pool.query !== 'function') throw new ExternalEffectEvidenceStoreError('pool.query is required', 'CONFIG');
    this.pool = pool;
  }

  async append({
    executionId, provider, accountIdentity = '', businessIdentity, providerReferenceId = null,
    observedAt, evidenceType, acquisitionMethod, reconciliationSource = '', lifecycle, detail = {}
  }) {
    executionId = requireText(executionId, 'executionId');
    provider = requireText(provider, 'provider');
    businessIdentity = requireText(businessIdentity, 'businessIdentity');
    acquisitionMethod = requireText(acquisitionMethod, 'acquisitionMethod');
    observedAt = requireText(observedAt, 'observedAt');
    if (!VALID_EVIDENCE_TYPES.has(evidenceType)) throw new ExternalEffectEvidenceStoreError(`invalid evidenceType: ${evidenceType}`, 'INVALID_INPUT');
    if (!VALID_LIFECYCLES.has(lifecycle)) throw new ExternalEffectEvidenceStoreError(`invalid lifecycle: ${lifecycle}`, 'INVALID_INPUT');

    // JSON round-trip normalizes any non-plain value (e.g. a pg Date) inside
    // `detail` into a canonical.mjs-safe plain structure before hashing.
    const plainDetail = JSON.parse(JSON.stringify(detail ?? {}));
    const evidenceId = sha256({
      executionId, provider, accountIdentity, businessIdentity, providerReferenceId,
      observedAt, evidenceType, acquisitionMethod, reconciliationSource, lifecycle, detail: plainDetail,
      nonce: `${executionId}:${evidenceType}:${Date.now()}:${Math.random()}`
    });

    const result = await this.pool.query(
      `INSERT INTO omnia_v9_external_effect_provider_evidence(
         evidence_id,execution_id,provider,account_identity,business_identity,provider_reference_id,
         observed_at,evidence_type,acquisition_method,reconciliation_source,lifecycle,detail
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [evidenceId, executionId, provider, accountIdentity, businessIdentity, providerReferenceId,
        observedAt, evidenceType, acquisitionMethod, reconciliationSource, lifecycle, JSON.stringify(detail)]
    );
    return normalizeRow(result.rows[0]);
  }

  async listForExecution(executionId) {
    const result = await this.pool.query(
      `SELECT * FROM omnia_v9_external_effect_provider_evidence WHERE execution_id=$1 ORDER BY created_at ASC`,
      [requireText(executionId, 'executionId')]
    );
    return result.rows.map(normalizeRow);
  }

  async findByType(executionId, evidenceType) {
    const rows = await this.listForExecution(executionId);
    return rows.filter(row => row.evidenceType === evidenceType);
  }
}
