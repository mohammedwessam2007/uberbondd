/**
 * Guard the deliberately destructive PostgresStore integration suite.
 * This is a test-only allowlist, not a credential verifier or a substitute for
 * an isolated database. Never echo connection URLs in errors or logs.
 */
export function assertDisposableLocalPostgresTestTarget({
  databaseUrl,
  acknowledgment,
  nodeEnv = process.env.NODE_ENV
} = {}) {
  if (nodeEnv === 'production' || process.env.NODE_ENV === 'production') {
    throw new Error('DESTRUCTIVE_PG_TEST_REFUSED_PRODUCTION');
  }
  if (acknowledgment !== 'TRUNCATE_LOCAL_UBERBOND_TEST_DB') {
    throw new Error('DESTRUCTIVE_PG_TEST_ACK_REQUIRED');
  }
  if (typeof databaseUrl !== 'string' || !databaseUrl) {
    throw new Error('DESTRUCTIVE_PG_TEST_URL_REQUIRED');
  }
  let parsed;
  try { parsed = new URL(databaseUrl); }
  catch { throw new Error('DESTRUCTIVE_PG_TEST_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !['127.0.0.1', '[::1]'].includes(parsed.hostname) ||
      parsed.pathname !== '/uberbond_test' ||
      !parsed.username ||
      !parsed.port || (Number(parsed.port) < 20000 || Number(parsed.port) > 65000) ||
      parsed.search || parsed.hash) {
    throw new Error('DESTRUCTIVE_PG_TEST_TARGET_NOT_ISOLATED_LOCAL');
  }
  return true;
}
