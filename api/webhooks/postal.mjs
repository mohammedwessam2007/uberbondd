import { Pool } from 'pg';
import { normalizePostalWebhookEvent } from '../../src/omnia-v9/integrations/providers/postal-webhook-evidence.mjs';
import { createPostgresPostalWebhookLedger } from '../../src/omnia-v9/integrations/providers/postal-webhook-ledger.mjs';

let pool;
function getPool(env) {
  if (!pool) pool = new Pool({ connectionString: env.DATABASE_URL, max: 2, idleTimeoutMillis: 10000 });
  return pool;
}
function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}

export function createFetchHandler(deps = {}) {
  const env = deps.env || process.env;
  const poolFactory = deps.getPool || getPool;
  const ledgerFactory = deps.createLedger || createPostgresPostalWebhookLedger;
  const now = deps.now || (() => new Date());
  return async function handler(request) {
    if (!env.POSTAL_WEBHOOK_PUBLIC_KEY) {
      return json({ ok: false, status: 'REFUSED', reasonCodes: ['postal-webhook-public-key-not-configured'] }, 503);
    }
    if (!env.DATABASE_URL) {
      return json({ ok: false, status: 'REFUSED', reasonCodes: ['database-url-required'] }, 503);
    }
    let raw;
    try { raw = Buffer.from(await request.arrayBuffer()); }
    catch { return json({ ok: false, status: 'REFUSED', reasonCodes: ['raw-body-read-failed'] }, 400); }
    if (raw.byteLength > 1024 * 1024) {
      return json({ ok: false, status: 'REFUSED', reasonCodes: ['body-too-large'] }, 413);
    }
    // Postal currently emits both a legacy SHA-1 X-Postal-Signature header and
    // X-Postal-Signature-256. This verifier is SHA-256, so only the explicit
    // SHA-256 header is admissible. Never silently reinterpret the legacy header.
    const event = normalizePostalWebhookEvent({
      rawBody: raw,
      signatureBase64: request.headers.get('x-postal-signature-256') || '',
      publicKeyPem: env.POSTAL_WEBHOOK_PUBLIC_KEY,
      receivedAt: now().toISOString()
    });
    let persisted;
    try {
      persisted = await ledgerFactory(poolFactory(env)).append(event);
    } catch {
      return json({ ok: false, status: 'REFUSED', reasonCodes: ['postal-webhook-not-durably-persisted'] }, 503);
    }
    if (!event.authenticated) {
      return json({
        ok: false,
        status: 'QUARANTINED',
        reasonCodes: ['postal-webhook-signature-invalid'],
        occurrenceKey: event.occurrenceKey,
        persistedStatus: persisted.status,
        businessEffectAuthority: 'NONE'
      }, 401);
    }
    return json({
      ok: true,
      status: event.quarantineReason ? 'QUARANTINED' : persisted.status,
      duplicate: persisted.duplicate,
      occurrenceKey: event.occurrenceKey,
      quarantineReason: event.quarantineReason,
      reconciliationRequired: event.eligibleForReconciliation === true,
      senderEvidenceAvailable: event.eligibleForSenderEvidence === true,
      businessEffectAuthority: 'NONE'
    }, 200);
  };
}

export const POST = createFetchHandler();
