import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

async function migratedDb() {
  const db = new PGlite();
  for (const name of [
    '001_initial.sql', '002_durable_queue.sql', '003_shared_artifacts.sql',
    '004_unattended_send_safety.sql', '106_lead_intelligence_collections.sql'
  ]) {
    await db.exec(await fs.readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  return db;
}

test('PostgreSQL has backing tables for every durable lead-intelligence collection', async () => {
  const db = await migratedDb();
  try {
    const result = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const tables = new Set(result.rows.map(row => row.table_name));
    for (const name of [
      'provider_events', 'lead_lists', 'reply_drafts', 'automation_plans',
      'automation_runs', 'lead_searches', 'lead_signals', 'lead_enrichment_runs',
      'lead_intake_events', 'lead_field_results', 'lead_tasks'
    ]) assert(tables.has(name), `missing table ${name}`);
  } finally {
    await db.close();
  }
});

test('lead-intelligence migration preserves idempotent signal and intake identities', async () => {
  const db = await migratedDb();
  try {
    await db.query("INSERT INTO campaigns(id, data) VALUES ('c1', '{}'::jsonb)");
    await db.query("INSERT INTO prospects(id, domain, campaign_id, data) VALUES ('p1', 'lead-schema.test', 'c1', '{}'::jsonb)");
    await db.query("INSERT INTO lead_signals(id, prospect_id, data) VALUES ('s1', 'p1', '{\"digest\":\"same\"}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO lead_signals(id, prospect_id, data) VALUES ('s2', 'p1', '{\"digest\":\"same\"}'::jsonb)"));
    await db.query("INSERT INTO lead_intake_events(id, data) VALUES ('i1', '{\"idempotencyKey\":\"one\"}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO lead_intake_events(id, data) VALUES ('i2', '{\"idempotencyKey\":\"one\"}'::jsonb)"));
  } finally {
    await db.close();
  }
});
