import test from 'node:test';
import assert from 'node:assert/strict';
import { runFounderOutcomeMissionSupervisor } from '../src/founder-outcome-mission-supervisor.mjs';

function fixture(deadlineAt='2026-09-11T09:00:00.000Z') {
  const mission={ok:true,missionId:'mission-test',missionClass:'ECONOMIC_OUTCOME',objectiveClass:'MAXIMIZE_CLEARED_CONTRIBUTION_PROFIT',startedAt:'2026-09-10T23:32:00.000Z',deadlineAt,state:'ACTIVE',spendCeilingCents:0};
  const logs=[{type:'founder_outcome_mission',createdAt:'2026-09-10T23:32:00.000Z',detail:mission}];
  const store={
    async list(key,opts={}) { if(key==='auditLog') return opts?.filters?.type ? logs.filter(x=>x.type===opts.filters.type) : logs; return []; },
    async log(type,detail) { logs.push({type,detail,createdAt:detail.observedAt||new Date().toISOString()}); return {id:`log-${logs.length}`}; }
  };
  return {mission,logs,store};
}

test('supervisor drives economic jobs and self-reschedules without converting missing payment evidence to zero', async()=>{
  const {store}=fixture(); const queued=[];
  const out=await runFounderOutcomeMissionSupervisor({store,missionId:'mission-test',now:new Date('2026-09-11T00:00:00.000Z'),enqueueJob:async(type,payload,options)=>{queued.push({type,payload,options});return{id:`job-${queued.length}`};}});
  assert.equal(out.ok,true); assert.equal(out.status,'FOUNDER_OUTCOME_MISSION_SUPERVISOR_CONTINUING');
  assert.equal(out.observedNetProviderClearedRevenueCents,null); assert.equal(out.clearedCashEvidenceComplete,false); assert.equal(out.terminal,false);
  assert.ok(queued.some(x=>x.type==='prometheus.commercial.catalog'));
  assert.ok(queued.some(x=>x.type==='payment.reconciliation.tick'));
  const next=queued.find(x=>x.type==='founder.outcome.mission.pulse'); assert.ok(next); assert.equal(next.options.priority,110); assert.ok(next.options.runAt instanceof Date);
});

test('after deadline supervisor stops fresh monetization lanes but keeps reconciliation and its own heartbeat alive', async()=>{
  const {store}=fixture(); const queued=[];
  const out=await runFounderOutcomeMissionSupervisor({store,missionId:'mission-test',now:new Date('2026-09-11T09:00:01.000Z'),enqueueJob:async(type,payload,options)=>{queued.push({type,payload,options});return{id:`job-${queued.length}`};}});
  assert.equal(out.missionWindowClosed,true); assert.equal(out.observedNetProviderClearedRevenueCents,null);
  assert.ok(queued.some(x=>x.type==='payment.reconciliation.tick'));
  assert.equal(queued.some(x=>x.type==='prometheus.commercial.catalog'),false);
  assert.ok(queued.some(x=>x.type==='founder.outcome.mission.pulse'));
});
