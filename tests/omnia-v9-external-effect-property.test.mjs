import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Pool } from 'pg';
import { ExternalEffectExecutionStore } from '../src/omnia-v9/integrations/external-effect-execution-store.mjs';
import { ExternalEffectEvidenceStore } from '../src/omnia-v9/integrations/external-effect-evidence-store.mjs';
import { NullSinkV2Adapter, SIMULATION_MODES } from '../src/omnia-v9/integrations/null-sink-v2.mjs';
import { dispatchExternalEffect, CRASH_POINTS, CrashInjected } from '../src/omnia-v9/integrations/external-effect-dispatcher.mjs';
import { recoverOneExecution, RECOVERY_ACTIONS } from '../src/omnia-v9/integrations/external-effect-recovery.mjs';
import { isTerminal } from '../src/omnia-v9/integrations/external-effect-state-machine.mjs';

const realPostgresUrl = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

/**
 * A property-style crash run, per this mission's section 26: not millions of
 * meaningless tests, but a meaningful sweep across crash boundary x provider
 * outcome x restart-pass-count, with a deterministic seed so any failure is
 * exactly reproducible. The one property every single scenario must satisfy
 * (SCENARIO_COUNT of them, reported below, not merely asserted in aggregate):
 * the number of REAL external-effect attempts (adapter.dispatchCallCount,
 * and independently the provider-side ledger row count for that scenario's
 * unique business key) never exceeds 1 -- this run models no explicit
 * proven-non-submission retries, so "exceeds 1" is unconditionally a bug.
 */
const SCENARIO_COUNT = Number(process.env.OMNIA_V9_PROPERTY_SCENARIO_COUNT || 1000);
const MAX_RECOVERY_PASSES = 5;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function migrateReal(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['omnia-v9-external-effect-test-migrate']);
    await client.query(await fs.readFile(new URL('../migrations/011_omnia_v9_external_effect_executions.sql', import.meta.url), 'utf8'));
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['omnia-v9-external-effect-test-migrate']).catch(() => {});
    client.release();
  }
}

const CRASH_OPTIONS = [null, ...Object.values(CRASH_POINTS)];
const MODE_OPTIONS = Object.values(SIMULATION_MODES);

test(`property run: ${SCENARIO_COUNT} deterministic crash/outcome/restart scenarios, zero duplicate external effects`, { skip: !realPostgresUrl, timeout: 300_000 }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 10 });
  try {
    await migrateReal(pool);
    const store = new ExternalEffectExecutionStore({ pool });
    const evidenceStore = new ExternalEffectEvidenceStore({ pool });
    const rng = mulberry32(20260809);

    const semanticClasses = new Map();
    const violations = [];
    const runId = `prop-${Date.now()}`;

    for (let i = 0; i < SCENARIO_COUNT; i += 1) {
      const crashAt = CRASH_OPTIONS[Math.floor(rng() * CRASH_OPTIONS.length)];
      const mode = MODE_OPTIONS[Math.floor(rng() * MODE_OPTIONS.length)];
      const businessKey = `bk-${runId}-${i}`;
      const executionId = `exec-${runId}-${i}`;
      const adapter = new NullSinkV2Adapter({ pool });

      const effectIntent = {
        executionId, actionIntentDigest: 'a'.repeat(64), authorizationDigest: 'authdigest',
        tenantId: 'tenant-property', operation: 'op', resource: `res:${i}`, businessKey,
        provider: 'null-sink-v2', providerEffectIdentity: `peid-${i}`, approvalId: 'ap-property',
        constitutionDigest: 'cd', policyDigest: 'pd', consequenceClass: 'WRITE_EXTERNAL',
        simulation: { mode, revealDelayMs: 0 }
      };

      let dispatchOutcomeStatus = null;
      let crashed = false;
      try {
        const result = await dispatchExternalEffect({ store, evidenceStore, adapter, effectIntent, crashAt });
        dispatchOutcomeStatus = result.status;
      } catch (error) {
        if (!(error instanceof CrashInjected)) throw error;
        crashed = true;
      }

      // Restart loop: recover until terminal, OWNER_REVIEW_REQUIRED, or the pass budget
      // is exhausted (DELAYED_RECONCILIATION-shaped scenarios may need >1 pass even with
      // revealDelayMs=0, since the first pass may only transition DISPATCHING->RESULT_UNCERTAIN
      // before reconciliation itself runs).
      let lastAction = null;
      let finalStatus = dispatchOutcomeStatus;
      for (let pass = 0; pass < MAX_RECOVERY_PASSES; pass += 1) {
        const execution = await store.getById(executionId);
        if (!execution) break; // AFTER_AUTHORITY_RESERVATION crash: nothing durable was ever created
        if (isTerminal(execution.status)) { finalStatus = execution.status; break; }
        if (execution.status === 'OWNER_REVIEW_REQUIRED') { finalStatus = execution.status; lastAction = RECOVERY_ACTIONS.OWNER_REVIEW_REQUIRED; break; }
        const recovered = await recoverOneExecution({ store, evidenceStore, adapter, execution });
        lastAction = recovered.action;
        finalStatus = recovered.status;
      }

      const ledgerCount = (await pool.query('SELECT count(*)::int AS n FROM omnia_v9_null_provider_ledger WHERE business_identity=$1', [businessKey])).rows[0].n;

      if (adapter.dispatchCallCount > 1) {
        violations.push({ i, crashAt, mode, reason: 'dispatchCallCount > 1', dispatchCallCount: adapter.dispatchCallCount });
      }
      if (ledgerCount > 1) {
        violations.push({ i, crashAt, mode, reason: 'provider ledger has more than one row for this business key', ledgerCount });
      }
      if (finalStatus && !isTerminal(finalStatus) && finalStatus !== 'OWNER_REVIEW_REQUIRED') {
        violations.push({ i, crashAt, mode, reason: `did not converge within ${MAX_RECOVERY_PASSES} recovery passes`, finalStatus });
      }

      const classKey = `${crashAt || 'NO_CRASH'}::${mode}::${finalStatus || 'NONE'}::${lastAction || (crashed ? 'CRASHED_BEFORE_ANY_ACTION' : 'NO_RECOVERY_NEEDED')}`;
      semanticClasses.set(classKey, (semanticClasses.get(classKey) || 0) + 1);
    }

    console.log(`[external-effect property run] ${SCENARIO_COUNT} scenarios, ${semanticClasses.size} unique semantic classes, ${violations.length} violations`);
    if (violations.length > 0) {
      console.log('violations sample:', JSON.stringify(violations.slice(0, 10), null, 2));
    }

    assert.equal(violations.length, 0, `${violations.length} of ${SCENARIO_COUNT} scenarios violated the at-most-one-external-effect property or failed to converge`);
    assert(semanticClasses.size >= 30, `expected broad coverage across crash points x modes x outcomes, only saw ${semanticClasses.size} unique classes`);

    const summaryPath = new URL('../artifacts/omnia-v9/external-effect-property-run-summary.json', import.meta.url);
    await fs.mkdir(new URL('../artifacts/omnia-v9/', import.meta.url), { recursive: true });
    await fs.writeFile(summaryPath, JSON.stringify({
      scenarioCount: SCENARIO_COUNT,
      uniqueSemanticClasses: semanticClasses.size,
      violations: violations.length,
      classes: Object.fromEntries(semanticClasses)
    }, null, 2));
  } finally { await pool.end(); }
});
