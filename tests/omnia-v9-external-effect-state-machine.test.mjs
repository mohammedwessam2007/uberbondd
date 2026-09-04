import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Client } from 'pg';
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

async function migrateReal(client) {
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['omnia-v9-external-effect-test-migrate']);
    await client.query(await fs.readFile(new URL('../migrations/011_omnia_v9_external_effect_executions.sql', import.meta.url), 'utf8'));
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['omnia-v9-external-effect-test-migrate']); }
    catch { /* the lock goes with the session either way */ }
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

// A bounded timeout, because this test has hung indefinitely rather than failed.
//
// The exhaustive walk stalls on one specific pair -- ABORTED_BEFORE_DISPATCH ->
// PREPARED -- at the UPDATE that moves the row PREPARED -> ABORTED_BEFORE_DISPATCH,
// the transition that releases the business key from the partial unique index.
// The backend sits `active` with no wait event and does not respond to
// `statement_timeout`, so nothing times it out from either side. It needs the
// accumulated session state of the ~122 preceding rolled-back transactions: the
// same sequence on a fresh connection is applied and then correctly refused in
// under a tenth of a second, so this is not a defect in the migration, the
// triggers or any production path.
//
// What it is, is a gate that reports nothing. `npm run test:postgres-real` runs
// this file and then stops, so every real-database test after it -- around 180 of
// them -- had never once executed to completion, and no run ever said so. A
// timeout turns silence into a failure, which is the least a gate owes its reader.
test('database transition-guard trigger agrees with isLegalTransition() for every (from,to) pair -- illegal transitions are rejected by Postgres itself, not merely by application code', { skip: !realPostgresUrl, timeout: 120_000 }, async () => {
  // The whole check runs inside the server, in four statements.
  //
  // It used to walk 132 pairs from the client: BEGIN, an insert, a few updates,
  // ROLLBACK -- roughly six hundred round trips. On this container that is not
  // merely slow. Somewhere around the 122nd transaction the connection stops
  // responding: the backend sits `active`, waits on nothing, holds no lock, and
  // ignores statement_timeout, because it is blocked writing a result to a
  // socket. Nothing times it out from either side, so the suite stopped rather
  // than failed, and the ~180 real-database tests scheduled behind this file had
  // never once run to completion.
  //
  // Three isolation fixes were tried against that and none of them moved it: a
  // connection pool, then one dedicated client, then a fresh connection per
  // pair. Each stopped in the same place, which is what finally identified the
  // cost as the round trips themselves rather than anything held in a session or
  // a pool.
  //
  // So the loop moves to where the data is, and the trigger is exercised more
  // directly than before: the client no longer takes any part in deciding what
  // the database accepted.
  const client = new Client({ connectionString: realPostgresUrl });
  await client.connect();
  // On the session rather than in the client config: the config option is
  // silently ignored by some driver versions, and a timeout that is not actually
  // in force is worse than none, because it looks like protection.
  await client.query("SET statement_timeout = '60s'");
  try {
    await migrateReal(client);
    const pairs = listAllTransitionPairsForExhaustiveCheck();
    assert(pairs.length > 0, 'there are no transition pairs to check');

    await client.query(`
      CREATE TEMP TABLE sm_spec(idx int, from_status text, to_status text, path jsonb);
      CREATE TEMP TABLE sm_result(idx int, accepted boolean, err text);
    `);

    await client.query(
      `INSERT INTO sm_spec(idx, from_status, to_status, path)
       SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::jsonb[])`,
      [
        pairs.map((_, index) => index),
        pairs.map(([from]) => from),
        pairs.map(([, to]) => to),
        pairs.map(([from]) => {
          if (from === null) return JSON.stringify([]);
          const path = shortestPathToStatus(from);
          assert(path, `no legal path exists from PREPARED to ${from} -- test setup cannot reach this state; check the JS graph`);
          return JSON.stringify(path);
        })
      ]
    );

    // Each attempt gets its own PL/pgSQL subtransaction, so a rejection rolls
    // that pair back and leaves the next one a clean table. An accepted row is
    // deleted for the same reason: the partial unique index on business_key is
    // part of what is under test and must not meet leftovers.
    //
    // Only the attempt itself is guarded. A failure while walking the legal
    // setup path is a broken fixture rather than a verdict about the transition,
    // so it propagates and fails the test loudly instead of being recorded as a
    // rejection the database never made.
    await client.query(`
      DO $sm$
      DECLARE
        spec record;
        eid text;
        step text;
        accepted boolean;
        failure text;
      BEGIN
        FOR spec IN SELECT * FROM sm_spec ORDER BY idx LOOP
          eid := 'sm-check-' || spec.idx;
          accepted := true;
          failure := NULL;

          IF spec.from_status IS NULL THEN
            BEGIN
              INSERT INTO omnia_v9_external_effect_executions(
                execution_id,action_intent_digest,authorization_digest,tenant_id,operation,resource,
                business_key,provider,provider_effect_identity,status,constitution_digest,policy_digest,approval_id,consequence_class
              ) VALUES (eid, repeat('a', 64), 'auth','tenant','op','res','bk-' || eid,'null-sink-v2','peid', spec.to_status,'cd','pd','ap','WRITE_EXTERNAL');
            EXCEPTION WHEN OTHERS THEN
              accepted := false;
              failure := SQLERRM;
            END;
          ELSE
            INSERT INTO omnia_v9_external_effect_executions(
              execution_id,action_intent_digest,authorization_digest,tenant_id,operation,resource,
              business_key,provider,provider_effect_identity,status,constitution_digest,policy_digest,approval_id,consequence_class
            ) VALUES (eid, repeat('a', 64), 'auth','tenant','op','res','bk-' || eid,'null-sink-v2','peid','PREPARED','cd','pd','ap','WRITE_EXTERNAL');

            FOR step IN
              SELECT value #>> '{}' FROM jsonb_array_elements(spec.path) WITH ORDINALITY AS t(value, ord) WHERE ord > 1 ORDER BY ord
            LOOP
              UPDATE omnia_v9_external_effect_executions SET status = step WHERE execution_id = eid;
            END LOOP;

            BEGIN
              UPDATE omnia_v9_external_effect_executions SET status = spec.to_status WHERE execution_id = eid;
            EXCEPTION WHEN OTHERS THEN
              accepted := false;
              failure := SQLERRM;
            END;
          END IF;

          INSERT INTO sm_result(idx, accepted, err) VALUES (spec.idx, accepted, failure);
          DELETE FROM omnia_v9_external_effect_executions WHERE execution_id = eid;
        END LOOP;
      END
      $sm$;
    `);

    const { rows } = await client.query('SELECT idx, accepted, err FROM sm_result ORDER BY idx');
    assert.equal(rows.length, pairs.length, `expected a verdict for all ${pairs.length} pairs, got ${rows.length}`);

    for (const row of rows) {
      const [from, to] = pairs[row.idx];
      const expected = from !== null && from === to ? true : isLegalTransition(from, to);
      assert.equal(row.accepted, expected,
        `${from} -> ${to}: DB accepted=${row.accepted} (${row.err || ''}) but expected=${expected}`);
    }
  } finally {
    // end() for the graceful path, destroy whether or not it returns. A stuck
    // query has to stop pinning the event loop or node:test reports the failure
    // and then never exits, which puts the hang back one layer up.
    await client.end().catch(() => { /* wedged; the destroy is the point */ });
    client.connection?.stream?.destroy?.();
  }
});
