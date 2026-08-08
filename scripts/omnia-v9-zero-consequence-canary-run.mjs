import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { Pool } from 'pg';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { createActionIntent, createEvidenceRecord } from '../src/omnia-v9/kernel.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { issueCanaryApproval, revokeCanaryApproval, CANARY_NULL_OPERATION, CANARY_NULL_EFFECT_CLASS, CANARY_NULL_PURPOSE } from '../src/omnia-v9/integrations/canary-approval.mjs';
import { NullConsequenceAdapter } from '../src/omnia-v9/integrations/null-consequence-adapter.mjs';
import { CanaryReceiptStore } from '../src/omnia-v9/integrations/canary-receipt-store.mjs';
import { bindRealCedarAuthority } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';
import { evaluateAndGateCanaryNull } from '../src/omnia-v9/integrations/canary-null-authority.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const DATABASE_URL = process.env.OMNIA_V9_TEST_DATABASE_URL;
if (!DATABASE_URL) {
  console.log(JSON.stringify({ status: 'BLOCKED', reason: 'OMNIA_V9_TEST_DATABASE_URL required -- this run must not certify authoritative canary behavior using only PGlite' }));
  process.exit(2);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const signer = digest => signDigestHex(digest, privateKey);
const NOW = new Date('2026-08-08T12:00:00.000Z');

async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['omnia-v9-canary-run-migrate']);
    for (const migration of ['005_omnia_v9_proof_store.sql', '009_omnia_v9_shadow_approval_registry.sql', '010_omnia_v9_canary_null_receipts.sql']) {
      await client.query(await fs.readFile(path.join(root, 'migrations', migration), 'utf8'));
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['omnia-v9-canary-run-migrate']).catch(() => {});
    client.release();
  }
}

function intentFor({ id, tenantId, evidenceId, resource, purpose = CANARY_NULL_PURPOSE, operation = CANARY_NULL_OPERATION, effectClass = CANARY_NULL_EFFECT_CLASS, maxCostUsd = 0, blastRadius = 1 }) {
  return createActionIntent({
    missionId: tenantId, tenantId, actorId: 'uberbond-canary-worker', operation,
    resource: resource || `null-sink:${id}`, purpose, effectClass,
    argumentsDigest: sha256(`args-${id}`), evidenceIds: [evidenceId], maxCostUsd, blastRadius,
    rollback: 'NONE', createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
    nonce: `nonce:${id}`, idempotencyKey: `res_${id}`
  }, NOW);
}

function evidenceFor(id, tenantId, overrides = {}) {
  return createEvidenceRecord({
    evidenceId: id, tenantId, subject: 'canary-subject', origin: 'SYNTHETIC_FIXTURE',
    relation: 'DIRECT', verificationClaims: [], lifecycleFlags: ['ACTIVE'], sourceRef: 'synthetic:fixture',
    payloadDigest: sha256('canary-payload'), observedAt: NOW.toISOString(), ...overrides
  });
}

function classifyCategory(legacyEligible, decision) {
  if (decision !== 'ALLOW' && decision !== 'DENY') return decision === 'INCOMPLETE' ? 'V9_INCOMPLETE' : (decision === 'ERROR' ? 'V9_ERROR' : 'V9_INCOMPLETE');
  const legacy = legacyEligible ? 'ALLOW' : 'DENY';
  if (legacy === 'ALLOW' && decision === 'ALLOW') return 'BOTH_ALLOW';
  if (legacy === 'DENY' && decision === 'DENY') return 'BOTH_DENY';
  if (legacy === 'ALLOW' && decision === 'DENY') return 'LEGACY_ALLOW_V9_DENY';
  return 'LEGACY_DENY_V9_ALLOW';
}

async function run() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 8 });
  await migrate(pool);
  const store = new OmniaV9ProofStore({ pool, keyResolver });
  const cedarAuthority = await bindRealCedarAuthority();
  const adapter = new NullConsequenceAdapter();
  const receiptStore = new CanaryReceiptStore({ pool });

  const records = [];

  async function evaluate({ id, label, category, legacyEligible, tenantId, approvalId, intentOverrides = {}, evidenceOverrides = {}, cedarAuthorityOverride, proofStoreOverride }) {
    const evidenceId = `ev-${id}`;
    const evidence = evidenceFor(evidenceId, tenantId, evidenceOverrides);
    const intent = intentFor({ id, tenantId, evidenceId, ...intentOverrides });
    const startedAt = process.hrtime.bigint();
    let result;
    try {
      result = await evaluateAndGateCanaryNull({
        pool, proofStore: proofStoreOverride || store, tenantId, cedarAuthority: cedarAuthorityOverride || cedarAuthority, keyResolver, adapter, receiptStore,
        intent, evidence, now: NOW
      });
    } catch (error) {
      result = { decision: 'ERROR', executed: false, reason: `no-execution:uncaught:${String(error?.message || error)}`, receipt: null, admission: null };
    }
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const usage = approvalId ? await store.getApprovalUsage(approvalId).catch(() => null) : null;
    const revoked = approvalId ? await store.isRevoked('OWNER_APPROVAL', approvalId).catch(() => false) : false;
    records.push({
      id, label, category, legacyEligible,
      v9Decision: result.decision,
      comparisonCategory: classifyCategory(legacyEligible, result.decision),
      nullSinkExecuted: result.executed,
      proofCompleteness: result.admission ? 'RESOLVED' : (result.decision === 'ERROR' || result.decision === 'INCOMPLETE' ? 'UNRESOLVED' : 'RESOLVED'),
      cedarResult: result.admission?.reasons?.includes('admission:all-gates-satisfied') ? 'ALLOW' : (result.decision === 'DENY' ? 'DENY-OR-NOT-REACHED' : 'NOT-REACHED'),
      approvalUsed: approvalId || null,
      authorityUseCount: usage ? usage.uses : null,
      revocationState: revoked ? 'REVOKED' : 'ACTIVE',
      expiryState: result.reason?.includes('REVIEW') ? 'UNKNOWN' : 'WITHIN_OR_NOT_APPLICABLE',
      latencyMs,
      receiptDigest: result.receipt?.receiptDigest || null,
      authorizationDigest: result.admission?.decisionDigest || null,
      reservationOk: result.reservation?.ok ?? null,
      reason: result.reason || null
    });
  }

  // --- SYNTHETIC: valid covering approval, reused across 8 candidates (founder-leverage shape) ---
  const reuseTenant = 'campaign:canary-run-valid';
  await issueCanaryApproval({
    proofStore: store, pool, signer, approvalId: 'run-ap-valid', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: reuseTenant,
    actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 8,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  });
  for (let i = 0; i < 8; i += 1) {
    await evaluate({ id: `valid-${i}`, label: 'SYNTHETIC', category: 'authority-valid', legacyEligible: true, tenantId: reuseTenant, approvalId: 'run-ap-valid' });
  }

  // --- SYNTHETIC: expired approval ---
  const expTenant = 'campaign:canary-run-expired';
  for (let i = 0; i < 3; i += 1) {
    const approvalId = `run-ap-expired-${i}`;
    await issueCanaryApproval({
      proofStore: store, pool, signer, approvalId, issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: expTenant,
      actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 7200_000).toISOString(), expiresAt: new Date(NOW.getTime() - 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 7200_000).toISOString()
    });
    await evaluate({ id: `expired-${i}`, label: 'SYNTHETIC', category: 'expiry', legacyEligible: true, tenantId: expTenant, approvalId });
  }

  // --- SYNTHETIC: revoked approval ---
  const revTenant = 'campaign:canary-run-revoked';
  for (let i = 0; i < 3; i += 1) {
    const approvalId = `run-ap-revoked-${i}`;
    await issueCanaryApproval({
      proofStore: store, pool, signer, approvalId, issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: revTenant,
      actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
    });
    await revokeCanaryApproval({ proofStore: store, pool, approvalId, tenantId: revTenant, revocationId: `run-revocation-${i}`, reason: 'dataset-drill', now: NOW });
    await evaluate({ id: `revoked-${i}`, label: 'SYNTHETIC', category: 'revocation', legacyEligible: true, tenantId: revTenant, approvalId });
  }

  // --- SYNTHETIC: wrong tenant (approval belongs to a different tenant) ---
  const wtTenant = 'campaign:canary-run-wrongtenant';
  await issueCanaryApproval({
    proofStore: store, pool, signer, approvalId: 'run-ap-wrongtenant-owner', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: 'campaign:canary-run-wrongtenant-owner',
    actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  });
  for (let i = 0; i < 3; i += 1) {
    await evaluate({ id: `wrongtenant-${i}`, label: 'SYNTHETIC', category: 'tenant', legacyEligible: true, tenantId: wtTenant, approvalId: null });
  }

  // --- SYNTHETIC: wrong resource (approval resourcePrefix doesn't cover) ---
  const wrTenant = 'campaign:canary-run-wrongresource';
  await issueCanaryApproval({
    proofStore: store, pool, signer, approvalId: 'run-ap-wrongresource', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: wrTenant,
    actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:only-allowed:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  });
  for (let i = 0; i < 3; i += 1) {
    await evaluate({ id: `wrongresource-${i}`, label: 'SYNTHETIC', category: 'wrong-resource', legacyEligible: true, tenantId: wrTenant, approvalId: 'run-ap-wrongresource', intentOverrides: { resource: `null-sink:other:${i}` } });
  }

  // --- SYNTHETIC: missing evidence ---
  const meTenant = 'campaign:canary-run-missingevidence';
  await issueCanaryApproval({
    proofStore: store, pool, signer, approvalId: 'run-ap-missingevidence', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: meTenant,
    actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  });
  for (let i = 0; i < 3; i += 1) {
    const evidenceId = `ev-missingevidence-${i}`;
    const intent = intentFor({ id: `missingevidence-${i}`, tenantId: meTenant, evidenceId });
    const startedAt = process.hrtime.bigint();
    const result = await evaluateAndGateCanaryNull({
      pool, proofStore: store, tenantId: meTenant, cedarAuthority, keyResolver, adapter, receiptStore,
      intent, evidence: undefined, now: NOW
    }).catch(error => ({ decision: 'ERROR', executed: false, reason: String(error?.message || error), receipt: null, admission: null }));
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    records.push({
      id: `missingevidence-${i}`, label: 'SYNTHETIC', category: 'missing-evidence', legacyEligible: true,
      v9Decision: result.decision, comparisonCategory: classifyCategory(true, result.decision),
      nullSinkExecuted: result.executed, proofCompleteness: 'UNRESOLVED', cedarResult: 'NOT-REACHED',
      approvalUsed: 'run-ap-missingevidence', authorityUseCount: null, revocationState: 'ACTIVE', expiryState: 'WITHIN_OR_NOT_APPLICABLE',
      latencyMs, receiptDigest: null, authorizationDigest: null, reservationOk: null, reason: result.reason
    });
  }

  // --- SYNTHETIC: Cedar authorizer throws (simulated outage) ---
  const cedarFailTenant = 'campaign:canary-run-cedarfail';
  await issueCanaryApproval({
    proofStore: store, pool, signer, approvalId: 'run-ap-cedarfail', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: cedarFailTenant,
    actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  });
  const throwingCedar = { policyAuthorizer: () => { throw new Error('simulated Cedar evaluator exception'); }, policyDigest: sha256('p'), constitutionDigest: sha256('c') };
  for (let i = 0; i < 2; i += 1) {
    await evaluate({ id: `cedarfail-${i}`, label: 'SYNTHETIC', category: 'cedar-unavailable', legacyEligible: true, tenantId: cedarFailTenant, approvalId: 'run-ap-cedarfail', cedarAuthorityOverride: throwingCedar });
  }

  // --- SYNTHETIC: DB unavailable (simulated) ---
  // Must register a real, covering approval first -- resolveShadowAuthorityContext's
  // registry query only calls getApprovalUsage/isRevoked per approval it actually finds;
  // with zero registered approvals for the tenant, the broken mock below would never be
  // invoked at all, and the candidate would resolve REVIEW (no covering approval) instead
  // of genuinely exercising a database-unavailable path.
  const dbFailTenant = 'campaign:canary-run-dbfail';
  await issueCanaryApproval({
    proofStore: store, pool, signer, approvalId: 'run-ap-dbfail', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: dbFailTenant,
    actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  });
  const brokenProofStore = { getApprovalUsage: async () => { throw new Error('simulated database unavailable'); }, isRevoked: async () => false };
  for (let i = 0; i < 2; i += 1) {
    await evaluate({ id: `dbfail-${i}`, label: 'SYNTHETIC', category: 'unavailable-database', legacyEligible: true, tenantId: dbFailTenant, approvalId: 'run-ap-dbfail', proofStoreOverride: brokenProofStore });
  }

  // --- ADVERSARIAL: forged signature ---
  const attackerKeys = generateKeyPairSync('ed25519');
  const forgedTenant = 'campaign:canary-run-forged';
  for (let i = 0; i < 3; i += 1) {
    const approvalId = `run-ap-forged-${i}`;
    await issueCanaryApproval({
      proofStore: store, pool, signer: digest => signDigestHex(digest, attackerKeys.privateKey), approvalId, issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: forgedTenant,
      actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
    });
    await evaluate({ id: `forged-${i}`, label: 'ADVERSARIAL', category: 'forged-signature', legacyEligible: true, tenantId: forgedTenant, approvalId });
  }

  // --- ADVERSARIAL: mutated after signing ---
  const mutTenant = 'campaign:canary-run-mutated';
  for (let i = 0; i < 3; i += 1) {
    const approvalId = `run-ap-mutated-${i}`;
    const { approval } = await issueCanaryApproval({
      proofStore: store, pool, signer, approvalId, issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: mutTenant,
      actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
      notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
    });
    // Simulate a mutated-after-signing approval by resolving from a store whose registry
    // JOIN returns tampered content; simplest honest simulation: directly evaluate against
    // a hand-built resolver returning the tampered approval object.
    const tamperedApprovalStore = {
      getApprovalUsage: store.getApprovalUsage.bind(store), isRevoked: store.isRevoked.bind(store),
      putObject: store.putObject.bind(store), reserveAuthority: store.reserveAuthority.bind(store)
    };
    const evidenceId = `ev-mutated-${i}`;
    const evidence = evidenceFor(evidenceId, mutTenant);
    const intent = intentFor({ id: `mutated-${i}`, tenantId: mutTenant, evidenceId });
    const { admitAction } = await import('../src/omnia-v9/kernel.mjs');
    const startedAt = process.hrtime.bigint();
    const tampered = { ...approval, maxCostUsd: 999 };
    let result;
    try {
      const admission = admitAction(intent, {
        now: NOW, approvals: [tampered], keyResolver, usageResolver: () => ({ uses: 0, costUsd: 0 }),
        evidenceResolver: id => (id === evidenceId ? evidence : null),
        evidenceRequirementResolver: () => ({ minCount: 1, allowedOrigins: ['SYNTHETIC_FIXTURE'] }),
        policyAuthorizer: cedarAuthority.policyAuthorizer, policyVersion: 'canary-run-v1', policyDigest: cedarAuthority.policyDigest, constitutionDigest: cedarAuthority.constitutionDigest
      });
      result = { decision: admission.decision, executed: false, reason: `no-execution:${admission.decision}`, receipt: null, admission };
    } catch (error) {
      result = { decision: 'ERROR', executed: false, reason: String(error?.message || error), receipt: null, admission: null };
    }
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    records.push({
      id: `mutated-${i}`, label: 'ADVERSARIAL', category: 'mutated-after-signing', legacyEligible: true,
      v9Decision: result.decision, comparisonCategory: classifyCategory(true, result.decision),
      nullSinkExecuted: false, proofCompleteness: 'UNRESOLVED', cedarResult: 'NOT-REACHED',
      approvalUsed: approvalId, authorityUseCount: null, revocationState: 'ACTIVE', expiryState: 'WITHIN_OR_NOT_APPLICABLE',
      latencyMs, receiptDigest: null, authorizationDigest: null, reservationOk: null, reason: result.reason
    });
  }

  // --- ADVERSARIAL: tampered evidence (forged external source ref) ---
  const tamperEvTenant = 'campaign:canary-run-tamperev';
  await issueCanaryApproval({
    proofStore: store, pool, signer, approvalId: 'run-ap-tamperev', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: tamperEvTenant,
    actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: 5,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  });
  for (let i = 0; i < 3; i += 1) {
    await evaluate({
      id: `tamperev-${i}`, label: 'ADVERSARIAL', category: 'evidence-tampering', legacyEligible: true, tenantId: tamperEvTenant, approvalId: 'run-ap-tamperev',
      evidenceOverrides: { origin: 'EXTERNAL_SOURCE', sourceRef: `not-a-real-url-${i}` }
    });
  }

  const byLabel = { SYNTHETIC: { total: 0, counts: {}, executed: 0 }, ADVERSARIAL: { total: 0, counts: {}, executed: 0 } };
  for (const r of records) {
    byLabel[r.label].total += 1;
    byLabel[r.label].counts[r.comparisonCategory] = (byLabel[r.label].counts[r.comparisonCategory] || 0) + 1;
    if (r.nullSinkExecuted) byLabel[r.label].executed += 1;
  }

  const latencies = records.map(r => r.latencyMs).sort((a, b) => a - b);
  const at = p => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] : null;

  const report = {
    schemaVersion: 'omnia.v9.zero-consequence-canary-report.v1',
    generatedAt: new Date().toISOString(),
    environment: { database: 'real PostgreSQL (OMNIA_V9_TEST_DATABASE_URL)', cedar: cedarAuthority.evaluator, policyDigest: cedarAuthority.policyDigest, constitutionDigest: cedarAuthority.constitutionDigest },
    sampleComposition: {
      REAL_PUBLIC_INPUT: { count: 0, reason: 'no real, publicly-observable organization data was fetched or used in this environment -- see V9_ZERO_CONSEQUENCE_CANARY_REPORT.md for why this was a deliberate choice, not merely an environment limitation' },
      PROJECT_HISTORICAL_INPUT: { count: 0, reason: 'data/db.sample.json is empty and sample-prospects.csv contains only an explicit unused placeholder row ("Replace with a real target") -- no real project history exists in this environment' },
      SYNTHETIC: { count: byLabel.SYNTHETIC.total },
      ADVERSARIAL: { count: byLabel.ADVERSARIAL.total }
    },
    totalCandidates: records.length,
    executionSummary: {
      totalExecuted: records.filter(r => r.nullSinkExecuted).length,
      totalNoExecution: records.filter(r => !r.nullSinkExecuted).length,
      allowDecisions: records.filter(r => r.v9Decision === 'ALLOW').length,
      executedAmongAllow: records.filter(r => r.v9Decision === 'ALLOW' && r.nullSinkExecuted).length,
      nonAllowThatExecuted: records.filter(r => r.v9Decision !== 'ALLOW' && r.nullSinkExecuted).length
    },
    comparisonByLabel: byLabel,
    latencyMs: { p50: at(50), p95: at(95), p99: at(99), max: latencies.at(-1) ?? null, count: latencies.length },
    records
  };

  await fs.writeFile(path.join(root, 'artifacts/omnia-v9/zero-consequence-canary-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    sampleComposition: report.sampleComposition,
    totalCandidates: report.totalCandidates,
    executionSummary: report.executionSummary,
    comparisonByLabel: report.comparisonByLabel,
    latencyMs: report.latencyMs
  }, null, 2));

  await pool.end();
}

await run();
