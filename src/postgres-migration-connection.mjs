// Migration locks are session-scoped: pg_advisory_lock belongs to one server
// session. Through a transaction-mode pooler the next statement can run on a
// different backend, so the lock can be released by another session or held by
// a session no one is using. Migrations, and the boot path that runs them, must
// therefore use a direct or session-mode connection.
//
// This guard detects the pooler indicators that appear in a connection string:
// port 6543 by convention, a host that names a pooler, pgbouncer=true, and
// pool_mode=transaction. It cannot prove that an arbitrary custom host is not a
// transaction pooler. The owner-supplied direct URL is the real control; this
// refuses the common misconfigurations and makes them loud.
export const MIGRATION_CONNECTION_VERSION = 'uberbond.postgres-migration-connection.v1';

function refusal(reason) {
  const error = new Error(`MIGRATION_REQUIRES_DIRECT_CONNECTION: ${reason}`);
  error.code = 'MIGRATION_REQUIRES_DIRECT_CONNECTION';
  return error;
}

export function assertDirectMigrationConnection(databaseUrl) {
  let url;
  try { url = new URL(String(databaseUrl)); }
  catch { throw refusal('the connection string could not be parsed, so it cannot be proven direct'); }
  if (url.port === '6543') throw refusal('port 6543 is the transaction-pooler convention');
  if (/pooler/i.test(url.hostname)) throw refusal('the host names a pooler');
  if (String(url.searchParams.get('pgbouncer') || '').toLowerCase() === 'true') throw refusal('pgbouncer=true marks a pooled connection');
  if (String(url.searchParams.get('pool_mode') || '').toLowerCase() === 'transaction') throw refusal('pool_mode=transaction is transaction pooling');
  return { ok: true, version: MIGRATION_CONNECTION_VERSION, check: 'NO_KNOWN_POOLER_INDICATOR' };
}
