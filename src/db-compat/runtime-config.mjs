// Pre-cutover runtime configuration check. It reads an env-like object and
// returns fixed reason codes. It never echoes a value, and it never connects.
// config.mjs validateStartupConfig() remains the authoritative full check at
// boot; this module adds the database-target allowlist and the cutover refusals.

export const RUNTIME_MODES = Object.freeze(['production', 'staging', 'test']);
const KEY_PATTERN = /^[a-f0-9]{64}$/i;
const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const DEFAULT_PORT = '5432';

function truthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

/** Normalise `host[:port]/database` to lowercase `host:port/database`, or null if malformed. */
function normalizeTarget(host, port, database) {
  if (!host || !database) return null;
  return `${host.toLowerCase()}:${port || DEFAULT_PORT}/${database}`;
}

function parseAllowlistEntry(entry) {
  if (typeof entry !== 'string') return null;
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(entry.trim());
  if (!match) return null;
  const [host, port = DEFAULT_PORT] = match[1].split(/:(?=\d+$)/);
  return normalizeTarget(host, port, match[2]);
}

function parseDatabaseUrl(raw) {
  try {
    const url = new URL(raw);
    if (!POSTGRES_PROTOCOLS.has(url.protocol)) return { error: 'DATABASE_URL_NOT_POSTGRES' };
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!url.hostname || !database) return { error: 'DATABASE_URL_INCOMPLETE' };
    // Only query parameters that cannot redirect the connection are allowed. pg copies every query parameter into the
    // connection config, so host, hostaddr, port, dbname, user or service in the URL would override the target that the
    // allowlist checked.
    const ALLOWED_QUERY = new Set(['sslmode', 'channel_binding', 'application_name', 'connect_timeout']);
    if ([...url.searchParams.keys()].some(key => !ALLOWED_QUERY.has(key))) return { error: 'DATABASE_URL_PARAMETER_NOT_ALLOWED' };
    return { target: normalizeTarget(url.hostname, url.port || DEFAULT_PORT, database) };
  } catch {
    return { error: 'DATABASE_URL_INVALID' };
  }
}

/**
 * Validate an env-like object for one of RUNTIME_MODES.
 *
 * `databaseAllowlist` is required and is supplied by the caller, for example
 * from the cutover receipt. Entries are `host[:port]/database`. An absent or
 * empty allowlist refuses every target (fail closed).
 *
 * Production adds: STORE_BACKEND=postgres, PROCESS_ROLE web or worker,
 * ALLOW_TEST_PAYMENT_UNLOCK off, UNSUBSCRIBE_SECRET of at least 32 characters,
 * and a TOKEN_ENCRYPTION_KEY present, since the production database holds
 * encrypted blobs that cannot be read without it.
 */
export function validateRuntimeConfig(env = {}, { mode, databaseAllowlist = [] } = {}) {
  const reasonCodes = new Set();
  const source = env && typeof env === 'object' ? env : {};
  const read = name => String(source[name] ?? '');

  if (!RUNTIME_MODES.includes(mode)) {
    return { ok: false, mode: null, reasonCodes: ['MODE_INVALID'] };
  }
  if (read('NODE_ENV') === 'production' && mode !== 'production') reasonCodes.add('MODE_MISMATCH');

  const rawUrl = read('DATABASE_URL');
  if (!rawUrl) {
    reasonCodes.add('DATABASE_URL_MISSING');
  } else {
    const parsed = parseDatabaseUrl(rawUrl);
    if (parsed.error) {
      reasonCodes.add(parsed.error);
    } else {
      const allowed = Array.isArray(databaseAllowlist) && databaseAllowlist.length > 0
        ? databaseAllowlist.map(parseAllowlistEntry)
        : null;
      if (!allowed) reasonCodes.add('DATABASE_TARGET_ALLOWLIST_MISSING');
      else if (allowed.some(entry => entry === null)) reasonCodes.add('DATABASE_TARGET_ALLOWLIST_INVALID');
      else if (!allowed.includes(parsed.target)) reasonCodes.add('DATABASE_TARGET_NOT_ALLOWLISTED');
    }
  }

  const key = read('TOKEN_ENCRYPTION_KEY');
  if (key && !KEY_PATTERN.test(key)) reasonCodes.add('TOKEN_ENCRYPTION_KEY_MALFORMED');
  if (!key && mode === 'production') reasonCodes.add('TOKEN_ENCRYPTION_KEY_ABSENT');

  if (mode === 'production') {
    if (read('STORE_BACKEND') !== 'postgres') reasonCodes.add('STORE_BACKEND_NOT_POSTGRES');
    const role = read('PROCESS_ROLE') || 'web';
    if (!['web', 'worker'].includes(role)) reasonCodes.add('PROCESS_ROLE_NOT_SEPARATED');
    if (truthy(read('ALLOW_TEST_PAYMENT_UNLOCK'))) reasonCodes.add('TEST_PAYMENT_UNLOCK_ENABLED');
    const secret = read('UNSUBSCRIBE_SECRET');
    if (!secret) reasonCodes.add('UNSUBSCRIBE_SECRET_MISSING');
    else if (secret.length < 32) reasonCodes.add('UNSUBSCRIBE_SECRET_TOO_SHORT');
  }

  const codes = [...reasonCodes].sort();
  return { ok: codes.length === 0, mode, reasonCodes: codes };
}
