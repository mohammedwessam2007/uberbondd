import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrateFounderOutcomeMission, superviseFounderOutcomeMissions } from '../src/founder-outcome-runtime.mjs';

const startedAt='2026-09-10T23:32:00.000Z';
const deadlineAt='2026-09-11T09:00:00.000Z';

function harness(extra=[]){
  const log=[{id:'m1',type:'founder_outcome_mission',createdAt:startedAt,detail:{missionId:'mission-1',policyVersion:'x',missionClass:'ECONOMIC_OUTCOME',objectiveClass:'MAXIMIZE_CLEARED_CONTRIBUTION_PROFIT',startedAt,deadlineAt,timezone:'Africa/Cairo',spendCeilingCents:0,state:'ACTIVE'}},...extra];
  const queued=[];
  return {
    store:{
      list:async key=>key==='auditLog'?structuredClone(log):[],
      log:async(type,detail)=>{const row={id:`a${log.length+1}`,type,detail:structuredClone(detail),createdAt:detail.observedAt||new Date().toISOString()};log.push(row);return row;}
    },
    queue:{enqueue:async(type,payload,options)=>{queued.push({type,payload,options});return {id:`q${queued.length}`};}},
    log,queued
  };
}

test('normalized Founder Center receipt rehydrates without raw founder chat',()=>{
  const mission=hydrateFounderOutcomeMission({missionId:'m',startedAt,deadlineAt});
  assert.equal(mission.ok,true);
  assert.equal('founderIntent' in mission,false);
});

test('worker supervisor keeps an active durable mission alive and queues economic work',async()=>{
  const h=harness();
  const out=await superviseFounderOutcomeMissions({...h,cfg:{discovery:{enabled:false}},now:new Date('2026-09-11T00:00:00Z')});
  assert.equal(out.missions[0].terminal,false);
  assert.ok(h.queued.some(row=>row.type==='payment.reconciliation.tick'));
  assert.ok(h.queued.some(row=>row.type==='prometheus.commercial.catalog'));
  assert.ok(h.log.some(row=>row.type==='founder_outcome_mission_state'));
});

test('after deadline an unresolved mission schedules reconciliation only',async()=>{
  const h=harness();
  await superviseFounderOutcomeMissions({...h,cfg:{},now:new Date('2026-09-11T09:00:01Z')});
  assert.deepEqual([...new Set(h.queued.map(row=>row.type))],['payment.reconciliation.tick']);
});

test('provider observation through deadline closes mission instead of looping UNKNOWN forever',async()=>{
  const h=harness([{id:'p',type:'founder_outcome_payment_observation',createdAt:'2026-09-11T09:00:02Z',detail:{missionId:'mission-1',clearedContributionProfitCents:0,providerOrigin:true,reconciled:true,independentVerification:true,evidenceClass:'PROVIDER_ORIGIN_RECONCILIATION',throughAt:deadlineAt,evidenceRefs:['provider:paypal:deadline'],environment:'LIVE'}}]);
  const out=await superviseFounderOutcomeMissions({...h,cfg:{},now:new Date('2026-09-11T09:00:03Z')});
  assert.equal(out.missions[0].terminal,true);
  assert.equal(h.queued.length,0);
  assert.ok(h.log.some(row=>row.type==='founder_outcome_mission_state'&&row.detail.terminal===true));
});

test('stale payment observation cannot close deadline mission',async()=>{
  const h=harness([{id:'p',type:'founder_outcome_payment_observation',createdAt:'2026-09-11T08:59:59Z',detail:{missionId:'mission-1',clearedContributionProfitCents:0,providerOrigin:true,reconciled:true,independentVerification:true,evidenceClass:'PROVIDER_ORIGIN_RECONCILIATION',throughAt:'2026-09-11T08:59:59Z',evidenceRefs:['provider:paypal:stale'],environment:'LIVE'}}]);
  const out=await superviseFounderOutcomeMissions({...h,cfg:{},now:new Date('2026-09-11T09:00:03Z')});
  assert.equal(out.missions[0].terminal,false);
  assert.deepEqual(h.queued.map(row=>row.type),['payment.reconciliation.tick']);
});
