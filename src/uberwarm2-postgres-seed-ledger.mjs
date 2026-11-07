export const UBERWARM2_POSTGRES_LEDGER_VERSION = 'uberbond.uberwarm2.postgres-seed-ledger.v1';
const refused = reason => ({ok:false,reason});

/**
 * Pool must be a trusted pg-compatible pool. Apply the separate SQL migration
 * before enabling. An advisory lock serializes reservations within a UTC date;
 * a transaction enforces BOTH per-sender and per-recipient caps atomically.
 * This ledger is intentionally isolated from commercial outbound state.
 */
export function createUberWarm2PostgresSeedLedger({pool}={}) {
  if(typeof pool?.connect!=='function')return {ok:false,status:'POOL_REQUIRED'};
  return Object.freeze({ok:true,version:UBERWARM2_POSTGRES_LEDGER_VERSION,
    async tryReserveProbe(row={}) {
      const {reservationId,day,senderEmail,recipientEmail,maxSenderProbesPerDay,maxRecipientProbesPerDay}=row;
      if(!/^uw2_[a-f0-9]{24}$/.test(String(reservationId||''))||!/^\d{4}-\d{2}-\d{2}$/.test(String(day||''))||
        !senderEmail||!recipientEmail||!Number.isInteger(maxSenderProbesPerDay)||maxSenderProbesPerDay<1||
        !Number.isInteger(maxRecipientProbesPerDay)||maxRecipientProbesPerDay<1||
        row.purpose!=='OWNER_CONTROLLED_PLACEMENT_TEST')return refused('invalid-reservation');
      const c=await pool.connect();let started=false;
      try {
        await c.query('BEGIN');started=true;
        // Serializes all calls for this UTC date, including different app workers.
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',['uberwarm2-seed',day]);
        const existing=await c.query('SELECT reservation_id FROM uberwarm2_seed_probes WHERE reservation_id=$1',[reservationId]);
        if(existing.rows.length){await c.query('ROLLBACK');started=false;return refused('replay');}
        const counts=await c.query('SELECT COUNT(*) FILTER (WHERE sender_email=$2) AS sender_count, COUNT(*) FILTER (WHERE recipient_email=$3) AS recipient_count FROM uberwarm2_seed_probes WHERE day=$1::date',[day,senderEmail,recipientEmail]);
        const n=counts.rows[0]||{};
        if(Number(n.sender_count)>=maxSenderProbesPerDay||Number(n.recipient_count)>=maxRecipientProbesPerDay){await c.query('ROLLBACK');started=false;return refused('sender-or-recipient-daily-limit');}
        await c.query("INSERT INTO uberwarm2_seed_probes (reservation_id,day,sender_email,recipient_email,status) VALUES ($1,$2::date,$3,$4,'RESERVED')",[reservationId,day,senderEmail,recipientEmail]);
        await c.query('COMMIT');started=false;return {ok:true};
      } catch(err) {
        if(started)try{await c.query('ROLLBACK');}catch{}
        // A failed COMMIT could still have committed: never auto-retry.
        return refused('database-outcome-uncertain-do-not-retry');
      } finally {c.release();}
    },
    async recordResult(row={}) {
      const result=await pool.query("UPDATE uberwarm2_seed_probes SET status=$2, provider_message_id=$3, last_result_at=now() WHERE reservation_id=$1 AND status='RESERVED' RETURNING reservation_id",[
        row.probeId,row.status,row.providerMessageId||null]);
      if(result.rowCount!==1)throw new Error('warm2-seed-result-not-recorded');
      return {ok:true};
    }
  });
}