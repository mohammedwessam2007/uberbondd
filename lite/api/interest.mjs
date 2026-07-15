import {
  q, ensureSchema, getReportByTokenHash, createImplementationRequest, countRecentLeadsByRequester
} from '../lib/db.mjs';
import { readJson, requesterHash, sendJson, handleError } from '../lib/http.mjs';
import { parseLeadInput, LiteInputError } from '../lib/validate.mjs';
import { hashToken, isTokenShape } from '../lib/tokens.mjs';
import { getLimits, decideLeadRateLimit } from '../lib/rate-limit.mjs';
import { sendOwnerEmail } from '../lib/email.mjs';

const HOUR = 60 * 60 * 1000;

export function createHandler(deps = {}) {
  const query = deps.query || q;
  const ensure = deps.ensure || (() => ensureSchema(query));
  const notify = deps.notify || sendOwnerEmail;
  const nowFn = deps.now || (() => Date.now());
  const markNotified = deps.markNotified || (async (leadId) => {
    await query('UPDATE lite_leads SET owner_notified = true WHERE id = $1', [leadId]);
  });

  return async function handler(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' }, { allow: 'POST' });
    try {
      await ensure();
      const body = await readJson(req);
      const token = String(body.token ?? '');
      if (!isTokenShape(token)) throw new LiteInputError('Missing or invalid report token.');

      const requester = requesterHash(req);
      const limits = getLimits();
      const perIpCount = await countRecentLeadsByRequester(query, requester, new Date(nowFn() - HOUR));
      const gate = decideLeadRateLimit({ perIpCount }, limits);
      if (!gate.allowed) return sendJson(res, 429, { ok: false, error: gate.message });

      const row = await getReportByTokenHash(query, hashToken(token));
      if (!row) return sendJson(res, 404, { ok: false, error: 'Report not found.' });
      if (row.status !== 'done' || row.score == null) {
        return sendJson(res, 409, { ok: false, error: 'Please wait until the audit report is complete before requesting implementation.' });
      }

      const lead = parseLeadInput(body);
      const email = lead.email; // request email stays server-side; the form asks for a reachable address
      if (!email) throw new LiteInputError('Please include an email so we can reply.');

      const findings = typeof row.findings === 'string' ? JSON.parse(row.findings) : (row.findings || []);
      const selectedIssueCode = String(body.selectedIssueCode ?? '').trim();
      if (selectedIssueCode && !/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(selectedIssueCode)) {
        throw new LiteInputError('Please choose a listed report priority.');
      }
      const selectedFinding = selectedIssueCode
        ? findings.find(finding => finding?.code === selectedIssueCode)
        : null;
      if (selectedIssueCode && !selectedFinding) {
        throw new LiteInputError('That report priority is not available. Please refresh the report and try again.');
      }
      const serviceInterest = selectedFinding?.service || 'General implementation review';

      const stored = await createImplementationRequest(query, {
        requestId: row.id,
        email,
        name: lead.name,
        message: lead.message,
        requesterHash: requester,
        selectedIssueCode: selectedFinding?.code || null,
        serviceInterest,
        sourcePage: 'private_report'
      });

      if (!stored.created) {
        return sendJson(res, 200, {
          ok: true,
          duplicate: true,
          message: 'Your implementation request was already received. UberBond will reply personally, usually within one business day.'
        });
      }

      try {
        const result = await notify({
          subject: `New implementation lead — ${row.domain}`,
          text: [
            `Website: ${row.domain}`,
            `Lead email: ${email}`,
            lead.name ? `Name: ${lead.name}` : null,
            selectedFinding ? `Selected issue: ${selectedFinding.title}` : null,
            `Service interest: ${serviceInterest}`,
            lead.message ? `Message:\n${lead.message}` : null,
            `Report status: ${row.status}`
          ].filter(Boolean).join('\n')
        });
        if (result?.ok) await markNotified(stored.id);
        else console.warn(`[interest] owner notification unavailable for implementation request ${stored.id}; request remains stored`);
      } catch {
        console.warn(`[interest] owner notification failed for implementation request ${stored.id}; request remains stored`);
      }

      return sendJson(res, 200, {
        ok: true,
        duplicate: false,
        message: 'Thank you — your implementation request is stored. UberBond will reply personally, usually within one business day.'
      });
    } catch (error) {
      return handleError(res, error, 'interest');
    }
  };
}

export default createHandler();
