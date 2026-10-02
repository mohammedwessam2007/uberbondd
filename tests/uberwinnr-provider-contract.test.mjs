import test from 'node:test';
import assert from 'node:assert/strict';
import { createWinnrInfrastructureAdapter } from '../src/uberwinnr-provider-adapter.mjs';
import { resolveProviderAdapter, validateProviderAdapter, KNOWN_PROVIDERS } from '../src/provider-adapter-contract.mjs';

const cfg=(patch={})=>({
  configured:true,
  apiKey:'wnr_account_abcdefghijklmnopqrstuvwx',
  accountAuthorized:true,
  termsCompatible:true,
  termsEvidenceRef:'winnr-terms:2026-09-24',
  ...patch
});
const response=(data={})=>({
  ok:true,status:200,
  headers:{get:()=>null},
  text:async()=>JSON.stringify({data})
});

test('Winnr is a canonical provider and structurally satisfies the infrastructure contract',()=>{
  assert.ok(KNOWN_PROVIDERS.includes('winnr'));
  const resolved=resolveProviderAdapter({providers:{winnr:cfg()}},'winnr');
  assert.equal(resolved.ok,true);
  assert.equal(resolved.adapter.providerName,'winnr');
  assert.equal(validateProviderAdapter(resolved.adapter).ok,true);
});

test('token presence without terms/account authority stays configured but live-blocked',async()=>{
  const adapter=createWinnrInfrastructureAdapter(cfg({accountAuthorized:false,termsCompatible:false,termsEvidenceRef:''}));
  assert.equal(adapter.configured,true);
  const live=await adapter.liveSupported();
  assert.equal(live.ok,false);
  const domains=await adapter.listDomains();
  assert.equal(domains.ok,false);
  assert.equal(domains.status,'WINNR_PROVIDER_BLOCKED');
});

test('canonical Winnr reads exact account and mailbox APIs without provider mutations',async()=>{
  const calls=[];
  const adapter=createWinnrInfrastructureAdapter(cfg(),{
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      if(url.endsWith('/v1/account'))return response({id:'acct_1',name:'UberBond'});
      if(url.includes('/v1/email-users?'))return response([{id:'u1',email:'sam@pilot.test',status:'active'}]);
      return response([]);
    }
  });
  const workspaces=await adapter.listWorkspaces();
  assert.equal(workspaces.ok,true);
  const mailboxes=await adapter.listMailboxes({domain:'pilot.test'});
  assert.equal(mailboxes.mailboxes[0].address,'sam@pilot.test');
  assert.equal(calls.every(call=>call.options.method==='GET'),true);
});

test('canonical Winnr writes need scoped non-expired owner approval',async()=>{
  let calls=0;
  const adapter=createWinnrInfrastructureAdapter(cfg(),{
    fetchImpl:async()=>{calls+=1;return response({job_id:'j1'});}
  });
  const denied=await adapter.provisionMailboxes({body:{domain:'pilot.test',users:[{username:'sam',name:'Sam'}]}});
  assert.equal(denied.status,'OWNER_APPROVAL_REQUIRED');
  assert.equal(calls,0);

  const allowed=await adapter.provisionMailboxes({
    body:{domain:'pilot.test',users:[{username:'sam',name:'Sam'}]},
    ownerApproval:{granted:true,grantedBy:'founder',scope:['winnr:provisionMailboxes'],expiresAt:'2099-01-01T00:00:00Z',spendLimitCents:0}
  });
  assert.equal(allowed.ok,true);
  assert.equal(calls,1);
});

test('mailbox provisioning keeps zero-budget, scope and expiry checks explicit',async()=>{
  let calls=0;
  const adapter=createWinnrInfrastructureAdapter(cfg(),{fetchImpl:async()=>{calls++;return response({job_id:'j1'});}});
  const body={domain:'pilot.test',users:[{username:'sam',name:'Sam'}]};
  const approval={granted:true,grantedBy:'founder',scope:['winnr:provisionMailboxes'],expiresAt:'2099-01-01T00:00:00Z'};
  assert.equal((await adapter.provisionMailboxes({body,ownerApproval:approval})).status,'SPEND_LIMIT_EXCEEDED');
  assert.equal((await adapter.provisionMailboxes({body,ownerApproval:{...approval,spendLimitCents:0,scope:['winnr:exportMailboxes']}})).status,'OWNER_APPROVAL_SCOPE_MISMATCH');
  assert.equal((await adapter.provisionMailboxes({body,ownerApproval:{...approval,spendLimitCents:0,expiresAt:'2000-01-01T00:00:00Z'}})).status,'OWNER_APPROVAL_EXPIRED');
  assert.equal(calls,0);
});

test('pre-warmed purchase stays outside automatic provider contract spend authority',async()=>{
  const adapter=createWinnrInfrastructureAdapter(cfg());
  const result=await adapter.prewarmPurchase({
    body:{domain:'pilot.test',address_count:3},
    ownerApproval:{granted:true,grantedBy:'founder',scope:['winnr:prewarmPurchase'],expiresAt:'2099-01-01T00:00:00Z',spendLimitCents:900}
  });
  assert.equal(result.ok,false);
  assert.equal(result.status,'UNSUPPORTED_CAPABILITY');
});
