// Read-only reader over already-verified payment events (P1-10). Never calls a payment provider,
// never reconciles, never mutates order/offer/delivery state, never issues a checkout or refund --
// it only lists orders rows that src/payments.mjs + src/revenue.mjs already verified via an
// HMAC-signature-checked webhook (source: 'verified-webhook'), an explicit owner confirmation
// (source: 'manual-owner'), or a gated test-mode simulation (source: 'test-simulation'). An
// unverified/redirect/screenshot/email claim never reaches paymentState:'paid' in the first place
// (the payment/revenue write path rejects any other verification source before that state is
// reachable), so this reader doesn't need to re-check source itself -- only to read the result.
export async function listVerifiedSignals({ store, since, limit = 25, signal } = {}) {
  if (!store) throw new Error('listVerifiedSignals requires a store');
  const sinceMs = since ? Date.parse(since) : 0;
  const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 25));
  signal?.throwIfAborted();
  const orders = await store.list('orders');
  signal?.throwIfAborted();
  // Oldest-first so that, if this batch is truncated by boundedLimit, the cursor only ever
  // advances past signals actually returned -- an out-of-order-arrival payment older than the new
  // cursor but not yet processed this batch is picked up on the next call, never skipped.
  orders.sort((a, b) => Date.parse(a.occurredAt || 0) - Date.parse(b.occurredAt || 0));
  const seen = new Set();
  const signals = [];
  let latestMs = Number.isFinite(sinceMs) ? sinceMs : 0;
  for (const order of orders) {
    if (order.paymentState !== 'paid') continue;
    if (order.processingStatus !== 'completed') continue;
    if (!order.providerEventId || seen.has(order.providerEventId)) continue;
    const occurredMs = Date.parse(order.occurredAt || 0);
    // Strictly after the cursor, not >=: the cursor itself marks the newest signal already
    // counted, so a payment exactly at that timestamp must never be recounted on the next cycle.
    if (Number.isFinite(sinceMs) && sinceMs > 0 && !(occurredMs > sinceMs)) continue;
    seen.add(order.providerEventId);
    signals.push({ providerEventId: order.providerEventId, occurredAt: order.occurredAt || null });
    if (Number.isFinite(occurredMs) && occurredMs > latestMs) latestMs = occurredMs;
    if (signals.length >= boundedLimit) break;
  }
  const latestOccurredAt = latestMs > 0 ? new Date(latestMs).toISOString() : (since || null);
  return { count: signals.length, truncated: signals.length >= boundedLimit, latestOccurredAt };
}
