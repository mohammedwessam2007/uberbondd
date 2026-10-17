import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberWarm2SeedBatch, executeUberWarm2SeedProbe, reconcileUberWarm2SeedObservations } from '../src/uberwarm2-seed-execution.mjs';
const now = new Date('2026-10-12T12:00:00.000Z');
const sender = { mailboxId: 'tara', address: 'tara@owned.example', authenticationStatus: 'AUTHENTICATED', paused: false, dnsAuthenticated: true, transportAuthorized: true, providerPolicyCompatible: true };
const seeds = [
  { email: 'me@gmail.com', provider: 'google', ownerControlled: true, receiveReady: true, authorizedScope: 'UBERWARM2_PLACEMENT_TEST', permissionEvidenceRef: 'consent:1', ownerEvidenceRef: 'custody:1', permissionExpiresAt: '2026-11-12T00:00:00Z' },
  { email: 'me@outlook.com', provider: 'microsoft', ownerControlled: true, receiveReady: true, authorizedScope: 'UBERWARM2_PLACEMENT_TEST', permissionEvidenceRef: 'consent:2', ownerEvidenceRef: 'custody:2', permissionExpiresAt: '2026-11-12T00:00:00Z' }
];
const plan = () => compileUberWarm2SeedBatch({ mailboxes: [sender], seedInboxes: seeds, now });
function auth(batch, probe) { return {granted:true,scope:'UBERWARM2_OWNER_SEED_PROBE',grantedBy:'founder',batchDigest:batch.batchDigest,probeId:probe.probeId,expiresAt:'2026-10-12T12:30:00Z',allowedSender:probe.senderEmail,allowedRecipient:probe.seedEmail}; }
function fixture() {
  const keys = new Set(), senders = new Map(), recipients = new Map(), results=[];
  let sends=0;
  const f = { get sends(){return sends}, results, shouldThrow: false,
    ledger:{async tryReserveProbe(x){if(keys.has(x.reservationId))return {ok:false,reason:'replay'};
      const sk=`${x.day}:${x.senderEmail}`, rk=`${x.day}:${x.recipientEmail}`;
      if((senders.get(sk)||0)>=x.maxSenderProbesPerDay || (recipients.get(rk)||0)>=x.maxRecipientProbesPerDay)return {ok:false,reason:'quota-exceeded'};
      keys.add(x.reservationId);senders.set(sk,(senders.get(sk)||0)+1);recipients.set(rk,(recipients.get(rk)||0)+1);return {ok:true};},async recordResult(x){results.push(x)}},
    adapter:{authorizedSmtp:true,boundMailboxId:'tara',boundSender:'tara@owned.example',async sendProbe(x){sends++;if(f.shouldThrow)throw new Error('network dropped after send');return {ok:true,status:'PROVIDER_ACCEPTED',providerMessageId:`smtp:${x.idempotencyKey}`}}}
  };
  return f;
}
test('plan requires actual sender and consenting seed, denies synthetic sender data',()=>{
  assert.equal(plan().ok,true);assert.equal(plan().probes.length,2);assert.equal(plan().crossProviderEvidencePossible,true);
  assert.equal(compileUberWarm2SeedBatch({mailboxes:[sender],seedInboxes:[{...seeds[0],ownerControlled:false}],now}).ok,false);
  assert.equal(compileUberWarm2SeedBatch({mailboxes:[{...sender,paused:true}],seedInboxes:seeds,now}).ok,false);
  assert.equal(compileUberWarm2SeedBatch({mailboxes:[{...sender,dnsAuthenticated:false}],seedInboxes:seeds,now}).ok,false);
  assert.equal(compileUberWarm2SeedBatch({mailboxes:[sender],seedInboxes:[{...seeds[0],permissionExpiresAt:'2026-10-11T00:00:00Z'}],now}).ok,false);
});
test('plan restricts one same-day probe per seed across the batch',()=>{
 const p=compileUberWarm2SeedBatch({mailboxes:[sender,{...sender,address:'nadia@owned.example',mailboxId:'nadia'}],seedInboxes:seeds,now,maxProbes:50});
 assert.equal(p.probes.length,2);assert.equal(new Set(p.probes.map(x=>x.seedEmail)).size,2);
});
test('no send without exact valid signed-intent scope, unchanged digest, adapter and ledger',async()=>{
 const p=plan(), x=p.probes[0], f=fixture();
 assert.equal((await executeUberWarm2SeedProbe({plan:p,probeId:x.probeId,authorization:{},ledger:f.ledger,sendAdapter:f.adapter,now})).ok,false);
 assert.equal((await executeUberWarm2SeedProbe({plan:p,probeId:x.probeId,authorization:{...auth(p,x),allowedRecipient:'other@gmail.com'},ledger:f.ledger,sendAdapter:f.adapter,now})).ok,false);
 assert.equal((await executeUberWarm2SeedProbe({plan:p,probeId:x.probeId,authorization:auth(p,x),ledger:f.ledger,sendAdapter:{...f.adapter,boundSender:'other@owned.example'},now})).ok,false);
 assert.equal((await executeUberWarm2SeedProbe({plan:p,probeId:x.probeId,authorization:auth(p,x),ledger:{},sendAdapter:f.adapter,now})).ok,false);
 assert.equal(f.sends,0);
 const bad={...p,probes:p.probes.map((y,i)=>i===0?{...y,seedEmail:'attacker@gmail.com'}:y)};
 assert.equal((await executeUberWarm2SeedProbe({plan:bad,probeId:x.probeId,authorization:auth(p,x),ledger:f.ledger,sendAdapter:f.adapter,now})).ok,false);
});
test('real adapter invoked once, records provider acceptance not placement, no replay',async()=>{
 const p=plan(), x=p.probes[0],f=fixture();
 const args={plan:p,probeId:x.probeId,authorization:auth(p,x),ledger:f.ledger,sendAdapter:f.adapter,now};
 const r=await executeUberWarm2SeedProbe(args);
 assert.equal(r.ok,true); assert.equal(r.status,'PROVIDER_ACCEPTED_NOT_INBOX_PROVEN');assert.equal(r.inboxPlacementProven,false);
 assert.equal((await executeUberWarm2SeedProbe(args)).ok,false);assert.equal(f.sends,1);assert.equal(f.results.length,1);
});
test('SMTP uncertain or receipt failure never triggers automatic retry',async()=>{
 const p=plan(), x=p.probes[0],f=fixture();f.shouldThrow=true;
 const args={plan:p,probeId:x.probeId,authorization:auth(p,x),ledger:f.ledger,sendAdapter:f.adapter,now};
 const r=await executeUberWarm2SeedProbe(args);assert.equal(r.ok,false);assert.equal(r.status,'OUTCOME_UNCERTAIN');
 assert.equal((await executeUberWarm2SeedProbe(args)).ok,false);assert.equal(f.sends,1);
});
test('expired authorization and expiry of plan both block',async()=>{
 const p=plan(),x=p.probes[0],f=fixture();let a=auth(p,x);
 assert.equal((await executeUberWarm2SeedProbe({plan:p,probeId:x.probeId,authorization:{...a,expiresAt:'2026-10-12T11:59:00Z'},ledger:f.ledger,sendAdapter:f.adapter,now})).ok,false);
 assert.equal((await executeUberWarm2SeedProbe({plan:p,probeId:x.probeId,authorization:a,ledger:f.ledger,sendAdapter:f.adapter,now:new Date('2026-10-12T13:00:00Z')})).ok,false);
 assert.equal(f.sends,0);
});
test('receiving provider observations require exact source, identity, permission, fresh time, valid folder',()=>{
 const p=plan(),x=p.probes[0];const row={probeId:x.probeId,senderEmail:x.senderEmail,seedEmail:x.seedEmail,seedProvider:x.seedProvider,source:'RECEIVING_PROVIDER_OBSERVATION',receiverAccountVerified:true,ownerControlled:true,evidenceRef:'gmail:message1',observedAt:'2026-10-12T12:05:00Z',folder:'INBOX'};
 const q=reconcileUberWarm2SeedObservations({plan:p,deliveryReceipts:[{probeId:x.probeId,batchDigest:p.batchDigest,senderEmail:x.senderEmail,seedEmail:x.seedEmail,status:'PROVIDER_ACCEPTED_NOT_INBOX_PROVEN',inboxPlacementProven:false,providerMessageId:'<confirmed@owned.example>'}],observations:[row,{...row,folder:'SPAM'}, {...row,seedEmail:'fraud@gmail.com'}, {...row,source:'SYNTHETIC_NETWORK'}, {...row,observedAt:'2026-10-11T23:00:00Z'}], now:new Date('2026-10-12T12:10:00Z')});
 assert.equal(q.ok,true);assert.equal(q.observed,1);assert.equal(q.rejected.length,4);assert.equal(q.readinessPromotionAuthorized,false);assert.equal(q.recipientNetworkReputationProven,false);
 assert.equal(q.report.senderReports[0].inbox,1);
});
test('single-provider seed coverage not mislabeled cross-provider proof',()=>{
 const p=compileUberWarm2SeedBatch({mailboxes:[sender],seedInboxes:[seeds[0]],now});
 assert.equal(p.crossProviderEvidencePossible,false);assert.equal(p.allProviderParityProven,false);
});