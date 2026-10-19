import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberWarm2AuthorizedOneShotRuntime } from '../src/uberwarm2-authorized-one-shot-runtime.mjs';
import { compileUberWarm2SeedBatch, createUberWarm2SeedApprovalProof, UBERWARM2_SEED_TEMPLATE_DIGEST } from '../src/uberwarm2-seed-executor.mjs';

const NOW=Date.parse('2026-10-19T00:00:00Z');
const sender='owner@owned.example', receiver='own-inbox@example.org', probeId='uberwarm-one-owned-probe-20261019';
const KEY='unit-test-only-owner-approval-verifier-not-a-real-secret-2026';
const iso=new Date(NOW).toISOString();
const senderRow=extra=>({email:sender,domain:'owned.example',observedAt:iso,evidenceRef:'trusted:sender-test-fixture',...extra});
const receiverRow=(receiptId,extra)=>({email:receiver,probeId,observedAt:iso,
  evidenceRef:`trusted:receiver-${receiptId}`,receiptId,verified:true,signed:true,...extra});
const senderState={mailboxId:'mb1',address:sender,authenticationStatus:'AUTHENTICATED',paused:false,
  dnsAuthenticated:true,transportAuthorized:true,providerPolicyCompatible:true};
const seedState={email:receiver,ownerControlled:true,receiveReady:true,consentToTest:true,
  consentEvidenceRef:'fixture:authenticated-exact-optin',permissionExpiresAt:new Date(NOW+25*60000).toISOString()};
const batch=compileUberWarm2SeedBatch({
  placementPlan:{probes:[{probeId,senderEmail:sender,seedEmail:receiver,seedProvider:'winnr',
    authority:'PLAN_ONLY',sendAuthorized:false,bodyToken:probeId}]},
  mailboxes:[senderState],seedInboxes:[seedState],now:new Date(NOW),maxBatch:1,maxSeedsPerSender:1
});
assert.equal(batch.ok,true);
function approvalFor(b=batch){
  const a={granted:true,grantedBy:'fixture-owner',expiresAt:new Date(NOW+20*60000).toISOString(),
    scopes:['uberwarm2:owner-controlled-seed-test'],batchDigest:b.batchDigest,
    templateDigest:UBERWARM2_SEED_TEMPLATE_DIGEST,probeId,evidenceRef:'fixture:authenticated-owner'};
  return {...a,proof:createUberWarm2SeedApprovalProof({approval:a,verificationKey:KEY})};
}
function fixture(){
  const calls={get:0,send:0,claims:0,finalized:0};
  let held=false, consentRevoked=false;
  const client={
    listAllMailboxes:async()=>({ok:true,data:[{id:'eu1',email:sender,domain:'owned.example',status:'active'}],
      pagination:{has_more:false},receipt:{responseDigest:'sha256:provider-mailbox-fixture'}}),
    listAllDomains:async()=>({ok:true,data:[{id:'domain1',domain:'owned.example'}],pagination:{has_more:false},
      receipt:{responseDigest:'sha256:provider-domain-fixture'}}),
    getDnsStatus:async()=>({ok:true,data:{domainId:'domain1',domain:'owned.example',ready:true,observedAt:iso},
      receipt:{responseDigest:'sha256:provider-dns-fixture'}}),
    async getMailbox(){calls.get++;return {ok:true,data:{id:'eu1',email:sender,domain:'owned.example',status:'active'},
      receipt:{responseDigest:'sha256:provider-identity-fixture'}};},
    async sendOwnerSeedViaHttps({writeAuthorized,to,subject,body}){calls.send++;assert.equal(writeAuthorized,true);
      assert.equal(to,receiver);assert.ok(subject);assert.ok(body.includes(probeId));
      return {ok:true,status:'UBERWINNR_WRITE_CONFIRMED',data:{message_id:'<provider-test-id@owned.example>'},
        receipt:{responseDigest:'sha256:provider-send-fixture'}};
    }
  };
  const pool={
    async connect(){return {release(){},async query(sql){
      if(sql.startsWith('SELECT (clock_timestamp()'))return {rows:[{quota_day:'2026-10-19'}]};
      if(sql.startsWith('SELECT reservation_key'))return {rows:calls.claims?[{reservation_key:'already'}]:[]};
      if(sql.includes('COUNT(*) FILTER'))return {rows:[{total:0,sender_total:0,seed_total:0,
        rolling_total:0,rolling_sender_total:0,rolling_seed_total:0}]};
      if(sql.startsWith('INSERT INTO uberwarm2_seed_probe_claims'))calls.claims++;
      return {rows:[]};
    }};},
    async query(sql){if(sql.startsWith('UPDATE uberwarm2_seed_probe_claims')){
      calls.finalized++;return {rows:[{reservation_key:'verified'}]};}
      return {rows:[]};}
  };
  const readers={
    readVerifiedHttpsTransport:async()=>[senderRow({authenticated:true,signed:true,transportAuthorized:true,
      secure:true,termsCompatible:true,senderIdentityVerified:true,providerWritePermissionVerified:true,
      submissionEndpoint:'WINNR_INBOX_HTTPS_API',authorizedPurpose:'OWNER_CONTROLLED_PLACEMENT_PROBE'})],
    readLocalHold:async()=>[senderRow({held,suppressed:false,signed:true,verified:true,
      paused:false,quarantined:false,placementQuarantine:false,policyCompatible:true})],
    readVerifiedDnsAlignment:async()=>[senderRow({aligned:true,signed:true})],
    readAuthenticatedConsent:async()=>[receiverRow('consent', {ownerControlled:true,consentToTest:!consentRevoked,
      withdrawn:consentRevoked,optedOut:false,suppressed:false,consentEvidenceRef:'fixture:consent',
      probeIds:[probeId],permissionExpiresAt:seedState.permissionExpiresAt})],
    readCurrentReceiveReady:async()=>[receiverRow('receiver',{ownerControlled:true,independentMailbox:true,receiveReady:true})],
    readSuppression:async()=>[receiverRow('suppression',{withdrawn:consentRevoked,optedOut:false,suppressed:false})]
  };
  return {client,pool,readers,calls,clock:()=>NOW,revoke:()=>{consentRevoked=true;},hold:()=>{held=true;}};
}
const create=(f,extra={})=>createUberWarm2AuthorizedOneShotRuntime({client:f.client,pool:f.pool,
  senderEmail:sender,userId:'eu1',trustedReaders:f.readers,clock:f.clock,
  approvalVerificationKey:KEY,operatorExecutionEnabled:true,...extra});

test('defaults refuse with no provider or ledger call and no send authority',async()=>{
  const f=fixture(); const r=create(f,{operatorExecutionEnabled:false});
  assert.equal(r.configured,false);assert.equal(r.ready,false);assert.equal(r.sendAuthority,'NONE');
  assert.equal((await r.executeApprovedOneShot({batch,probeId,approval:approvalFor()})).providerSubmissions,0);
  assert.equal(f.calls.send,0);assert.equal(f.calls.claims,0);assert.equal(f.calls.get,0);
});
test('missing external exact-scope signing and consent verification readers denies source assembly',async()=>{
  const f=fixture();delete f.readers.readAuthenticatedConsent;
  const r=create(f);assert.equal(r.configured,false);
  assert.equal((await r.executeApprovedOneShot({batch,probeId,approval:approvalFor()})).ok,false);
  assert.equal(f.calls.send,0);
});
test('unsigned batch approval is refused before any provider read, claim or send',async()=>{
  const f=fixture(),r=create(f);assert.equal(r.configured,true);
  assert.equal(r.ready,false);assert.equal(r.sendAuthority,'NONE');
  const response=await r.executeApprovedOneShot({batch,probeId,approval:{...approvalFor(),proof:'0'.repeat(64)}});
  assert.equal(response.status,'UBERWARM2_OWNER_APPROVAL_REQUIRED');
  assert.equal(f.calls.get,0);assert.equal(f.calls.send,0);assert.equal(f.calls.claims,0);
});
test('fixture-authenticated exact optin + signed approval + durable primary submits at most one provider test',async()=>{
  const f=fixture(),r=create(f);
  const result=await r.executeApprovedOneShot({batch,probeId,approval:approvalFor()});
  assert.equal(result.ok,true);assert.equal(result.status,'PROVIDER_ACCEPTED_PLACEMENT_UNKNOWN');
  assert.equal(result.providerMessageId,'<provider-test-id@owned.example>');
  assert.equal(result.verifiedPlacements,0);assert.equal(f.calls.send,1);
  assert.equal(f.calls.claims,1);assert.equal(f.calls.finalized,1);
  const replay=await r.executeApprovedOneShot({batch,probeId,approval:approvalFor()});
  assert.equal(replay.ok,false);assert.equal(f.calls.send,1);assert.equal(f.calls.claims,1);
});
test('actual optout or sender hold overrides signed prior approval and prevents any claim',async()=>{
  for(const which of ['revoke','hold']){
    const f=fixture(),r=create(f);f[which]();
    const result=await r.executeApprovedOneShot({batch,probeId,approval:approvalFor()});
    assert.equal(result.status,'UBERWARM2_LIVE_PREFLIGHT_REFUSED');
    assert.equal(f.calls.claims,0);assert.equal(f.calls.send,0);
  }
});
