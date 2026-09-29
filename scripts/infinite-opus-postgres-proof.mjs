import assert from 'node:assert/strict';
import { PostgresStore } from '../src/store.mjs';
import { createInfiniteOpusRuntime } from '../src/infinite-opus-native-runtime.mjs';
if (!process.argv.includes('--disposable') || !process.env.OMNIA_V9_TEST_DATABASE_URL) throw new Error('disposable-test-database-required');
const databaseUrl = process.env.OMNIA_V9_TEST_DATABASE_URL;
const stores = [new PostgresStore({databaseUrl,ssl:false}),new PostgresStore({databaseUrl,ssl:false})];
let now = Date.parse('2026-09-29T22:00:00Z');
const request = i => ({callId:`local-proof-${i}`,taskId:`local-proof-${i}`,model:'fixture/model',provider:'fixture',qualityClass:'Q_FRONTIER',role:'WORKER',ceilingMicrousd:1000000,cacheState:'MISS'});
try {
  await stores[0].init();
  const runtimes = stores.map(store => createInfiniteOpusRuntime({store,clock:()=>now}));
  const attempts = await Promise.all(Array.from({length:20},(_,i)=>runtimes[i%2].preparePaidCall(request(i))));
  assert.equal(attempts.filter(r=>r.ok).length,15);
  const before = await runtimes[1].snapshot();
  assert.equal(before.budget.reservedMicrousd,15000000);
  assert.equal(before.budget.crownEscrowRemainingMicrousd,15000000);
  now = Date.parse('2026-10-01T00:00:00Z');
  const rollover = await runtimes[0].snapshot();
  assert.equal(rollover.budget.state,'BLACK');
  assert.equal((await runtimes[1].preparePaidCall(request(21))).ok,false);
  for (let i=0;i<20;i++) if (attempts[i].ok) await runtimes[i%2].reconcileCall({callId:`local-proof-${i}`,month:'2026-09',settledDate:'2026-09-30',actualMicrousd:0,observedModel:'fixture/model',observedProvider:'fixture',receiptRef:`fixture-confirmed-zero-${i}`});
  assert.notEqual((await runtimes[1].snapshot()).budget.state,'BLACK');
  console.log(JSON.stringify({status:'PASS',backend:'REAL_DISPOSABLE_POSTGRES',connections:2,concurrentReservations:20,accepted:15,crownEscrowMicrousd:15000000,rolloverUncertainChargeBlock:true,historicalReconciliationUnblocks:true,providerInferenceCalls:0,economicSavingsClaim:null}));
} finally { await Promise.all(stores.map(store=>store.close())); }
