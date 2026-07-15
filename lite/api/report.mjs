import { q, ensureSchema, getReportByTokenHash } from '../lib/db.mjs';
import { sendJson, handleError } from '../lib/http.mjs';
import { hashToken, isTokenShape } from '../lib/tokens.mjs';

const PUBLIC_STAGES = new Set([
  'waiting_for_audit_worker', 'loading_website',
  'testing_desktop_experience', 'testing_mobile_experience',
  'checking_links_and_conversion_paths', 'generating_findings',
  'preparing_report', 'completed', 'failed_after_retries'
]);

function publicStage(row) {
  if (PUBLIC_STAGES.has(row.processing_stage)) return row.processing_stage;
  if (row.status === 'done') return 'completed';
  if (row.status === 'failed') return 'failed_after_retries';
  return row.status === 'running' ? 'loading_website' : 'waiting_for_audit_worker';
}

function tokenFrom(req) {
  if (req.query?.token) return String(req.query.token);
  try { return new URL(req.url, 'http://localhost').searchParams.get('token') || ''; }
  catch { return ''; }
}

export function createHandler(deps = {}) {
  const query = deps.query || q;
  const ensure = deps.ensure || (() => ensureSchema(query));

  return async function handler(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' }, { allow: 'GET' });
    try {
      const token = tokenFrom(req);
      if (!isTokenShape(token)) return sendJson(res, 400, { ok: false, error: 'Invalid report token.' });
      await ensure();
      const row = await getReportByTokenHash(query, hashToken(token));
      if (!row) return sendJson(res, 404, { ok: false, error: 'Report not found. Check the link and try again.' });

      if (row.status === 'done' && row.score != null) {
        const summary = typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary;
        const findings = typeof row.findings === 'string' ? JSON.parse(row.findings) : row.findings;
        return sendJson(res, 200, {
          ok: true,
          status: 'done',
          processingStage: 'completed',
          report: { domain: row.domain, score: row.score, summary, findings, createdAt: row.report_created_at || row.completed_at }
        });
      }
      if (row.status === 'failed') {
        return sendJson(res, 200, {
          ok: true,
          status: 'failed',
          processingStage: 'failed_after_retries',
          domain: row.domain,
          message: 'We could not complete this audit after the available retries. The site may block automated checks or be temporarily unreachable.'
        });
      }
      return sendJson(res, 200, {
        ok: true,
        status: row.status,
        processingStage: publicStage(row),
        domain: row.domain,
        requestedAt: row.created_at
      });
    } catch (error) {
      return handleError(res, error, 'report');
    }
  };
}

export default createHandler();
