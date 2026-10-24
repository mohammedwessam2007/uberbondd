/**
 * Verified PostgreSQL TLS policy. Never log credentials or the connection URL.
 * Remove sslmode before node-postgres parses it, because its URL parser can
 * replace an explicit ssl object when sslmode is present.
 */
export function postgresTlsOptions({ databaseUrl, ssl = true, nodeEnv = process.env.NODE_ENV } = {}) {
  if (typeof databaseUrl !== 'string' || !databaseUrl) throw new Error('PostgreSQL connection URL is required');
  let url;
  try { url = new URL(databaseUrl); }
  catch { throw new Error('PostgreSQL connection URL is invalid'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
    throw new Error('PostgreSQL connection URL must use postgres or postgresql');
  }
  if (typeof ssl !== 'boolean') throw new Error('PostgreSQL TLS setting must be boolean');
  const params = url.searchParams;
  const mode = params.getAll('sslmode');
  const unsupported = ['sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat', 'ssl'];
  if (unsupported.some(key => params.has(key)) || mode.length > 1) {
    throw new Error('Conflicting PostgreSQL TLS connection parameters');
  }
  if (ssl === false) {
    if (nodeEnv === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('Production PostgreSQL requires verified TLS');
    }
    if (mode.length) throw new Error('Insecure local PostgreSQL mode conflicts with URL sslmode');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Plaintext PostgreSQL is permitted only for local development');
    }
    return { connectionString: databaseUrl, ssl: false };
  }
  if (mode.length && !['require', 'verify-full'].includes(mode[0])) {
    throw new Error('PostgreSQL URL contains an unsafe sslmode');
  }
  params.delete('sslmode');
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true } };
}
