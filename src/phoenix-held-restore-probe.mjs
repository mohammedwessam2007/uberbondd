import { Client } from 'pg';
import { decryptJson } from './crypto.mjs';

export const PHOENIX_HELD_RESTORE_PROBE = 'PHOENIX_HELD_RESTORE_PROBE';
const TARGET_HOST = 'ep-soft-cake-baiahh8q.c-8.eu-central-1.aws.neon.tech';
const TARGET_DATABASE = 'uberbond_phoenix_rehearsal_20261014_v2';
const KEY_PATTERN = /^[a-f0-9]{64}$/i;
const enabled = value => ['true','1','yes','on'].includes(String(value ?? '').toLowerCase());
const refused = reason => { throw new Error('PHOENIX_HELD_RESTORE_REFUSED:' + reason); };

export function heldRestoreRequestAllowed(method, rawUrl) {
  if (method !== 'GET') return false;
  const url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl, 'http://localhost');
  return (url.pathname === '/api/health' || url.pathname === '/api/summary') && !url.search;
}

export function assertHeldRestoreConfig(env, cfg) {
  if (env[PHOENIX_HELD_RESTORE_PROBE] !== '1') refused('EXPLICIT_PROBE_GATE');
  if (cfg.nodeEnv !== 'production' || cfg.processRole !== 'web' || cfg.storeBackend !== 'postgres') refused('ISOLATED_WEB_ONLY');
  if (cfg.autopilot || cfg.outbound?.enabled || cfg.outbound?.dryRun !== true ||
      enabled(env.AGENT_RELAY_ENABLED) || enabled(env.PUBLIC_AUDIT_ENABLED) || !enabled(env.OUTBOUND_EMERGENCY_STOP)) refused('SIDE_EFFECT_GATES');
  if (!KEY_PATTERN.test(String(cfg.encryptionKey || '')) || String(cfg.adminToken || '').length < 32) refused('PROTECTED_KEYS_REQUIRED');
  if (enabled(env.ALLOW_TEST_PAYMENT_UNLOCK)) refused('TEST_PAYMENT_UNLOCK');
  if (cfg.databaseSsl !== true || env.NODE_TLS_REJECT_UNAUTHORIZED === '0') refused('TLS_VERIFY_FULL_REQUIRED');
  for (const [key, value] of Object.entries(env)) {
    if (/^(WINNR_|INFINITE_OPUS_|UBERMIND_)/.test(key) &&
        /(ONCE|EXECUTE|DISPATCH|AUTOFINISH|BOOTSTRAP|LIVE_CANARY|REPLAY)/.test(key) && enabled(value))
      refused('UNRELATED_RUNTIME_GATE');
  }
  let uri;
  try { uri = new URL(cfg.databaseUrl); } catch { refused('INVALID_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(uri.protocol) || uri.hostname !== TARGET_HOST ||
      decodeURIComponent(uri.pathname) !== '/' + TARGET_DATABASE || !uri.username || !uri.password ||
      (uri.port && uri.port !== '5432') ||
      [...uri.searchParams].some(([key,value]) => !((key === 'sslmode' || key === 'channel_binding') && value === 'require')) ||
      uri.hash) refused('ISOLATED_DATABASE_IDENTITY');
  return { host: TARGET_HOST, database: TARGET_DATABASE, onlyLoopback: true };
}

// Prevent URL query parameters and node-postgres sslmode=require from
// replacing the verified TLS settings (pg-connection-string can override ssl).
// Both the isolated verifier and the actual app Pool MUST use these exact
// host-validated native connection options with CA/hostname verification.
export function verifiedHeldPgOptions(connectionString) {
  let uri;
  try { uri = new URL(connectionString); } catch { refused('INVALID_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(uri.protocol) ||
      uri.hostname !== TARGET_HOST || decodeURIComponent(uri.pathname) !== '/' + TARGET_DATABASE ||
      !uri.username || !uri.password || (uri.port && uri.port !== '5432') || uri.hash ||
      [...uri.searchParams].some(([key,value]) => !((key === 'sslmode' || key === 'channel_binding') && value === 'require')))
    refused('ISOLATED_DATABASE_IDENTITY');
  return {
    host: TARGET_HOST,
    port: Number(uri.port || 5432),
    database: TARGET_DATABASE,
    user: decodeURIComponent(uri.username),
    password: decodeURIComponent(uri.password),
    ssl: { rejectUnauthorized: true, servername: TARGET_HOST },
    connectionTimeoutMillis: 15000,
    statement_timeout: 10000
  };
}

export async function verifyHeldRestoreReadOnly({ env = process.env, cfg, clientFactory } = {}) {
  assertHeldRestoreConfig(env, cfg);
  const client = clientFactory ? await clientFactory() : new Client(verifiedHeldPgOptions(cfg.databaseUrl));
  let began = false;
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    began = true;
    const p = await client.query(`SELECT current_database() AS db, current_setting('transaction_read_only') AS read_only,
        (SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls FROM pg_roles WHERE rolname=current_user) AS privileged,
        has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
        has_schema_privilege(current_user,'public','CREATE') AS schema_create,
        (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind IN ('r','p') AND
          has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS writable_tables`);
    const proof = p.rows?.[0];
    if (p.rowCount !== 1 || proof?.db !== TARGET_DATABASE || proof?.read_only !== 'on' ||
        proof?.privileged !== false || proof?.database_create !== false ||
        proof?.schema_create !== false || Number(proof?.writable_tables) !== 0)
      refused('DB_ROLE_HAS_WRITE_AUTHORITY');
    const catalog = await client.query(`SELECT count(*)::int AS tables FROM pg_tables WHERE schemaname='public'`);
    const migrations = await client.query(`SELECT count(*)::int AS count FROM public.schema_migrations`);
    if (catalog.rows?.[0]?.tables !== 57 || migrations.rows?.[0]?.count !== 20) refused('RESTORED_SCHEMA_MISMATCH');
    const rows = await client.query(`SELECT data->'tokens' AS tokens FROM public.accounts ORDER BY id`);
    if (rows.rowCount !== 6 || rows.rows.length !== 6) refused('RESTORED_ACCOUNT_COVERAGE');
    for (const row of rows.rows) {
      const b = row.tokens;
      if (!b || Object.keys(b).sort().join(',') !== 'data,iv,tag') refused('TOKEN_FORMAT');
      try { decryptJson(b, cfg.encryptionKey); } catch { refused('ORIGINAL_KEY_INCOMPATIBLE'); }
    }
    return { ok: true, state: 'HELD_RESTORE_READ_ONLY_BOOT_ADMITTED', tableCount: 57,
      migrationCount: 20, tokenAccountCount: 6, originalKeyCompatible: true,
      readonlyDatabaseRole: true, outboundAuthority: false, workerStarted: false,
      database: TARGET_DATABASE, dataWritten: 0, providerCalls: 0 };
  } finally {
    if (began) await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
  }
}
