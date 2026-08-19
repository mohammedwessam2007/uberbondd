import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { proveReservedBefore, verifyAuthorityTransitionChain } from '../src/omnia-v9/authority-transition-ledger.mjs';

function row({
  sequence = 1,
  digest = 'a'.repeat(64),
  previous = null,
  fromStatus = null,
  toStatus = 'PENDING',
  occurredAt = '2026-08-08T10:00:00.000Z',
  tenantId = 'tenant1',
  intentDigest = 'b'.repeat(64),
  approvalId = 'approval1',
  idempotencyKey = 'send:p1:0',
  reason = ''
} = {}) {
  const event = {
    schemaVersion: 'omnia.v9.authority-transition.p9',
    idempotencyKey,
    sequenceNo: sequence,
    tenantId,
    intentDigest,
    approvalId,
    fromStatus,
    toStatus,
    reason,
    previousEventDigest: previous,
    occurredAt,
    eventDigest: digest
  };
  return {
    event_digest: digest,
    idempotency_key: idempotencyKey,
    sequence_no: sequence,
    tenant_id: tenantId,
    intent_digest: intentDigest,
    approval_id: approvalId,
    from_status: fromStatus,
    to_status: toStatus,
    reason,
    previous_event_digest: previous,
    occurred_at: occurredAt,
    created_at: occurredAt,
    event,
    recomputed_digest: digest
  };
}

function fakePool(rows) {
  return { query: async () => ({ rows }) };
}

function validRows() {
  const first = row();
  const second = row({
    sequence: 2,
    digest: 'c'.repeat(64),
    previous: first.event_digest,
    fromStatus: 'PENDING',
    toStatus: 'RESERVED',
    occurredAt: '2026-08-08T10:01:00.000Z'
  });
  const third = row({
    sequence: 3,
    digest: 'd'.repeat(64),
    previous: second.event_digest,
    fromStatus: 'RESERVED',
    toStatus: 'COMMITTED',
    reason: 'provider-accepted',
    occurredAt: '2026-08-08T10:02:00.000Z'
  });
  return [first, second, third];
}

test('P9 accepts a continuous identity-stable authority transition chain', async () => {
  const result = await verifyAuthorityTransitionChain({ pool: fakePool(validRows()), idempotencyKey: 'send:p1:0' });
  assert.equal(result.ok, true);
  assert.equal(result.currentStatus, 'COMMITTED');
  assert.equal(result.events.length, 3);
  assert.equal(result.headDigest, 'd'.repeat(64));
});

test('P9 proves exactly one RESERVED transition existed before the effect boundary', async () => {
  const result = await proveReservedBefore({
    pool: fakePool(validRows()),
    idempotencyKey: 'send:p1:0',
    boundaryAt: '2026-08-08T10:01:30.000Z',
    tenantId: 'tenant1',
    intentDigest: 'b'.repeat(64),
    approvalId: 'approval1'
  });
  assert.equal(result.ok, true);
  assert.equal(result.reservedEvent.sequenceNo, 2);
});

test('P9 refuses chain-link surgery', async () => {
  const rows = validRows();
  rows[2] = { ...rows[2], previous_event_digest: 'e'.repeat(64), event: { ...rows[2].event, previousEventDigest: 'e'.repeat(64) } };
  const result = await verifyAuthorityTransitionChain({ pool: fakePool(rows), idempotencyKey: 'send:p1:0' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'authority-transition-chain-link-mismatch');
});

test('P9 refuses a database/event digest disagreement', async () => {
  const rows = validRows();
  rows[1] = { ...rows[1], recomputed_digest: 'f'.repeat(64) };
  const result = await verifyAuthorityTransitionChain({ pool: fakePool(rows), idempotencyKey: 'send:p1:0' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'authority-transition-digest-mismatch');
});

test('P9 refuses identity drift inside one reservation chain', async () => {
  const rows = validRows();
  rows[2] = { ...rows[2], tenant_id: 'tenant2', event: { ...rows[2].event, tenantId: 'tenant2' } };
  const result = await verifyAuthorityTransitionChain({ pool: fakePool(rows), idempotencyKey: 'send:p1:0' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'authority-transition-tenant-drift');
});

test('P9 refuses RESERVED authorization that happened after the effect boundary', async () => {
  const result = await proveReservedBefore({
    pool: fakePool(validRows()),
    idempotencyKey: 'send:p1:0',
    boundaryAt: '2026-08-08T10:00:30.000Z'
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'authority-not-reserved-before-effect');
});

test('P9 chain verification treats a native Date occurred_at column (as returned by node-postgres) as equal to its sub-second-precision ISO event timestamp', async () => {
  // node-postgres parses timestamptz columns into JS Date objects, while the
  // jsonb `event` payload stores occurredAt as an ISO string. A prior defect
  // compared them via Date.parse(String(dateObject)), which invokes
  // Date.prototype.toString() and silently truncates sub-second precision,
  // producing spurious authority-transition-time-mismatch failures (or worse,
  // falsely satisfying "reserved before boundary" checks) whenever a real
  // PostgreSQL driver was used instead of a string-returning shim.
  const occurredAtIso = '2026-08-08T10:00:00.837Z';
  const genesis = {
    event_digest: 'a'.repeat(64),
    idempotency_key: 'send:p1:0',
    sequence_no: 1,
    tenant_id: 'tenant1',
    intent_digest: 'b'.repeat(64),
    approval_id: 'approval1',
    from_status: null,
    to_status: 'PENDING',
    reason: '',
    previous_event_digest: null,
    occurred_at: new Date(occurredAtIso),
    created_at: new Date(occurredAtIso),
    event: {
      schemaVersion: 'omnia.v9.authority-transition.p9',
      idempotencyKey: 'send:p1:0',
      sequenceNo: 1,
      tenantId: 'tenant1',
      intentDigest: 'b'.repeat(64),
      approvalId: 'approval1',
      fromStatus: null,
      toStatus: 'PENDING',
      reason: '',
      previousEventDigest: null,
      occurredAt: occurredAtIso,
      eventDigest: 'a'.repeat(64)
    },
    recomputed_digest: 'a'.repeat(64)
  };
  const result = await verifyAuthorityTransitionChain({ pool: fakePool([genesis]), idempotencyKey: 'send:p1:0' });
  assert.equal(result.ok, true);
  assert.equal(result.events.length, 1);
});

test('P9 chain verification still rejects a genuine sub-second time disagreement even when occurred_at is a Date object', async () => {
  const genesis = {
    event_digest: 'a'.repeat(64),
    idempotency_key: 'send:p1:0',
    sequence_no: 1,
    tenant_id: 'tenant1',
    intent_digest: 'b'.repeat(64),
    approval_id: 'approval1',
    from_status: null,
    to_status: 'PENDING',
    reason: '',
    previous_event_digest: null,
    occurred_at: new Date('2026-08-08T10:00:00.837Z'),
    created_at: new Date('2026-08-08T10:00:00.837Z'),
    event: {
      schemaVersion: 'omnia.v9.authority-transition.p9',
      idempotencyKey: 'send:p1:0',
      sequenceNo: 1,
      tenantId: 'tenant1',
      intentDigest: 'b'.repeat(64),
      approvalId: 'approval1',
      fromStatus: null,
      toStatus: 'PENDING',
      reason: '',
      previousEventDigest: null,
      occurredAt: '2026-08-08T10:00:05.000Z',
      eventDigest: 'a'.repeat(64)
    },
    recomputed_digest: 'a'.repeat(64)
  };
  const result = await verifyAuthorityTransitionChain({ pool: fakePool([genesis]), idempotencyKey: 'send:p1:0' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'authority-transition-time-mismatch');
});

const realPostgresUrl = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

function hexFor(label) {
  return createHash('sha256').update(label).digest('hex');
}

async function migrateRealPostgres(pool) {
  for (const migration of ['005_omnia_v9_proof_store.sql', '008_omnia_v9_authority_transition_ledger.sql']) {
    await pool.query(await fs.readFile(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  }
}

test('real PostgreSQL atomically captures direct authority mutations and makes provenance append-only', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 2 });
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const idempotencyKey = `p9:${suffix}`;
  const intentDigest = '1'.repeat(64);
  try {
    await migrateRealPostgres(pool);
    await pool.query(
      `INSERT INTO omnia_v9_authority_reservations(
         idempotency_key,intent_digest,approval_id,tenant_id,use_delta,cost_delta_usd,blast_radius,status,reason
       ) VALUES ($1,$2,$3,$4,1,0.01,1,'PENDING','')`,
      [idempotencyKey, intentDigest, `approval_${suffix}`, 'tenant_real']
    );
    await pool.query(
      `UPDATE omnia_v9_authority_reservations SET status='RESERVED',updated_at=now() WHERE idempotency_key=$1`,
      [idempotencyKey]
    );
    await pool.query(
      `UPDATE omnia_v9_authority_reservations SET status='COMMITTED',reason='provider-accepted',updated_at=now() WHERE idempotency_key=$1`,
      [idempotencyKey]
    );

    const chain = await verifyAuthorityTransitionChain({ pool, idempotencyKey });
    assert.equal(chain.ok, true);
    assert.deepEqual(chain.events.map(event => event.toStatus), ['PENDING', 'RESERVED', 'COMMITTED']);
    assert.equal(chain.events[1].fromStatus, 'PENDING');
    assert.equal(chain.events[2].previousEventDigest, chain.events[1].eventDigest);

    const proof = await proveReservedBefore({
      pool,
      idempotencyKey,
      boundaryAt: chain.events[2].occurredAt,
      tenantId: 'tenant_real',
      intentDigest,
      approvalId: `approval_${suffix}`
    });
    assert.equal(proof.ok, true);

    await assert.rejects(
      pool.query(`UPDATE omnia_v9_authority_transition_events SET reason='forged' WHERE idempotency_key=$1 AND sequence_no=2`, [idempotencyKey])
    );
    await assert.rejects(
      pool.query(`DELETE FROM omnia_v9_authority_transition_events WHERE idempotency_key=$1 AND sequence_no=2`, [idempotencyKey])
    );
  } finally {
    await pool.end();
  }
});

test('real PostgreSQL: a forged event row inserted directly (bypassing the reservation trigger) with sequence-number surgery is detected', { skip: !realPostgresUrl }, async () => {
  // The append-only triggers only guard UPDATE/DELETE on the events table; there is
  // no trigger preventing a direct INSERT that bypasses the reservation-table trigger
  // entirely. This proves the application-level chain verifier still detects such a
  // forged row using PostgreSQL's own digest() computation, not a JS-side mock.
  const pool = new Pool({ connectionString: realPostgresUrl, max: 2 });
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const idempotencyKey = `p9forge:${suffix}`;
  const intentDigest = '2'.repeat(64);
  try {
    await migrateRealPostgres(pool);
    await pool.query(
      `INSERT INTO omnia_v9_authority_reservations(
         idempotency_key,intent_digest,approval_id,tenant_id,use_delta,cost_delta_usd,blast_radius,status,reason
       ) VALUES ($1,$2,$3,$4,1,0.01,1,'PENDING','')`,
      [idempotencyKey, intentDigest, `approval_${suffix}`, 'tenant_real']
    );
    await pool.query(
      `UPDATE omnia_v9_authority_reservations SET status='RESERVED',updated_at=now() WHERE idempotency_key=$1`,
      [idempotencyKey]
    );

    // Sequence surgery: insert a forged row that jumps ahead past the real next
    // sequence number, skipping over the gap.
    const forgedDigest = hexFor(`forge-seq:${suffix}`);
    await pool.query(
      `INSERT INTO omnia_v9_authority_transition_events(
         event_digest,idempotency_key,sequence_no,tenant_id,intent_digest,approval_id,
         from_status,to_status,reason,previous_event_digest,occurred_at,event
       ) VALUES ($1,$2,9,$3,$4,$5,'RESERVED','COMMITTED','forged-sequence-jump',NULL,now(),$6::jsonb)`,
      [
        forgedDigest, idempotencyKey, 'tenant_real', intentDigest, `approval_${suffix}`,
        JSON.stringify({
          schemaVersion: 'omnia.v9.authority-transition.p9', idempotencyKey, sequenceNo: 9,
          tenantId: 'tenant_real', intentDigest, approvalId: `approval_${suffix}`,
          fromStatus: 'RESERVED', toStatus: 'COMMITTED', reason: 'forged-sequence-jump',
          previousEventDigest: null, occurredAt: new Date().toISOString(), eventDigest: forgedDigest
        })
      ]
    );

    const chain = await verifyAuthorityTransitionChain({ pool, idempotencyKey });
    assert.equal(chain.ok, false);
    assert.equal(chain.reason, 'authority-transition-sequence-gap');
  } finally {
    await pool.end();
  }
});

test('real PostgreSQL: a forged event row with a digest that does not match PostgreSQL\'s own recomputation is detected', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 2 });
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const idempotencyKey = `p9digest:${suffix}`;
  const intentDigest = '3'.repeat(64);
  try {
    await migrateRealPostgres(pool);
    await pool.query(
      `INSERT INTO omnia_v9_authority_reservations(
         idempotency_key,intent_digest,approval_id,tenant_id,use_delta,cost_delta_usd,blast_radius,status,reason
       ) VALUES ($1,$2,$3,$4,1,0.01,1,'PENDING','')`,
      [idempotencyKey, intentDigest, `approval_${suffix}`, 'tenant_real']
    );

    // Genesis row now exists at sequence_no=1 via the trigger. Directly insert a
    // sequence_no=2 row whose event_digest column disagrees with what PostgreSQL's
    // digest() function actually computes over the stored event payload.
    const genesis = await pool.query(
      `SELECT event_digest FROM omnia_v9_authority_transition_events WHERE idempotency_key=$1 AND sequence_no=1`,
      [idempotencyKey]
    );
    const previousDigest = genesis.rows[0].event_digest;
    const wrongDigest = hexFor(`forge-digest:${suffix}`);
    const forgedEvent = {
      schemaVersion: 'omnia.v9.authority-transition.p9', idempotencyKey, sequenceNo: 2,
      tenantId: 'tenant_real', intentDigest, approvalId: `approval_${suffix}`,
      fromStatus: 'PENDING', toStatus: 'RESERVED', reason: '',
      previousEventDigest: previousDigest, occurredAt: new Date().toISOString(),
      eventDigest: wrongDigest
    };
    await pool.query(
      `INSERT INTO omnia_v9_authority_transition_events(
         event_digest,idempotency_key,sequence_no,tenant_id,intent_digest,approval_id,
         from_status,to_status,reason,previous_event_digest,occurred_at,event
       ) VALUES ($1,$2,2,$3,$4,$5,'PENDING','RESERVED','',$6,now(),$7::jsonb)`,
      [wrongDigest, idempotencyKey, 'tenant_real', intentDigest, `approval_${suffix}`, previousDigest, JSON.stringify(forgedEvent)]
    );

    const chain = await verifyAuthorityTransitionChain({ pool, idempotencyKey });
    assert.equal(chain.ok, false);
    assert.equal(chain.reason, 'authority-transition-digest-mismatch');
  } finally {
    await pool.end();
  }
});
