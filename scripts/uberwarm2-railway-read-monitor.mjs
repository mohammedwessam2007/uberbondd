#!/usr/bin/env node
// Bounded provider read check. Optional append-only operational receipts, never probe claims.
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { persistOperationalSnapshot } from '../src/uberwarm2-operational-journal.mjs';
import { observeReceiverBinding } from '../src/uberwarm2-receiver-binding.mjs';
import { observeBobwork } from '../src/uberwarm2-bobwork-observer.mjs';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1, connectionTimeoutMillis: 10000,
  statement_timeout: 10000, query_timeout: 12000,
  options: '-c default_transaction_read_only=on'
});
const receipt = {
  receipt: 'UBERWARM_OPERATIONAL_READ_CHECK',
  observedAt: new Date().toISOString(),
  source: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.UBERWARM_SOURCE_SHA || null,
  sends: 0, runtimeReady: false, sendAuthority: 'NONE',
  blockers: []
};
let journal;
try {
  if (!process.env.DATABASE_URL) throw new Error('database-binding-missing');
  const db = await pool.query(`SELECT current_database() AS database,
    pg_is_in_recovery() AS recovery,
    to_regclass('public.uberwarm2_seed_probe_claims') IS NOT NULL AS ledger_present`);
  receipt.database = db.rows[0];
  if (receipt.database.recovery || !receipt.database.ledger_present) {
    receipt.blockers.push('authoritative-primary-ledger-unavailable');
  } else {
    const ledger = await pool.query(`SELECT count(*)::int AS claims,
      count(*) FILTER (WHERE submitted_state='SUBMISSION_OUTCOME_UNCERTAIN')::int AS uncertain,
      count(*) FILTER (WHERE submitted_state='RESERVED')::int AS reserved
      FROM public.uberwarm2_seed_probe_claims`);
    receipt.ledger = ledger.rows[0];
  }
  const doctor = spawnSync(process.execPath, [
    fileURLToPath(new URL('./uberwarm2-live-read-doctor.mjs', import.meta.url)), '--probe'
  ], { encoding: 'utf8', timeout: 45000, maxBuffer: 65536 });
  try {
    const lines = doctor.stdout.trim().split('\n');
    receipt.provider = JSON.parse(lines.at(-1));
  } catch {
    receipt.provider = { status: 'READ_CHECK_FAILED', sends: 0 };
  }
  if (doctor.status !== 0) receipt.blockers.push('authenticated-provider-read-not-ready');
  receipt.blockers.push('independent-sender-consent-and-placement-gates-required');
  receipt.status = 'BLOCKED_FOR_SENDING';
  receipt.bobwork = await observeBobwork({apiKey: process.env.BOBWORK_API_KEY});
  if (process.env.BOBWORK_API_KEY && receipt.bobwork.status !== 'INVENTORY_OBSERVED') {
    receipt.blockers.push('bobwork-observation-not-verified');
  }
  if (process.env.UBERWARM_RECEIVER_EMAIL && process.env.UBERWARM_RECEIVER_ENCRYPTION_KEY) {
    receipt.receiver = await observeReceiverBinding({pool,
      receiverEmail:process.env.UBERWARM_RECEIVER_EMAIL,
      encryptionKey:process.env.UBERWARM_RECEIVER_ENCRYPTION_KEY});
  }
  if (process.env.UBERWARM_OPERATIONAL_RECEIPTS_ENABLED === '1') {
    journal = new pg.Pool({
      connectionString: process.env.DATABASE_URL, max: 1,
      connectionTimeoutMillis: 10000, statement_timeout: 10000, query_timeout: 12000,
      options: '-c default_transaction_read_only=off'
    });
    try {
      receipt.persistence = await persistOperationalSnapshot({pool: journal, receipt});
    } catch {
      receipt.persistence = {stored: false};
      receipt.status = 'INFRASTRUCTURE_CHECK_FAILED';
      receipt.blockers.push('operational-receipt-persistence-failed');
      process.exitCode = 1;
    }
  }
  console.log(JSON.stringify(receipt));
} catch {
  receipt.status = 'INFRASTRUCTURE_CHECK_FAILED';
  receipt.blockers.push('database-read-failed');
  console.log(JSON.stringify(receipt));
  process.exitCode = 1;
} finally {
  await pool.end();
  if (journal) await journal.end();
}
