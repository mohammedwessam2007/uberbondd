#!/usr/bin/env node
// Measures the performance and founder-burden cost of the crash-safe
// external-effect execution protocol (OMNIA V9 Mission 6), against a real
// PostgreSQL 16 database. Requires OMNIA_V9_TEST_DATABASE_URL. Writes
// artifacts/omnia-v9/external-effect-recovery-report.json.
import fs from 'node:fs/promises';
import { Pool } from 'pg';
import { ExternalEffectExecutionStore } from '../src/omnia-v9/integrations/external-effect-execution-store.mjs';
import { ExternalEffectEvidenceStore } from '../src/omnia-v9/integrations/external-effect-evidence-store.mjs';
import { NullSinkV2Adapter, SIMULATION_MODES } from '../src/omnia-v9/integrations/null-sink-v2.mjs';
import { dispatchExternalEffect, CRASH_POINTS, CrashInjected } from '../src/omnia-v9/integrations/external-effect-dispatcher.mjs';
import { recoverOneExecution, RECOVERY_ACTIONS } from '../src/omnia-v9/integrations/external-effect-recovery.mjs';

const databaseUrl = process.env.OMNIA_V9_TEST_DATABASE_URL;
if (!databaseUrl) {
  console.error('OMNIA_V9_TEST_DATABASE_URL is required (a real, disposable PostgreSQL 16 database).');
  process.exit(1);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50Ms: Number(percentile(sorted, 50)?.toFixed(3)),
    p95Ms: Number(percentile(sorted, 95)?.toFixed(3)),
    p99Ms: Number(percentile(sorted, 99)?.toFixed(3)),
    minMs: Number(sorted[0]?.toFixed(3)),
    maxMs: Number(sorted[sorted.length - 1]?.toFixed(3))
  };
}

async function migrateReal(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['omnia-v9-external-effect-perf-migrate']);
    await client.query(await fs.readFile(new URL('../migrations/011_omnia_v9_external_effect_executions.sql', import.meta.url), 'utf8'));
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['omnia-v9-external-effect-perf-migrate']).catch(() => {});
    client.release();
  }
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  await migrateReal(pool);
  const store = new ExternalEffectExecutionStore({ pool });
  const evidenceStore = new ExternalEffectEvidenceStore({ pool });
  const runId = `perf-${Date.now()}`;

  // --- Pre-dispatch persistence overhead: store.prepare() + transition to DISPATCHING alone.
  const prepOnlySamples = [];
  for (let i = 0; i < 200; i += 1) {
    const id = `${runId}-prep-${i}`;
    const t0 = performance.now();
    const prepared = await store.prepare({
      executionId: `exec-${id}`, actionIntentDigest: 'a'.repeat(64), authorizationDigest: 'auth',
      tenantId: 'perf', operation: 'op', resource: `res:${id}`, businessKey: `bk-${id}`,
      provider: 'null-sink-v2', providerEffectIdentity: `peid-${id}`, approvalId: 'ap-perf',
      constitutionDigest: 'cd', policyDigest: 'pd', consequenceClass: 'WRITE_EXTERNAL'
    });
    await store.transition({ executionId: prepared.executionId, toStatus: 'DISPATCHING', reason: 'perf', expectedFromStatus: 'PREPARED' });
    prepOnlySamples.push(performance.now() - t0);
  }

  // --- Full safe dispatch overhead: complete dispatchExternalEffect() happy path.
  const fullDispatchSamples = [];
  for (let i = 0; i < 200; i += 1) {
    const id = `${runId}-full-${i}`;
    const adapter = new NullSinkV2Adapter({ pool });
    const t0 = performance.now();
    await dispatchExternalEffect({
      store, evidenceStore, adapter,
      effectIntent: {
        executionId: `exec-${id}`, actionIntentDigest: 'a'.repeat(64), authorizationDigest: 'auth',
        tenantId: 'perf', operation: 'op', resource: `res:${id}`, businessKey: `bk-${id}`,
        provider: 'null-sink-v2', providerEffectIdentity: `peid-${id}`, approvalId: 'ap-perf',
        constitutionDigest: 'cd', policyDigest: 'pd', consequenceClass: 'WRITE_EXTERNAL',
        simulation: { mode: SIMULATION_MODES.DEFINITE_SUCCESS }
      }
    });
    fullDispatchSamples.push(performance.now() - t0);
  }

  // --- Recovery lookup latency: recoverOneExecution() on a DISPATCHING-with-no-evidence execution.
  const recoveryLookupSamples = [];
  const reconciliationSamples = [];
  for (let i = 0; i < 200; i += 1) {
    const id = `${runId}-recover-${i}`;
    const adapter = new NullSinkV2Adapter({ pool });
    try {
      await dispatchExternalEffect({
        store, evidenceStore, adapter,
        effectIntent: {
          executionId: `exec-${id}`, actionIntentDigest: 'a'.repeat(64), authorizationDigest: 'auth',
          tenantId: 'perf', operation: 'op', resource: `res:${id}`, businessKey: `bk-${id}`,
          provider: 'null-sink-v2', providerEffectIdentity: `peid-${id}`, approvalId: 'ap-perf',
          constitutionDigest: 'cd', policyDigest: 'pd', consequenceClass: 'WRITE_EXTERNAL',
          simulation: { mode: SIMULATION_MODES.DEFINITE_SUCCESS }
        },
        crashAt: CRASH_POINTS.IMMEDIATELY_BEFORE_PROVIDER_CALL
      });
    } catch (error) {
      if (!(error instanceof CrashInjected)) throw error;
    }
    const execution = await store.getById(`exec-${id}`);
    const t0 = performance.now();
    await recoverOneExecution({ store, evidenceStore, adapter, execution });
    recoveryLookupSamples.push(performance.now() - t0);

    // Reconciliation-only latency: the adapter.reconcile() call in isolation, on a resolved case.
    const t1 = performance.now();
    await adapter.reconcile({ businessKey: `bk-${id}` });
    reconciliationSamples.push(performance.now() - t1);
  }

  // --- Storage per consequence: approximate row byte sizes for one full execution.
  const storageRow = await pool.query(
    `SELECT pg_column_size(e.*) AS execution_bytes,
            (SELECT coalesce(sum(pg_column_size(v.*)),0) FROM omnia_v9_external_effect_provider_evidence v WHERE v.execution_id = e.execution_id) AS evidence_bytes,
            (SELECT coalesce(sum(pg_column_size(t.*)),0) FROM omnia_v9_execution_transition_events t WHERE t.execution_id = e.execution_id) AS ledger_bytes
     FROM omnia_v9_external_effect_executions e WHERE e.execution_id = $1`,
    [`exec-${runId}-full-0`]
  );
  const storageBytes = storageRow.rows[0];

  // --- Founder burden: reuse the property run's semantic-class summary if present, else compute a small dedicated sample.
  let founderBurden;
  try {
    const propertySummary = JSON.parse(await fs.readFile(new URL('../artifacts/omnia-v9/external-effect-property-run-summary.json', import.meta.url), 'utf8'));
    let ownerReviewCount = 0;
    let uncertainCount = 0;
    for (const [classKey, count] of Object.entries(propertySummary.classes)) {
      const noCrashNoRecovery = classKey.includes('::NO_RECOVERY_NEEDED') || classKey.includes('::CRASHED_BEFORE_ANY_ACTION');
      if (!noCrashNoRecovery) uncertainCount += count;
      if (classKey.includes('OWNER_REVIEW_REQUIRED')) ownerReviewCount += count;
    }
    founderBurden = {
      source: 'external-effect-property-run-summary.json',
      totalScenarios: propertySummary.scenarioCount,
      uncertainOrRecoveredScenarios: uncertainCount,
      ownerReviewScenarios: ownerReviewCount,
      ownerReviewsPer100UncertainEffects: uncertainCount > 0 ? Number(((ownerReviewCount / uncertainCount) * 100).toFixed(2)) : 0
    };
  } catch {
    founderBurden = { source: 'unavailable', note: 'run the property test first to populate external-effect-property-run-summary.json' };
  }

  const report = {
    schemaVersion: 'omnia.v9.external-effect-recovery-report.v1',
    measuredAt: new Date().toISOString(),
    performance: {
      preDispatchPersistenceOverheadMs: summarize(prepOnlySamples),
      fullSafeDispatchOverheadMs: summarize(fullDispatchSamples),
      recoveryLookupLatencyMs: summarize(recoveryLookupSamples),
      reconciliationLatencyMs: summarize(reconciliationSamples),
      storagePerConsequenceBytes: {
        executionRow: Number(storageBytes.execution_bytes),
        evidenceRows: Number(storageBytes.evidence_bytes),
        transitionLedgerRows: Number(storageBytes.ledger_bytes),
        total: Number(storageBytes.execution_bytes) + Number(storageBytes.evidence_bytes) + Number(storageBytes.ledger_bytes)
      }
    },
    founderBurden,
    note: 'CANARY_MEASURED against synthetic scenarios, not REAL_OPERATIONAL traffic -- see V9_REAL_OPERATIONAL_SAMPLE_PLAN.md for why REAL_OPERATIONAL remains 0 in this environment.'
  };

  await fs.mkdir(new URL('../artifacts/omnia-v9/', import.meta.url), { recursive: true });
  await fs.writeFile(new URL('../artifacts/omnia-v9/external-effect-recovery-report.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await pool.end();
}

main().catch(error => { console.error(error); process.exit(1); });
