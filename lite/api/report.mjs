import { q, ensureSchema, getReportByTokenHash } from '../lib/db.mjs';
import { sendJson, handleError } from '../lib/http.mjs';
import { hashToken, isTokenShape } from '../lib/tokens.mjs';

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
          report: { domain: row.domain, score: row.score, summary, findings, createdAt: row.report_created_at || row.completed_at }
        });
      }
      if (row.status === 'failed') {
        return sendJson(res, 200, {
          ok: true,
          status: 'failed',
          domain: row.domain,
          message: 'We could not complete this audit automatically. The site may block crawlers or be temporarily unreachable.'
        });
      }
      return sendJson(res, 200, { ok: true, status: row.status, domain: row.domain, requestedAt: row.created_at });
    } catch (error) {
      return handleError(res, error, 'report');
    }
  };
}

export default createHandler();
