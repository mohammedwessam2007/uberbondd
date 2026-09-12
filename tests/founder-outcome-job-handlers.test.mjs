import test from 'node:test';
import assert from 'node:assert/strict';
import { createMissionAwareJobHandlers } from '../src/founder-outcome-job-handlers.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

function fixture(deadlineAt='2026-09-12T20:00:00.000Z') {
  const mission={
    ok:true,
    missionId:'mission-handler-test',
    missionClass:'ECONOMIC_OUTCOME',
    objectiveClass:'MAXIMIZE_CLEARED_CONTRIBUTION_PROFIT',
    startedAt:'2026-09-12T17:00:00.000Z',
    deadlineAt,
    state:'ACTIVE',
    spendCeilingCents:0
  };
  const logs=[{type:'founder_outcome_mission',createdAt:'2026-09-12T17:00:00.000Z',detail:mission}];
  const store={
    async list(key,opts={}) {
      if (key==='auditLog') return opts?.filters?.type ? logs.filter(row=>row.type===opts.filters.type) : logs;
      if (key==='orders' || key==='revenueEvents') return [];
      return [];
    },
    async log(type,detail) {
      logs.push({type,detail,createdAt:detail.observedAt||'2026-09-12T17:01:00.000Z'});
      return {id:`log-${logs.length}`};
    }
  };
  return {store,logs};
}

function handlers(options={}) {
  return createMissionAwareJobHandlers({
    cfg:{},
    pipeline:{},
    revenue:{},
    discoveryRunner:{},
    ...options
  });
}

test('mission-aware production handler exists and refuses without a durable enqueue function', async()=>{
  const {store}=fixture();
  const map=handlers({store});
  assert.equal(typeof map['founder.outcome.mission.pulse'],'function');
  const out=await map['founder.outcome.mission.pulse']({missionId:'mission-handler-test'});
  assert.equal(out.ok,false);
  assert.equal(out.status,'FOUNDER_OUTCOME_MISSION_SUPERVISOR_REFUSED');
  assert.deepEqual(out.reasonCodes,['durable-enqueue-function-required']);
  assert.equal(out.businessEffectAuthority,'NONE');
  assert.deepEqual(out.externalEffectLedger,ZERO_EXTERNAL_EFFECTS);
});

test('mission-aware production handler delegates to the supervisor without inventing payment truth or external effects', async()=>{
  const {store,logs}=fixture();
  const queued=[];
  const map=handlers({
    store,
    enqueueJob:async(type,payload,options)=>{
      queued.push({type,payload,options});
      return {id:`job-${queued.length}`};
    }
  });
  const out=await map['founder.outcome.mission.pulse']({
    missionId:'mission-handler-test',
    now:new Date('2026-09-12T17:05:00.000Z'),
    zeroMarginalDiscoveryConfigured:false
  });
  assert.equal(out.ok,true);
  assert.equal(out.status,'FOUNDER_OUTCOME_MISSION_SUPERVISOR_CONTINUING');
  assert.equal(out.observedNetProviderClearedRevenueCents,null);
  assert.equal(out.clearedCashEvidenceComplete,false);
  assert.deepEqual(out.externalEffectLedger,ZERO_EXTERNAL_EFFECTS);
  assert.ok(queued.some(row=>row.type==='prometheus.commercial.catalog'));
  assert.ok(queued.some(row=>row.type==='payment.reconciliation.tick'));
  assert.ok(queued.some(row=>row.type==='founder.outcome.mission.pulse'));
  assert.ok(logs.some(row=>row.type==='founder_outcome_mission_pulse'));
  assert.equal(queued.some(row=>Number(row.options?.priority)>110),false);
});
