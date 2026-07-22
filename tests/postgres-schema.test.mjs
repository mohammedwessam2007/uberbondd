import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

async function migratedDb() {
  const db = new PGlite();
  for (const name of ['001_initial.sql', '002_durable_queue.sql', '003_shared_artifacts.sql', '004_unattended_send_safety.sql', '005_offer_payment_state.sql', '006_paid_delivery_workflow.sql', '007_acquisition_learning.sql', '008_autonomy_cycle.sql']) {
    await db.exec(await fs.readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  return db;
}

test('PostgreSQL migration creates every required table and index foundation', async () => {
  const db = await migratedDb();
  try {
    const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const names = new Set(tables.rows.map(row => row.table_name));
    for (const name of ['prospects','campaigns','jobs','messages','replies','suppressions','social_tasks','accounts','audit_log','settings','leads','orders','offers','deliveries','subscriptions','monitoring_runs','notifications','revenue_events','discovery_runs','worker_heartbeats','artifacts','outbound_reservations','sender_health','outbound_events','autonomy_cycle_runs']) {
      assert(names.has(name), `missing table ${name}`);
    }
  } finally { await db.close(); }
});

test('PostgreSQL constraints reject duplicate business and provider identities', async () => {
  const db = await migratedDb();
  try {
    await db.query("INSERT INTO campaigns(id, approved, auto_send, data) VALUES ('c1', true, false, '{}'::jsonb)");
    await db.query("INSERT INTO prospects(id, domain, campaign_id, data) VALUES ('p1', 'example.com', 'c1', '{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO prospects(id, domain, campaign_id, data) VALUES ('p2', 'example.com', 'c1', '{}'::jsonb)"));
    await db.query("INSERT INTO suppressions(id, value, data) VALUES ('s1', 'no@example.com', '{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO suppressions(id, value, data) VALUES ('s2', 'no@example.com', '{}'::jsonb)"));
    await db.query("INSERT INTO replies(id, gmail_id, data) VALUES ('r1', 'gmail-1', '{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO replies(id, gmail_id, data) VALUES ('r2', 'gmail-1', '{}'::jsonb)"));
    await db.query("INSERT INTO accounts(id, slot, data) VALUES ('a1', 'A', '{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO accounts(id, slot, data) VALUES ('a2', 'A', '{}'::jsonb)"));
    await db.query("INSERT INTO orders(id, provider_event_id, data) VALUES ('o1', 'evt-1', '{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO orders(id, provider_event_id, data) VALUES ('o2', 'evt-1', '{}'::jsonb)"));
    await db.query("INSERT INTO offers(id, campaign_id, prospect_id, type, status, data) VALUES ('offer-1', 'c1', 'p1', 'diagnostic', 'draft', '{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO offers(id, campaign_id, prospect_id, type, status, data) VALUES ('offer-2', 'c1', 'p1', 'diagnostic', 'draft', '{}'::jsonb)"));
    await db.query("INSERT INTO deliveries(id, offer_id, order_id, campaign_id, prospect_id, status, delivery_deadline, data) VALUES ('delivery-1', 'offer-1', 'o1', 'c1', 'p1', 'delivery-queued', now(), '{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO deliveries(id, offer_id, order_id, status, delivery_deadline, data) VALUES ('delivery-2', 'offer-1', 'o1', 'delivery-queued', now(), '{}'::jsonb)"));
    await db.query("INSERT INTO revenue_events(id, provider_event_id, data) VALUES ('v1', 'rev-1', '{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO revenue_events(id, provider_event_id, data) VALUES ('v2', 'rev-1', '{}'::jsonb)"));
  } finally { await db.close(); }
});

test('PostgreSQL prospect claiming uses SKIP LOCKED-compatible state columns', async () => {
  const db = await migratedDb();
  try {
    await db.query("INSERT INTO campaigns(id, approved, auto_send, data) VALUES ('c1', true, false, '{}'::jsonb)");
    await db.query("INSERT INTO prospects(id, domain, campaign_id, status, created_at, data) VALUES ('future', 'future.test', 'c1', 'retry', '2020-01-01', '{\"id\":\"future\",\"status\":\"retry\",\"nextCrawlAt\":\"2999-01-01T00:00:00.000Z\"}'::jsonb)");
    await db.query("INSERT INTO prospects(id, domain, campaign_id, status, created_at, data) VALUES ('p1', 'one.test', 'c1', 'queued', now(), '{\"id\":\"p1\",\"status\":\"queued\"}'::jsonb)");
    const result = await db.query(`WITH candidates AS (SELECT id FROM prospects WHERE status = ANY($1::text[]) AND COALESCE((data->>'nextCrawlAt')::timestamptz, now()) <= now() ORDER BY created_at ASC NULLS FIRST FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE prospects p SET status='claimed', updated_at=now(), data=jsonb_set(p.data,'{status}','\"claimed\"'::jsonb) FROM candidates c WHERE p.id=c.id RETURNING p.id`, [['queued','retry'], 1]);
    assert.equal(result.rows[0].id, 'p1');
  } finally { await db.close(); }
});


test('durable queue migration adds retry, locking, dedupe, and dead-letter columns', async () => {
  const db = await migratedDb();
  try {
    const columns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='jobs'");
    const names = new Set(columns.rows.map(row => row.column_name));
    for (const name of ['queue','priority','attempts','max_attempts','run_at','locked_at','locked_by','heartbeat_at','last_error','dedupe_key','singleton_key','dead_lettered_at','result']) {
      assert(names.has(name), `missing jobs.${name}`);
    }
    await db.query(`INSERT INTO jobs(id,type,queue,status,dedupe_key,run_at,data) VALUES ('j1','test','test','queued','once',now(),'{"id":"j1","status":"queued"}'::jsonb)`);
    await assert.rejects(db.query(`INSERT INTO jobs(id,type,queue,status,dedupe_key,run_at,data) VALUES ('j2','test','test','queued','once',now(),'{"id":"j2","status":"queued"}'::jsonb)`));
    await db.query(`INSERT INTO jobs(id,type,queue,status,singleton_key,run_at,data) VALUES ('j3','single','single','active','one-active',now(),'{"id":"j3","status":"active"}'::jsonb)`);
    await assert.rejects(db.query(`INSERT INTO jobs(id,type,queue,status,singleton_key,run_at,data) VALUES ('j4','single','single','queued','one-active',now(),'{"id":"j4","status":"queued"}'::jsonb)`));
    await db.query(`UPDATE jobs SET status='completed' WHERE id='j3'`);
    await db.query(`INSERT INTO jobs(id,type,queue,status,singleton_key,run_at,data) VALUES ('j5','single','single','queued','one-active',now(),'{"id":"j5","status":"queued"}'::jsonb)`);
  } finally { await db.close(); }
});


test('shared artifact table stores binary screenshots for separate web and worker services', async () => {
  const db = await migratedDb();
  try {
    const content = Buffer.from('png-bytes');
    await db.query(`INSERT INTO artifacts(id,content_type,byte_size,sha256,metadata,content) VALUES ('artifact_test','image/png',$1,'hash','{}'::jsonb,$2)`, [content.length, content]);
    const result = await db.query(`SELECT content_type,byte_size,content FROM artifacts WHERE id='artifact_test'`);
    assert.equal(result.rows[0].content_type, 'image/png');
    assert.equal(Number(result.rows[0].byte_size), content.length);
    assert.equal(Buffer.from(result.rows[0].content).toString(), 'png-bytes');
  } finally { await db.close(); }
});

test('PostgreSQL can atomically claim one requested prospect without taking the oldest unrelated row', async () => {
  const db = await migratedDb();
  try {
    await db.query("INSERT INTO campaigns(id, approved, auto_send, data) VALUES ('c-target', true, false, '{}'::jsonb)");
    await db.query("INSERT INTO prospects(id, domain, campaign_id, status, created_at, data) VALUES ('old-target', 'old-target.test', 'c-target', 'queued', '2026-01-01', '{\"id\":\"old-target\",\"status\":\"queued\"}'::jsonb)");
    await db.query("INSERT INTO prospects(id, domain, campaign_id, status, created_at, data) VALUES ('wanted-target', 'wanted-target.test', 'c-target', 'queued', '2026-02-01', '{\"id\":\"wanted-target\",\"status\":\"queued\"}'::jsonb)");
    const result = await db.query(`UPDATE prospects SET status='claimed', data=jsonb_set(data,'{status}','\"claimed\"'::jsonb) WHERE id=$1 AND status=ANY($2::text[]) RETURNING id`, ['wanted-target', ['queued','new','retry','error']]);
    assert.equal(result.rows[0].id, 'wanted-target');
    const old = await db.query("SELECT status FROM prospects WHERE id='old-target'");
    assert.equal(old.rows[0].status, 'queued');
  } finally { await db.close(); }
});


test('outbound safety migration enforces durable idempotency and sender health uniqueness', async () => {
  const db = await migratedDb();
  try {
    await db.query("INSERT INTO outbound_reservations(id,idempotency_key,inbox,recipient_email,status,reserved_at,data) VALUES ('or1','initial:p1','A','info@example.com','reserved',now(),'{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO outbound_reservations(id,idempotency_key,inbox,recipient_email,status,reserved_at,data) VALUES ('or2','initial:p1','A','info@example.com','reserved',now(),'{}'::jsonb)"));
    await db.query("INSERT INTO sender_health(id,inbox,data) VALUES ('sh1','A','{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO sender_health(id,inbox,data) VALUES ('sh2','A','{}'::jsonb)"));
  } finally { await db.close(); }
});

test('offer migration links payment events and indexes explicit payment state', async () => {
  const db = await migratedDb();
  try {
    const columns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='orders'");
    const names = new Set(columns.rows.map(row => row.column_name));
    for (const name of ['offer_id', 'payment_state', 'occurred_at']) assert(names.has(name), `missing orders.${name}`);
    const indexes = await db.query("SELECT indexname FROM pg_indexes WHERE tablename IN ('offers','orders')");
    const indexNames = new Set(indexes.rows.map(row => row.indexname));
    assert(indexNames.has('offers_prospect_type_unique'));
    assert(indexNames.has('orders_offer_time_idx'));
  } finally { await db.close(); }
});

test('delivery migration links one delivery to each verified payment event', async () => {
  const db = await migratedDb();
  try {
    const columns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='deliveries'");
    const names = new Set(columns.rows.map(row => row.column_name));
    for (const name of ['offer_id', 'order_id', 'campaign_id', 'prospect_id', 'lead_id', 'status', 'delivery_deadline']) assert(names.has(name), `missing deliveries.${name}`);
    const indexes = await db.query("SELECT indexname FROM pg_indexes WHERE tablename='deliveries'");
    const indexNames = new Set(indexes.rows.map(row => row.indexname));
    assert(indexNames.has('deliveries_order_unique'));
    assert(indexNames.has('deliveries_status_deadline_idx'));
  } finally { await db.close(); }
});

test('CON-01/F-04: the database refuses a second active autonomy cycle, even with a different run key', async () => {
  const db = await migratedDb();
  try {
    await db.query(`INSERT INTO autonomy_cycle_runs(id, run_key, status, lease_owner, lease_expires_at)
      VALUES ('run1', 'key-one', 'active', 'worker-a', now() + interval '5 minutes')`);
    await assert.rejects(db.query(`INSERT INTO autonomy_cycle_runs(id, run_key, status, lease_owner, lease_expires_at)
      VALUES ('run2', 'key-two', 'active', 'worker-b', now() + interval '5 minutes')`));
    // Completing the first frees the slot for a genuinely new cycle.
    await db.query(`UPDATE autonomy_cycle_runs SET status='completed', finalized_at=now() WHERE id='run1'`);
    await db.query(`INSERT INTO autonomy_cycle_runs(id, run_key, status, lease_owner, lease_expires_at)
      VALUES ('run3', 'key-two', 'active', 'worker-b', now() + interval '5 minutes')`);
  } finally { await db.close(); }
});

test('same run key is rejected as a duplicate cycle (idempotent run creation)', async () => {
  const db = await migratedDb();
  try {
    await db.query(`INSERT INTO autonomy_cycle_runs(id, run_key, status, lease_owner, lease_expires_at)
      VALUES ('run1', 'same-key', 'completed', 'worker-a', now())`);
    await assert.rejects(db.query(`INSERT INTO autonomy_cycle_runs(id, run_key, status, lease_owner, lease_expires_at)
      VALUES ('run2', 'same-key', 'active', 'worker-b', now() + interval '5 minutes')`));
  } finally { await db.close(); }
});

test('autonomy cycle status is constrained to known values', async () => {
  const db = await migratedDb();
  try {
    await assert.rejects(db.query(`INSERT INTO autonomy_cycle_runs(id, run_key, status, lease_owner, lease_expires_at)
      VALUES ('run1', 'bad-status', 'running-forever', 'worker-a', now())`));
  } finally { await db.close(); }
});

test('CAS: a stale version number is rejected instead of silently overwriting newer progress', async () => {
  const db = await migratedDb();
  try {
    await db.query(`INSERT INTO autonomy_cycle_runs(id, run_key, status, version, lease_owner, lease_expires_at)
      VALUES ('run1', 'cas-key', 'active', 0, 'worker-a', now() + interval '5 minutes')`);
    const first = await db.query(`UPDATE autonomy_cycle_runs SET version = version + 1, stages = '{"discover":"done"}'::jsonb, updated_at = now()
      WHERE id='run1' AND version = 0 RETURNING version`);
    assert.equal(first.rows[0].version, 1);
    // A second writer still holding the old version number (e.g. a resumed process that read
    // state before the first writer committed) must not be able to overwrite it.
    const stale = await db.query(`UPDATE autonomy_cycle_runs SET version = version + 1, stages = '{"discover":"overwritten"}'::jsonb, updated_at = now()
      WHERE id='run1' AND version = 0 RETURNING version`);
    assert.equal(stale.rows.length, 0);
    const current = await db.query(`SELECT version, stages FROM autonomy_cycle_runs WHERE id='run1'`);
    assert.equal(current.rows[0].version, 1);
    assert.deepEqual(current.rows[0].stages, { discover: 'done' });
  } finally { await db.close(); }
});
