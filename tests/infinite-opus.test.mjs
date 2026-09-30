import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/store.mjs';
import { canonicalSemanticJson, semanticHash, semanticProgramHash, createSemanticClosureChecker, executeExactOpcode,
  createBoundedCircuitCertificate, validateFinitePolicy, impactedSemanticNodes,
  coalesceSemanticProofCuts, renderClosedClaims } from '../src/semantic-closure-kernel.mjs';
import { createCognitionLedger, cognitionBudgetSummary, reserveCognitionCall, markCognitionDispatched,
  releaseUndispatchedCognition, settleCognitionCall, estimateCognitionCeiling, createExactResponseCache,
  putExactResponse, readExactResponse, exactRequestFingerprint, cognitionMetrics, compileStickyCrownPacket } from '../src/cognition-ledger.mjs';
import { createInfiniteOpusRuntime, INFINITE_OPUS_TASK_SCHEMA } from '../src/infinite-opus-native-runtime.mjs';

const NOW = Date.parse('2026-09-29T22:00:00Z'), DAY = '2026-09-29';
const H = semanticHash({ source: 'synthetic-fixture' });
const context = () => ({ scope: 'test-only', crownRevision: 'synthetic-crown-r1', qualityContractHash: H,
  sourceHashes: { source: H }, invalidators: { drift: false }, requiredClaimIds: ['total'], authorizedProgramHash: semanticProgramHash(artifact()) });
const record = (id, value, kind = 'REALITY') => ({ id, value, kind, status: 'ACTIVE', scope: 'test-only',
  qualityContractHash: H, sourceHashes: { source: H }, invalidators: ['drift'],
  crownRevision: 'synthetic-crown-r1', evidenceRef: 'synthetic://fixture',
  verifiedAt: '2026-09-29T21:00:00Z', expiresAt: '2026-09-30T21:00:00Z' });
const records = () => [record('a', 10), record('b', 20)];
const artifact = () => ({ scope: 'test-only', qualityContractHash: H,
  nodes: [{ id: 'a', kind: 'REALITY', value: 10, dependencies: [], authorityId: 'a' },
    { id: 'b', kind: 'REALITY', value: 20, dependencies: [], authorityId: 'b' },
    { id: 'sum', kind: 'DERIVATION', opcode: 'SUM_INTEGER', value: 30, dependencies: ['a','b'] }],
  claims: [{ id: 'total', nodeId: 'sum', value: 30 }] });
const checker = () => createSemanticClosureChecker({ authorityRecords: records() });
const request = () => ({ requestBody: { messages: [], temperature: 0, seed: 4, max_tokens: 10 },
  model: 'test/model', modelRevision: 'r1', providerRoute: 'test-route', toolSchema: [],
  systemInstructions: 'test-only', semanticStateHash: semanticHash(context()), sourceHashes: { source: H },
  qualityContractHash: H, freshnessClass: 'DEPENDENCY_BOUND', credentialScopeId: 'test-nonsecret-scope' });
const call = (callId = 'call-1', role = 'WORKER', ceilingMicrousd = 1000) => ({ callId, taskId: callId,
  model: 'test/model', provider: 'openrouter', qualityClass: 'Q_FRONTIER', role, ceilingMicrousd, cacheState: 'MISS' });
const receipt = (callId = 'call-1', actualMicrousd = 10) => ({ callId, actualMicrousd, observedModel: 'test/model', observedProvider: 'openrouter', receiptRef: `receipt:${callId}` });
const policy = () => ({ domain: [{ status: 'yes' }, { status: 'no' }], rows: [
  { input: { status: 'yes' }, output: { decision: 'ACCEPT', uncertainty: 'none-in-this-domain' } },
  { input: { status: 'no' }, output: { decision: 'QUEUE', uncertainty: 'none-in-this-domain' } }] });

test('canonical typed equality is key-order invariant but not meaning-by-similarity', () => {
  assert.equal(semanticHash({ a: 1, b: 2 }), semanticHash({ b: 2, a: 1 }));
  assert.notEqual(semanticHash({ a: 1 }), semanticHash({ a: '1' }));
  assert.notEqual(semanticHash([1,2]), semanticHash([2,1]));
});
for (const [label, value] of [['nan',NaN], ['infinity',Infinity], ['undefined',undefined], ['negative-zero',-0], ['bigint',1n], ['date',new Date()], ['sparse',new Array(2)], ['prototype',JSON.parse('{"__proto__":1}')]]) {
  test(`lossy canonical input rejected: ${label}`, () => assert.throws(() => canonicalSemanticJson(value)));
}
test('canonical representation rejects cycles, getters and symbol keys', () => {
  const cyclic = {}; cyclic.x = cyclic;
  assert.throws(() => semanticHash(cyclic));
  assert.throws(() => semanticHash({ get x() { return 1; } }));
  assert.throws(() => semanticHash({ [Symbol('x')]: 1 }));
});
test('exact typed derivation closes through trusted current facts with zero effects', () => {
  const closed = checker()({ artifact: artifact(), context: context(), now: NOW });
  assert.equal(closed.ok, true, JSON.stringify(closed));
  assert.equal(closed.claimCount, 1);
  assert.equal(closed.externalEffectLedger.providerCalls, 0);
});
test('no records means no authority, even with a claimed proof packet', () => {
  assert.equal(createSemanticClosureChecker()({ artifact: artifact(), context: context(), now: NOW }).ok, false);
});
for (const [label, mutate] of [
  ['invented-number', a => a.nodes[2].value = 31],
  ['claim-number', a => a.claims[0].value = 31],
  ['unresolved-leaf', a => a.nodes[2].dependencies[0] = 'missing'],
  ['cycle', a => a.nodes[2].dependencies.push('sum')],
  ['duplicate-id', a => a.nodes.push(a.nodes[0])],
  ['unknown-opcode', a => a.nodes[2].opcode = 'EXEC_SHELL'],
  ['empirical-authority', a => a.nodes[0].kind = 'E5_EMPIRICAL'],
  ['caller-confidence', a => a.nodes[0].kind = 'JEV_CONFIDENCE'],
  ['uncovered-caveat', a => a.claims.push({ id: 'caveat', nodeId: 'a', value: 10 })],
  ['forged-fact', a => a.nodes[0].value = 9],
  ['dropped-required-claim', a => a.claims[0].id = 'something-else']
]) test(`closure blocks hostile artifact: ${label}`, () => {
  const a = artifact(); mutate(a);
  assert.equal(checker()({ artifact: a, context: context(), now: NOW }).ok, false);
});
for (const [label, mutate] of [
  ['dependency-change', c => c.sourceHashes.source = 'f'.repeat(64)],
  ['invalidator-fired', c => c.invalidators.drift = true],
  ['invalidator-unknown', c => delete c.invalidators.drift],
  ['scope-change', c => c.scope = 'another-scope'],
  ['quality-change', c => c.qualityContractHash = 'f'.repeat(64)],
  ['missing-obligation', c => delete c.requiredClaimIds]
]) test(`closure invalidates context: ${label}`, () => {
  const c = context(); mutate(c);
  assert.equal(checker()({ artifact: artifact(), context: c, now: NOW }).ok, false);
});
test('expired/revoked/future/historical authority is rejected', () => {
  for (const change of [{ expiresAt: '2026-01-01' }, { status: 'REVOKED' }, { verifiedAt: '2027-01-01' }]) {
    const r = records(); Object.assign(r[0], change);
    assert.equal(createSemanticClosureChecker({ authorityRecords: r })({ artifact: artifact(), context: context(), now: NOW }).ok, false);
  }
});
test('Crown succession blocks old Crown semantics until revalidated', () => {
  const a = artifact(); a.nodes[0].kind = 'CROWN';
  const r = records(); r[0].kind = 'CROWN';
  const c = context(); c.crownRevision = 'new-crown';
  assert.equal(createSemanticClosureChecker({ authorityRecords: r })({ artifact: a, context: c, now: NOW }).ok, false);
});
test('finite-domain policies must cover every state exactly once', () => {
  assert.equal(validateFinitePolicy(policy()), true);
  for (const mutate of [p => p.rows.pop(), p => p.rows[1] = p.rows[0], p => p.domain.push(p.domain[0]), p => p.rows[0].input = 'unlisted']) {
    const p = policy(); mutate(p); assert.throws(() => validateFinitePolicy(p));
  }
});
test('bounded Jev certificate is independently recomputed; forged flags do not count', () => {
  const c = context(), p = policy(), input = { status: 'yes' };
  let cert = createBoundedCircuitCertificate({ policyId: 'policy', policy: p, input, context: c });
  const a = { scope: c.scope, qualityContractHash: H, nodes: [
    { id: 'p', kind: 'POLICY', value: p, dependencies: [], authorityId: 'policy' },
    { id: 'decision', kind: 'CIRCUIT', input, value: p.rows[0].output, dependencies: ['p'], certificate: cert }
  ], claims: [{ id: 'total', nodeId: 'decision', value: p.rows[0].output }] };
  c.authorizedProgramHash = semanticProgramHash(a);
  a.nodes[1].certificate = createBoundedCircuitCertificate({ policyId: 'policy', policy: p, input, context: c });
  const check = createSemanticClosureChecker({ authorityRecords: [record('policy', p, 'POLICY')] });
  assert.equal(check({ artifact: a, context: c, now: NOW }).ok, true);
  const forged = structuredClone(a); forged.nodes[1].certificate.applicability_passed = true;
  assert.equal(check({ artifact: forged, context: c, now: NOW }).ok, false);
  const altered = structuredClone(a); altered.nodes[1].value.decision = 'SEND';
  assert.equal(check({ artifact: altered, context: c, now: NOW }).ok, false);
  assert.throws(() => createBoundedCircuitCertificate({ policyId: 'policy', policy: p, input: { status: 'maybe' }, context: c }));
});
test('renderer requires producer origin, preserves exact values, and rechecks expiry', () => {
  const a = artifact(), c = context(), closed = checker()({ artifact: a, context: c, now: NOW });
  assert.equal(renderClosedClaims({ artifact: a, closure: closed, context: c, now: NOW }), '[{"id":"total","value":30}]');
  assert.throws(() => renderClosedClaims({ artifact: a, closure: structuredClone(closed), context: c, now: NOW }));
  assert.throws(() => renderClosedClaims({ artifact: a, closure: closed, context: c, now: NOW + 2 * 86400000 }));
  assert.throws(() => renderClosedClaims({ artifact: a, closure: closed, context: c, now: NOW, style: 'free-prose' }));
});
test('exact opcode preconditions prevent lossy arithmetic and unsafe composition', () => {
  assert.equal(executeExactOpcode('SUM_INTEGER', [1,2]), 3);
  assert.throws(() => executeExactOpcode('SUM_INTEGER', [Number.MAX_SAFE_INTEGER,1]));
  assert.throws(() => executeExactOpcode('SUM_INTEGER', [1,'2']));
  assert.throws(() => executeExactOpcode('PROJECT', [{ x: 1 }], { keys: ['missing'] }));
});
test('dependency change touches only the transitive affected subgraph', () => {
  const nodes = [{ id:'a', dependencies:[] }, { id:'b', dependencies:['a'] }, { id:'c', dependencies:[] }];
  assert.deepEqual(impactedSemanticNodes(nodes, ['a']).affectedIds, ['a','b']);
  assert.equal(impactedSemanticNodes(nodes, ['a']).recomputeFraction, 2/3);
});
test('proof-cut multicast coalesces 1000 consumers while separating changed quality/source/output obligations', () => {
  const tasks = Array.from({ length: 1000 }, (_, i) => ({ taskId:`task-${i}`, obligation:{ proposition:'same-unresolved-atom' }, context:context() }));
  const plan = coalesceSemanticProofCuts(tasks);
  assert.equal(plan.unresolvedCutCount, 1);
  assert.equal(plan.candidateMulticastFactor, 1000);
  assert.equal(plan.actualCrownCallsAvoided, null);
  tasks[0].context.sourceHashes.source = 'f'.repeat(64);
  tasks[1].context.requiredClaimIds = ['different-output'];
  assert.equal(coalesceSemanticProofCuts(tasks).unresolvedCutCount, 3);
});
test('budget uses exact microdollar reservations and protects Crown escrow', () => {
  let ledger = createCognitionLedger({ month:'2026-09' });
  const reserved = reserveCognitionCall(ledger, call('large', 'WORKER', 15000000), DAY);
  assert.equal(reserved.ok, true); ledger = reserved.ledger;
  assert.equal(cognitionBudgetSummary(ledger, DAY).state, 'RED');
  assert.equal(reserveCognitionCall(ledger, call('worker-extra','WORKER',1), DAY).ok, false);
  assert.equal(reserveCognitionCall(ledger, call('crown','CROWN',15000000), DAY).ok, true);
});
test('soft daily budget permits hard days and leaves quiet days at zero', () => {
  let ledger = createCognitionLedger({ month:'2026-09' });
  assert.equal(cognitionBudgetSummary(ledger, DAY).todaySpentMicrousd, 0);
  ledger = reserveCognitionCall(ledger, call('hard','CROWN',2000000), DAY).ledger;
  ledger = settleCognitionCall(ledger, receipt('hard',1500000), DAY).ledger;
  assert.equal(cognitionBudgetSummary(ledger, DAY).state, 'YELLOW');
  assert.equal(cognitionBudgetSummary(ledger, '2026-09-30').todaySpentMicrousd, 0);
  assert.throws(() => cognitionBudgetSummary(ledger,'2026-10-01'));
});
test('duplicate retries never dispatch twice; uncertain calls hold reservations', () => {
  let ledger = reserveCognitionCall(createCognitionLedger({ month:'2026-09' }), call(), DAY).ledger;
  assert.throws(() => reserveCognitionCall(ledger, call(), DAY));
  ledger = markCognitionDispatched(ledger, 'call-1', DAY);
  assert.throws(() => releaseUndispatchedCognition(ledger,'call-1',DAY));
  assert.equal(cognitionBudgetSummary(ledger, DAY).reservedMicrousd,1000);
  ledger = settleCognitionCall(ledger, receipt(), DAY).ledger;
  assert.equal(settleCognitionCall(ledger, receipt(), DAY).status,'IDEMPOTENT_SETTLEMENT');
  assert.throws(() => settleCognitionCall(ledger, receipt('call-1',11), DAY));
});
test('actual overspend and model substitution are recorded and freeze further calls', () => {
  let ledger = reserveCognitionCall(createCognitionLedger({ month:'2026-09' }),call(),DAY).ledger;
  const r = receipt('call-1',2000); r.observedModel = 'test/wrong-model';
  ledger = settleCognitionCall(ledger,r,DAY).ledger;
  assert.equal(cognitionBudgetSummary(ledger, DAY).state,'BLACK');
  assert.equal(cognitionBudgetSummary(ledger, DAY).monthSpentMicrousd,2000);
  assert.equal(reserveCognitionCall(ledger,call('next','CROWN',1),DAY).ok,false);
});
test('price registry expires and reserves cache-write and long-context tier prices', () => {
  const route = { model:'test/model', provider:'openrouter', sourceRef:'synthetic://price',
    verifiedAt:'2026-09-29T21:00:00Z', expiresAt:'2026-09-30T21:00:00Z',
    inputUsdPerMillion:2, outputUsdPerMillion:10, cacheWriteUsdPerMillion:2.5,
    contextTokens:1050000, maxOutputTokens:128000,
    priceOverrides:[{ minPromptTokens:272000, inputUsdPerMillion:4, outputUsdPerMillion:15, cacheWriteUsdPerMillion:5 }] };
  assert.equal(estimateCognitionCeiling({ route,inputTokens:300000,maxOutputTokens:1000,now:NOW }),1515000);
  assert.throws(() => estimateCognitionCeiling({ route,inputTokens:1,maxOutputTokens:1,now:NOW+2*86400000 }));
  assert.throws(() => estimateCognitionCeiling({ route,inputTokens:1,maxOutputTokens:200000,now:NOW }));
});
test('exact response cache has full fingerprints, TTL, poison checks and authority revalidation', () => {
  const a = artifact(), c = context(), req = request(), check = checker(), closure = check({ artifact:a,context:c,now:NOW });
  const cache = putExactResponse(createExactResponseCache(), { request:req,artifact:a,closure,createdAt:NOW,ttlMs:1000 });
  assert.equal(readExactResponse(cache,{ request:req,context:c,checkClosure:check,now:NOW+1 }).status,'HIT');
  assert.equal(readExactResponse(cache,{ request:req,context:c,checkClosure:check,now:NOW+1000 }).status,'MISS');
  const poisoned = structuredClone(cache); poisoned.entries[exactRequestFingerprint(req)].artifact.claims[0].value = 99;
  assert.equal(readExactResponse(poisoned,{ request:req,context:c,checkClosure:check,now:NOW+1 }).reason,'CACHE_POISONING');
  c.invalidators.drift = true;
  assert.equal(readExactResponse(cache,{ request:req,context:c,checkClosure:check,now:NOW+1 }).reason,'AUTHORITY_DECOMPILED');
  const live = request(); live.freshnessClass = 'LIVE';
  assert.throws(() => putExactResponse(cache,{ request:live,artifact:a,closure,createdAt:NOW,ttlMs:100 }));
});
for (const field of ['model','modelRevision','providerRoute','toolSchema','systemInstructions','semanticStateHash','sourceHashes','qualityContractHash','credentialScopeId','requestBody']) test(`cache fingerprint changes with ${field}`, () => {
  const a = request(), b = request();
  b[field] = ['toolSchema'].includes(field) ? [{ name:'new-tool' }] : ['sourceHashes','requestBody'].includes(field) ? { changed: true } : ['semanticStateHash','qualityContractHash'].includes(field) ? 'f'.repeat(64) : 'changed';
  assert.notEqual(exactRequestFingerprint(a),exactRequestFingerprint(b));
});
test('prompt prefix identity and sticky route remain stable across tiny deltas', () => {
  const first = compileStickyCrownPacket({ immutablePrefix:{ quality:0 },delta:{ claim:'a' },modelRevision:'r1',providerRoute:'p1' });
  const next = compileStickyCrownPacket({ immutablePrefix:{ quality:0 },delta:{ claim:'b' },modelRevision:'r1',providerRoute:'p1' });
  assert.equal(first.sessionId,next.sessionId);
  assert.equal(first.promptCacheReadShare,null);
});
test('no reference multiplier from missing/zero/synthetic economics', () => {
  assert.equal(cognitionMetrics([]).referenceCompressionFactor,null);
  assert.equal(cognitionMetrics([{ kind:'TASK_COMPLETION',closureVerified:true,executionClass:'E1' }]).referenceCompressionFactor,null);
});
test('Decision Franchise metrics dedupe semantic consumers and require provable receipts for avoided Crown calls', () => {
  const receipts=[
    {kind:'DECISION_FRANCHISE_USE',assetId:'asset-a',consumerSemanticHash:'c1',executionClass:'E1'},
    {kind:'DECISION_FRANCHISE_USE',assetId:'asset-a',consumerSemanticHash:'c1',executionClass:'E1'},
    {kind:'DECISION_FRANCHISE_USE',assetId:'asset-a',consumerSemanticHash:'c2',executionClass:'E4'},
    {kind:'PROVABLE_FRANCHISE_USE',assetId:'asset-a',consumerSemanticHash:'c1',executionClass:'E1',referenceContractHash:'r1'},
    {kind:'PROVABLE_FRANCHISE_USE',assetId:'asset-a',consumerSemanticHash:'c2',executionClass:'E4',referenceContractHash:'r2'}
  ];
  const m=cognitionMetrics(receipts);
  assert.equal(m.decisionFranchiseFanout,2);
  assert.equal(m.crownCallsAvoided,1);
});
test('semantic franchise fanout without counterfactual proof does not claim avoided Crown calls', () => {
  const m=cognitionMetrics([
    {kind:'DECISION_FRANCHISE_USE',assetId:'asset-a',consumerSemanticHash:'c1',executionClass:'E1'},
    {kind:'DECISION_FRANCHISE_USE',assetId:'asset-a',consumerSemanticHash:'c2',executionClass:'E1'}
  ]);
  assert.equal(m.decisionFranchiseFanout,2);
  assert.equal(m.crownCallsAvoided,null);
});

async function nativeStore(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'infinite-opus-test-'));
  t.after(() => fs.rm(dir,{ recursive:true,force:true }));
  const store = new JsonStore(dir); await store.init(); return { dir,store };
}
const task = (taskId = 'event-1') => ({ schemaVersion:INFINITE_OPUS_TASK_SCHEMA,taskId,taskClass:'EXACT_TEST',stakes:'LOW',sideEffectClass:'NONE',artifact:artifact(),request:request(),obligation:{ claim:'total' } });
test('native runtime counts only distinct non-E0 semantic consumers as Decision Franchise fanout', async t => {
  const { store } = await nativeStore(t);
  const runtime = createInfiniteOpusRuntime({ store,contextLoader:context,authorityRecords:records(),clock:() => NOW });
  const make=(id,consumer)=>{const x=task(id);delete x.request;x.obligation={claim:'total',consumer};return x;};
  assert.equal((await runtime.execute(make('franchise-1','a'))).ok,true);
  assert.equal((await runtime.execute(make('franchise-2','b'))).ok,true);
  assert.equal((await runtime.execute(make('franchise-3','c'))).ok,true);
  // New task id but identical semantic consumer: must not inflate fanout.
  assert.equal((await runtime.execute(make('franchise-4','c'))).ok,true);
  const snap=await runtime.snapshot();
  assert.equal(snap.capitalAssets,1);
  const asset=Object.values(snap.capital)[0];
  assert.equal(asset.compiledNonIdenticalConsumers,3);
  assert.equal(asset.provableNonIdenticalConsumers,0);
  assert.equal(asset.crownCallsAvoided,0);
  assert.equal(snap.metrics.decisionFranchiseFanout,3);
  assert.equal(snap.metrics.crownCallsAvoided,null);
});
test('E0 exact-response replay never inflates Decision Franchise fanout', async t => {
  const { store } = await nativeStore(t);
  const runtime = createInfiniteOpusRuntime({ store,contextLoader:context,authorityRecords:records(),clock:() => NOW });
  const first=task('cache-franchise-1'); first.obligation={claim:'total',consumer:'first'};
  const second=task('cache-franchise-2'); second.obligation={claim:'total',consumer:'different-but-request-identical'};
  assert.equal((await runtime.execute(first)).ok,true);
  const replay=await runtime.execute(second);
  assert.equal(replay.ok,true);
  assert.equal(replay.cacheStatus,'HIT');
  const snap=await runtime.snapshot();
  assert.equal(snap.metrics.decisionFranchiseFanout,1);
});

test('native persistence survives restart; cached claims are revalidated and duplicate completion is not counted', async t => {
  const { dir,store } = await nativeStore(t);
  const runtime = createInfiniteOpusRuntime({ store,contextLoader:context,authorityRecords:records(),clock:() => NOW });
  assert.equal((await runtime.execute(task())).ok,true);
  const reopened = new JsonStore(dir); await reopened.init();
  const next = createInfiniteOpusRuntime({ store:reopened,contextLoader:context,authorityRecords:records(),clock:() => NOW });
  const replay = await next.execute(task());
  assert.equal(replay.cacheStatus,'HIT');
  assert.equal((await next.snapshot()).metrics.usefulTasks,1);
  const changed = task(); changed.artifact.claims[0].value = 99;
  await assert.rejects(next.execute(changed),/idempotency-contradiction/);
});
test('native transactions conserve budget under concurrent reservation attempts', async t => {
  const { store } = await nativeStore(t);
  const runtime = createInfiniteOpusRuntime({ store,clock:() => NOW });
  const attempts = await Promise.all(Array.from({ length:20 },(_,i) => runtime.preparePaidCall(call(`race-${i}`,'WORKER',1000000))));
  assert.equal(attempts.filter(r => r.ok).length,5);
  const snapshot = await runtime.snapshot();
  assert.equal(snapshot.budget.reservedMicrousd,15000000);
  assert.equal(snapshot.budget.crownEscrowRemainingMicrousd,15000000);
});
test('empty authority queues novelty and unconnected runtime asks for no inference', async t => {
  const { store } = await nativeStore(t);
  const runtime = createInfiniteOpusRuntime({ store,clock:() => NOW });
  assert.equal((await runtime.execute(task())).status,'CROWN_PAGE_FAULT_QUEUED');
  assert.equal((await runtime.demandPlan()).unconnectedDebtCount,1);
  assert.equal((await runtime.snapshot()).budget.monthSpentMicrousd,0);
  assert.equal((await runtime.dispatchPaidCall('anything',{})).providerCallsPerformed,0);
});
test('task cannot grant authority, change schema, hide stakes or add external effects', async t => {
  const { store } = await nativeStore(t);
  const runtime = createInfiniteOpusRuntime({ store,clock:() => NOW });
  for (const mutation of [{ context:context() },{ authorityRecords:records() },{ schemaVersion:'new' },{ stakes:'UNKNOWN' },{ sideEffectClass:'SEND' }]) {
    assert.equal((await runtime.execute({ ...task(),...mutation })).ok,false);
  }
});
test('paid callback crash holds dispatched budget and refuses duplicate dispatch', async t => {
  const { store } = await nativeStore(t);
  let calls = 0;
  const runtime = createInfiniteOpusRuntime({ store,clock:() => NOW,
    paidAuthorization:{ evidenceRef:'synthetic://owner',month:'2026-09',maxMonthlyMicrousd:20000000,expiresAt:'2026-10-01T00:00:00Z' },
    routePrices:[{model:'test/model',provider:'openrouter',sourceRef:'synthetic://price',verifiedAt:'2026-09-29T21:00:00Z',expiresAt:'2026-09-30T21:00:00Z',contextTokens:1000000,maxOutputTokens:10000,inputUsdPerMillion:.01,outputUsdPerMillion:.01}],
    paidExecutor:async () => { calls++; throw new Error('connection-lost'); } });
  await runtime.preparePaidCall(call('call-1','WORKER',10000));
  const payload = { model:'test/model',task:{ taskId:'call-1' },costCeilingCents:1,maxTokens:20,inputTokenCeiling:2048 };
  assert.equal((await runtime.dispatchPaidCall('call-1',payload)).status,'DISPATCH_UNCERTAIN_RECONCILIATION_REQUIRED');
  await assert.rejects(runtime.dispatchPaidCall('call-1',payload),/undispatched-call-required/);
  assert.equal(calls,1);
  assert.equal((await runtime.snapshot()).budget.reservedMicrousd,10000);
});

test('provider response without observed bill keeps reservation held', async t => {
  const { store } = await nativeStore(t);
  const runtime = createInfiniteOpusRuntime({ store,clock:() => NOW,
    paidAuthorization:{ evidenceRef:'synthetic://owner',month:'2026-09',maxMonthlyMicrousd:20000000,expiresAt:'2026-10-01T00:00:00Z' },
    routePrices:[{model:'test/model',provider:'openrouter',sourceRef:'synthetic://price',verifiedAt:'2026-09-29T21:00:00Z',expiresAt:'2026-09-30T21:00:00Z',contextTokens:1000000,maxOutputTokens:10000,inputUsdPerMillion:.01,outputUsdPerMillion:.01}],
    paidExecutor:async () => ({ ok:true,providerRequestId:'provider-call-1',observedModel:'test/model',provider:'openrouter',usage:{} }) });
  await runtime.preparePaidCall(call('bill-gap','WORKER',10000));
  const r=await runtime.dispatchPaidCall('bill-gap',{ model:'test/model',task:{taskId:'bill-gap'},costCeilingCents:1,maxTokens:20 });
  assert.equal(r.status,'OBSERVED_BILL_REQUIRED_RESERVATION_HELD');
  assert.equal((await runtime.snapshot()).budget.reservedMicrousd,10000);
});
