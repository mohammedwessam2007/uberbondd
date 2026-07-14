import {
  q, ensureSchema, getReportByTokenHash, createLead, countRecentLeadsByRequester
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

      const lead = parseLeadInput(body);
      const email = lead.email; // request email stays server-side; the form asks for a reachable address
      if (!email) throw new LiteInputError('Please include an email so we can reply.');

      const leadId = await createLead(query, {
        requestId: row.id,
        email,
        name: lead.name,
        message: lead.message,
        requesterHash: requester
      });

      const result = await notify({
        subject: `New implementation lead — ${row.domain}`,
        text: [
          `Website: ${row.domain}`,
          `Lead email: ${email}`,
          lead.name ? `Name: ${lead.name}` : null,
          lead.message ? `Message:\n${lead.message}` : null,
          `Report status: ${row.status}`
        ].filter(Boolean).join('\n')
      });
      if (result?.ok) await markNotified(leadId);

      return sendJson(res, 200, { ok: true, message: 'Thank you — your request is in. UberBond will reply personally, usually within one business day.' });
    } catch (error) {
      return handleError(res, error, 'interest');
    }
  };
}

export default createHandler();
