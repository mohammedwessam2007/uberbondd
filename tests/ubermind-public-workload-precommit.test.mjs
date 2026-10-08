import test from 'node:test';
import assert from 'node:assert/strict';
import {precommitPublicWorkload} from '../src/ubermind-public-workload-precommit.mjs';
test('empty corpus returns a refusal',()=>{ const p=precommitPublicWorkload({campaignId:'fixture',asOf:'2026-10-08T10:00:00Z',taskRows:[]}); assert.equal(p.ok,false); });

import crypto from 'node:crypto';
import {reviewPairedWorkloadSubmission} from '../src/ubermind-public-workload-precommit.mjs';
const h=x=>'sha256:'+crypto.createHash('sha256').update(x).digest('hex');
const sample=(n,extra={})=>({taskId:'issue-'+n,taskClass:'REPOSITORY_TASK',taskContentDigest:h('task-'+n),
 sourceUrl:'https://github.com/mohammedwessam2007/uberbondd/issues/'+n,
 sourceObservedAt:'2026-10-08T09:00:00Z',dataClass:'PUBLIC',
 sourcePubliclyAccessible:true,externalConsentVerified:false,...extra});
test('distinct source manifests do not mint quality evidence',()=>{
 const r=precommitPublicWorkload({campaignId:'trial',asOf:'2026-10-08T10:00:00Z',
  taskRows:[sample(1),sample(2)]});
 assert.equal(r.ok,true);
 assert.equal(r.taskCount,2);
 assert.equal(r.independentFreshHoldoutsAdmitted,0);
 assert.equal(r.empiricalMultiplier,null);
 assert.equal(r.items[0].permissionForProviderBenchmarkReuseVerified,false);
});
test('same task digest cannot be counted twice',()=>{
 const r=precommitPublicWorkload({campaignId:'trial',asOf:'2026-10-08T10:00:00Z',
  taskRows:[sample(1),sample(2,{taskContentDigest:h('task-1')})]});
 assert.equal(r.ok,false);
});
test('unverified paired submissions cannot certify multiplier',()=>{
 const p=precommitPublicWorkload({campaignId:'trial',asOf:'2026-10-08T10:00:00Z',taskRows:[sample(1)]});
 const out=reviewPairedWorkloadSubmission({manifest:p,records:[]});
 assert.equal(out.ok,true);
 assert.equal(out.empiricallyAdmittedSamples,0);
 assert.equal(out.empiricalMultiplier,null);
});
