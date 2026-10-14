export const UBERWARM2_PG_LEDGER_VERSION = 'uberbond.uberwarm2-pg-ledger.v1';
const emailOk = v => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validKey = v => typeof v === 'string' && /^uberwarm2-seed:[a-f0-9]{64}$/.test(v);
const validDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
const refused = reason => ({ ok: false, claimed: false, capsEnforced: false, reason });
// Daily UTC buckets and the rolling 24-hour window both apply. A caller-chosen
// bucket cannot hide a send, and a send that straddles midnight still counts.
function capRefusal(c) {
  if (c.total >= 100) return 'global-daily-limit';
  if (c.senderTotal >= 2) return 'sender-daily-limit';
  if (c.seedTotal >= 1) return 'seed-daily-limit';
  if (c.rollingTotal >= 100) return 'global-rolling-limit';
  if (c.rollingSenderTotal >= 2) return 'sender-rolling-limit';
  if (c.rollingSeedTotal >= 1) return 'seed-rolling-limit';
  return null;
}
/**
 * PostgreSQL effect reservation implementation for UberWarm2 seed-only probes.
 * The migration docs/migrations-pending/20261012_uberwarm2_seed_one_shot.sql must be applied by an owner-authorized runner (not the boot migrator)
 * separately. This factory performs no migration, send, provider call or DNS
 * write. It MUST run against the authoritative shared PostgreSQL primary.
 */
export function createUberWarm2PgLedger({ pool } = {}) {
  return {
    version: UBERWARM2_PG_LEDGER_VERSION,
    async claimOnceAndEnforceCaps(reservation = {}) {
      const r = reservation;
      if (!pool || typeof pool.connect !== 'function') return refused('postgres-primary-required');
      if (!validKey(r.reservationKey) || !r.probeId || !r.batchDigest ||
          !emailOk(r.senderEmail) || !emailOk(r.seedEmail) || r.senderEmail === r.seedEmail ||
          !validDay(r.quotaWindow) || r.senderDailyLimit !== 2 || r.globalDailyLimit !== 100 ||
          r.seedDailyLimit !== 1 || r.rollingWindowHours !== 24 ||
          r.effectClass !== 'OWNER_CONTROLLED_PLACEMENT_PROBE') return refused('invalid-immutable-seed-reservation');
      const client = await pool.connect();
      let inTransaction = false;
      try {
        // READ COMMITTED is pinned explicitly so a session or server default
        // cannot change the isolation this decision depends on.
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        inTransaction = true;
        // One transaction-scoped lock, taken before any read and independent of
        // the caller's label, serializes every claim against this table.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('uberwarm2-seed-claims'))");
        // The UTC day comes from the database clock, read after the lock. The
        // caller's quotaWindow is only a label and must name that same day.
        const clock = await client.query("SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text AS quota_day");
        const quotaDay = clock.rows?.[0]?.quota_day;
        if (quotaDay !== r.quotaWindow) {
          await client.query('ROLLBACK'); inTransaction = false;
          return refused('quota-window-mismatch');
        }
        const prior = await client.query(
          'SELECT reservation_key FROM uberwarm2_seed_probe_claims WHERE reservation_key=$1',
          [r.reservationKey]
        );
        if (prior.rows?.length) {
          await client.query('ROLLBACK'); inTransaction = false;
          return refused('durable-one-shot-claim-already-present');
        }
        const counts = await client.query(
          `SELECT
             COUNT(*) FILTER (WHERE quota_day=$1::date)::int AS total,
             COUNT(*) FILTER (WHERE quota_day=$1::date AND sender_email=$2)::int AS sender_total,
             COUNT(*) FILTER (WHERE quota_day=$1::date AND seed_email=$3)::int AS seed_total,
             COUNT(*) FILTER (WHERE created_at > clock_timestamp() - interval '24 hours')::int AS rolling_total,
             COUNT(*) FILTER (WHERE created_at > clock_timestamp() - interval '24 hours' AND sender_email=$2)::int AS rolling_sender_total,
             COUNT(*) FILTER (WHERE created_at > clock_timestamp() - interval '24 hours' AND seed_email=$3)::int AS rolling_seed_total
           FROM uberwarm2_seed_probe_claims
           WHERE quota_day=$1::date OR created_at > clock_timestamp() - interval '24 hours'`,
          [quotaDay, r.senderEmail, r.seedEmail]
        );
        const row = counts.rows?.[0] || {};
        const caps = {
          total: Number(row.total), senderTotal: Number(row.sender_total), seedTotal: Number(row.seed_total),
          rollingTotal: Number(row.rolling_total), rollingSenderTotal: Number(row.rolling_sender_total),
          rollingSeedTotal: Number(row.rolling_seed_total)
        };
        if (!Object.values(caps).every(n => Number.isInteger(n) && n >= 0))
          throw Error('unreliable-durable-cap-counts');
        const reason = capRefusal(caps);
        if (reason) {
          await client.query('ROLLBACK'); inTransaction = false;
          return refused(reason);
        }
        await client.query(
          'INSERT INTO uberwarm2_seed_probe_claims (reservation_key,probe_id,batch_digest,sender_email,seed_email,quota_day) VALUES ($1,$2,$3,$4,$5,$6::date)',
          [r.reservationKey, r.probeId, r.batchDigest, r.senderEmail, r.seedEmail, quotaDay]
        );
        await client.query('COMMIT'); inTransaction = false;
        return { ok: true, claimed: true, capsEnforced: true, reservationKey: r.reservationKey };
      } catch (err) {
        if (inTransaction) {
          try { await client.query('ROLLBACK'); } catch { /* commit outcome may remain uncertain */ }
        }
        // Never claim the reservation did not happen if the DB link drops
        // at COMMIT. The caller will not retry a possibly-sent effect.
        throw new Error('uberwarm2-postgres-reservation-uncertain', { cause: err });
      } finally {
        client.release();
      }
    },
    async finalize({ reservationKey, receipt } = {}) {
      if (!pool || typeof pool.query !== 'function' || !validKey(reservationKey) ||
          !receipt || receipt.reservationKey !== reservationKey ||
          !['SMTP_ACCEPTED_PLACEMENT_UNKNOWN','SUBMISSION_OUTCOME_UNCERTAIN'].includes(receipt.status))
        return { ok: false, status: 'UBERWARM2_FINALIZATION_REFUSED' };
      const result = await pool.query(
        `UPDATE uberwarm2_seed_probe_claims
            SET submitted_state=$2, receipt_json=$3::jsonb, finalized_at=CURRENT_TIMESTAMP
          WHERE reservation_key=$1 AND submitted_state='RESERVED'
          RETURNING reservation_key`,
        [reservationKey, receipt.status, JSON.stringify(receipt)]
      );
      return { ok: result.rows?.length === 1,
        status: result.rows?.length === 1 ? 'UBERWARM2_CLAIM_FINALIZED' : 'UBERWARM2_CLAIM_MISSING_OR_ALREADY_FINALIZED' };
    },
    async observe({ reservationKey } = {}) {
      if (!pool || typeof pool.query !== 'function' || !validKey(reservationKey))
        return { ok: false, status: 'UBERWARM2_OBSERVE_REFUSED' };
      const result = await pool.query(
        'SELECT reservation_key, submitted_state, receipt_json, created_at, finalized_at FROM uberwarm2_seed_probe_claims WHERE reservation_key=$1',
        [reservationKey]
      );
      const row = result.rows?.[0];
      return row ? {
        ok: true, status: row.submitted_state,
        reservationKey: row.reservation_key,
        receipt: row.receipt_json || null,
        createdAt: row.created_at,
        finalizedAt: row.finalized_at || null,
        externalEffectAuthority: 'NONE'
      } : { ok: false, status: 'UBERWARM2_CLAIM_NOT_FOUND' };
    }
  };
}
