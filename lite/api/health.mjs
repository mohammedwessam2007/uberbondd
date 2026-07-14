import { q, ensureSchema } from '../lib/db.mjs';
import { sendJson, handleError } from '../lib/http.mjs';

export function createHandler(deps = {}) {
  const query = deps.query || q;
  const ensure = deps.ensure || (() => ensureSchema(query));
  const env = deps.env || process.env;

  return async function handler(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' }, { allow: 'GET' });
    try {
      if (!env.DATABASE_URL) {
        const error = new Error('DATABASE_URL is not configured');
        error.code = 'no_database';
        error.status = 503;
        throw error;
      }
      await ensure();
      await query('SELECT 1 AS ok');
      return sendJson(res, 200, {
        ok: true,
        app: 'uberbond-cash-engine-lite',
        databaseConfigured: true,
        databaseReachable: true,
        time: new Date().toISOString()
      });
    } catch (error) {
      if (!error.status) error.status = 503;
      return handleError(res, error, 'health');
    }
  };
}

export default createHandler();
