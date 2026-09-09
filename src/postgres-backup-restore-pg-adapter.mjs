import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';

const hash = value => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;
const quoteIdentifier = value => `"${String(value).replaceAll('"', '""')}"`;

function parsed(databaseUrl) {
  const url = new URL(databaseUrl);
  if (!/^postgres(?:ql)?:$/.test(url.protocol)) throw new Error('postgres URL required');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new Error('database name required');
  return { url, database };
}

function cliEnv(databaseUrl) {
  const { url, database } = parsed(databaseUrl);
  const env = { ...process.env };
  env.PGHOST = url.hostname;
  env.PGPORT = url.port || '5432';
  env.PGUSER = decodeURIComponent(url.username || '');
  env.PGPASSWORD = decodeURIComponent(url.password || '');
  env.PGDATABASE = database;
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

function runCli(command, args, databaseUrl) {
  const run = spawnSync(command, args, { env: cliEnv(databaseUrl), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { exitCode: run.status ?? 1, errorClass: run.error ? String(run.error.name || 'Error') : null };
}

function databaseUrlWithName(databaseUrl, databaseName) {
  const { url } = parsed(databaseUrl);
  const copy = new URL(url.toString());
  copy.pathname = `/${encodeURIComponent(databaseName)}`;
  return copy.toString();
}

async function withPool(databaseUrl, fn) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1, ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined });
  try { return await fn(pool); } finally { await pool.end(); }
}

async function tableRows(pool) {
  const tables = (await pool.query(`
    SELECT schemaname, tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY schemaname, tablename
  `)).rows;
  const counts = [];
  for (const row of tables) {
    const relation = `${quoteIdentifier(row.schemaname)}.${quoteIdentifier(row.tablename)}`;
    const result = await pool.query(`SELECT count(*)::bigint AS count FROM ${relation}`);
    counts.push([`${row.schemaname}.${row.tablename}`, String(result.rows[0]?.count ?? '0')]);
  }
  return { tables: tables.map(row => `${row.schemaname}.${row.tablename}`), counts };
}

async function schemaRows(pool) {
  return (await pool.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name,
           pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull AS not_null
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p')
      AND n.nspname NOT IN ('pg_catalog','information_schema')
    ORDER BY n.nspname, c.relname, a.attnum
  `)).rows;
}

async function migrationRows(pool) {
  const candidates = ['schema_migrations', 'migrations'];
  for (const table of candidates) {
    const exists = await pool.query('SELECT to_regclass($1) AS relation', [`public.${table}`]);
    if (!exists.rows[0]?.relation) continue;
    const rows = await pool.query(`SELECT * FROM ${quoteIdentifier('public')}.${quoteIdentifier(table)} ORDER BY 1`);
    return { table, rows: rows.rows };
  }
  return { table: null, rows: [] };
}

export function createPostgresBackupRestorePgAdapter() {
  return {
    async fingerprint(databaseUrl) {
      return withPool(databaseUrl, async pool => {
        const [tableData, schema, migrations] = await Promise.all([tableRows(pool), schemaRows(pool), migrationRows(pool)]);
        return {
          migrationFingerprint: hash(JSON.stringify(migrations)),
          tableFingerprint: hash(JSON.stringify({ tables: tableData.tables, schema })),
          rowCountFingerprint: hash(JSON.stringify(tableData.counts))
        };
      });
    },

    async dump(databaseUrl) {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-pg-restore-'));
      const dumpPath = path.join(dir, 'backup.dump');
      const run = runCli('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--file', dumpPath], databaseUrl);
      let bytes = 0;
      let sha256 = null;
      try {
        const body = await fs.readFile(dumpPath);
        bytes = body.length;
        sha256 = `sha256:${crypto.createHash('sha256').update(body).digest('hex')}`;
      } catch { /* runner will reject empty/missing dump */ }
      return { ...run, bytes, sha256, path: dumpPath, tempDir: dir };
    },

    async createIsolatedDatabase(primaryDatabaseUrl, databaseName) {
      if (!/^[a-z][a-z0-9_]{2,62}$/.test(databaseName)) throw new Error('unsafe restore database name');
      const adminUrl = databaseUrlWithName(primaryDatabaseUrl, 'postgres');
      await withPool(adminUrl, pool => pool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`));
      return { databaseUrl: databaseUrlWithName(primaryDatabaseUrl, databaseName) };
    },

    async restore(restoreDatabaseUrl, dump) {
      return runCli('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', '--dbname', parsed(restoreDatabaseUrl).database, dump.path], restoreDatabaseUrl);
    },

    async boundedReadWrite(restoreDatabaseUrl) {
      return withPool(restoreDatabaseUrl, async pool => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('CREATE TEMP TABLE uberbond_restore_probe (id integer PRIMARY KEY, marker text NOT NULL) ON COMMIT DROP');
          await client.query("INSERT INTO uberbond_restore_probe(id, marker) VALUES (1, 'restore-probe')");
          const result = await client.query('SELECT marker FROM uberbond_restore_probe WHERE id = 1');
          const ok = result.rows[0]?.marker === 'restore-probe';
          await client.query('ROLLBACK');
          return { ok, rolledBack: true };
        } catch (error) {
          try { await client.query('ROLLBACK'); } catch { /* best effort */ }
          return { ok: false, rolledBack: true, errorClass: String(error?.name || 'Error') };
        } finally {
          client.release();
        }
      });
    },

    async dropIsolatedDatabase(primaryDatabaseUrl, databaseName) {
      if (!/^[a-z][a-z0-9_]{2,62}$/.test(databaseName)) throw new Error('unsafe restore database name');
      const adminUrl = databaseUrlWithName(primaryDatabaseUrl, 'postgres');
      await withPool(adminUrl, async pool => {
        await pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [databaseName]);
        await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
      });
      return { ok: true };
    },

    async cleanupDump(dump) {
      if (dump?.tempDir) await fs.rm(dump.tempDir, { recursive: true, force: true });
    }
  };
}
