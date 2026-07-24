import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { newOrganization, newWebsite, newOpportunity } from '../../revenue-os/src/model.mjs';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'revenue-os', 'migrations');

test('every migration file applies cleanly, in order, against a real Postgres-compatible engine', async () => {
  const db = new PGlite();
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();
  assert.equal(files.length, 6);
  for (const file of files) {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.exec(sql);
  }
  const result = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  const tables = result.rows.map(row => row.table_name);
  assert.ok(tables.every(name => name.startsWith('ros_')), 'every table must be ros_-prefixed to avoid collision');
  assert.ok(tables.includes('ros_organizations'));
  assert.ok(tables.includes('ros_payments'));
  assert.ok(tables.includes('ros_jobs'));
});

test('ros_payments.status CHECK constraint enforces the mission\'s exact 13-state vocabulary', async () => {
  const db = new PGlite();
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) await db.exec(await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
  await db.exec(`INSERT INTO ros_payments (id, status) VALUES ('p1', 'VERIFIED')`);
  await assert.rejects(() => db.exec(`INSERT INTO ros_payments (id, status) VALUES ('p2', 'NOT_A_REAL_STATE')`));
});

test('newOrganization rejects an invalid kind and requires a name', () => {
  assert.throws(() => newOrganization({ kind: 'not-a-real-kind', name: 'x' }));
  assert.throws(() => newOrganization({ kind: 'agency', name: '' }));
  const org = newOrganization({ kind: 'agency', name: 'Acme' });
  assert.equal(org.kind, 'agency');
});

test('newWebsite and newOpportunity require their core fields', () => {
  assert.throws(() => newWebsite({ organizationId: 'org1' }));
  assert.throws(() => newOpportunity({ channel: 'email' }));
  const opp = newOpportunity({ organizationDomain: 'a.example.com', channel: 'email' });
  assert.equal(opp.status, 'candidate');
  assert.deepEqual(opp.data.demandSignals, []);
});
