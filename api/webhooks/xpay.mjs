import { Pool } from 'pg';
import { verifyXPayWebhook } from '../../src/xpay-webhook-boundary.mjs';
import { persistVerifiedBillingEvent } from '../../src/billing-webhook-repository.mjs';

let pool;
const json = (body, status = 200) => Response.json(body, { status,
  headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
export function createFetchHandler(deps = {}) {
  const env = deps.env || process.env;
  const getPool = deps.getPool || (() => pool ||= new Pool({ connectionString: env.DATABASE_URL, max: 2 }));
  const persist = deps.persistVerifiedBillingEvent || persistVerifiedBillingEvent;
  const now = deps.now || Date.now;
  return async request => {
    if (request.method !== 'POST') return json({ ok: false, reasonCodes: ['method-not-allowed'] }, 405);
    if (!env.DATABASE_URL || !env.XPAY_WEBHOOK_SECRET || !['test', 'live'].includes(env.XPAY_WEBHOOK_ENVIRONMENT)) {
      return json({ ok: false, reasonCodes: ['xpay-endpoint-not-configured'] }, 503);
    }
    const chunks = []; let size = 0;
    try {
      if (request.body) for await (const chunk of request.body) {
        size += chunk.length;
        if (size > 1024 * 1024) return json({ ok: false, reasonCodes: ['body-too-large'] }, 413);
        chunks.push(Buffer.from(chunk));
      }
    } catch { return json({ ok: false, reasonCodes: ['raw-body-read-failed'] }, 400); }
    const verified = verifyXPayWebhook({ rawBody: Buffer.concat(chunks), signature: request.headers.get('xpay-signature'),
      signingSecret: env.XPAY_WEBHOOK_SECRET, environment: env.XPAY_WEBHOOK_ENVIRONMENT, now: now() });
    if (!verified.ok) return json(verified, verified.httpStatus);
    try {
      const result = await persist(getPool(), verified.event, { receivedAt: new Date(now()) });
      return json({ ok: true, status: result.status, duplicate: result.duplicate,
        reconciliationRequired: true, commercialTruthEligible: false, businessEffectAuthority: 'NONE' });
    } catch { return json({ ok: false, reasonCodes: ['verified-webhook-not-durably-persisted'] }, 503); }
  };
}
export const POST = createFetchHandler();
