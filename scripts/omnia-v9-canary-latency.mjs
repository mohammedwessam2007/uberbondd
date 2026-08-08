import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { generateKeyPairSync } from 'node:crypto';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { createActionIntent, createEvidenceRecord } from '../src/omnia-v9/kernel.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { issueCanaryApproval, CANARY_NULL_OPERATION, CANARY_NULL_EFFECT_CLASS, CANARY_NULL_PURPOSE } from '../src/omnia-v9/integrations/canary-approval.mjs';
import { NullConsequenceAdapter } from '../src/omnia-v9/integrations/null-consequence-adapter.mjs';
import { CanaryReceiptStore } from '../src/omnia-v9/integrations/canary-receipt-store.mjs';
import { bindRealCedarAuthority, resetRealCedarAuthorityCache } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';
import { evaluateAndGateCanaryNull } from '../src/omnia-v9/integrations/canary-null-authority.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const DATABASE_URL = process.env.OMNIA_V9_TEST_DATABASE_URL;
if (!DATABASE_URL) { console.log(JSON.stringify({ status: 'BLOCKED', reason: 'OMNIA_V9_TEST_DATABASE_URL required' })); process.exit(2); }

const CANDIDATE_COUNT = Number(process.env.CANARY_LATENCY_CANDIDATE_COUNT || 40);
const TENANT_ID = 'campaign:canary-latency';
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const signer = digest => signDigestHex(digest, privateKey);
const NOW = new Date('2026-08-08T12:00:00.000Z');

function percentileSummary(valuesMs) {
  const sorted = [...valuesMs].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { p50: null, p95: null, p99: null, max: null, count: 0 };
  const at = p => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return { p50: at(50), p95: at(95), p99: at(99), max: sorted.at(-1), count: sorted.length };
}

async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['omnia-v9-canary-latency-migrate']);
    for (const migration of ['005_omnia_v9_proof_store.sql', '009_omnia_v9_shadow_approval_registry.sql', '010_omnia_v9_canary_null_receipts.sql']) {
      await client.query(await fs.readFile(path.join(root, 'migrations', migration), 'utf8'));
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['omnia-v9-canary-latency-migrate']).catch(() => {});
    client.release();
  }
}

async function run() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 8 });
  await migrate(pool);
  const store = new OmniaV9ProofStore({ pool, keyResolver });

  const coldStart = process.hrtime.bigint();
  resetRealCedarAuthorityCache();
  const cedarAuthority = await bindRealCedarAuthority({ fresh: true });
  const cedarBindLatencyMs = Number(process.hrtime.bigint() - coldStart) / 1e6;

  await issueCanaryApproval({
    proofStore: store, pool, signer, approvalId: 'latency-canary-ap', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: TENANT_ID,
    actorIds: ['uberbond-canary-worker'], resourcePrefixes: ['null-sink:'], maxBlastRadius: 1, maxCostUsd: 0, maxUses: CANDIDATE_COUNT + 5,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  });

  const adapter = new NullConsequenceAdapter();
  const receiptStore = new CanaryReceiptStore({ pool });
  const perCandidate = [];

  for (let i = 0; i < CANDIDATE_COUNT; i += 1) {
    const evidenceId = `ev-lat-${i}`;
    const evidence = createEvidenceRecord({
      evidenceId, tenantId: TENANT_ID, subject: 'canary-subject', origin: 'SYNTHETIC_FIXTURE', relation: 'DIRECT',
      verificationClaims: [], lifecycleFlags: ['ACTIVE'], sourceRef: 'synthetic:fixture', payloadDigest: sha256('canary-payload'), observedAt: NOW.toISOString()
    });
    const intent = createActionIntent({
      missionId: TENANT_ID, tenantId: TENANT_ID, actorId: 'uberbond-canary-worker', operation: CANARY_NULL_OPERATION,
      resource: `null-sink:lat-${i}`, purpose: CANARY_NULL_PURPOSE, effectClass: CANARY_NULL_EFFECT_CLASS,
      argumentsDigest: sha256(`args-${i}`), evidenceIds: [evidenceId], maxCostUsd: 0, blastRadius: 1, rollback: 'NONE',
      createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 300_000).toISOString(), nonce: `nonce:lat-${i}`, idempotencyKey: `res_lat_${i}`
    }, NOW);

    let cedarMs = 0;
    const wrappedCedar = { ...cedarAuthority, policyAuthorizer: (...args) => {
      const t0 = process.hrtime.bigint();
      const out = cedarAuthority.policyAuthorizer(...args);
      cedarMs += Number(process.hrtime.bigint() - t0) / 1e6;
      return out;
    } };

    const startedAt = process.hrtime.bigint();
    const result = await evaluateAndGateCanaryNull({
      pool, proofStore: store, tenantId: TENANT_ID, cedarAuthority: wrappedCedar, keyResolver, adapter, receiptStore,
      intent, evidence, now: NOW
    });
    const totalMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    perCandidate.push({ index: i, totalMs, cedarMs, decision: result.decision, executed: result.executed });
  }

  const coldCount = Math.max(1, Math.round(perCandidate.length * 0.1));
  const cold = perCandidate.slice(0, coldCount);
  const warm = perCandidate.slice(coldCount);

  const report = {
    schemaVersion: 'omnia.v9.canary-latency.v1',
    environment: { database: 'real PostgreSQL (OMNIA_V9_TEST_DATABASE_URL)', cedar: cedarAuthority.evaluator, candidateCount: perCandidate.length },
    cedarBindLatencyMs,
    totalLatencyMs: percentileSummary(perCandidate.map(r => r.totalMs)),
    coldTotalLatencyMs: percentileSummary(cold.map(r => r.totalMs)),
    warmTotalLatencyMs: percentileSummary(warm.map(r => r.totalMs)),
    cedarOnlyLatencyMs: percentileSummary(perCandidate.map(r => r.cedarMs)),
    executedCount: perCandidate.filter(r => r.executed).length,
    note: 'measures the FULL authoritative canary_null path: real Postgres authority resolution, real Cedar evaluation, real reserveAuthority() transaction, null-sink execution, and durable receipt persistence -- not decision computation alone.',
    perCandidate
  };

  await fs.writeFile(path.join(root, 'artifacts/omnia-v9/canary-latency.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ cedarBindLatencyMs, totalLatencyMs: report.totalLatencyMs, coldTotalLatencyMs: report.coldTotalLatencyMs, warmTotalLatencyMs: report.warmTotalLatencyMs, cedarOnlyLatencyMs: report.cedarOnlyLatencyMs, executedCount: report.executedCount }, null, 2));
  await pool.end();
}

await run();
