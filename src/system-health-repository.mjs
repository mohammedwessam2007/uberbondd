export const SYSTEM_HEALTH_REPOSITORY_VERSION='uberbond.system-health-repository.v1';
export async function readSystemHealthInputs(pool){
 const [senders,outbound,jobs,egress,connections,maxConnections]=await Promise.all([
  pool.query(`SELECT paused,hard_bounces_today AS "hardBouncesToday",complaints_today AS "complaintsToday",failure_streak AS "failureStreak" FROM sender_health`),
  pool.query(`SELECT date_trunc('hour',occurred_at) AS hour,count(*)::int AS count FROM outbound_events WHERE occurred_at>=now()-interval '24 hours' GROUP BY 1 ORDER BY 1`),
  pool.query(`SELECT count(*) FILTER (WHERE status='pending')::int AS pending,count(*) FILTER (WHERE status IN ('leased','running'))::int AS leased,count(*) FILTER (WHERE status='failed')::int AS failed,count(*) FILTER (WHERE dead_lettered_at IS NOT NULL)::int AS "deadLetter" FROM jobs`),
  pool.query(`SELECT count(*) FILTER (WHERE state='HEALTHY')::int AS healthy,count(*) FILTER (WHERE state='DEGRADED')::int AS degraded,count(*) FILTER (WHERE state='QUARANTINED')::int AS quarantined FROM egress_route_health`),
  pool.query(`SELECT count(*)::int AS active FROM pg_stat_activity WHERE datname=current_database()`),
  pool.query(`SELECT setting::int AS max_connections FROM pg_settings WHERE name='max_connections'`)
 ]);
 return {senderHealth:senders.rows,hourlyOutbound:outbound.rows,jobs:jobs.rows[0]||{},egress:egress.rows[0]||{},database:{activeConnections:connections.rows[0]?.active||0,maxConnections:maxConnections.rows[0]?.max_connections||0}};
}
