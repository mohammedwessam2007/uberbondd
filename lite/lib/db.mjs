import crypto from 'node:crypto';
import { Pool } from 'pg';
import { SCHEMA_SQL } from './schema.mjs';

let pool = null;

export function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL || '';
  if (!url) {
    const error = new Error('DATABASE_URL is not configured');
    error.status = 503;
    error.code = 'no_database';
    throw error;
  }
  const local = /localhost|127\.0\.0\.1/.test(url);
  const sslDisabled = /sslmode=disable/i.test(url);
  pool = new Pool({
    connectionString: url,
    max: 1, // serverless-safe: one connection per function instance
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: local || sslDisabled ? false : { rejectUnauthorized: true }
  });
  return pool;
}

export async function q(text, params = []) {
  return getPool().query(text, params);
}

let schemaReady = null;
// Idempotent (CREATE ... IF NOT EXISTS) so the app self-provisions on first use.
export async function ensureSchema(runner = q) {
  if (!schemaReady) {
    schemaReady = Promise.resolve(runner(SCHEMA_SQL)).catch(error => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export async function closePool() {
  if (pool) { await pool.end(); pool = null; }
  schemaReady = null;
}

const id = () => crypto.randomUUID();

export const PROCESSING_STAGES = Object.freeze([
  'waiting_for_audit_worker',
  'loading_website',
  'testing_desktop_experience',
  'testing_mobile_experience',
  'checking_links_and_conversion_paths',
  'generating_findings',
  'preparing_report',
  'completed',
  'failed_after_retries'
]);
const PROCESSING_STAGE_SET = new Set(PROCESSING_STAGES);

// ---- Audit requests -------------------------------------------------------

export async function createAuditRequest(query, { websiteUrl, domain, email, tokenHash, requesterHash }) {
  const requestId = id();
  await query(
    `INSERT INTO lite_audit_requests (id, website_url, domain, email, status, report_token_hash, requester_hash)
     VALUES ($1, $2, $3, $4, 'queued', $5, $6)`,
    [requestId, websiteUrl, domain, email, tokenHash, requesterHash]
  );
  return requestId;
}

// Idempotent submission path used by Cash Engine Lite. A caller-supplied,
// high-entropy report token lets a safe browser retry recover the same private
// report link without storing the raw capability token in PostgreSQL.
export async function createOrGetAuditRequest(query, { websiteUrl, domain, email, tokenHash, requesterHash }) {
  const requestId = id();
  const inserted = await query(
    `INSERT INTO lite_audit_requests
       (id, website_url, domain, email, status, processing_stage, report_token_hash, requester_hash)
     VALUES ($1, $2, $3, $4, 'queued', 'waiting_for_audit_worker', $5, $6)
     ON CONFLICT (report_token_hash) DO NOTHING
     RETURNING id`,
    [requestId, websiteUrl, domain, email, tokenHash, requesterHash]
  );
  if (inserted.rows[0]?.id) return { id: inserted.rows[0].id, created: true };

  const existing = await query(
    `SELECT id, website_url, domain, email, requester_hash
       FROM lite_audit_requests
      WHERE report_token_hash = $1`,
    [tokenHash]
  );
  const row = existing.rows[0];
  if (row && row.website_url === websiteUrl && row.domain === domain && row.email === email && row.requester_hash === requesterHash) {
    return { id: row.id, created: false };
  }
  const error = new Error('Please retry the submission with a fresh report link.');
  error.status = 409;
  throw error;
}

export async function countRecentRequestsByRequester(query, requesterHash, since) {
  const res = await query(
    'SELECT COUNT(*)::int AS n FROM lite_audit_requests WHERE requester_hash = $1 AND created_at > $2',
    [requesterHash, since]
  );
  return res.rows[0]?.n ?? 0;
}

export async function countRecentRequestsByEmail(query, email, since) {
  const res = await query(
    'SELECT COUNT(*)::int AS n FROM lite_audit_requests WHERE email = $1 AND created_at > $2',
    [email, since]
  );
  return res.rows[0]?.n ?? 0;
}

export async function countActiveRequests(query) {
  const res = await query("SELECT COUNT(*)::int AS n FROM lite_audit_requests WHERE status IN ('queued','running')");
  return res.rows[0]?.n ?? 0;
}

// Mark stale, retry-exhausted work as failed before claiming new work.
export async function sweepStaleRequests(query, { staleBefore, maxAttempts }) {
  const res = await query(
    `UPDATE lite_audit_requests
        SET status = 'failed', processing_stage = 'failed_after_retries', locked_at = NULL,
            last_error = COALESCE(last_error, 'audit timed out'), updated_at = now()
      WHERE status = 'running' AND locked_at < $1 AND attempts >= $2`,
    [staleBefore, maxAttempts]
  );
  // `rowCount` is node-postgres' convention; PGlite (used in tests) reports the
  // same number under `affectedRows` instead. Support both so this is accurate
  // whether it runs against Neon in production or PGlite in tests.
  return res.rowCount ?? res.affectedRows ?? 0;
}

export async function claimNextAudit(query, { staleBefore, maxAttempts }) {
  const res = await query(
    `UPDATE lite_audit_requests
        SET status = 'running', processing_stage = 'loading_website',
            locked_at = now(), attempts = attempts + 1, updated_at = now()
      WHERE id = (
        SELECT id FROM lite_audit_requests
         WHERE (status = 'queued' AND attempts < $2)
            OR (status = 'running' AND locked_at < $1 AND attempts < $2)
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, website_url, domain, email, attempts`,
    [staleBefore, maxAttempts]
  );
  return res.rows[0] || null;
}

export async function updateAuditStage(query, requestId, stage) {
  if (!PROCESSING_STAGE_SET.has(stage) || stage === 'completed' || stage === 'failed_after_retries') {
    throw new TypeError(`Unsupported active audit stage: ${stage}`);
  }
  await query(
    `UPDATE lite_audit_requests
        SET processing_stage = $2, updated_at = now()
      WHERE id = $1 AND status = 'running'`,
    [requestId, stage]
  );
}

export async function completeAudit(query, { requestId, domain, score, summary, findings }) {
  await query(
    `INSERT INTO lite_reports (id, request_id, domain, score, summary, findings)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
     ON CONFLICT (request_id) DO UPDATE
       SET score = EXCLUDED.score, summary = EXCLUDED.summary, findings = EXCLUDED.findings`,
    [id(), requestId, domain, score, JSON.stringify(summary), JSON.stringify(findings)]
  );
  await query(
    `UPDATE lite_audit_requests
        SET status = 'done', processing_stage = 'completed', completed_at = now(),
            updated_at = now(), locked_at = NULL, last_error = NULL
      WHERE id = $1`,
    [requestId]
  );
}

export async function failAudit(query, { requestId, error, maxAttempts }) {
  const res = await query(
    `UPDATE lite_audit_requests
        SET status = CASE WHEN attempts >= $3 THEN 'failed' ELSE 'queued' END,
            processing_stage = CASE WHEN attempts >= $3 THEN 'failed_after_retries' ELSE 'waiting_for_audit_worker' END,
            last_error = $2, locked_at = NULL, updated_at = now()
      WHERE id = $1
      RETURNING status`,
    [requestId, String(error || 'unknown error').slice(0, 400), maxAttempts]
  );
  return res.rows[0]?.status || null;
}

export async function getReportByTokenHash(query, tokenHash) {
  const res = await query(
    `SELECT r.id, r.domain, r.status, r.processing_stage, r.attempts, r.created_at, r.completed_at,
            p.score, p.summary, p.findings, p.created_at AS report_created_at
       FROM lite_audit_requests r
  LEFT JOIN lite_reports p ON p.request_id = r.id
      WHERE r.report_token_hash = $1`,
    [tokenHash]
  );
  return res.rows[0] || null;
}

// ---- Leads ----------------------------------------------------------------

export async function createLead(query, { requestId, email, name, message, requesterHash }) {
  const leadId = id();
  await query(
    `INSERT INTO lite_leads (id, request_id, email, name, message, requester_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [leadId, requestId, email, name, message, requesterHash || '']
  );
  return leadId;
}

export async function createImplementationRequest(query, {
  requestId, email, name, message, requesterHash,
  selectedIssueCode = null, serviceInterest = null, sourcePage = 'private_report'
}) {
  const issue = String(selectedIssueCode || '').trim().slice(0, 120) || null;
  const service = String(serviceInterest || '').trim().slice(0, 200) || null;
  const source = String(sourcePage || 'private_report').trim().slice(0, 80) || 'private_report';
  const dedupeKey = crypto.createHash('sha256')
    .update(JSON.stringify([requestId, String(email).toLowerCase(), issue || '', service || '']))
    .digest('hex');
  const leadId = id();
  const inserted = await query(
    `INSERT INTO lite_leads
       (id, request_id, email, name, message, selected_issue_code, service_interest,
        status, source_page, dedupe_key, requester_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9, $10)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [leadId, requestId, email, name, message, issue, service, source, dedupeKey, requesterHash || '']
  );
  if (inserted.rows[0]?.id) return { id: inserted.rows[0].id, created: true };
  const existing = await query('SELECT id FROM lite_leads WHERE dedupe_key = $1', [dedupeKey]);
  if (!existing.rows[0]?.id) throw new Error('Implementation request deduplication failed.');
  return { id: existing.rows[0].id, created: false };
}

export async function countRecentLeadsByRequester(query, requesterHash, since) {
  const res = await query(
    'SELECT COUNT(*)::int AS n FROM lite_leads WHERE requester_hash = $1 AND created_at > $2',
    [requesterHash, since]
  );
  return res.rows[0]?.n ?? 0;
}

export async function pendingLeads(query, limit = 20) {
  const res = await query(
    `SELECT l.id, l.email, l.name, l.message, l.selected_issue_code,
            l.service_interest, l.status, l.source_page, l.created_at,
            r.domain, r.website_url
       FROM lite_leads l
       JOIN lite_audit_requests r ON r.id = l.request_id
      WHERE l.owner_notified = false
      ORDER BY l.created_at
      LIMIT $1`,
    [limit]
  );
  return res.rows;
}

export async function markLeadNotified(query, leadId) {
  await query('UPDATE lite_leads SET owner_notified = true WHERE id = $1', [leadId]);
}
