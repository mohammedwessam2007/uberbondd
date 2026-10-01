import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileWinnrPostPurchaseRegistryPlan,
  applyWinnrPostPurchaseRegistryPlan
} from '../src/uberwinnr-postpurchase.mjs';
import { computeSendingDomainState } from '../src/sending-domain-registry.mjs';

const CSV=[
  'domain,from_email,from_name,user_name,password,smtp_host,smtp_port,imap_host,imap_port,imap_username,imap_password,footer',
  'pilot-outreach.co,sam@pilot-outreach.co,Sam,sam@pilot-outreach.co,p1,smtp.example.net,465,imap.example.net,993,sam@pilot-outreach.co,p1,',
  'pilot-outreach.co,alex@pilot-outreach.co,Alex,alex@pilot-outreach.co,p2,smtp.example.net,465,imap.example.net,993,alex@pilot-outreach.co,p2,',
  'pilot-outreach.co,ria@pilot-outreach.co,Ria,ria@pilot-outreach.co,p3,smtp.example.net,465,imap.example.net,993,ria@pilot-outreach.co,p3,'
].join('\n');

function store(){
  const rows=[];
  return {
    rows,
    async log(type,detail){rows.push({type,detail,createdAt:detail.timestamp||new Date().toISOString()});return {type,detail};},
    async list(collection,{filters}={}){
      if(collection!=='auditLog')return[];
      return rows.filter(row=>!filters?.type||row.type===filters.type);
    }
  };
}

test('post-purchase plan records provider control without falsely claiming ownership',()=>{
  const p=compileWinnrPostPurchaseRegistryPlan({csvText:CSV});
  assert.equal(p.ok,true);
  assert.equal(p.domain.ownershipStatus,'PROVIDER_CONTROL_CONFIRMED');
  assert.equal(p.mailboxes.length,3);
  assert.equal(p.mailboxes.every(x=>x.plannedDailyCap===2),true);
  assert.equal(JSON.stringify(p).includes('p1'),false);
});

test('provider-controlled registry state advances to DNS checks without owner-ownership fiction',()=>{
  const p=compileWinnrPostPurchaseRegistryPlan({csvText:CSV});
  const event={
    kind:'REGISTERED',
    domainId:p.domain.domainId,
    workspaceId:p.workspaceId,
    domain:p.domain.domain,
    ownershipStatus:'PROVIDER_CONTROL_CONFIRMED',
    registrar:'winnr-managed',
    purpose:'outreach',
    provider:'winnr-prewarmed',
    timestamp:'2026-10-01T21:00:00.000Z'
  };
  const state=computeSendingDomainState([event],{date:new Date('2026-10-01T21:00:00Z')});
  assert.equal(state.state,'DNS_INCOMPLETE');
  assert.equal(state.ownershipStatus,'PROVIDER_CONTROL_CONFIRMED');
});

test('post-purchase registry application is idempotent over deterministic identities',async()=>{
  const s=store();
  const p=compileWinnrPostPurchaseRegistryPlan({csvText:CSV});
  const first=await applyWinnrPostPurchaseRegistryPlan({store:s,plan:p,date:new Date('2026-10-01T21:00:00Z')});
  assert.equal(first.ok,true);
  const count=s.rows.length;
  const second=await applyWinnrPostPurchaseRegistryPlan({store:s,plan:p,date:new Date('2026-10-01T21:01:00Z')});
  assert.equal(second.ok,true);
  assert.equal(s.rows.length,count);
  assert.deepEqual(second.linksByEmail,p.linksByEmail);
});

test('post-purchase plan refuses mixed-domain credential exports',()=>{
  const mixed=CSV+'\nother-outreach.co,x@other-outreach.co,X,x@other-outreach.co,p,smtp.example.net,465,imap.example.net,993,x@other-outreach.co,p,';
  const p=compileWinnrPostPurchaseRegistryPlan({csvText:mixed});
  assert.equal(p.ok,false);
  assert.ok(p.reasonCodes.includes('exactly-one-prewarmed-domain-required'));
});
