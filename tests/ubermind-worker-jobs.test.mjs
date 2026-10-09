import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberMindWorkerJobs } from '../src/ubermind-worker-jobs.mjs';

// The jobs worker.mjs schedules at startup. Each persists a version-deduped
// ledger, so the properties that matter are: one write per genuinely new
// version, none on a refusal, the advisory lock on Postgres, and logs that
// stay quiet when nothing changed.

function memoryStore({ transactionClient = false, settings = {} } = {}) {
  const state = structuredClone(settings);
  const writes = [];
  const locks = [];
  return {
    writes, locks,
    settings: () => structuredClone(state),
    transaction: async fn => fn({
      transactionClient,
      pool: { query: async (sql, params) => { locks.push({ sql, params }); } },
      getSettings: async () => structuredClone(state),
      setSetting: async (key, value) => { writes.push(key); state[key] = structuredClone(value); }
    })
  };
}

function memoryLog() {
  const lines = [];
  const record = stream => line => {
    const space = line.indexOf(' ');
    lines.push({ stream, tag: line.slice(0, space), body: JSON.parse(line.slice(space + 1)) });
  };
  return { lines, log: { log: record('out'), error: record('err') }, tagged: tag => lines.filter(l => l.tag === tag) };
}

function deps(overrides = {}) {
  return {
    runUberMindLiveSourceWork: () => ({ ok: true, verifiedSourceCount: 3, materializedOutputCount: 3, receiptBatchDigest: 'r1', sourceBatchDigest: 's1' }),
    compileSourceWorkCheckpoint: ({ prior, work }) => prior?.sourceBatchDigest === work.sourceBatchDigest
      ? { ok: true, changed: false, status: 'EXISTING_SOURCE_REVISION', ledger: prior }
      : { ok: true, changed: true, status: 'NEW_SOURCE_REVISION', ledger: { sourceBatchDigest: work.sourceBatchDigest } },
    capturePublicIssueWorkload: async () => ({ ok: true, sourceScanComplete: true, sourceVersionDigest: 'v1', sourceAuthenticationMode: 'TOKEN' }),
    compilePublicIssueBacklog: ({ prior, capture }) => prior?.sourceVersionDigest === capture.sourceVersionDigest
      ? { ok: true, changed: false, status: 'UNCHANGED', ledger: prior, retainedOpenIssueCount: 2 }
      : { ok: true, changed: true, status: 'UPDATED', ledger: { sourceVersionDigest: capture.sourceVersionDigest }, retainedOpenIssueCount: 2, newDistinctIssueCandidates: 2 },
    compileRealIssueJevShadowPrecommit: ({ capture }) => ({ ok: true, schemaVersion: 'shadow.v1', sourceVersionDigest: capture.sourceVersionDigest,
      precommitDigest: 'p-' + capture.sourceVersionDigest, realSourceIssuesPrecommitted: 2, originalTypedAdvisoryQuestions: 4, boundedGovernedBatchCount: 1 }),
    reconcileUberMindRealWorkCounter: () => ({ ok: true, status: 'COUNTED', counterReceiptHash: 'c1' }),
    inspectJevPendingClaims: () => ({ ok: true, status: 'CLEAN', inventoryDigest: 'i1', claimsNeedingOwnerReconciliation: 0 }),
    runUberMind890ProofCycle: () => ({ ok: true, status: 'VERIFIED', stateDigest: 'd1' }),
    ...overrides
  };
}

test('construction refuses a store without transactions or a missing dependency', () => {
  assert.throws(() => createUberMindWorkerJobs({ store: {}, deps: deps() }), /transactional-store-required/);
  const partial = deps();
  delete partial.runUberMind890ProofCycle;
  assert.throws(() => createUberMindWorkerJobs({ store: memoryStore(), deps: partial }), /runUberMind890ProofCycle/);
});

test('source work is checkpointed once per revision and takes the advisory lock on Postgres', async () => {
  const store = memoryStore({ transactionClient: true });
  const { log, tagged } = memoryLog();
  const jobs = createUberMindWorkerJobs({ store, deps: deps(), log });
  await jobs.executeUberMindSourceWorkAtStartup();
  await jobs.executeUberMindSourceWorkAtStartup();
  assert.deepEqual(store.writes, ['ubermindExactSourceWorkV1'], 'a restart on the same revision must not count it twice');
  assert.deepEqual(store.locks.map(l => l.params[0]), ['setting:ubermindExactSourceWorkV1', 'setting:ubermindExactSourceWorkV1']);
  assert.deepEqual(tagged('UBERMIND_SOURCE_WORK').map(l => l.body.sourceRevisionNewToProtectedLedger), [true, false]);
  assert.ok(tagged('UBERMIND_SOURCE_WORK').every(l => l.body.providerCallsPerformed === 0 && l.body.newIndependentModelHoldouts === 0));
});

test('refused source work writes nothing; a failing checkpoint is reported, not thrown', async () => {
  const refused = memoryStore();
  const first = memoryLog();
  await createUberMindWorkerJobs({ store: refused, deps: deps({ runUberMindLiveSourceWork: () => ({ ok: false, status: 'SOURCE_UNVERIFIED', reason: 'digest-mismatch' }) }), log: first.log })
    .executeUberMindSourceWorkAtStartup();
  assert.deepEqual(refused.writes, []);
  assert.equal(first.tagged('UBERMIND_SOURCE_WORK')[0].stream, 'err');

  const broken = memoryStore();
  broken.transaction = async () => { throw new TypeError('db down'); };
  const second = memoryLog();
  await createUberMindWorkerJobs({ store: broken, deps: deps(), log: second.log }).executeUberMindSourceWorkAtStartup();
  assert.equal(second.tagged('UBERMIND_SOURCE_WORK')[0].body.status, 'PROTECTED_SOURCE_WORK_CHECKPOINT_UNAVAILABLE');
  assert.equal(second.tagged('UBERMIND_SOURCE_WORK')[0].body.errorClass, 'TypeError');
});

test('an incomplete GitHub read admits nothing and reports bounded failure classes', async () => {
  const store = memoryStore();
  const { log, tagged } = memoryLog();
  const capture = async () => ({ ok: false, sourceScanComplete: false, selectedSourceCount: 3, sourceReadFailures: [
    { reason: 'HTTP_ERROR', httpStatus: 403 }, { reason: 'HTTP_ERROR', httpStatus: 403 }, { reason: 'TIMEOUT' }
  ] });
  await createUberMindWorkerJobs({ store, deps: deps({ capturePublicIssueWorkload: capture }), log }).tickUberMindPublicIssueBacklog();
  assert.deepEqual(store.writes, []);
  const [line] = tagged('UBERMIND_LIVE_WORK_INTAKE');
  assert.equal(line.body.status, 'LIVE_GITHUB_SOURCE_READ_INCOMPLETE');
  assert.deepEqual(line.body.sourceFailureClasses, { 'HTTP_ERROR:403': 2, 'TIMEOUT:N/A': 1 });
  assert.equal(line.body.issueCandidatesNewlyAdmitted, 0);
});

test('issue intake records a new shadow precommit once and recognises it on the next tick', async () => {
  const store = memoryStore();
  const { log, tagged } = memoryLog();
  const jobs = createUberMindWorkerJobs({ store, deps: deps(), log });
  await jobs.tickUberMindPublicIssueBacklog();
  await jobs.tickUberMindPublicIssueBacklog();
  assert.deepEqual(store.writes, ['ubermindLivePublicIssueBacklogV1', 'ubermindJevRealIssueShadowPrecommitV1']);
  assert.deepEqual(tagged('UBERMIND_JEV_REAL_ISSUE_SHADOW').map(l => l.body.status),
    ['NEW_REAL_SOURCE_JEV_SHADOW_PRECOMMIT', 'EXISTING_REAL_SOURCE_JEV_SHADOW_PRECOMMIT']);
  const receipt = store.settings().ubermindJevRealIssueShadowPrecommitV1;
  assert.equal(receipt.paidInferenceAuthorized, false);
  assert.equal(receipt.versions.length, 1);
  assert.ok(tagged('UBERMIND_LIVE_WORK_INTAKE').every(l => l.body.providerCallsPerformed === 0 && l.body.paidInferenceAuthorized === false));
});

test('a full shadow version archive refuses to grow instead of dropping history', async () => {
  const versions = Array.from({ length: 64 }, (_, i) => ({ precommitDigest: 'old-' + i }));
  const store = memoryStore({ settings: { ubermindJevRealIssueShadowPrecommitV1: { precommitDigest: 'old-63', versions } } });
  const { log, tagged } = memoryLog();
  await createUberMindWorkerJobs({ store, deps: deps(), log }).tickUberMindPublicIssueBacklog();
  assert.equal(tagged('UBERMIND_JEV_REAL_ISSUE_SHADOW')[0].body.status, 'JEV_SHADOW_PRECOMMIT_VERSION_ARCHIVE_REQUIRED');
  assert.equal(store.settings().ubermindJevRealIssueShadowPrecommitV1.versions.length, 64);
  assert.equal(store.writes.includes('ubermindJevRealIssueShadowPrecommitV1'), false);
});

test('overlapping intake ticks run once, and a thrown capture releases the guard', async () => {
  let calls = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const store = memoryStore();
  const { log, tagged } = memoryLog();
  const jobs = createUberMindWorkerJobs({ store, log, deps: deps({ capturePublicIssueWorkload: async () => {
    calls++;
    if (calls === 1) { await gate; throw new RangeError('boom'); }
    return { ok: true, sourceScanComplete: true, sourceVersionDigest: 'v2' };
  } }) });
  const first = jobs.tickUberMindPublicIssueBacklog();
  await jobs.tickUberMindPublicIssueBacklog();
  assert.equal(calls, 1, 'a tick that starts while one is running must not start a second capture');
  release();
  await first;
  assert.equal(tagged('UBERMIND_LIVE_WORK_INTAKE')[0].body.status, 'SOURCE_DISCOVERY_UNAVAILABLE');
  await jobs.tickUberMindPublicIssueBacklog();
  assert.equal(calls, 2, 'a failed tick must not leave the guard stuck');
});

test('the proof flywheel logs changes and stays quiet on identical evidence', async () => {
  const store = memoryStore();
  const { log, tagged } = memoryLog();
  let digest = 'd1';
  const jobs = createUberMindWorkerJobs({ store, log, deps: deps({ runUberMind890ProofCycle: () => ({ ok: true, status: 'VERIFIED', stateDigest: digest }) }) });
  await jobs.tickUberMindProofFlywheel();
  await jobs.tickUberMindProofFlywheel();
  digest = 'd2';
  await jobs.tickUberMindProofFlywheel();
  assert.equal(tagged('UBERMIND_890_PROOF_LOOP').length, 2);
  assert.equal(tagged('UBERMIND_REAL_WORK_COUNTER').length, 1);
  assert.equal(tagged('UBERMIND_JEV_PENDING_CLAIMS').length, 1);
  assert.ok(tagged('UBERMIND_890_PROOF_LOOP').every(l => l.body.paidCallsPerformed === 0 && l.body.global33333xConfirmed === false));
  assert.deepEqual(store.writes, [], 'the flywheel is read-only');
});

test('claims needing owner reconciliation are reported every tick, never suppressed', async () => {
  const { log, tagged } = memoryLog();
  const jobs = createUberMindWorkerJobs({ store: memoryStore(), log, deps: deps({
    inspectJevPendingClaims: () => ({ ok: true, status: 'OWNER_RECONCILIATION_REQUIRED', inventoryDigest: 'same', claimsNeedingOwnerReconciliation: 1 })
  }) });
  await jobs.tickUberMindProofFlywheel();
  await jobs.tickUberMindProofFlywheel();
  assert.equal(tagged('UBERMIND_JEV_PENDING_CLAIMS').length, 2);
  assert.ok(tagged('UBERMIND_JEV_PENDING_CLAIMS').every(l => l.body.automaticRetryAuthorized === false));
});

test('a failing evidence read is reported as read-only unavailability', async () => {
  const store = memoryStore();
  store.transaction = async () => { throw new SyntaxError('bad row'); };
  const { log, tagged } = memoryLog();
  await createUberMindWorkerJobs({ store, deps: deps(), log }).tickUberMindProofFlywheel();
  const [line] = tagged('UBERMIND_890_PROOF_LOOP_FAILED');
  assert.equal(line.body.status, 'READ_ONLY_EVIDENCE_CYCLE_UNAVAILABLE');
  assert.equal(line.body.reasonClass, 'SyntaxError');
});
