import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Pool } from 'pg';
import {
  EXECUTION_STATES, ALL_STATES, isLegalTransition, isTerminal, wasDispatchAttempted,
  listAllTransitionPairsForExhaustiveCheck, listLegalTransitionPairs, BUSINESS_KEY_RELEASING_STATES
} from '../src/omnia-v9/integrations/external-effect-state-machine.mjs';

/** BFS shortest legal path (as a list of statuses to pass through, PREPARED first) from creation to `target`, using the JS module's own graph as ground truth. */
function shortestPathToStatus(target) {
  if (target === 'PREPARED') return ['PREPARED'];
  const adjacency = new Map();
  for (const [from, to] of listLegalTransitionPairs()) {
    if (from === null) continue;
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(to);
  }
  const queue = [['PREPARED']];
  const visited = new Set(['PREPARED']);
  while (queue.length > 0) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (last === target) return path;
    for (const next of adjacency.get(last) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push([...path, next]);
    }
  }
  return null;
}

const realPostgresUrl = process.env.OMNIA_V9_TEST_DATABASE_URL || '';

function suffix() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
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

test('isLegalTransition: exhaustively enumerates the intended graph, not merely a spot check', () => {
  assert.equal(isLegalTransition(null, 'PREPARED'), true);
  assert.equal(isLegalTransition(null, 'DISPATCHING'), false);
  assert.equal(isLegalTransition('PREPARED', 'DISPATCHING'), true);
  assert.equal(isLegalTransition('PREPARED', 'ABORTED_BEFORE_DISPATCH'), true);
  assert.equal(isLegalTransition('PREPARED', 'PROVIDER_ACCEPTED'), false, 'no shortcut from PREPARED straight to a terminal provider outcome');
  assert.equal(isLegalTransition('DISPATCHING', 'PROVIDER_ACCEPTED'), true);
  assert.equal(isLegalTransition('DISPATCHING', 'PROVIDER_REJECTED'), true);
  assert.equal(isLegalTransition('DISPATCHING', 'RESULT_UNCERTAIN'), true);
  assert.equal(isLegalTransition('DISPATCHING', 'PREPARED'), false, 'once durably DISPATCHING, never resettable back to PREPARED -- this is the core anti-blind-retry invariant');
  assert.equal(isLegalTransition('DISPATCHING', 'DISPATCHING'), false, 'no-op reassertion is not itself a transition');
  assert.equal(isLegalTransition('RESULT_UNCERTAIN', 'PROVIDER_ACCEPTED'), false, 'uncertainty may only resolve through reconciliation, never a direct jump to a confident terminal state');
  assert.equal(isLegalTransition('RESULT_UNCERTAIN', 'RECONCILING'), true);
  assert.equal(isLegalTransition('RECONCILING', 'RECONCILED_ACCEPTED'), true);
  assert.equal(isLegalTransition('RECONCILING', 'RECONCILED_REJECTED'), true);
  assert.equal(isLegalTransition('RECONCILING', 'RECONCILED_NOT_SUBMITTED'), true);
  assert.equal(isLegalTransition('RECONCILING', 'OWNER_REVIEW_REQUIRED'), true);
  assert.equal(isLegalTransition('RECONCILING', 'RESULT_UNCERTAIN'), true, 'inconclusive reconciliation may retry reconciliation later without finalizing');
  for (const terminal of ['PROVIDER_ACCEPTED', 'PROVIDER_REJECTED', 'RECONCILED_ACCEPTED', 'RECONCILED_REJECTED', 'RECONCILED_NOT_SUBMITTED', 'ABORTED_BEFORE_DISPATCH']) {
    for (const to of ALL_STATES) {
      assert.equal(isLegalTransition(terminal, to), false, `terminal state ${terminal} must have zero outgoing transitions (attempted ${terminal} -> ${to})`);
    }
    assert.equal(isTerminal(terminal), true);
  }
});

test('wasDispatchAttempted distinguishes pre-dispatch states from every state reachable only after DISPATCHING became durable', () => {
  assert.equal(wasDispatchAttempted('PREPARED'), false);
  assert.equal(wasDispatchAttempted('DISPATCHING'), true);
  assert.equal(wasDispatchAttempted('RESULT_UNCERTAIN'), true);
  assert.equal(wasDispatchAttempted('RECONCILED_NOT_SUBMITTED'), true);
});

test('BUSINESS_KEY_RELEASING_STATES matches exactly the two states migration 011 excludes from the active-business-key uniqueness index', () => {
  assert.deepEqual([...BUSINESS_KEY_RELEASING_STATES].sort(), ['ABORTED_BEFORE_DISPATCH', 'RECONCILED_NOT_SUBMITTED']);
});

test('EXECUTION_STATES enumerates exactly ALL_STATES with no drift', () => {
  assert.deepEqual(Object.values(EXECUTION_STATES).sort(), [...ALL_STATES].sort());
});

test('database transition-guard trigger agrees with isLegalTransition() for every (from,to) pair -- illegal transitions are rejected by Postgres itself, not merely by application code', { skip: !realPostgresUrl }, async () => {
  const pool = new Pool({ connectionString: realPostgresUrl, max: 5 });
  try {
    await migrateReal(pool);
    const pairs = listAllTransitionPairsForExhaustiveCheck();
    let checked = 0;
    for (const [from, to] of pairs) {
      const executionId = `sm-check-${suffix()}`;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        if (from === null) {
          let dbAccepted = true;
          let dbError = null;
          try {
            await client.query(
              `INSERT INTO omnia_v9_external_effect_executions(
                 execution_id,action_intent_digest,authorization_digest,tenant_id,operation,resource,
                 business_key,provider,provider_effect_identity,status,constitution_digest,policy_digest,approval_id,consequence_class
               ) VALUES ($1,$2,'auth','tenant','op','res',$3,'null-sink-v2','peid',$4,'cd','pd','ap','WRITE_EXTERNAL')`,
              [executionId, 'a'.repeat(64), `bk-${executionId}`, to]
            );
          } catch (error) {
            dbAccepted = false;
            dbError = error;
          }
          assert.equal(dbAccepted, isLegalTransition(from, to), `creation with status=${to}: DB accepted=${dbAccepted} (${dbError?.message || ''}) but isLegalTransition=${isLegalTransition(from, to)}`);
        } else {
          const path = shortestPathToStatus(from);
          assert(path, `no legal path exists from PREPARED to ${from} -- test setup cannot reach this state; check the JS graph`);
          await client.query(
            `INSERT INTO omnia_v9_external_effect_executions(
               execution_id,action_intent_digest,authorization_digest,tenant_id,operation,resource,
               business_key,provider,provider_effect_identity,status,constitution_digest,policy_digest,approval_id,consequence_class
             ) VALUES ($1,$2,'auth','tenant','op','res',$3,'null-sink-v2','peid','PREPARED','cd','pd','ap','WRITE_EXTERNAL')`,
            [executionId, 'a'.repeat(64), `bk-${executionId}`]
          );
          for (let step = 1; step < path.length; step += 1) {
            await client.query(`UPDATE omnia_v9_external_effect_executions SET status=$2 WHERE execution_id=$1`, [executionId, path[step]]);
          }
          let dbAccepted = true;
          let dbError = null;
          try {
            await client.query(`UPDATE omnia_v9_external_effect_executions SET status=$2 WHERE execution_id=$1`, [executionId, to]);
          } catch (error) {
            dbAccepted = false;
            dbError = error;
          }
          const expected = from === to ? true : isLegalTransition(from, to);
          assert.equal(dbAccepted, expected, `${from} -> ${to}: DB accepted=${dbAccepted} (${dbError?.message || ''}) but expected=${expected}`);
        }
        checked += 1;
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    }
    assert(checked === pairs.length && checked > 0, `expected to check all ${pairs.length} pairs, checked ${checked}`);
  } finally {
    await pool.end();
  }
});
