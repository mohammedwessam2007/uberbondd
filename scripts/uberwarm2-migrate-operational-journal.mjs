#!/usr/bin/env node
// Explicit additive migration for the dedicated Railway ledger database only.
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

if (process.argv[2] !== '--apply' || process.env.UBERWARM_OPERATIONAL_RECEIPTS_ENABLED !== '1') {
  console.error('operational-journal-migration-not-authorized');
  process.exit(1);
}
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000,
  statement_timeout: 10000, query_timeout: 12000,
  options: '-c default_transaction_read_only=off'
});
try {
  if (!process.env.DATABASE_URL) throw Error('database-binding-missing');
  await client.connect();
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('uberwarm2-operational-journal-migration'))");
  const state = (await client.query(`SELECT current_database() AS database,
    pg_is_in_recovery() AS recovery,
    to_regclass('public.uberwarm2_seed_probe_claims') IS NOT NULL AS ledger_present,
    to_regclass('public.uberwarm2_operational_receipts') IS NOT NULL AS journal_present`)).rows[0];
  if (state.database !== 'railway' || state.recovery || !state.ledger_present) {
    throw Error('authoritative-dedicated-ledger-mismatch');
  }
  const sql = await readFile(new URL('../docs/migrations-pending/20261017_uberwarm2_operational_receipts.sql', import.meta.url), 'utf8');
  if (!state.journal_present) await client.query(sql);
  const columns = (await client.query(`SELECT column_name, data_type, is_nullable
    FROM information_schema.columns WHERE table_schema='public'
    AND table_name='uberwarm2_operational_receipts' ORDER BY ordinal_position`)).rows;
  const expected = [
    ['receipt_digest','text'], ['source_sha','text'],
    ['observed_at','timestamp with time zone'], ['recorded_at','timestamp with time zone'],
    ['receipt_json','jsonb']
  ];
  if (columns.length !== expected.length || columns.some((c,i) =>
    c.column_name !== expected[i][0] || c.data_type !== expected[i][1] || c.is_nullable !== 'NO')) {
    throw Error('existing-journal-schema-incompatible');
  }
  // Existing tables must carry the exact reviewed checks and key, not merely similar columns.
  const constraints = (await client.query(`SELECT contype, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint WHERE conrelid='public.uberwarm2_operational_receipts'::regclass`)).rows;
  if (!constraints.some(c=>c.contype==='p' && c.definition==='PRIMARY KEY (receipt_digest)') ||
      constraints.filter(c=>c.contype==='c').length !== 3 ||
      !constraints.some(c=>c.definition.includes('sendAuthority') && c.definition.includes('IS TRUE'))) {
    throw Error('existing-journal-constraints-incompatible');
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({receipt:'UBERWARM_OPERATIONAL_JOURNAL_MIGRATION',
    database:state.database, primary:true, created:!state.journal_present,
    migrationDigest:'sha256:'+createHash('sha256').update(sql).digest('hex'),
    source:process.env.RAILWAY_GIT_COMMIT_SHA || null, sends:0}));
} catch {
  await client.query('ROLLBACK').catch(()=>{});
  console.error('operational-journal-migration-failed-closed');
  process.exitCode=1;
} finally {
  await client.end().catch(()=>{});
}
