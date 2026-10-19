// UberWarm ingress fence: a fail-closed send precondition that needs no
// cross-provider credential.
//
// Winnr adverse events (bounce/complaint) land in the Supabase private ingress
// ledger. The canonical stop list lives in the UberBond primary Postgres
// `suppressions` table. Until every adverse ingress event is copied into the
// canonical table, sending must stop. The Supabase receiver publishes only an
// aggregate, PII-free adverse-event count over HTTPS; the sender compares that
// count with the count it has already reconciled. Any gap, any unreadable or
// stale health response, or a webhook that is not enabled for adverse events
// keeps the fence at HOLD. The fence can only ever add a hold. It never grants
// send authority, never clears a suppression and never resumes a mailbox.

export const UBERWARM_INGRESS_FENCE_VERSION = 'uberwarm.ingress-fence.v1';
export const INGRESS_FENCE_STATES = Object.freeze({ CLEAR: 'CLEAR', HOLD: 'HOLD' });
export const REQUIRED_ADVERSE_EVENTS = Object.freeze(['email.bounced', 'email.complained']);
export const DEFAULT_INGRESS_URL = 'https://lslifasfebpjbtqmkitm.supabase.co/functions/v1/uberwarm-winnr-receiver';
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function evaluateIngressFence({
  ingressHealth = null,
  webhook = null,
  canonicalReconciliation = null,
  expectedUrl = DEFAULT_INGRESS_URL,
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_AGE_MS
} = {}) {
  const hold = [];
  const nowMs = new Date(now).getTime();

  if (!ingressHealth || typeof ingressHealth !== 'object') hold.push('ingress-health-unavailable');
  else {
    const observedMs = Date.parse(ingressHealth.observedAt || '');
    if (!Number.isFinite(observedMs)) hold.push('ingress-health-observation-time-missing');
    else if (nowMs - observedMs > maxAgeMs || observedMs - nowMs > 60_000) hold.push('ingress-health-stale');
    if (ingressHealth.httpReady !== true) hold.push('ingress-not-http-ready');
    if (ingressHealth.signingConfigured !== true) hold.push('ingress-signing-not-configured');
    if (ingressHealth.databaseReadback !== true) hold.push('ingress-database-readback-failed');
    if (ingressHealth.outboundAuthority !== 'NONE') hold.push('ingress-claims-outbound-authority');
    if (count(ingressHealth.adverseEventCount) === null) hold.push('ingress-adverse-count-unknown');
  }

  if (!webhook || typeof webhook !== 'object') hold.push('provider-webhook-unknown');
  else {
    if (webhook.status !== 'enabled') hold.push(`provider-webhook-not-enabled:${String(webhook.status || 'UNKNOWN').slice(0, 40)}`);
    if (webhook.url !== expectedUrl) hold.push('provider-webhook-url-mismatch');
    const events = Array.isArray(webhook.events) ? webhook.events : [];
    for (const type of REQUIRED_ADVERSE_EVENTS) if (!events.includes(type)) hold.push(`provider-webhook-missing-event:${type}`);
    if (!(Number(webhook.consecutive_failures) === 0)) hold.push('provider-webhook-delivery-failures');
  }

  const ingressCount = count(ingressHealth?.adverseEventCount);
  const reconciledCount = count(canonicalReconciliation?.reconciledAdverseEventCount);
  if (reconciledCount === null) hold.push('canonical-reconciliation-unknown');
  else if (ingressCount !== null && reconciledCount < ingressCount) hold.push('unreconciled-adverse-ingress-events');
  else if (ingressCount !== null && reconciledCount > ingressCount) hold.push('canonical-ahead-of-ingress-inconsistent');

  const reasons = [...new Set(hold)];
  return {
    version: UBERWARM_INGRESS_FENCE_VERSION,
    state: reasons.length ? INGRESS_FENCE_STATES.HOLD : INGRESS_FENCE_STATES.CLEAR,
    holdReasonCodes: reasons,
    ingressAdverseEventCount: ingressCount,
    reconciledAdverseEventCount: reconciledCount,
    sendAuthority: 'NONE',
    truthBoundary: 'CLEAR only means no adverse ingress event is known to be missing from the canonical stop list at observation time. It is one precondition, never send authority.'
  };
}

// Reads the receiver's public GET. Every failure mode returns null so the fence
// holds; an unreachable receiver is never treated as an empty suppression list.
export async function readIngressHealth({ url = DEFAULT_INGRESS_URL, fetchImpl = globalThis.fetch, timeoutMs = 8000, now = () => new Date() } = {}) {
  if (typeof fetchImpl !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: 'GET', signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response || response.status !== 200) return null;
    const type = String(response.headers?.get?.('content-type') || '');
    if (!type.includes('application/json')) return null;
    const body = await response.json();
    if (!body || typeof body !== 'object' || body.service !== 'uberwarm-ingress') return null;
    return { ...body, observedAt: new Date(now()).toISOString() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
