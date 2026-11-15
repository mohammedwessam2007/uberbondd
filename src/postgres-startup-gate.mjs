/**
 * PHOENIX T213: database startup boundary.
 * Probe mode issues one read-only SELECT and NEVER invokes migrations.
 * Migrate mode is reserved for an explicitly invoked operator migration script.
 */
export async function initializePostgresPool(pool, mode, migrate) {
  if (mode === 'probe') {
    if (!pool || typeof pool.query !== 'function') throw new Error('POSTGRES_PROBE_POOL_REQUIRED');
    await pool.query('SELECT 1 AS uberbond_startup_probe');
    return 'PROBED_NO_MIGRATION';
  }
  if (mode === 'migrate') {
    if (typeof migrate !== 'function') throw new Error('POSTGRES_MIGRATION_RUNNER_REQUIRED');
    await migrate();
    return 'MIGRATED_EXPLICITLY';
  }
  throw new Error('POSTGRES_STARTUP_MODE_INVALID');
}
