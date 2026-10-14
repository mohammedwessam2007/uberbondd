// Hostile proof for the UberWarm2 owner-seed send path.
//
// The reservation, template, rolling-window and recompiled-plan cases run
// through executeUberWarm2SeedProbe with fakes for transport and store. The
// boundary case runs the executor against the real PostgreSQL ledger on a
// disposable server from withDisposablePostgres. Addresses are synthetic and
// owned by the test. Nothing reaches an SMTP server, provider or DNS.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { withDisposablePostgres } from '../scripts/disposable-postgres.mjs';
import { createUberWarm2PgLedger } from '../src/uberwarm2-pg-ledger.mjs';
import * as warm from '../src/uberwarm2-seed-executor.mjs';
import {
  compileUberWarm2SeedBatch, executeUberWarm2SeedProbe as rawExecuteSeedProbe,
  createUberWarm2SeedApprovalProof
} from '../src/uberwarm2-seed-executor.mjs';

const MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'migrations-pending', '20261012_uberwarm2_seed_one_shot.sql'
);
const KEY = 'test-only-never-production-seed-approval-hmac-key-2026';
// Absent before the fix, so a missing export is a plain assertion failure rather than a load error.
const TEMPLATE_DIGEST = warm.UBERWARM2_SEED_TEMPLATE_DIGEST ?? 'sha256:template-digest-not-exported';
const T = new Date('2026-10-12T18:00:00.000Z');
const T1 = new Date('2026-10-12T18:02:00.000Z');
const T2 = new Date('2026-10-12T18:03:00.000Z');
const SENDER = 'tara@example.net';
const SEED_A = 'owned-seed@gmail.com';
const SEED_B = 'owned-seed@outlook.com';
const MAILBOXES = [{ mailboxId: 'tara', address: SENDER, authenticationStatus: 'AUTHENTICATED', paused: false }];
const SEEDS = [
  { email: SEED_A, ownerControlled: true, receiveReady: true, consentToTest: true, consentEvidenceRef: 'owner-test-agreement:g' },
  { email: SEED_B, ownerControlled: true, receiveReady: true, consentToTest: true, consentEvidenceRef: 'owner-test-agreement:m' }
];

function executeUberWarm2SeedProbe(args) {
  return rawExecuteSeedProbe({
    verifyCurrentSenderHealth: async () => true,
    verifyCurrentSeedConsent: async () => true,
    ...args
  });
}

function probe(probeId, seedEmail = SEED_A) {
  return {
    probeId, bodyToken: probeId, senderEmail: SENDER, seedEmail, seedProvider: 'google',
    authority: 'PLAN_ONLY', sendAuthorized: false
  };
}

function batch(now = T, probes = [probe('uw2-probe-a', SEED_A), probe('uw2-probe-b', SEED_B)]) {
  return compileUberWarm2SeedBatch({ placementPlan: { probes }, mailboxes: MAILBOXES, seedInboxes: SEEDS, now });
}

// The digest is unkeyed, so anyone holding a batch object can recompute it.
// This is the attacker capability the executor must not rely on alone.
function redigest(b) {
  const canonical = { version: warm.UBERWARM2_SEED_EXECUTION_VERSION, createdAt: b.createdAt, probes: b.probes };
  return { ...b, batchDigest: `sha256:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}` };
}

function approval(b, { templateDigest = TEMPLATE_DIGEST, expiresAt = '2026-10-12T19:00:00Z' } = {}) {
  const entry = {
    granted: true, grantedBy: 'founder', expiresAt,
    scopes: ['uberwarm2:owner-controlled-seed-test'],
    batchDigest: b.batchDigest, evidenceRef: 'owner-authorized-fixture', templateDigest
  };
  return { ...entry, proof: createUberWarm2SeedApprovalProof({ approval: entry, verificationKey: KEY }) };
}

// A store with the one-shot semantics of the durable ledger, keyed by reservation.
function store() {
  const seen = new Set(), finished = [], claims = [];
  return {
    seen, finished, claims,
    async claimOnceAndEnforceCaps(r) {
      claims.push(r);
      if (seen.has(r.reservationKey)) return { ok: false, reason: 'replay-blocked' };
      seen.add(r.reservationKey);
      return { ok: true, claimed: true, capsEnforced: true, reservationKey: r.reservationKey };
    },
    async finalize(r) { finished.push(r); return { ok: true }; }
  };
}

function transport() {
  const calls = [];
  return {
    calls,
    async sendOwnedSeed(x) {
      calls.push(x);
      return { ok: true, accepted: true, messageId: 'provider-message-id-' + x.probeId };
    }
  };
}

function settleWithin(promise, label, ms = 60000) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

function shiftDay(day, offset) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

test('UW2-SEED-01: a recompiled plan with the same probeId cannot send that probe again', async () => {
  const first = batch(T), recompiled = batch(T1);
  assert.notEqual(first.batchDigest, recompiled.batchDigest);
  const probeId = first.probes[0].probeId;
  const s = store(), tx = transport();
  const sent = await executeUberWarm2SeedProbe({
    batch: first, probeId, approval: approval(first), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(sent.status, 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN');
  const replay = await executeUberWarm2SeedProbe({
    batch: recompiled, probeId, approval: approval(recompiled), approvalVerificationKey: KEY, store: s, transport: tx, now: T2
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 'UBERWARM2_PROBE_NOT_CLAIMED');
  assert.equal(tx.calls.length, 1);
});

test('UW2-SEED-02: a probe body replaced after compile is refused with no claim and no transport call', async () => {
  const b = batch(), p = b.probes[0];
  const tampered = redigest({
    ...b, probes: [{ ...p, body: `Limited offer, buy now. Reference: ${p.probeId}` }, ...b.probes.slice(1)]
  });
  const s = store(), tx = transport();
  const result = await executeUberWarm2SeedProbe({
    batch: tampered, probeId: p.probeId, approval: approval(tampered), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UBERWARM2_EXECUTION_REFUSED');
  assert.ok(result.reasonCodes.includes('probe-content-not-approved-template'));
  assert.equal(s.claims.length, 0);
  assert.equal(tx.calls.length, 0);
});

test('UW2-SEED-02: a probe subject replaced after compile is refused with no claim and no transport call', async () => {
  const b = batch(), p = b.probes[0];
  const tampered = redigest({ ...b, probes: [{ ...p, subject: 'Your account needs attention' }, ...b.probes.slice(1)] });
  const s = store(), tx = transport();
  const result = await executeUberWarm2SeedProbe({
    batch: tampered, probeId: p.probeId, approval: approval(tampered), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('probe-content-not-approved-template'));
  assert.equal(s.claims.length, 0);
  assert.equal(tx.calls.length, 0);
});

test('UW2-SEED-02: an approval not bound to the approved template digest is refused', async () => {
  const b = batch(), p = b.probes[0];
  for (const templateDigest of ['sha256:' + 'b'.repeat(64), '']) {
    const s = store(), tx = transport();
    const result = await executeUberWarm2SeedProbe({
      batch: b, probeId: p.probeId, approval: approval(b, { templateDigest }),
      approvalVerificationKey: KEY, store: s, transport: tx, now: T1
    });
    assert.equal(result.status, 'UBERWARM2_OWNER_APPROVAL_REQUIRED', `templateDigest=${JSON.stringify(templateDigest)}`);
    assert.equal(s.claims.length, 0);
    assert.equal(tx.calls.length, 0);
  }
});

test('UW2-SEED-02 control: the untampered batch with a template-bound approval sends once with the approved content', async () => {
  const b = batch(), p = b.probes[0], s = store(), tx = transport();
  const result = await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: approval(b), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(result.status, 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN');
  assert.equal(tx.calls.length, 1);
  assert.equal(tx.calls[0].subject, 'UberBond permitted mailbox delivery test');
  assert.ok(tx.calls[0].body.includes(`Reference: ${p.probeId}`));
});

test('UW2-SEED-03: the executor hands the store a rolling 24-hour window and the claim timestamp', async () => {
  const b = batch(), p = b.probes[0], s = store(), tx = transport();
  await executeUberWarm2SeedProbe({
    batch: b, probeId: p.probeId, approval: approval(b), approvalVerificationKey: KEY, store: s, transport: tx, now: T1
  });
  assert.equal(s.claims.length, 1);
  assert.equal(s.claims[0].rollingWindowHours, 24);
  assert.equal(s.claims[0].claimedAt, T1.toISOString());
  assert.equal(s.claims[0].quotaWindow, '2026-10-12');
});

test('UW2-SEED-03: two sends across the UTC day boundary two minutes apart refuse the second on PostgreSQL', () => withDisposablePostgres(async url => {
  const pool = new Pool({ connectionString: url, max: 4 });
  pool.on('error', () => {});
  try {
    await pool.query(await fs.readFile(MIGRATION, 'utf8'));
    const ledger = createUberWarm2PgLedger({ pool });
    const day = (await pool.query("SELECT (now() AT TIME ZONE 'UTC')::date::text AS day")).rows[0].day;
    const now = new Date();
    const sameSeed = [probe('uw2-boundary-1', SEED_A), probe('uw2-boundary-2', SEED_A)];
    const b = batch(now, sameSeed);
    const [first, second] = b.probes;
    const tx = transport();
    const opts = {
      batch: b, approval: approval(b, { expiresAt: new Date(now.getTime() + 3600000).toISOString() }),
      approvalVerificationKey: KEY, store: ledger, transport: tx
    };
    const sent = await settleWithin(executeUberWarm2SeedProbe({ ...opts, probeId: first.probeId, now }), 'first send');
    assert.equal(sent.status, 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN');
    // Record the first send as yesterday's UTC bucket, two minutes before the second claim.
    await pool.query(
      "UPDATE uberwarm2_seed_probe_claims SET quota_day=$1::date, created_at=clock_timestamp() - interval '2 minutes' WHERE reservation_key=$2",
      [shiftDay(day, -1), sent.reservationKey]
    );
    const again = await settleWithin(executeUberWarm2SeedProbe({ ...opts, probeId: second.probeId, now: new Date() }), 'second send');
    assert.equal(again.ok, false);
    assert.equal(again.status, 'UBERWARM2_PROBE_NOT_CLAIMED');
    assert.ok(again.reasonCodes.includes('seed-rolling-limit'), again.reasonCodes.join(','));
    assert.equal(tx.calls.length, 1);
  } finally {
    await settleWithin(pool.end(), 'pool.end()', 5000).catch(() => {});
  }
}));
