import { ConflictError } from './store.mjs';

// Time-boxed recovery for outboundReservations left stuck by an interrupted
// worker. Reuses the exact reservation state machine already defined in
// store.mjs (reserved -> dispatching -> sent/uncertain/cancelled); it never
// invents a parallel model. Every decision is a pure state transition on an
// existing row plus one audit receipt via the existing store.log() writer.
// This module never calls a provider and never mutates anything except a
// reservation's own status/recovery fields.
//
// Concurrency note: markOutboundReservation's underlying patch is applied
// unconditionally (no compare-and-swap), so two concurrent sweeps racing on
// the same row both converge on the same final status -- safe to apply
// twice. The only thing that must not happen twice is the audit receipt and
// its counted decision, so those are deduplicated via the store's existing
// deterministic-id uniqueness constraint (the same mechanism already used
// for suppressions/replies/jobs) rather than a bespoke lock. This avoids
// nesting a second store.transaction() inside the caller's, which the
// PostgreSQL backend does not support.

// Bump when the recovery policy changes so past receipts stay attributable.
export const RECOVERY_POLICY_VERSION = 'reservation-recovery-1.0.0';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_LIMIT = 200;

function isStale(referenceMs, timestamp, timeoutMs) {
  const stamp = Date.parse(timestamp || '');
  if (!Number.isFinite(stamp)) return null;
  return referenceMs - stamp > timeoutMs;
}

// Pure classification: given the status a reservation was found in, decide
// what a safe recovery transition looks like. Exported so tests and callers
// can reason about the state machine without re-deriving it.
export function classifyStaleReservation(status) {
  if (status === 'reserved') {
    // The pipeline only ever calls the provider after the 'dispatching'
    // transition (and only after a final guard recheck passes). A reservation
    // still sitting at 'reserved' proves the provider was never reached, so
    // releasing it is a known-safe, known-no-send outcome.
    return { targetStatus: 'cancelled', bucket: 'recoverable', reason: 'stale-reserved-no-provider-attempt' };
  }
  if (status === 'dispatching') {
    // Genuinely unknown whether the provider received/sent the message. Reuse
    // the existing 'uncertain' state rather than inventing a new one: the
    // guard already treats 'uncertain' as a permanent replay-block for this
    // idempotency key, so it can never be silently retried.
    return { targetStatus: 'uncertain', bucket: 'quarantined', reason: 'stale-dispatching-unknown-outcome' };
  }
  return null;
}

// Side-effect-free preview: identical classification logic, no store writes.
// Used both for an explicit dryRun call and internally to build the actual
// receipt before deciding whether to persist it.
function buildReceipt({ row, referenceMs, anchorTimestamp, timeoutMs, dryRun, timestamp, classification }) {
  return {
    reservationId: row.id,
    idempotencyKey: row.idempotencyKey || '',
    campaignId: row.campaignId || null,
    prospectId: row.prospectId || null,
    inbox: row.inbox || '',
    fromStatus: row.status,
    toStatus: classification.targetStatus,
    bucket: classification.bucket,
    reason: classification.reason,
    ageMs: referenceMs - Date.parse(anchorTimestamp),
    timeoutMs,
    dryRun: Boolean(dryRun),
    policyVersion: RECOVERY_POLICY_VERSION,
    timestamp
  };
}

// Time-boxed, bounded, deterministic, workspace-scoped sweep. Never retries a
// send, never calls a provider, never guesses that an unresolved external
// outcome was safe.
export async function recoverStaleOutboundReservations({
  store, date = new Date(), timeoutMs = DEFAULT_TIMEOUT_MS, limit = DEFAULT_LIMIT,
  workspaceId = '', dryRun = false
} = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const referenceMs = referenceDate.getTime();
  const timestamp = referenceDate.toISOString();
  const counts = { examined: 0, recoverable: 0, quarantined: 0, alreadyTerminal: 0, skipped: 0, failedSafely: 0 };
  const decisions = [];

  if (!store || typeof store.list !== 'function') {
    return { ok: false, reason: 'malformed-input-store', counts, decisions, dryRun: Boolean(dryRun), policyVersion: RECOVERY_POLICY_VERSION, timestamp };
  }

  const filters = workspaceId ? { campaignId: workspaceId } : {};
  const [reservedRows, dispatchingRows] = await Promise.all([
    store.list('outboundReservations', { filters: { ...filters, status: 'reserved' }, orderBy: 'reservedAt', direction: 'asc' }),
    store.list('outboundReservations', { filters: { ...filters, status: 'dispatching' }, orderBy: 'reservedAt', direction: 'asc' })
  ]);

  const candidates = [...reservedRows, ...dispatchingRows]
    .sort((a, b) => String(a?.reservedAt || '').localeCompare(String(b?.reservedAt || '')))
    .slice(0, Math.max(0, Number(limit) || DEFAULT_LIMIT));

  for (const row of candidates) {
    counts.examined += 1;
    if (!row?.id || !row?.status) { counts.failedSafely += 1; continue; }

    const originalStatus = row.status;
    const anchorTimestamp = originalStatus === 'dispatching' ? (row.dispatchedAt || row.reservedAt) : row.reservedAt;
    const stale = isStale(referenceMs, anchorTimestamp, timeoutMs);
    if (stale === null) { counts.failedSafely += 1; continue; }
    if (!stale) { counts.skipped += 1; continue; }

    const classification = classifyStaleReservation(originalStatus);
    if (!classification) { counts.skipped += 1; continue; }

    try {
      const receipt = buildReceipt({ row, referenceMs, anchorTimestamp, timeoutMs, dryRun, timestamp, classification });
      if (!dryRun) {
        await store.markOutboundReservation(row.id, classification.targetStatus, {
          recoveredAt: timestamp, recoveryReason: classification.reason
        });
      }
      // Deterministic id: a concurrent or replayed sweep computing the exact
      // same recovery decision for the same row hits the store's existing
      // duplicate-id constraint instead of writing (and counting) a second
      // receipt for a mutation that already happened.
      const receiptId = `recovery:${row.id}:${originalStatus}:${classification.targetStatus}:${dryRun ? 'dry' : 'live'}`;
      try {
        await store.add('auditLog', { id: receiptId, type: 'outbound_reservation_recovery', detail: receipt, createdAt: timestamp });
      } catch (logError) {
        if (logError instanceof ConflictError) { counts.alreadyTerminal += 1; continue; }
        throw logError;
      }
      decisions.push(receipt);
      counts[classification.bucket] += 1;
    } catch (error) {
      counts.failedSafely += 1;
      decisions.push({
        reservationId: row.id, error: String(error?.message || error).slice(0, 500),
        dryRun: Boolean(dryRun), policyVersion: RECOVERY_POLICY_VERSION, timestamp
      });
    }
  }

  return { ok: true, counts, decisions, dryRun: Boolean(dryRun), limit: Math.max(0, Number(limit) || DEFAULT_LIMIT), timeoutMs, workspaceId: workspaceId || null, policyVersion: RECOVERY_POLICY_VERSION, timestamp };
}
