import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePlacementProbePlan } from '../src/uberplacement.mjs';
import {
  compileUberWarm2SeedBatch, createUberWarm2SeedApprovalProof,
  UBERWARM2_SEED_TEMPLATE_DIGEST
} from '../src/uberwarm2-seed-executor.mjs';
import { createUberWarm2ProtectedOneShotOperator } from '../src/uberwarm2-protected-one-shot-operator.mjs';

const KEY = 'fixture-only-approval-key-nobody-should-deploy';
const senderEmail = 'sender@owned.example';
const seedEmail = 'consenting@owned-seed.example';
const T = Date.parse('2026-10-18T13:00:00.000Z');
const at = T + 120000;
const sender = {mailboxId:'win-1',address:senderEmail,authenticationStatus:'AUTHENTICATED',
  dnsAuthenticated:true,transportAuthorized:true,providerPolicyCompatible:true,
  paused:false,quarantined:false};
const seed = {email:seedEmail,ownerControlled:true,receiveReady:true,consentToTest:true,
  consentEvidenceRef:'synthetic-owner-test-only',permissionExpiresAt:'2026-10-18T13:42:00.000Z'};
function batch(){
 const placementPlan=compilePlacementProbePlan({
  senders:[{slot:'win-1',email:senderEmail,connected:true,paused:false}],
  seedInboxes:[{email:seedEmail,ownerControlled:true,receiveReady:true}],
  campaignId:'owner-test-fixture',now:new Date(T)
 });
 return compileUberWarm2SeedBatch({placementPlan,mailboxes:[sender],seedInboxes:[seed],now:new Date(T)});
}
function approval(b){
 const entry={granted:true,grantedBy:'owner-fixture',expiresAt:'2026-10-18T13:40:00.000Z',
  scopes:['uberwarm2:owner-controlled-seed-test'],batchDigest:b.batchDigest,
  templateDigest:UBERWARM2_SEED_TEMPLATE_DIGEST,probeId:b.probes[0].probeId,
  evidenceRef:'synthetic-fixture-not-real-authorization'};
 return {...entry,proof:createUberWarm2SeedApprovalProof({approval:entry,verificationKey:KEY})};
}
const empty = async()=>[];
function fixture(){
 const calls=[];
 const client={
  async listAllMailboxes(){calls.push('mailboxes');return {ok:true,data:[],pagination:{has_more:false}}},
  async listAllDomains(){calls.push('domains');return {ok:true,data:[],pagination:{has_more:false}}},
  async getDnsStatus(){calls.push('dns');return {ok:false}},
  async getMailbox(){calls.push('provider-read');return {ok:false}},
  async sendOwnerSeedViaHttps(){calls.push('PROVIDER-WRITE');return {ok:true}}
 };
 const pool={async connect(){calls.push('DB-WRITE');throw Error('must-never-reserve')},
   async query(){calls.push('DB-READ');return {rows:[]}}};
 const readers={readVerifiedHttpsTransport:empty,readLocalHold:empty,
   readVerifiedDnsAlignment:empty,readAuthenticatedConsent:empty,
   readCurrentReceiveReady:empty,readSuppression:empty};
 const operator=createUberWarm2ProtectedOneShotOperator({client,pool,userId:'win-1',
  senderEmail,trustedReaders:readers,approvalVerificationKey:KEY,
  readAuthenticatedReceivingEvidence:empty,readVerifiedEvidenceReference:()=>false,
  clock:()=>at});
 return {operator,calls};
}

test('protected one-shot requires primary, signer and trusted readers before IO',async()=>{
 const op=createUberWarm2ProtectedOneShotOperator();
 assert.equal(op.configured,false);
 const r=await op.runOne({});
 assert.equal(r.ok,false);assert.equal(r.providerSubmissions,0);
 assert.equal(r.automaticRetryAuthorized,false);
});

test('wrong sender or non-unique batch refuses without API reads or DB claim',async()=>{
 const {operator,calls}=fixture();
 assert.equal(operator.configured,true);
 for(const b of [null,{probes:[]},{probes:[{probeId:'x',senderEmail:'wrong@owned.example'}]},
  {probes:[{probeId:'x',senderEmail}, {probeId:'y',senderEmail}]}]){
  const r=await operator.runOne({batch:b,probeId:'x'});
  assert.equal(r.status,'UBERWARM2_PROTECTED_OPERATOR_REFUSED');
 }
 assert.deepEqual(calls,[]);
});

test('valid signed fixture cannot submit without separately verified sender and consent sources',async()=>{
 const {operator,calls}=fixture();const b=batch();
 assert.equal(b.ok,true);assert.equal(b.probes.length,1);
 const r=await operator.runOne({batch:b,probeId:b.probes[0].probeId,approval:approval(b)});
 assert.equal(r.status,'UBERWARM2_LIVE_PREFLIGHT_REFUSED');
 assert.equal(r.providerSubmissions,0);assert.equal(r.verifiedPlacements,0);
 assert.equal(r.automaticRetryAuthorized,false);
 assert.equal(calls.includes('PROVIDER-WRITE'),false);
 assert.equal(calls.includes('DB-WRITE'),false);
});

test('missing or tampered signer proof refuses with no effect',async()=>{
 const {operator,calls}=fixture();const b=batch();
 for(const a of [null,{...approval(b),proof:'0'.repeat(64)},
  {...approval(b),batchDigest:'sha256:'+'0'.repeat(64)}]){
  const r=await operator.runOne({batch:b,probeId:b.probes[0].probeId,approval:a});
  assert.equal(r.status,'UBERWARM2_OWNER_APPROVAL_REQUIRED');
 }
 assert.deepEqual(calls,[]);
});
