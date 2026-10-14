// PHOENIX N08: exact-count guarded single-statement registry history.
// Prior type-only 1000/5000 oldest-first LIMITs silently omitted later holds.
// The full typed history fits one SELECT snapshot (READ COMMITTED semantics).
// Before/after count detects mutation and unexpectedly partial/mock responses.
// A bounded ceiling fails closed, never returns a misleading "ready" subset.
// This interim general-store implementation scans one event type; a future
// indexed JSONB identity query can optimize it without changing its contract.
export const MAX_SENDING_REGISTRY_AUDIT_EVENTS = 100000;

export async function loadCompleteSendingRegistryEvents(store, eventType) {
  if (!store || typeof store.list !== 'function' || typeof store.count !== 'function') {
    throw new Error('sending-registry-history-verification-unavailable');
  }
  if (!['sending_mailbox_event', 'sending_domain_event'].includes(eventType)) {
    throw new Error('sending-registry-history-event-type-unrecognized');
  }
  const filters = { type: eventType };
  const before = await store.count('auditLog', filters);
  if (!Number.isSafeInteger(before) || before < 0 || before > MAX_SENDING_REGISTRY_AUDIT_EVENTS) {
    throw new Error('sending-registry-history-too-large-or-invalid-count');
  }
  // LIMIT n+1 is NOT a partial-history allowance. The final length must
  // equal the exact count or the caller receives an error (never an empty
  // "safe" history). Full history remains bounded to avoid memory exhaustion.
  const rows = await store.list('auditLog', {
    filters, orderBy: 'createdAt', direction: 'asc', limit: before + 1
  });
  const after = await store.count('auditLog', filters);
  if (!Array.isArray(rows) || rows.length !== before || after !== before) {
    throw new Error('sending-registry-history-incomplete-or-raced');
  }
  for (const row of rows) {
    if (row?.type !== eventType || !row.id ||
      !Number.isFinite(Date.parse(row.createdAt)) ||
      !row.detail || typeof row.detail !== 'object' ||
      typeof row.detail.kind !== 'string') {
      throw new Error('sending-registry-history-malformed-row');
    }
  }
  // Explicit total order, independent of PostgreSQL's handling of tied
  // created_at values. For same-time mixed PAUSED/RESUMED events, the
  // conservative pause wins; later timestamped owner resume is still honored.
  const rank = row => row.detail.kind === 'RETIRED' || row.detail.kind === 'PAUSED' ? 1 : 0;
  rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) ||
    rank(a) - rank(b) || String(a.id).localeCompare(String(b.id)));
  return rows.map(row => row.detail);
}
