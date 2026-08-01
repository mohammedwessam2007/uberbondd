import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export async function migratedDb() {
  const db = new PGlite();
  for (const name of ['001_initial.sql', '002_durable_queue.sql', '003_shared_artifacts.sql', '004_unattended_send_safety.sql', '005_revenue_os_control_plane.sql', '006_pr6_repair.sql', '007_pr6_repair_2.sql', '008_canon_v3_integration.sql', '009_canon_cohort_repair.sql']) {
    await db.exec(await fs.readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
  return db;
}

test('PostgreSQL migration creates every required table and index foundation', async () => {
  const db = await migratedDb();
  try {
    const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const names = new Set(tables.rows.map(row => row.table_name));
    for (const name of ['prospects','campaigns','jobs','messages','replies','suppressions','social_tasks','accounts','audit_log','settings','leads','orders','subscriptions','monitoring_runs','notifications','revenue_events','discovery_runs','worker_heartbeats','artifacts','outbound_reservations','sender_health','outbound_events']) {
      assert(names.has(name), `missing table ${name}`);
    }
  } finally { await db.close(); }
});

test('PR #7 repair: migrations 008/009 create the Canon cohort/ledger tables and source_evidence columns', async () => {
  const db = await migratedDb();
  try {
    const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const names = new Set(tables.rows.map(row => row.table_name));
    for (const name of ['campaign_activation_approvals', 'cost_ledger_entries', 'campaign_cohort_members']) {
      assert(names.has(name), `missing table ${name}`);
    }
    const columns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='source_evidence'");
    const columnNames = new Set(columns.rows.map(row => row.column_name));
    for (const name of ['source_family', 'claim_origin', 'last_verified_at', 'pre_send_verified_at']) {
      assert(columnNames.has(name), `missing source_evidence column ${name}`);
    }
  } finally { await db.close(); }
});

test('PR #7 repair: campaign_cohort_members rejects a duplicate organization or recipient within one approval', async () => {
  const db = await migratedDb();
  try {
    await db.query("INSERT INTO experiments(id, status, hypothesis, lane, variant, success_metric, data) VALUES ('exp1','active','h','lane','a','replies','{}'::jsonb)");
    await db.query("INSERT INTO campaign_activation_approvals(id, experiment_id, batch_hash, recipients_hash, sender_set, max_count, policy_version, approved_by, approved_at, expires_at, data) VALUES ('appr1','exp1','bh','rh','{sender-a}',1,'v1','owner',now(),now()+interval '1 day','{}'::jsonb)");
    await db.query("INSERT INTO campaign_cohort_members(id, approval_id, organization_domain, recipient_email, data) VALUES ('m1','appr1','acme.com','buyer@acme.com','{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO campaign_cohort_members(id, approval_id, organization_domain, recipient_email, data) VALUES ('m2','appr1','acme.com','buyer2@acme.com','{}'::jsonb)"));
    await assert.rejects(db.query("INSERT INTO campaign_cohort_members(id, approval_id, organization_domain, recipient_email, data) VALUES ('m3','appr1','other.com','buyer@acme.com','{}'::jsonb)"));
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
    await db.query("INSERT INTO revenue_events(id, provider_event_id, data) VALUES ('v1', 'rev-1', '{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO revenue_events(id, provider_event_id, data) VALUES ('v2', 'rev-1', '{}'::jsonb)"));
  } finally { await db.close(); }
});

test('PostgreSQL prospect claiming uses SKIP LOCKED-compatible state columns', async () => {
  const db = await migratedDb();
  try {
    await db.query("INSERT INTO campaigns(id, approved, auto_send, data) VALUES ('c1', true, false, '{}'::jsonb)");
    await db.query("INSERT INTO prospects(id, domain, campaign_id, status, created_at, data) VALUES ('p1', 'one.test', 'c1', 'queued', now(), '{\"id\":\"p1\",\"status\":\"queued\"}'::jsonb)");
    const result = await db.query(`WITH candidates AS (SELECT id FROM prospects WHERE status = ANY($1::text[]) ORDER BY created_at ASC NULLS FIRST FOR UPDATE SKIP LOCKED LIMIT $2) UPDATE prospects p SET status='claimed', updated_at=now(), data=jsonb_set(p.data,'{status}','\"claimed\"'::jsonb) FROM candidates c WHERE p.id=c.id RETURNING p.id`, [['queued'], 1]);
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

test('Revenue OS control-plane migration (005) creates every new table', async () => {
  const db = await migratedDb();
  try {
    const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const names = new Set(tables.rows.map(row => row.table_name));
    for (const name of ['source_evidence', 'experiments', 'opportunities', 'policy_decisions', 'message_variants', 'owner_gates']) {
      assert(names.has(name), `missing table ${name}`);
    }
  } finally { await db.close(); }
});

test('Revenue OS control-plane migration enforces identity uniqueness (source evidence, opportunities, message variants)', async () => {
  const db = await migratedDb();
  try {
    await db.query("INSERT INTO source_evidence(id,organization_domain,source_url,source_type,captured_at,content_hash,data) VALUES ('ev1','example.com','https://example.com/careers','official-company',now(),'hash1','{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO source_evidence(id,organization_domain,source_url,source_type,captured_at,content_hash,data) VALUES ('ev2','example.com','https://example.com/careers','official-company',now(),'hash1','{}'::jsonb)"));

    await db.query("INSERT INTO opportunities(id,idempotency_key,service_lane,data) VALUES ('op1','opportunity:example.com:website-qa:abc','website-qa','{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO opportunities(id,idempotency_key,service_lane,data) VALUES ('op2','opportunity:example.com:website-qa:abc','website-qa','{}'::jsonb)"));

    await db.query("INSERT INTO message_variants(id,lane,subject,body_hash,data) VALUES ('mv1','website-qa','Subject A','bodyhash1','{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO message_variants(id,lane,subject,body_hash,data) VALUES ('mv2','website-qa','Subject A','bodyhash1','{}'::jsonb)"));
  } finally { await db.close(); }
});

test('Revenue OS control-plane migration enforces numeric bounds (probability_bps, owner_minutes, delivery_hours)', async () => {
  const db = await migratedDb();
  try {
    await assert.rejects(db.query("INSERT INTO opportunities(id,idempotency_key,service_lane,probability_bps,data) VALUES ('op-bad','opportunity:x:y:z','website-qa',10001,'{}'::jsonb)"));
    await assert.rejects(db.query("INSERT INTO opportunities(id,idempotency_key,service_lane,owner_minutes,data) VALUES ('op-bad2','opportunity:x:y:z2',ARRAY['website-qa'][1],-1,'{}'::jsonb)"));
  } finally { await db.close(); }
});

// --- migration 006 (PR #6 repair): partner_routes/offers/rejections, stage CHECK, message content columns ---

test('PR #6 repair migration (006) creates partner_routes, offers, and rejections tables', async () => {
  const db = await migratedDb();
  try {
    const tables = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const names = new Set(tables.rows.map(row => row.table_name));
    for (const name of ['partner_routes', 'offers', 'rejections']) assert(names.has(name), `missing table ${name}`);
  } finally { await db.close(); }
});

test('PR #6 repair migration (006) enforces idempotency-key uniqueness on partner_routes, offers, and rejections', async () => {
  const db = await migratedDb();
  try {
    await db.query("INSERT INTO partner_routes(id,idempotency_key,organization_domain,service_lane,data) VALUES ('pr1','k1','example.com','website-qa','{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO partner_routes(id,idempotency_key,organization_domain,service_lane,data) VALUES ('pr2','k1','example.com','website-qa','{}'::jsonb)"));
    await db.query("INSERT INTO offers(id,idempotency_key,organization_domain,service_lane,data) VALUES ('of1','k2','example.com','website-qa','{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO offers(id,idempotency_key,organization_domain,service_lane,data) VALUES ('of2','k2','example.com','website-qa','{}'::jsonb)"));
    await db.query("INSERT INTO rejections(id,idempotency_key,organization_domain,service_lane,data) VALUES ('rj1','k3','example.com','website-qa','{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO rejections(id,idempotency_key,organization_domain,service_lane,data) VALUES ('rj2','k3','example.com','website-qa','{}'::jsonb)"));
  } finally { await db.close(); }
});

test('PR #6 repair migration (006) makes an invalid opportunity stage impossible to persist', async () => {
  const db = await migratedDb();
  try {
    await db.query("INSERT INTO opportunities(id,idempotency_key,service_lane,stage,data) VALUES ('op-stage-ok','opportunity:x:y:stage-ok','website-qa','ready_for_message','{}'::jsonb)");
    await assert.rejects(db.query("INSERT INTO opportunities(id,idempotency_key,service_lane,stage,data) VALUES ('op-stage-bad','opportunity:x:y:stage-bad','website-qa','not-a-real-stage','{}'::jsonb)"));
  } finally { await db.close(); }
});

test('PR #6 repair migration (006) adds message_variants.opportunity_id and .body columns', async () => {
  const db = await migratedDb();
  try {
    const columns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='message_variants'");
    const names = new Set(columns.rows.map(row => row.column_name));
    assert(names.has('opportunity_id'), 'missing message_variants.opportunity_id');
    assert(names.has('body'), 'missing message_variants.body');
  } finally { await db.close(); }
});
