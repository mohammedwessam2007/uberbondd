import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileWinnrPostPurchaseRegistryPlan,
  compileWinnrPostPurchaseFleetPlan,
  applyWinnrPostPurchaseFleetPlan
} from '../src/uberwinnr-postpurchase.mjs';

const HEADER='domain,from_email,from_name,user_name,password,smtp_host,smtp_port,imap_host,imap_port,imap_username,imap_password,footer';

// Synthetic fleet: 10 domains x 5 mailboxes = 50 Startup mailboxes. Credentials are fake placeholders.
function fleetCsv({domains=10,perDomain=5}={}){
  const rows=[HEADER];
  for(let d=1;d<=domains;d++){
    const domain=`fleet-${String(d).padStart(2,"0")}-startup.co`;
    for(let m=1;m<=perDomain;m++){
      const email=`box${m}@${domain}`;
      rows.push(`${domain},${email},Box ${m},${email},secret-${d}-${m},smtp.example.net,465,imap.example.net,993,${email},imap-secret-${d}-${m},`);
    }
  }
  return rows.join('\n');
}

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

test('fleet plan maps 50 mailboxes across 10 domains without carrying any password',()=>{
  const csv=fleetCsv();
  const plan=compileWinnrPostPurchaseFleetPlan({csvText:csv});
  assert.equal(plan.ok,true);
  assert.equal(plan.status,'WINNR_POSTPURCHASE_FLEET_PLAN_READY');
  assert.equal(plan.domainCount,10);
  assert.equal(plan.mailboxCount,50);
  assert.equal(plan.domainPlans.length,10);
  assert.equal(plan.domainPlans.every(p=>p.mailboxes.length===5),true);
  assert.equal(Object.keys(plan.linksByEmail).length,50);
  assert.equal(JSON.stringify(plan).includes('secret-'),false);
  assert.equal(JSON.stringify(plan).includes('imap-secret-'),false);
});

test('each mailbox link points at the domain identity of its own domain plan',()=>{
  const plan=compileWinnrPostPurchaseFleetPlan({csvText:fleetCsv()});
  for(const domainPlan of plan.domainPlans){
    for(const row of domainPlan.mailboxes){
      assert.equal(plan.linksByEmail[row.email].sendingDomainId,domainPlan.domain.domainId);
      assert.equal(plan.linksByEmail[row.email].sendingMailboxId,row.mailboxId);
    }
  }
});

test('single-domain plan still refuses a multi-domain export (behaviour preserved)',()=>{
  const p=compileWinnrPostPurchaseRegistryPlan({csvText:fleetCsv()});
  assert.equal(p.ok,false);
  assert.ok(p.reasonCodes.includes('exactly-one-prewarmed-domain-required'));
});

test('fleet plan refuses an empty export without provider calls',()=>{
  const p=compileWinnrPostPurchaseFleetPlan({csvText:HEADER});
  assert.equal(p.ok,false);
  assert.equal(p.providerCalls,0);
  assert.equal(p.messagesSent,0);
  assert.ok(p.reasonCodes.includes('credential-export-mailboxes-required'));
});

test('fleet registry application is idempotent across all 10 domains',async()=>{
  const s=store();
  const plan=compileWinnrPostPurchaseFleetPlan({csvText:fleetCsv()});
  const first=await applyWinnrPostPurchaseFleetPlan({store:s,fleetPlan:plan,date:new Date('2026-10-13T09:00:00Z')});
  assert.equal(first.ok,true);
  assert.equal(first.domainCount,10);
  assert.equal(first.mailboxCount,50);
  assert.equal(Object.keys(first.linksByEmail).length,50);
  const count=s.rows.length;
  const second=await applyWinnrPostPurchaseFleetPlan({store:s,fleetPlan:plan,date:new Date('2026-10-13T09:01:00Z')});
  assert.equal(second.ok,true);
  assert.equal(second.eventsWritten,0);
  assert.equal(s.rows.length,count);
  assert.deepEqual(second.linksByEmail,plan.linksByEmail);
});

test('fleet apply refuses an unvalidated plan',async()=>{
  const r=await applyWinnrPostPurchaseFleetPlan({store:store(),fleetPlan:{ok:false}});
  assert.equal(r.ok,false);
  assert.ok(r.reasonCodes.includes('valid-fleet-plan-required'));
});
