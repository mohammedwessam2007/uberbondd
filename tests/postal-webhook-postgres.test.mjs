import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createPostgresPostalWebhookLedger } from '../src/omnia-v9/integrations/providers/postal-webhook-ledger.mjs';

const connectionString=process.env.OMNIA_V9_TEST_DATABASE_URL;
const run=Boolean(connectionString);

test('real PostgreSQL Postal webhook replay is idempotent', { skip:!run }, async()=>{
  const pool=new Pool({connectionString,max:1});
  try {
    const migration=await fs.readFile(new URL('../migrations/104_postal_webhook_events.sql',import.meta.url),'utf8');
    await pool.query(migration);
    const ledger=createPostgresPostalWebhookLedger(pool);
    const suffix=randomUUID();
    const event={
      occurrenceKey:`postal:${suffix}`,eventName:'MessageSent',lifecycle:'SENT',occurredAt:'2026-09-02T00:00:00.000Z',receivedAt:'2026-09-02T00:00:01.000Z',
      authenticated:true,quarantineReason:null,executionTagValid:true,executionTag:`v9_${'a'.repeat(48)}`,postalMessageId:`p-${suffix}`,
      messageId:`<v9-${'a'.repeat(64)}@example.test>`,to:'buyer@example.com',from:'outreach@example.test',subjectSha256:'b'.repeat(64),
      rawBodySha256:'c'.repeat(64),detailsDigest:'d'.repeat(64),provenance:'AUTHENTICATED_POSTAL_WEBHOOK',eligibleForReconciliation:true
    };
    const first=await ledger.append(event);
    const second=await ledger.append(event);
    assert.equal(first.status,'PERSISTED');
    assert.equal(second.status,'DUPLICATE');
    const rows=await ledger.findByTag(event.executionTag);
    assert.ok(rows.some(row=>row.occurrenceKey===event.occurrenceKey));
  } finally {
    await pool.end();
  }
});
