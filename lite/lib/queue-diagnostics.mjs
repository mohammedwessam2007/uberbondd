import crypto from 'node:crypto';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

function safeCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function safeSource(value) {
  const source = String(value || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return source.slice(0, 48) || 'unknown';
}

function writeLog(logger, level, line) {
  try {
    const write = logger?.[level] || logger?.log;
    if (typeof write === 'function') write.call(logger, line);
  } catch {
    // Incident telemetry must never alter submission or worker behavior.
  }
}

// A stable, non-secret identifier for the logical PostgreSQL endpoint. The
// password and URL query parameters are deliberately excluded before hashing.
// Matching values mean two runtimes were configured for the same host,
// database, and role; the connection string itself is never logged.
export function databaseFingerprint(databaseUrl) {
  const raw = String(databaseUrl || '').trim();
  if (!raw) return 'unconfigured';
  try {
    const url = new URL(raw);
    if (!POSTGRES_PROTOCOLS.has(url.protocol)) return 'invalid';
    const identity = JSON.stringify({
      hostname: url.hostname.toLowerCase(),
      port: url.port || '5432',
      database: decodeURIComponent(url.pathname.replace(/^\/+/, '')),
      username: decodeURIComponent(url.username)
    });
    return crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16);
  } catch {
    return 'invalid';
  }
}

export async function readAuditRequestCounts(query) {
  const result = await query(
    `SELECT
       (COUNT(*) FILTER (WHERE status = 'queued'))::int AS queued,
       (COUNT(*) FILTER (WHERE status = 'running'))::int AS running,
       (COUNT(*) FILTER (WHERE status = 'done'))::int AS done
     FROM lite_audit_requests`
  );
  const row = result.rows[0] || {};
  return {
    queued: safeCount(row.queued),
    running: safeCount(row.running),
    done: safeCount(row.done)
  };
}

export function formatQueueDiagnostic({ source, fingerprint, counts, inserted }) {
  const fields = [
    '[lite] queue diagnostic',
    `source=${safeSource(source)}`,
    `db=${String(fingerprint || 'unavailable')}`
  ];
  if (typeof inserted === 'boolean') fields.push(`inserted=${inserted}`);
  fields.push(`queued=${safeCount(counts?.queued)}`);
  fields.push(`running=${safeCount(counts?.running)}`);
  fields.push(`done=${safeCount(counts?.done)}`);
  return fields.join(' ');
}

// Temporary incident telemetry for comparing Vercel with GitHub Actions. It
// emits only a one-way endpoint fingerprint, aggregate counts, and (for a
// submission) whether that request inserted a new row. No URL, token, domain,
// email, requester hash, request ID, or database error is emitted.
export async function emitQueueDiagnostic({
  query,
  databaseUrl,
  source,
  inserted,
  logger = console
}) {
  const fingerprint = databaseFingerprint(databaseUrl);
  try {
    const counts = await readAuditRequestCounts(query);
    const line = formatQueueDiagnostic({ source, fingerprint, counts, inserted });
    writeLog(logger, 'info', line);
    return { ok: true, fingerprint, counts, inserted };
  } catch {
    writeLog(
      logger,
      'warn',
      `[lite] queue diagnostic source=${safeSource(source)} db=${fingerprint} counts=unavailable`
    );
    return { ok: false, fingerprint };
  }
}
