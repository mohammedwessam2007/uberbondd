import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberDistributionCycle } from '../src/sender-infrastructure-mesh.mjs';

const motion={id:'owned-content',type:'OWNED_CONTENT',capabilityRef:'cap:content',configured:true,blocked:false,evidence:{verifiedOutcomeCount:0,clearedPaymentCount:0,quality:'NO_VERIFIED_OUTCOMES'},safety:{suppressionClear:true,complaintClear:true,senderHealthClear:true}};

test('UberDistribution calls the canonical Distribution Control Plane but grants no execution authority',()=>{
  const out=compileUberDistributionCycle({motions:[motion],now:'2026-09-11T12:00:00Z',explorationSlots:1});
  assert.equal(out.ok,true);assert.equal(out.status,'UBER_DISTRIBUTION_CYCLE_COMPILED');assert.equal(out.executionAuthority,'NONE');assert.equal(out.businessEffectAuthority,'NONE');assert.equal(out.portfolio.authorization.messages,'DISABLED');assert.equal(out.portfolio.authorization.spend,'DISABLED');
});

test('UberDistribution refuses an invalid distribution motion instead of laundering it through orchestration',()=>{
  const out=compileUberDistributionCycle({motions:[{...motion,type:'UNKNOWN'}],now:'2026-09-11T12:00:00Z'});
  assert.equal(out.ok,false);assert.equal(out.status,'UBER_DISTRIBUTION_CYCLE_BLOCKED');assert.equal(out.portfolio.ok,false);
});
