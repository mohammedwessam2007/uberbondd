import { Pool } from 'pg';
import { normalizePostalWebhookEvent } from '../../src/omnia-v9/integrations/providers/postal-webhook-evidence.mjs';
import { createPostgresPostalWebhookLedger } from '../../src/omnia-v9/integrations/providers/postal-webhook-ledger.mjs';

/**
 * The Postal webhook endpoint: the only way independent evidence about what a
 * self-hosted mail server actually did reaches this system.
 *
 * Mirrors api/webhooks/billing.mjs, including the parts that look like
 * over-caution and are not. The raw body is read once and verified before it is
 * parsed, because an RSA signature is over exact bytes and re-serializing JSON
 * changes them. A delivery that fails verification is still persisted -- as a
 * quarantined row, carrying only a digest, its reason and its timing -- because
 * knowing that someone posted an unsigned event to this endpoint is worth more
 * than a silent 401, and a quarantined row can never be selected for
 * reconciliation.
 *
 * Nothing here sends anything, releases a business key, or authorizes a resend.
 * It records what arrived.
 */

let pool;
function getPool(env) {
  if (!pool) pool = new Pool({ connectionString: env.DATABASE_URL, max: 2, idleTimeoutMillis: 10000 });
  return pool;
}

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

const MAX_BODY_BYTES = 1024 * 1024;

export function createFetchHandler(deps = {}) {
  const env = deps.env || process.env;
  const poolFactory = deps.getPool || getPool;
  const ledgerFactory = deps.createLedger || createPostgresPostalWebhookLedger;
  const normalize = deps.normalizePostalWebhookEvent || normalizePostalWebhookEvent;
  const now = deps.now || (() => new Date());

  return async function handler(request) {
    if (String(request?.method || '').toUpperCase() !== 'POST') {
      return json({ ok: false, status: 'REFUSED', reasonCodes: ['method-not-allowed'] }, 405);
    }
    // Without the public key nothing that arrives can be distinguished from
    // anything else that arrives, so the endpoint refuses rather than
    // accumulating rows it could never authenticate after the fact.
    if (!env.POSTAL_WEBHOOK_PUBLIC_KEY) {
      return json({ ok: false, status: 'REFUSED', reasonCodes: ['postal-webhook-public-key-not-configured'] }, 503);
    }
    if (!env.DATABASE_URL) {
      return json({ ok: false, status: 'REFUSED', reasonCodes: ['database-url-required'] }, 503);
    }

    let rawText;
    try { rawText = await request.text(); }
    catch { return json({ ok: false, status: 'REFUSED', reasonCodes: ['raw-body-read-failed'] }, 400); }
    if (Buffer.byteLength(rawText, 'utf8') > MAX_BODY_BYTES) {
      return json({ ok: false, status: 'REFUSED', reasonCodes: ['body-too-large'] }, 413);
    }

    const record = normalize({
      rawBody: Buffer.from(rawText, 'utf8'),
      signature: request.headers.get('x-postal-signature'),
      publicKey: env.POSTAL_WEBHOOK_PUBLIC_KEY,
      receivedAt: now()
    });

    let persisted;
    try {
      persisted = await ledgerFactory(poolFactory(env)).append(record);
    } catch {
      // Never echo the failure: it can carry connection strings.
      return json({ ok: false, status: 'REFUSED', reasonCodes: ['postal-webhook-not-durably-persisted'] }, 503);
    }

    const body = {
      ok: record.authenticated === true,
      status: persisted.status,
      duplicate: persisted.duplicate,
      occurrenceKey: persisted.occurrenceKey,
      lifecycle: record.lifecycle,
      quarantineReason: record.quarantineReason,
      reconciliationRequired: true,
      businessEffectAuthority: 'NONE'
    };
    // An unauthenticated delivery is recorded and then refused. Answering 200
    // would tell a forger their event was accepted, and the row it wrote is
    // quarantined and unusable either way.
    return json(body, record.authenticated ? 200 : 401);
  };
}

export const POST = createFetchHandler();
