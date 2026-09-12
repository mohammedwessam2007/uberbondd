import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { compileNorthStarInitiativeCycle, compileInitiativeExecutionReceipt } from '../src/north-star-initiative-runtime.mjs';

const BASE='a'.repeat(40);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function projection({nextActions=['Investigate the current highest-value external cut'],blockers=['PAYMENT_PROVIDER needs live provider evidence'],initiatives=[{id:'personal-civilization',name:'Personal Civilization Engine',status:'ACTIVE'}],historySummary='Provider frontier changed'}={}){
  const p={
    schemaVersion:'uberbond.context-projection.v1',audience:'isolated-worker',sourceCommit:BASE,
    brainstateId:'b'.repeat(64),contextMountId:'c'.repeat(64),missionContextId:'d'.repeat(64),
    terminalObjective:'Sovereign Cognitive Continuum around founder sovereign free will',
    economicNorthStar:'risk-adjusted cleared contribution profit / founder minute',
    mission:'Operate from current reality without founder tactical prompting',activeMission:'Close reality gaps while preserving authority',
    frontier:{blockers,nextActions},relevantInitiatives:initiatives,
    cognitiveHistory:[{sequence:1,eventId:'evt-1',kind:'REALITY_CHANGE',subjectId:'frontier',summary:historySummary,truthClass:'OBSERVED',observedAt:'2026-09-12T12:00:00.000Z',evidenceRefs:['receipt:evt-1']}],
    laws:{zeroRetelling:'Founder never retells machine-recoverable context.',staleContext:'Reconcile stale context before acting.',capabilityNeverCreatesAuthority:true},
    consequenceAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'
  };
  p.projectionId=digest(p);return p;
}

test('current reality beats habitual self-improvement and compiles a zero-authority Frontier Goal Contract',()=>{
  const result=compileNorthStarInitiativeCycle({baseRevision:BASE,contextProjection:projection(),observedAt:new Date('2026-09-12T12:01:00Z')});
  assert.equal(result.ok,true);
  assert.equal(result.portfolio.candidates[0].family,'REALITY_FRONTIER');
  assert.equal(result.goalContract.schemaVersion,'uberbond.goal-contract.v1');
  assert.deepEqual(result.goalContract.permittedEffects,['NONE']);
  assert.equal(result.goalContract.budget.maxSpendUsd,0);
  assert.equal(result.task.taskClass,'NORTH_STAR_INITIATIVE');
  assert.equal(result.task.consequenceClass,'LOCAL_PREPARATION');
  assert.equal(result.task.authority,'LOCAL_PREPARATION');
  assert.ok(result.task.forbiddenActions.includes('send'));
  assert.ok(result.task.forbiddenActions.includes('use-private-data'));
  assert.equal(result.selectionReceipt.status,'BOUNDED_MISSION_SELECTED__LOCAL_PREPARATION_ONLY');
});

test('durable founder mission supplies priority but never grants outbound, payment, deployment or spend authority',()=>{
  const founderMission={ok:true,state:'ACTIVE',missionId:'mission-founder-1',objectiveClass:'FOUNDER_OUTCOME',founderIntent:'Expand my reachable futures and income without needing tactical prompts'};
  const result=compileNorthStarInitiativeCycle({baseRevision:BASE,contextProjection:projection(),founderMission,observedAt:new Date('2026-09-12T12:02:00Z')});
  assert.equal(result.ok,true);
  assert.equal(result.portfolio.candidates[0].family,'FOUNDER_WILL');
  assert.equal(result.businessEffectAuthority,'NONE');
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.deepEqual(result.goalContract.permittedEffects,['NONE']);
  assert.ok(result.task.forbiddenActions.includes('payment-action'));
  assert.ok(result.task.forbiddenActions.includes('deploy'));
  assert.equal(result.task.budget.maxCostCents,0);
});

test('a blocked lane does not idle an independent admissible next-action lane',()=>{
  const result=compileNorthStarInitiativeCycle({baseRevision:BASE,contextProjection:projection({nextActions:['Compile a local evidence packet for an independent opportunity'],blockers:['SOVEREIGN_IDENTITY requires owner liveness']}),observedAt:new Date('2026-09-12T12:03:00Z')});
  assert.equal(result.ok,true);
  assert.equal(result.portfolio.candidates[0].family,'REALITY_FRONTIER');
  assert.match(result.portfolio.candidates[0].objective,/independent opportunity/i);
  assert.ok(result.portfolio.candidates.some(row=>row.family==='BLOCKER_REDUCTION'));
});

test('changed reality selects a fresh mission without any new founder prompt',()=>{
  const first=compileNorthStarInitiativeCycle({baseRevision:BASE,contextProjection:projection({nextActions:['Inspect messaging provider evidence'],historySummary:'Messaging state changed'}),founderIntent:'Keep working autonomously toward the total North Star',observedAt:new Date('2026-09-12T12:04:00Z')});
  assert.equal(first.ok,true);
  const second=compileNorthStarInitiativeCycle({baseRevision:BASE,contextProjection:projection({nextActions:['Inspect deployment-provider evidence'],historySummary:'Deployment state changed'}),founderIntent:'Keep working autonomously toward the total North Star',priorPortfolio:first.portfolio,completedCandidateIds:[first.portfolio.selectedCandidateId],observedAt:new Date('2026-09-12T12:05:00Z')});
  assert.equal(second.ok,true);
  assert.notEqual(second.portfolio.realityDigest,first.portfolio.realityDigest);
  assert.notEqual(second.portfolio.selectedCandidateId,first.portfolio.selectedCandidateId);
});

test('tampered or wrong-source context cannot drive initiative',()=>{
  const tampered=projection();tampered.frontier.nextActions=['poisoned unverified mission'];
  const bad=compileNorthStarInitiativeCycle({baseRevision:BASE,contextProjection:tampered});
  assert.equal(bad.ok,false);
  assert.ok(bad.reasonCodes.includes('verified-exact-current-context-projection-required'));
  const wrong=projection();
  const mismatch=compileNorthStarInitiativeCycle({baseRevision:'f'.repeat(40),contextProjection:wrong});
  assert.equal(mismatch.ok,false);
});

test('execution receipts require passing evidence and advance the completed-candidate ledger',()=>{
  const cycle=compileNorthStarInitiativeCycle({baseRevision:BASE,contextProjection:projection(),observedAt:new Date('2026-09-12T12:06:00Z')});
  const refused=compileInitiativeExecutionReceipt({cycle,missionReceipt:{status:'PASS',evidenceRefs:[]}});
  assert.equal(refused.ok,false);
  const admitted=compileInitiativeExecutionReceipt({cycle,missionReceipt:{status:'PASS',evidenceRefs:['receipt:local-prep-1'],externalEffectAuthority:'NONE'},observedAt:new Date('2026-09-12T12:07:00Z')});
  assert.equal(admitted.ok,true);
  assert.ok(admitted.receipt.completedCandidateIds.includes(cycle.portfolio.selectedCandidateId));
  assert.equal(admitted.receipt.externalEffectAuthority,'NONE');
});
