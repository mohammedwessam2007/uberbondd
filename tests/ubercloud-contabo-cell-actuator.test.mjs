import test from 'node:test';
import assert from 'node:assert/strict';
import { compileContaboMailCellPlan, executeContaboMailCellAcquisition, reconcileContaboMailCell, createContaboApiClient } from '../src/ubercloud-contabo-cell-actuator.mjs';

const SHA='b2b7943f9fe40a18a16432a3d14af345382b46c7';
const NOW='2026-09-13T01:00:00Z';
const quote=()=>({productId:'V153',productName:'Cloud VPS 4',monthlyPriceCents:1000,setupFeeCents:0,currency:'EUR',evidenceRef:'web:contabo-current-checkout',observedAt:'2026-09-13T00:30:00Z',expiresAt:'2026-09-13T02:00:00Z'});
const plan=()=>compileContaboMailCellPlan({sourceCommit:SHA,quote:quote(),regionId:'EU',imageId:'ubuntu-current',sshKeySecretId:42,now:new Date(NOW)});
const auth=p=>({authorizationId:'founder-spend-1',evidenceRef:'founder:current-session',approvedByRole:'FOUNDER',planDigest:p.planDigest,currency:'EUR',maxSpendCents:1000,approvedAt:'2026-09-13T00:45:00Z',expiresAt:'2026-09-13T01:15:00Z',spendAuthority:'EXPLICIT_ONE_SHOT',oneShot:true});

test('plan is zero-effect and binds current quote, exact source and smallest selected product',()=>{
  const result=plan();
  assert.equal(result.ok,true);assert.equal(result.status,'CONTABO_MAIL_CELL_PLAN_READY');assert.equal(result.plan.request.productId,'V153');assert.equal(result.plan.request.period,1);assert.equal(result.plan.sourceCommit,SHA);
  assert.ok(result.plan.boundedPostAcquisitionEffects.includes('SET_PTR_TO_CANONICAL_MAIL_HOST'));
  assert.equal(result.externalEffectLedger.providerCalls,0);assert.equal(result.externalEffectLedger.purchases,0);assert.equal(result.externalEffectLedger.spendCents,0);
});

test('stale quote, wrong product and noncanonical host fail closed',()=>{
  const stale=compileContaboMailCellPlan({sourceCommit:SHA,quote:{...quote(),expiresAt:'2026-09-13T00:59:00Z'},regionId:'EU',imageId:'ubuntu-current',sshKeySecretId:42,now:new Date(NOW)});
  assert.equal(stale.ok,false);assert.ok(stale.reasonCodes.includes('current-price-validity-window-required'));
  const wrong=compileContaboMailCellPlan({sourceCommit:SHA,quote:{...quote(),productId:'V154',productName:'Cloud VPS 6'},regionId:'EU',imageId:'ubuntu-current',sshKeySecretId:42,now:new Date(NOW)});
  assert.equal(wrong.ok,false);assert.ok(wrong.reasonCodes.includes('contabo-cloud-vps-4-quote-required'));
  const host=compileContaboMailCellPlan({sourceCommit:SHA,quote:quote(),regionId:'EU',imageId:'ubuntu-current',sshKeySecretId:42,hostname:'other.example',now:new Date(NOW)});
  assert.equal(host.ok,false);assert.ok(host.reasonCodes.includes('canonical-mail-hostname-required'));
});

test('missing or insufficient founder spend authorization prevents all provider calls',async()=>{
  const p=plan();let calls=0;const client={async createInstance(){calls++;return{ok:true,instanceId:'1'};}};
  const missing=await executeContaboMailCellAcquisition({planResult:p,client,claimAuthorization:async()=>({ok:true,claimRef:'claim:1'}),now:new Date(NOW)});
  assert.equal(missing.ok,false);assert.equal(calls,0);
  const weak=await executeContaboMailCellAcquisition({planResult:p,authorization:{...auth(p),maxSpendCents:999},client,claimAuthorization:async()=>({ok:true,claimRef:'claim:1'}),now:new Date(NOW)});
  assert.equal(weak.ok,false);assert.ok(weak.reasonCodes.includes('spend-ceiling-below-current-quote'));assert.equal(calls,0);
});

test('unclaimable one-shot authorization is consumed by nobody and provider is not called',async()=>{
  const p=plan();let calls=0;
  const result=await executeContaboMailCellAcquisition({planResult:p,authorization:auth(p),claimAuthorization:async()=>({ok:false}),client:{async createInstance(){calls++;}},now:new Date(NOW)});
  assert.equal(result.ok,false);assert.ok(result.reasonCodes.includes('spend-authorization-already-used-or-unclaimable'));assert.equal(calls,0);
});

test('authorized acquisition with no PTR executor records one bounded purchase and leaves physical reconciliation pending',async()=>{
  const p=plan();let calls=0;
  const result=await executeContaboMailCellAcquisition({planResult:p,authorization:auth(p),claimAuthorization:async()=>({ok:true,claimRef:'claim:spent-1'}),client:{async createInstance(request){calls++;assert.equal(request.productId,'V153');return{ok:true,instanceId:'instance-123',publicIpv4:'203.0.113.25'};}},now:new Date(NOW)});
  assert.equal(result.ok,true);assert.equal(calls,1);assert.equal(result.status,'CONTABO_MAIL_CELL_ACQUIRED__PHYSICAL_RECONCILIATION_REQUIRED');assert.equal(result.receipt.ptrStatus,'PENDING_OBSERVATION_OR_UPDATE');
  assert.equal(result.externalEffectLedger.purchases,1);assert.equal(result.externalEffectLedger.spendCents,1000);
});

test('authorized acquisition sets canonical PTR immediately when provider returns a public IPv4',async()=>{
  const p=plan();const calls=[];
  const result=await executeContaboMailCellAcquisition({planResult:p,authorization:auth(p),claimAuthorization:async()=>({ok:true,claimRef:'claim:spent-1'}),client:{async createInstance(){calls.push('create');return{ok:true,instanceId:'instance-123',publicIpv4:'203.0.113.25'};},async setPtr(input){calls.push(input);return{ok:true};}},now:new Date(NOW)});
  assert.equal(result.ok,true);assert.equal(result.status,'CONTABO_MAIL_CELL_ACQUIRED__PTR_UPDATE_ACCEPTED');assert.equal(result.receipt.ptrStatus,'UPDATE_ACCEPTED');
  assert.deepEqual(calls[1],{ip:'203.0.113.25',ptr:'mta.uberbond.cloud'});assert.equal(result.externalEffectLedger.providerCalls,2);assert.equal(result.externalEffectLedger.dnsChanges,1);
});

test('delayed public IP reconciliation is bound to the acquisition receipt and can finish PTR without new spend authority',async()=>{
  const p=plan();
  const acquired=await executeContaboMailCellAcquisition({planResult:p,authorization:auth(p),claimAuthorization:async()=>({ok:true,claimRef:'claim:spent-1'}),client:{async createInstance(){return{ok:true,instanceId:'instance-123',publicIpv4:null};}},now:new Date(NOW)});
  assert.equal(acquired.receipt.publicIpv4,null);const calls=[];
  const reconciled=await reconcileContaboMailCell({acquisitionResult:acquired,client:{async getInstance(id){calls.push(['get',id]);return{ok:true,publicIpv4:'203.0.113.25'};},async setPtr(input){calls.push(['ptr',input]);return{ok:true};}}});
  assert.equal(reconciled.ok,true);assert.equal(reconciled.status,'CONTABO_MAIL_CELL_PTR_UPDATE_ACCEPTED');assert.equal(reconciled.receipt.ptrStatus,'UPDATE_ACCEPTED');assert.equal(reconciled.receipt.publicIpv4,'203.0.113.25');
  assert.equal(reconciled.externalEffectLedger.spendCents,0);assert.equal(reconciled.externalEffectLedger.dnsChanges,1);assert.equal(calls.length,2);
});

test('provider exception after authorization claim becomes uncertain rather than retry-safe failure',async()=>{
  const p=plan();
  const result=await executeContaboMailCellAcquisition({planResult:p,authorization:auth(p),claimAuthorization:async()=>({ok:true,claimRef:'claim:spent-1'}),client:{async createInstance(){throw new Error('timeout');}},now:new Date(NOW)});
  assert.equal(result.ok,false);assert.equal(result.status,'CONTABO_MAIL_CELL_ACQUISITION_UNCERTAIN');assert.equal(result.spendAuthority,'CONSUMED');assert.equal(result.externalEffectLedger.providerCalls,null);assert.equal(result.externalEffectLedger.purchases,null);
});

test('HTTP client authenticates in memory, reads instance state, and never places credentials in request URLs',async()=>{
  const calls=[];const fetchFn=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes('/protocol/openid-connect/token'))return{ok:true,status:200,json:async()=>({access_token:'token-abc'})};
    if(String(url).endsWith('/v1/compute/instances')&&options.method==='POST')return{ok:true,status:201,json:async()=>({instanceId:123,publicIpv4:'203.0.113.25'})};
    if(String(url).endsWith('/v1/compute/instances/123')&&options.method==='GET')return{ok:true,status:200,json:async()=>({instanceId:123,status:'running',publicIpv4:'203.0.113.25'})};
    if(String(url).includes('/v1/dns/ptrs/'))return{ok:true,status:204,json:async()=>({})};
    throw new Error('unexpected-url');
  };
  const client=createContaboApiClient({clientId:'cid',clientSecret:'secret-value',apiUser:'owner@example.com',apiPassword:'password-value',fetchFn,requestId:()=> '00000000-0000-4000-8000-000000000001'});
  const created=await client.createInstance({productId:'V153'});assert.equal(created.instanceId,'123');
  const observed=await client.getInstance('123');assert.equal(observed.publicIpv4,'203.0.113.25');
  const ptr=await client.setPtr({ip:'203.0.113.25',ptr:'mta.uberbond.cloud'});assert.equal(ptr.ok,true);
  assert.equal(calls.length,4);assert.ok(calls.every(row=>!row.url.includes('secret-value')&&!row.url.includes('password-value')));assert.equal(calls[1].options.headers.authorization,'Bearer token-abc');assert.equal(calls[3].options.method,'PUT');
});
