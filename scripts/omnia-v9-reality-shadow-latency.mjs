import { Pool } from 'pg';
import { generateKeyPairSync } from 'node:crypto';
import { signDigestHex, sha256 } from '../src/omnia-v9/canonical.mjs';
import { OmniaV9ProofStore } from '../src/omnia-v9/proof-store.mjs';
import { issueShadowApproval } from '../src/omnia-v9/integrations/shadow-approval.mjs';
import { buildRealityShadowHook } from '../src/omnia-v9/integrations/reality-shadow-evaluator.mjs';
import { bindRealCedarAuthority, resetRealCedarAuthorityCache } from '../src/omnia-v9/integrations/reality-shadow-cedar.mjs';
import { observeOutboundFinalAdmission } from '../src/omnia-v9/final-admission-shadow.mjs';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/omnia_v9_latency';
const CANDIDATE_COUNT = Number(process.env.LATENCY_CANDIDATE_COUNT || 60);
const TENANT_ID = 'campaign:latency-c1';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const keyResolver = keyId => (keyId === 'owner-key-1' ? publicKey : null);
const signer = digest => signDigestHex(digest, privateKey);
const NOW = new Date('2026-08-08T12:00:00.000Z');

function outboundContext(i) {
  const suffix = `lat-${i}`;
  return {
    observedAt: NOW.toISOString(),
    boundary: 'AFTER_DURABLE_DISPATCH_RESERVATION_BEFORE_GMAIL',
    reservation: { id: `res_${suffix}`, idempotencyKey: `initial:p_${suffix}`, inbox: 'A', recipientEmail: `buyer_${suffix}@example.com`, kind: 'initial', followup: 0 },
    action: {
      operation: 'OUTBOUND_EMAIL_SEND', prospectId: `p_${suffix}`, campaignId: 'latency-c1',
      senderEmail: 'sender@uberbond.test', recipientEmail: `buyer_${suffix}@example.com`,
      subjectSha256: sha256(`subject-${suffix}`), bodySha256: sha256(`body-${suffix}`),
      evidenceUrl: 'https://example.com/evidence-page', evidenceExcerptSha256: sha256(`excerpt-${suffix}`)
    },
    legacySignals: { legacyEligible: true, legacyReason: '' }
  };
}

function percentileSummary(valuesMs) {
  const sorted = [...valuesMs].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { p50: null, p95: null, p99: null, max: null, count: 0 };
  const at = p => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  return { p50: at(50), p95: at(95), p99: at(99), max: sorted.at(-1), count: sorted.length };
}

async function countingQuery(pool) {
  let queryCount = 0;
  let bytesWritten = 0;
  const wrapped = {
    query: async (...args) => {
      queryCount += 1;
      const sql = String(args[0] || '');
      if (/^\s*(insert|update|delete)/i.test(sql)) bytesWritten += Buffer.byteLength(JSON.stringify(args), 'utf8');
      return pool.query(...args);
    },
    connect: pool.connect ? (...args) => pool.connect(...args) : undefined
  };
  return { wrapped, getQueryCount: () => queryCount, getBytesWritten: () => bytesWritten };
}

async function run() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS omnia_v9_objects (
      object_type text NOT NULL, object_id text NOT NULL, tenant_id text NOT NULL,
      digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'), data jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (object_type, object_id), UNIQUE (object_type, digest)
    );
    CREATE INDEX IF NOT EXISTS idx_omnia_v9_objects_tenant_type_created ON omnia_v9_objects(tenant_id, object_type, created_at DESC);
    CREATE TABLE IF NOT EXISTS omnia_v9_revocations (
      target_type text NOT NULL, target_id text NOT NULL, revocation_id text NOT NULL, tenant_id text NOT NULL,
      reason text NOT NULL, evidence_digest text NULL CHECK (evidence_digest IS NULL OR evidence_digest ~ '^[0-9a-f]{64}$'),
      revoked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (target_type, target_id), UNIQUE (revocation_id)
    );
    CREATE TABLE IF NOT EXISTS omnia_v9_approval_usage (
      approval_id text PRIMARY KEY, tenant_id text NOT NULL, uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
      cost_usd numeric(18,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS omnia_v9_authority_reservations (
      idempotency_key text PRIMARY KEY, intent_digest text NOT NULL CHECK (intent_digest ~ '^[0-9a-f]{64}$'),
      approval_id text NOT NULL, tenant_id text NOT NULL, use_delta integer NOT NULL DEFAULT 1 CHECK (use_delta > 0),
      cost_delta_usd numeric(18,6) NOT NULL DEFAULT 0 CHECK (cost_delta_usd >= 0), blast_radius integer NOT NULL DEFAULT 0 CHECK (blast_radius >= 0),
      status text NOT NULL CHECK (status IN ('PENDING','RESERVED','COMMITTED','UNCERTAIN','RELEASED','DENIED')),
      reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS omnia_v9_shadow_approval_registry (
      approval_id text PRIMARY KEY, tenant_id text NOT NULL, shadow_only boolean NOT NULL DEFAULT true CHECK (shadow_only = true),
      purpose_restriction text NOT NULL, registered_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query('TRUNCATE omnia_v9_objects, omnia_v9_revocations, omnia_v9_approval_usage, omnia_v9_authority_reservations, omnia_v9_shadow_approval_registry');

  const proofStore = new OmniaV9ProofStore({ pool, keyResolver });

  const coldStart = process.hrtime.bigint();
  resetRealCedarAuthorityCache();
  const cedarAuthority = await bindRealCedarAuthority({ fresh: true });
  const cedarBindLatencyMs = Number(process.hrtime.bigint() - coldStart) / 1e6;

  await issueShadowApproval({
    proofStore, pool, signer, approvalId: 'ap-latency-1', issuerId: 'mohamed', keyId: 'owner-key-1', tenantId: TENANT_ID,
    actorIds: ['uberbond-outbound-worker'], operations: ['email.send'], resourcePrefixes: ['email:'], purposes: ['qualified-b2b-outreach'],
    effectClasses: ['COMMUNICATE_EXTERNAL'], maxBlastRadius: 5, maxCostUsd: 1, maxUses: CANDIDATE_COUNT + 5,
    notBefore: new Date(NOW.getTime() - 3600_000).toISOString(), expiresAt: new Date(NOW.getTime() + 3600_000).toISOString(), issuedAt: new Date(NOW.getTime() - 3600_000).toISOString()
  });

  const { wrapped: countedPool, getQueryCount, getBytesWritten } = await countingQuery(pool);
  const countedProofStore = new OmniaV9ProofStore({ pool: countedPool, keyResolver });

  const perCandidate = [];
  for (let i = 0; i < CANDIDATE_COUNT; i += 1) {
    const context = outboundContext(i);
    const queriesBefore = getQueryCount();
    const bytesBefore = getBytesWritten();
    const cedarCallLatencies = [];
    const wrappedCedar = { ...cedarAuthority, policyAuthorizer: (...args) => {
      const t0 = process.hrtime.bigint();
      const result = cedarAuthority.policyAuthorizer(...args);
      cedarCallLatencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
      return result;
    } };
    const instrumentedHook = buildRealityShadowHook({ pool: countedPool, proofStore: countedProofStore, tenantId: TENANT_ID, cedarAuthority: wrappedCedar, keyResolver });

    const startedAt = process.hrtime.bigint();
    const observation = await observeOutboundFinalAdmission({ hook: instrumentedHook, store: null, context });
    const totalMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    perCandidate.push({
      index: i,
      totalMs,
      cedarMs: cedarCallLatencies.reduce((a, b) => a + b, 0),
      queries: getQueryCount() - queriesBefore,
      bytesWritten: getBytesWritten() - bytesBefore,
      status: observation.status,
      decision: observation.decision
    });
  }

  const coldCount = Math.max(1, Math.round(perCandidate.length * 0.1));
  const cold = perCandidate.slice(0, coldCount);
  const warm = perCandidate.slice(coldCount);

  const report = {
    schemaVersion: 'omnia.v9.reality-shadow-latency.v1',
    environment: {
      database: 'real PostgreSQL 16 (pg_ctlcluster, TCP over 127.0.0.1:5432)',
      cedarPackage: cedarAuthority.evaluator.packageName,
      cedarPackageVersion: cedarAuthority.evaluator.version,
      cedarRuntimeVersion: cedarAuthority.cedarVersion,
      candidateCount: perCandidate.length
    },
    cedarBindLatencyMs,
    totalLatencyMs: percentileSummary(perCandidate.map(r => r.totalMs)),
    coldTotalLatencyMs: percentileSummary(cold.map(r => r.totalMs)),
    warmTotalLatencyMs: percentileSummary(warm.map(r => r.totalMs)),
    cedarOnlyLatencyMs: percentileSummary(perCandidate.map(r => r.cedarMs)),
    databaseQueriesPerAction: percentileSummary(perCandidate.map(r => r.queries)),
    bytesWrittenPerAction: percentileSummary(perCandidate.map(r => r.bytesWritten)),
    decisionCounts: perCandidate.reduce((acc, r) => { acc[r.decision] = (acc[r.decision] || 0) + 1; return acc; }, {}),
    statusCounts: perCandidate.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {}),
    perCandidate
  };

  console.log(JSON.stringify(report, null, 2));
  await pool.end();
}

await run();
