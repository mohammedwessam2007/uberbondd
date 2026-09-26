import test from 'node:test';
import assert from 'node:assert/strict';
import { compileMaildosoEvidenceSnapshot, syncMaildosoEvidence } from '../src/ubermaildoso-evidence-sync.mjs';

test('provider domain presence never becomes DNS authentication',()=>{
 const r=compileMaildosoEvidenceSnapshot({domainsResponse:{items:[{domain:'send.example.com',status:'active'}]}});
 assert.equal(r.domains[0].domain,'send.example.com');
 assert.equal(r.domains[0].dnsAuthenticated,null);
 assert.equal(r.summary.dnsAuthenticatedDomains,0);
});

test('provider account binds only to an exact locally known SMTP address',()=>{
 const r=compileMaildosoEvidenceSnapshot({
   accountsResponse:{accounts:[{email:'a@example.com',status:'active',daily_limit:15},{email:'other@example.com',status:'active'}]},
   fleetAccounts:[{id:'local-1',email:'a@example.com',provider:'smtp-relay',connected:true,sendingMailboxId:'mb1'}]
 });
 assert.equal(r.accounts[0].localMailboxId,'mb1');
 assert.equal(r.accounts[1].localMailboxId,null);
 assert.equal(r.summary.locallyBoundProviderAccounts,1);
});

test('warmup completion is explicit and unknown status stays uncertain',()=>{
 const r=compileMaildosoEvidenceSnapshot({warmupsResponse:{services:[
   {status:'completed',mailboxes:['a@example.com']},{status:'mystery',mailboxes:['b@example.com']}
 ]}});
 assert.equal(r.warmups[0].status,'WARMUP_COMPLETE');
 assert.equal(r.warmups[1].status,'WARMUP_UNCERTAIN');
});

test('sync performs reads only and writes redacted evidence events',async()=>{
 const calls=[];
 const data={
   domains:{items:[{domain:'example.com',status:'active'}]},
   accountsLookup:{accounts:[{email:'a@example.com',status:'active',daily_limit:15}]},
   warmups:{services:[{status:'completed',mailboxes:['a@example.com']}]},
   forwardingLookup:{items:[{email:'reply@maildoso.email',status:'active'}]},
   stats:{sent:0}
 };
 const adapter={configured:true,read:async name=>{calls.push(name);return{ok:true,providerCalls:1,data:data[name],receipt:{responseDigest:`sha256:${name}`}};}};
 const logs=[];
 const store={
   log:async(type,detail)=>{logs.push({type,detail});return true;}
 };
 const out=await syncMaildosoEvidence({adapter,store,fleetAccounts:[{email:'a@example.com',provider:'smtp-relay',connected:true,sendingMailboxId:'mb1'}],now:new Date('2026-09-26T16:00:00Z')});
 assert.equal(out.ok,true);assert.equal(out.providerCalls,5);
 assert.deepEqual(calls,['domains','accountsLookup','warmups','forwardingLookup','stats']);
 assert.equal(out.dnsMutations,0);assert.equal(out.messagesSent,0);
 assert.ok(logs.some(x=>x.type==='sending_mailbox_event'));
 assert.ok(logs.some(x=>x.type==='ubermaildoso_evidence_snapshot'));
});
