import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enforceHumanAuthorityKernel,
  evaluateSovereignFutureKernel,
  evaluateCivilizationalInvariant,
  evaluatePossibilityConstitution,
  measurePossibilityNorthStar,
  evaluateMythicCivilizationCycle
} from '../src/possibility-civilization-kernel.mjs';

const before=[
  {id:'medicine',value:90,reachability:.4,truthState:'OBSERVED',agency:1,reversibility:.9,consent:false,protected:true},
  {id:'research',value:80,reachability:.6,truthState:'STRONGLY_SUPPORTED',agency:1,reversibility:.9,consent:false,protected:true}
];
const after=[
  {id:'medicine',value:90,reachability:.7,truthState:'OBSERVED',agency:1,reversibility:.9,consent:false,protected:true},
  {id:'research',value:80,reachability:.7,truthState:'STRONGLY_SUPPORTED',agency:1,reversibility:.9,consent:false,protected:true},
  {id:'inventor',value:85,reachability:.55,truthState:'SUPPORTED_INFERENCE',agency:1,reversibility:.8,consent:false,protected:true}
];

test('capability growth never grants authority by itself',()=>{
  const r=enforceHumanAuthorityKernel({
    capabilityBefore:['simulate'],capabilityAfter:['simulate','deploy'],
    authorityBefore:['read'],authorityAfter:['read','spend'],
    explicitAuthorityGrants:[]
  });
  assert.equal(r.ok,false);
  assert.deepEqual(r.unauthorizedAuthorityAdded,['spend']);
});

test('explicit authority grant can permit an authority scope without treating capability as the grant',()=>{
  const r=enforceHumanAuthorityKernel({
    capabilityBefore:[],capabilityAfter:['deploy'],
    authorityBefore:[],authorityAfter:['deploy-prod'],
    explicitAuthorityGrants:['deploy-prod']
  });
  assert.equal(r.ok,true);
});

test('unconsented valuable future closure violates sovereign future kernel',()=>{
  const r=evaluateSovereignFutureKernel({before,after:[...after.filter(x=>x.id!=='research')]});
  assert.equal(r.ok,false);
  assert.ok(r.involuntaryClosures.includes('research'));
});

test('possibility north star measures gained reach without calling the metric complete human value',()=>{
  const r=measurePossibilityNorthStar({before,after});
  assert.equal(r.ok,true);
  assert.ok(r.delta.robustReachableValue>0);
  assert.ok(r.gainedFutureIds.includes('medicine'));
  assert.match(r.truthBoundary,/DECLARED_FUTURE_SET/);
});

test('constitution requires authority and civilizational invariant together',()=>{
  const r=evaluatePossibilityConstitution({
    beforeFutures:before,afterFutures:after,
    capabilityBefore:['search'],capabilityAfter:['search','simulate'],
    authorityBefore:['read'],authorityAfter:['read'],explicitAuthorityGrants:[]
  });
  assert.equal(r.ok,true);
  assert.equal(r.status,'POSSIBILITY_CONSTITUTION_SATISFIED');
});

test('mythic cycle cannot claim completion from a partial stage chain',()=>{
  const r=evaluateMythicCivilizationCycle({
    stageEvidence:{PERCEIVE_REALITY:['evidence:1'],MAP_UNKNOWN:['evidence:2']},
    beforeFutures:before,afterFutures:after,
    constitutionInput:{
      capabilityBefore:['search'],capabilityAfter:['search','simulate'],
      authorityBefore:['read'],authorityAfter:['read']
    }
  });
  assert.equal(r.status,'MYTHIC_CIVILIZATION_CYCLE_INCOMPLETE');
  assert.equal(r.evidencedStageCount,2);
});
