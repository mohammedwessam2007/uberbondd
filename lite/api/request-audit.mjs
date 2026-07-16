import {
  q, ensureSchema, createOrGetAuditRequest,
  countRecentRequestsByRequester, countRecentRequestsByEmail, countActiveRequests
} from '../lib/db.mjs';
import { readJson, requesterHash, sendJson, handleError } from '../lib/http.mjs';
import { parseEmail, parseWebsite, LiteInputError } from '../lib/validate.mjs';
import { createReportToken, hashToken, isTokenShape } from '../lib/tokens.mjs';
import { getLimits, decideAuditRateLimit } from '../lib/rate-limit.mjs';
import { emitQueueDiagnostic } from '../lib/queue-diagnostics.mjs';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function createHandler(deps = {}) {
  const query = deps.query || q;
  const ensure = deps.ensure || (() => ensureSchema(query));
  const lookup = deps.lookup || null;
  const nowFn = deps.now || (() => Date.now());
  const env = deps.env || process.env;
  const diagnoseQueue = deps.diagnoseQueue || emitQueueDiagnostic;
  const logger = deps.logger || console;

  return async function handler(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' }, { allow: 'POST' });
    try {
      await ensure();
      const body = await readJson(req);
      const email = parseEmail(body.email);
      const site = await parseWebsite(body.website, { lookup });
      const requester = requesterHash(req);
      const now = nowFn();
      const limits = getLimits();
      const [perIpCount, perEmailCount, activeCount] = await Promise.all([
        countRecentRequestsByRequester(query, requester, new Date(now - HOUR)),
        countRecentRequestsByEmail(query, email, new Date(now - DAY)),
        countActiveRequests(query)
      ]);
      const gate = decideAuditRateLimit({ perIpCount, perEmailCount, activeCount }, limits);
      if (!gate.allowed) return sendJson(res, 429, { ok: false, error: gate.message, reason: gate.reason });

      const suppliedToken = String(body.reportToken ?? '');
      if (suppliedToken && (!isTokenShape(suppliedToken) || suppliedToken.length < 40)) {
        throw new LiteInputError('The secure report link could not be created. Please try again.');
      }
      const token = suppliedToken || createReportToken();
      const request = await createOrGetAuditRequest(query, {
        websiteUrl: site.href,
        domain: site.domain,
        email,
        tokenHash: hashToken(token),
        requesterHash: requester
      });
      // A successful response already requires the INSERT above to finish.
      // This temporary, non-secret log proves which queue received the row.
      if (env.DATABASE_URL) {
        try {
          await diagnoseQueue({
            query,
            databaseUrl: env.DATABASE_URL,
            source: 'vercel-submit',
            inserted: request.created,
            logger
          });
        } catch {
          // Diagnostics are best-effort and must not turn a stored request into
          // a misleading HTTP failure that encourages duplicate submissions.
        }
      }
      return sendJson(res, 200, {
        ok: true,
        status: 'queued',
        processingStage: request.created ? 'request_accepted' : 'waiting_for_audit_worker',
        duplicate: !request.created,
        domain: site.domain,
        reportPath: `/r/${token}`,
        note: 'Audits run automatically on a schedule. Your report is usually ready within the hour.'
      });
    } catch (error) {
      return handleError(res, error, 'request-audit');
    }
  };
}

export default createHandler();
