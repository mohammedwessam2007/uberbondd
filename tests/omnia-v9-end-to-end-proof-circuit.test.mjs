import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Pool } from 'pg';
import { createActionIntent } from '../src/omnia-v9/kernel.mjs';
import { digestObject } from '../src/omnia-v9/canonical.mjs';
import { buildReceiptFromDurableReservation } from '../src/omnia-v9/execution-receipt-shadow.mjs';
import { OmniaV9AuthorizationBoundReceiptStore } from '../src/omnia-v9/authorization-bound-receipt-store.mjs';
import { reconcilePreEffectAuthority } from '../src/omnia-v9/pre-effect-authority-reconciler.mjs';
import { verifyAuthorityTransitionChain } from '../src/omnia-v9/authority-transition-ledger.mjs';

const databaseUrl = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

function iso(ms) {
  return new Date(ms).toISOString();
}

async function migrate(pool) {
  for (const name of [
    '005_omnia_v9_proof_store.sql',
    '006_omnia_v9_execution_receipt_uniqueness.sql',
    '007_omnia_v9_authorization_bound_receipts.sql',
    '008_omnia_v9_authority_transition_ledger.sql'
  ]) {
    await pool.query(await fs.readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  }
}

async function putObject(pool, { objectType, objectId, tenantId, digest, data }) {
  await pool.query(
    `INSERT INTO omnia_v9_objects(object_type,object_id,tenant_id,digest,data)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [objectType, objectId, tenantId, digest, JSON.stringify(data)]
  );
}

test('V9 real PostgreSQL proof circuit binds one external consequence to immutable pre-effect authority and fails closed on tampering', { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const tenantId = `tenant_${suffix}`;
  const approvalId = `approval_${suffix}`;
  const reservationId = `reservation_${suffix}`;
  const idempotencyKey = `send:${suffix}:0`;
  const baseMs = Date.now();

  try {
    await migrate(pool);

    const intent = createActionIntent({
      missionId: `mission_${suffix}`,
      tenantId,
      actorId: `worker_${suffix}`,
      operation: 'OUTBOUND_EMAIL_SEND',
      resource: 'gmail:slot1',
      purpose: 'qualified-outreach',
      effectClass: 'COMMUNICATE_EXTERNAL',
      arguments: { prospectId: `prospect_${suffix}` },
      evidenceIds: [`evidence_${suffix}`],
      maxCostUsd: 0.01,
      blastRadius: 1,
      rollback: 'NOT_POSSIBLE_AFTER_PROVIDER_ACCEPTANCE',
      createdAt: iso(baseMs - 5_000),
      expiresAt: iso(baseMs + 60 * 60_000),
      nonce: `nonce_${suffix}`,
      idempotencyKey
    }, new Date(baseMs - 5_000));

    const approvalBase = {
      schemaVersion: 'omnia.v9.p0',
      approvalId,
      tenantId,
      approverId: `owner_${suffix}`,
      purpose: 'qualified-outreach',
      allowedOperations: ['OUTBOUND_EMAIL_SEND'],
      allowedResources: ['gmail:slot1'],
      maxUses: 10,
      maxCostUsd: 1,
      maxBlastRadius: 10,
      notBefore: iso(baseMs - 60_000),
      expiresAt: iso(baseMs + 60 * 60_000),
      issuedAt: iso(baseMs - 30_000)
    };
    const approval = { ...approvalBase, approvalDigest: digestObject(approvalBase) };

    const policyDigest = 'a'.repeat(64);
    const constitutionDigest = 'b'.repeat(64);
    const decisionBase = {
      schemaVersion: 'omnia.v9.p0',
      decision: 'ALLOW',
      intentDigest: intent.intentDigest,
      approvalId,
      policyVersion: 'policy-v9-closure',
      policyDigest,
      constitutionDigest,
      reasons: ['closure-circuit-authorized'],
      decidedAt: iso(baseMs - 1_000)
    };
    const authorizationDecision = { ...decisionBase, decisionDigest: digestObject(decisionBase) };

    await putObject(pool, {
      objectType: 'ACTION_INTENT', objectId: intent.intentDigest, tenantId,
      digest: intent.intentDigest, data: intent
    });
    await putObject(pool, {
      objectType: 'OWNER_APPROVAL', objectId: approvalId, tenantId,
      digest: approval.approvalDigest, data: approval
    });
    await putObject(pool, {
      objectType: 'AUTHORIZATION_DECISION', objectId: authorizationDecision.decisionDigest, tenantId,
      digest: authorizationDecision.decisionDigest, data: authorizationDecision
    });

    await pool.query(
      `INSERT INTO omnia_v9_authority_reservations(
         idempotency_key,intent_digest,approval_id,tenant_id,use_delta,cost_delta_usd,blast_radius,status,reason
       ) VALUES ($1,$2,$3,$4,1,0.01,1,'PENDING','')`,
      [idempotencyKey, intent.intentDigest, approvalId, tenantId]
    );
    await pool.query(
      `UPDATE omnia_v9_authority_reservations SET status='RESERVED',updated_at=now() WHERE idempotency_key=$1`,
      [idempotencyKey]
    );

    const chainBeforeEffect = await verifyAuthorityTransitionChain({ pool, idempotencyKey });
    assert.equal(chainBeforeEffect.ok, true);
    assert.deepEqual(chainBeforeEffect.events.map(event => event.toStatus), ['PENDING', 'RESERVED']);
    const reservedAtMs = Date.parse(chainBeforeEffect.events[1].occurredAt);
    assert(Number.isFinite(reservedAtMs));

    const observedAt = iso(Math.max(Date.now(), reservedAtMs) + 2_000);
    const shadowObservation = {
      schemaVersion: 'omnia.v9.outbound-final-shadow-observation.p4',
      authoritative: false,
      enforced: false,
      boundary: 'AFTER_DURABLE_DISPATCH_RESERVATION_BEFORE_GMAIL',
      reservationId,
      contextDigest: 'c'.repeat(64),
      observedAt,
      status: 'OBSERVED',
      decision: 'ALLOW',
      reasons: ['closure-circuit-match'],
      policyDigest,
      constitutionDigest
    };

    const occurredAt = iso(Date.parse(observedAt) + 2_000);
    const durableReservation = {
      id: reservationId,
      prospectId: `prospect_${suffix}`,
      campaignId: `campaign_${suffix}`,
      inbox: 'slot1',
      recipientEmail: `buyer_${suffix}@example.com`,
      kind: 'initial',
      followup: 0,
      idempotencyKey,
      status: 'sent',
      sentAt: occurredAt,
      gmailId: `gmail_${suffix}`,
      threadId: `thread_${suffix}`,
      rfcMessageId: `<${suffix}@example.com>`
    };
    const executionReceipt = buildReceiptFromDurableReservation({
      reservation: durableReservation,
      shadowObservation,
      occurredAt
    });

    await pool.query(
      `INSERT INTO omnia_v9_execution_receipt_bindings(
         reservation_id,receipt_digest,tenant_id,outcome,pre_effect_context_digest,pre_effect_observation_digest,receipt
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        reservationId,
        executionReceipt.receiptDigest,
        tenantId,
        executionReceipt.outcome,
        executionReceipt.preEffectContextDigest,
        executionReceipt.preEffectObservationDigest,
        JSON.stringify(executionReceipt)
      ]
    );

    await pool.query(
      `UPDATE omnia_v9_authority_reservations
       SET status='COMMITTED',reason='provider-accepted',updated_at=now()
       WHERE idempotency_key=$1`,
      [idempotencyKey]
    );

    const bindingStore = new OmniaV9AuthorizationBoundReceiptStore({ pool });
    const reconciled = await reconcilePreEffectAuthority({
      pool,
      shadowObservation,
      executionReceipt,
      bindingStore
    });

    assert.equal(reconciled.status, 'RECONCILED');
    assert.equal(reconciled.reconciled, true);
    assert.equal(reconciled.binding.tenantId, tenantId);
    assert.equal(reconciled.binding.intentDigest, intent.intentDigest);
    assert.equal(reconciled.binding.authorizationDecisionDigest, authorizationDecision.decisionDigest);
    assert.equal(reconciled.binding.approvalId, approvalId);
    assert.equal(reconciled.binding.consequence.receiptDigest, executionReceipt.receiptDigest);
    assert.equal(reconciled.evidence.reservedTransition.sequenceNo, 2);

    const persistedBinding = await bindingStore.getByReservation(reservationId);
    assert(persistedBinding);
    assert.equal(persistedBinding.binding_digest, reconciled.binding.bindingDigest);
    assert.equal(persistedBinding.receipt_digest, executionReceipt.receiptDigest);

    const finalChain = await verifyAuthorityTransitionChain({ pool, idempotencyKey });
    assert.equal(finalChain.ok, true);
    assert.deepEqual(finalChain.events.map(event => event.toStatus), ['PENDING', 'RESERVED', 'COMMITTED']);
    assert.equal(finalChain.events[2].previousEventDigest, finalChain.events[1].eventDigest);

    const tamperedObservation = {
      ...shadowObservation,
      reasons: ['post-hoc-tampering-attempt']
    };
    const tampered = await reconcilePreEffectAuthority({
      pool,
      shadowObservation: tamperedObservation,
      executionReceipt
    });
    assert.equal(tampered.status, 'INCOMPLETE');
    assert.equal(tampered.reason, 'shadow-observation-digest-mismatch');
  } finally {
    await pool.end();
  }
});
