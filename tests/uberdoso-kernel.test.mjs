import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberDosoTopology, compileUberDosoDnsPlan, selectUberDosoSender, evaluateUberDosoSelfHealing, compileUberDosoCycle, UBERDOSO_POSTAL_VERSION } from '../src/uberdoso-kernel.mjs';

test('UberDoso hard-binds exactly the two owned outreach roots and no website role',()=>{
  const result=compileUberDosoTopology();
  assert.equal(result.ok,true);
  assert.equal(result.topology.transport.pinnedVersion,UBERDOSO_POSTAL_VERSION);
  assert.deepEqual(result.topology.roots.map(r=>r.root),['uberbond.agency','uberbond.cloud']);
  assert.ok(result.topology.roots.every(r=>r.websiteRole==='NONE_OUTREACH_ONLY'));
  assert.deepEqual(result.topology.roots.map(r=>r.mailboxes[0].address),['mohamed@uberbond.agency','mohamed@uberbond.cloud']);
});

test('UberDoso refuses any invented third root or subdomain-as-root',()=>{
  assert.equal(compileUberDosoTopology({roots:['uberbond.agency','uberbond.cloud','evil.example']}).ok,false);
  assert.equal(compileUberDosoTopology({roots:['uberbond.agency','send.uberbond.cloud']}).ok,false);
});

test('DNS plan refuses to green itself without physical IP PTR and observed DKIM',()=>{
  const topology=compileUberDosoTopology().topology;
  const blocked=compileUberDosoDnsPlan({topology});
  assert.equal(blocked.status,'UBERDOSO_DNS_PLAN_BLOCKED_PHYSICAL_EVIDENCE');
  assert.ok(blocked.plan.reasonCodes.includes('static-public-ipv4-required'));
  assert.ok(blocked.plan.reasonCodes.some(v=>v.includes('observed-postal-dkim-record-required:uberbond.agency')));
  assert.equal(blocked.externalEffectLedger.dnsChanges,0);
});

test('DNS plan becomes concrete only with public IP matching PTR and observed per-root DKIM',()=>{
  const topology=compileUberDosoTopology().topology;
  const result=compileUberDosoDnsPlan({topology,publicIpv4:'203.0.113.25',ptrHostname:'mta.uberbond.cloud',dkimRecordsByDomain:{
    'uberbond.agency':{host:'postal._domainkey.uberbond.agency',value:'v=DKIM1; k=rsa; p=AAA'},
    'uberbond.cloud':{host:'postal._domainkey.uberbond.cloud',value:'v=DKIM1; k=rsa; p=BBB'}
  }});
  assert.equal(result.status,'UBERDOSO_DNS_PLAN_READY');
  assert.ok(result.plan.records.some(r=>r.host==='uberbond.agency'&&r.type==='TXT'&&r.value.includes('include:spf.uberbond.cloud')));
  assert.ok(result.plan.records.some(r=>r.host==='_dmarc.uberbond.cloud'));
  assert.equal(result.plan.ptrRequirement.verified,true);
});

test('sender routing is health-gated, capacity-aware and deterministic',()=>{
  const rows=[
    {mailboxId:'a',address:'mohamed@uberbond.agency',domain:'uberbond.agency',connected:true,paused:false,authenticationStatus:'AUTHENTICATED',warmupStatus:'WARMUP_COMPLETE',currentDailyCap:20,sentToday:3},
    {mailboxId:'b',address:'mohamed@uberbond.cloud',domain:'uberbond.cloud',connected:true,paused:false,authenticationStatus:'AUTHENTICATED',warmupStatus:'WARMUP_COMPLETE',currentDailyCap:20,sentToday:4},
    {mailboxId:'c',address:'bad@uberbond.cloud',domain:'uberbond.cloud',connected:true,paused:true,authenticationStatus:'AUTHENTICATED',warmupStatus:'WARMUP_COMPLETE',currentDailyCap:20,sentToday:0}
  ];
  const one=selectUberDosoSender({mailboxes:rows,recipientKey:'acme.com'});
  const two=selectUberDosoSender({mailboxes:rows,recipientKey:'acme.com'});
  assert.equal(one.ok,true);
  assert.equal(one.sender.address,two.sender.address);
  assert.notEqual(one.sender.mailboxId,'c');
  assert.equal(one.candidateCount,2);
});

test('bounce or complaint failure quarantines and never auto-resumes',()=>{
  const healing=evaluateUberDosoSelfHealing({mailboxState:{mailboxId:'m1',bounceCount:2,complaintCount:0,authenticationStatus:'AUTHENTICATED'},sentCount:20});
  assert.equal(healing.status,'UBERDOSO_REPAIR_REQUIRED');
  assert.equal(healing.repair.action,'QUARANTINE_UNTIL_EVIDENCE_AND_OWNER_REVIEW');
  assert.equal(healing.repair.automaticResume,false);
  assert.ok(healing.repair.reasonCodes.includes('bounce-rate-exceeds-threshold'));
});

test('transient rate limiting cools down but still requires fresh re-verification before resume',()=>{
  const healing=evaluateUberDosoSelfHealing({mailboxState:{mailboxId:'m1',bounceCount:0,complaintCount:0,authenticationStatus:'AUTHENTICATED',providerRateLimited:true},sentCount:20,date:'2026-09-13T00:00:00Z'});
  assert.equal(healing.repair.action,'AUTO_COOLDOWN_THEN_REVERIFY');
  assert.equal(healing.repair.automaticResume,false);
  assert.ok(healing.repair.resumeAfter);
});

test('cycle energizes missing authentication and warmup while ready mailboxes rest',()=>{
  const domains=[{domainId:'d1',domain:'uberbond.agency',dnsState:{status:'GREEN'}},{domainId:'d2',domain:'uberbond.cloud',dnsState:{status:'GREEN'}}];
  const mailboxes=[
    {mailboxId:'m1',sendingDomainId:'d1',address:'mohamed@uberbond.agency',domain:'uberbond.agency',connected:true,paused:false,authenticationStatus:'AUTHENTICATED',warmupStatus:'WARMUP_COMPLETE',currentDailyCap:15,bounceCount:0,complaintCount:0},
    {mailboxId:'m2',sendingDomainId:'d2',address:'mohamed@uberbond.cloud',domain:'uberbond.cloud',connected:true,paused:false,authenticationStatus:'AUTHENTICATED',warmupStatus:'WARMUP_NOT_STARTED',currentDailyCap:2,bounceCount:0,complaintCount:0}
  ];
  const result=compileUberDosoCycle({domains,mailboxes});
  assert.equal(result.status,'UBERDOSO_ENERGIZED');
  assert.deepEqual(result.readyMailboxIds,['m1']);
  assert.ok(result.actions.some(a=>a.kind==='START_WARMUP'&&a.mailboxId==='m2'));
  assert.equal(result.externalEffectAuthority,'NONE');
});
