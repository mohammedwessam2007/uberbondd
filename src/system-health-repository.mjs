export const SYSTEM_HEALTH_REPOSITORY_VERSION='uberbond.system-health-repository.v1';
export async function readSystemHealthInputs(pool){
 const [senders,outbound,jobs,egress,connections,maxConnections,billing]=await Promise.all([
  pool.query(`SELECT paused,hard_bounces_today AS "hardBouncesToday",complaints_today AS "complaintsToday",failure_streak AS "failureStreak" FROM sender_health`),
  pool.query(`SELECT date_trunc('hour',occurred_at) AS hour,count(*)::int AS count FROM outbound_events WHERE occurred_at>=now()-interval '24 hours' GROUP BY 1 ORDER BY 1`),
  pool.query(`SELECT count(*) FILTER (WHERE status='pending')::int AS pending,count(*) FILTER (WHERE status IN ('leased','running'))::int AS leased,count(*) FILTER (WHERE status='failed')::int AS failed,count(*) FILTER (WHERE dead_lettered_at IS NOT NULL)::int AS "deadLetter" FROM jobs`),
  pool.query(`SELECT count(*) FILTER (WHERE state='HEALTHY')::int AS healthy,count(*) FILTER (WHERE state='DEGRADED')::int AS degraded,count(*) FILTER (WHERE state='QUARANTINED')::int AS quarantined FROM egress_route_health`),
  pool.query(`SELECT count(*)::int AS active FROM pg_stat_activity WHERE datname=current_database()`),
  pool.query(`SELECT setting::int AS max_connections FROM pg_settings WHERE name='max_connections'`),
  // Aggregates only. No provider_event_key, no payload_hash, no custom_data --
  // this feeds an operator endpoint, and none of those are needed to answer
  // "is verified payment evidence piling up unprocessed".
  //
  // `everClaimed` is the one that matters. Nothing in this tree calls
  // claimBillingEvents, so a backlog here is not a worker running behind: it is
  // a worker that does not exist. Those are different operational facts and the
  // matrix must not blur them into one "pending" number.
  pool.query(`SELECT
    count(*) FILTER (WHERE status IN ('RECEIVED','RETRYABLE'))::int AS "awaitingClaim",
    count(*) FILTER (WHERE status='CLAIMED')::int AS "claimed",
    count(*) FILTER (WHERE status='UNCERTAIN')::int AS "uncertain",
    count(*) FILTER (WHERE status IN ('RECONCILED','IGNORED'))::int AS "settled",
    count(*) FILTER (WHERE status='FAILED')::int AS "failed",
    count(*) FILTER (WHERE claimed_by IS NOT NULL)::int AS "everClaimed",
    min(received_at) FILTER (WHERE status NOT IN ('RECONCILED','IGNORED','FAILED')) AS "oldestUnsettledAt"
    FROM billing_webhook_inbox`)
 ]);
 return {senderHealth:senders.rows,hourlyOutbound:outbound.rows,jobs:jobs.rows[0]||{},egress:egress.rows[0]||{},database:{activeConnections:connections.rows[0]?.active||0,maxConnections:maxConnections.rows[0]?.max_connections||0},billing:billing.rows[0]||{}};
}
