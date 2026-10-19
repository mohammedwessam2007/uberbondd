import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ONE_SHOT_EVIDENCE_ROLES,attestedOneShotSigningPayload} from '../src/uberwarm2-attested-one-shot-readers.mjs';
import {createUberWarm2DelegatedEvidenceCustodyReaders as create} from '../src/uberwarm2-delegated-evidence-custody.mjs';
const kinds=Object.keys(ONE_SHOT_EVIDENCE_ROLES),now=Date.parse('2026-10-19T17:00:00.000Z');
function fixture(){
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const d={version:'uberbond.uberwarm2-evidence-custody.v1',revoked:false,
  delegationId:'TEST_ONLY_DELEGATION',authorityRef:'fixture:owner-authorization',signerId:'fixture-custodian',
  senderEmail:'sender@example.com',recipientEmail:'owner@example.net',domain:'example.com',probeId:'TEST_ONLY',
  validAfter:new Date(now-1000).toISOString(),expiresAt:new Date(now+600000).toISOString(),
  publicKeyPem:publicKey.export({type:'spki',format:'pem'}).toString(),
  sourceAuthorities:Object.fromEntries(kinds.map(k=>[k,'fixture-source:'+k]))};
 const m={attestations:{}};
 for(const [i,k] of kinds.entries()){
  const observedAt=new Date(now).toISOString(),expiresAt=new Date(now+40000).toISOString();
  const row={email:i<3?d.senderEmail:d.recipientEmail,...(i<3?{domain:d.domain}:{}),
   observedAt,delegationId:d.delegationId,authorityRef:d.authorityRef,sourceAuthority:d.sourceAuthorities[k],
   senderEmail:d.senderEmail,recipientEmail:d.recipientEmail,probeId:d.probeId,
   sourceDigest:'sha256:'+'a'.repeat(64),receiptId:'fixture-receipt:'+k,evidenceRef:'fixture-evidence:'+k};
  const x={kind:k,signerId:d.signerId,observedAt,expiresAt,row};
  x.signature=sign(null,attestedOneShotSigningPayload(x),privateKey).toString('base64url');m.attestations[k]=[x];
 }
 const f={d,m,privateKey,clock:now};
 f.resign=k=>{const x=m.attestations[k][0];x.signature=sign(null,attestedOneShotSigningPayload(x),privateKey).toString('base64url');};
 f.make=()=>create({readEvidence:async()=>JSON.stringify(m),readTrustedDelegation:()=>f.d,clock:()=>f.clock});
 f.query=k=>({email:kinds.indexOf(k)<3?d.senderEmail:d.recipientEmail,...(kinds.indexOf(k)<3?{domain:d.domain}:{probeId:d.probeId})});
 return f;
}
async function denied(f){const r=f.make();for(const k of kinds)assert.deepEqual(await r.readers[k](f.query(k)),[]);}
test('one explicitly delegated custodian preserves all six separate source receipts',async()=>{
 const f=fixture(),r=f.make();assert.equal(r.configured,true);
 for(const k of kinds){const rows=await r.readers[k](f.query(k));assert.equal(rows.length,1);
  assert.equal(rows[0].verificationMode,'OWNER_DELEGATED_SOURCE_CUSTODY');
  assert.equal(rows[0].sourceAuthority,f.d.sourceAuthorities[k]);assert.equal(rows[0].signed,true);}
});
test('untrusted manifest cannot supply or replace delegation',async()=>{
 const f=fixture();f.m.delegation=f.d;f.d=null;await denied(f);
 const g=fixture();g.m.publicKeyPem=g.d.publicKeyPem;g.d.publicKeyPem='invalid';await denied(g);
});
test('revocation and expiry are rechecked on every read',async()=>{
 const f=fixture(),r=f.make(),k=kinds[0];assert.equal((await r.readers[k](f.query(k))).length,1);
 f.d.revoked=true;assert.deepEqual(await r.readers[k](f.query(k)),[]);
 f.d.revoked=false;f.clock=Date.parse(f.d.expiresAt);assert.deepEqual(await r.readers[k](f.query(k)),[]);
});
test('missing, duplicate, reused and tampered evidence denies the entire set',async()=>{
 for(const mutate of [
  f=>delete f.m.attestations[kinds[5]],
  f=>f.m.attestations[kinds[0]].push(f.m.attestations[kinds[0]][0]),
  f=>{f.m.attestations[kinds[1]][0].row.receiptId=f.m.attestations[kinds[0]][0].row.receiptId;f.resign(kinds[1]);},
  f=>{f.m.attestations[kinds[1]][0].row.evidenceRef=f.m.attestations[kinds[0]][0].row.evidenceRef;f.resign(kinds[1]);},
  f=>f.m.attestations[kinds[3]][0].row.consented=true,
  f=>{f.m.attestations[kinds[2]][0].row.sourceAuthority='different-source';f.resign(kinds[2]);},
  f=>{f.m.attestations[kinds[4]][0].row.verified=true;f.resign(kinds[4]);},
  f=>{f.m.attestations[kinds[5]][0].row.sourceDigest='no-digest';f.resign(kinds[5]);}
 ]){const f=fixture();mutate(f);await denied(f);}
});
test('even correctly signed scope escalation and stale source receipts fail',async()=>{
 for(const [field,value] of [['probeId','OTHER'],['senderEmail','other@example.com'],['recipientEmail','other@example.net'],
 ['authorityRef','other-approval'],['delegationId','other-delegation'],['email','other@example.com']]){
  const f=fixture();f.m.attestations[kinds[0]][0].row[field]=value;f.resign(kinds[0]);await denied(f);
 }
 for(const delta of [-1,60001]){const f=fixture();f.clock=now+delta;await denied(f);}
 const f=fixture();f.d.expiresAt=new Date(now+2700001).toISOString();await denied(f);
});
test('query cannot widen protected scope',async()=>{
 const f=fixture(),r=f.make();
 for(const k of kinds)for(const patch of [{email:'other@example.com'},{domain:'other.example'},{probeId:'OTHER'}])
  assert.deepEqual(await r.readers[k]({...f.query(k),...patch}),[]);
});
test('custody never invents positive safety facts and downstream checks remain required',async()=>{
 const f=fixture(),r=f.make(),row=(await r.readers[kinds[0]](f.query(kinds[0])))[0];
 assert.equal(row.transportAuthorized,undefined);assert.equal(row.senderIdentityVerified,undefined);
 assert.equal(row.termsCompatible,undefined);
 const launcher=readFileSync(new URL('../operator-tools/uberwarm2-execute-approved-once.mjs',import.meta.url),'utf8');
 assert.match(launcher,/UBERWARM_ONE_SHOT_EVIDENCE_MODE==='OWNER_DELEGATED_SOURCE_CUSTODY'/);
 assert.match(launcher,/createUberWarm2AuthorizedOneShotRuntime/);
 assert.match(launcher,/approvalVerificationKey:ownerKey/);
 assert.match(launcher,/createUberWarm2AttestedFileReaders/);
});

test('expiry and revocation during asynchronous evidence read fail closed',async()=>{
 for(const action of ['expire','revoke']){
  const f=fixture();const r=create({readTrustedDelegation:()=>f.d,clock:()=>f.clock,
   readEvidence:async()=>{if(action==='expire')f.clock+=60001;else f.d.revoked=true;return JSON.stringify(f.m);}});
  assert.deepEqual(await r.readers[kinds[0]](f.query(kinds[0])),[]);
 }
});
test('adverse safety fields are preserved, never cleared by custody verification',async()=>{
 const f=fixture(),k=kinds[1];Object.assign(f.m.attestations[k][0].row,{held:true,quarantined:true,suppressed:true});f.resign(k);
 const row=(await f.make().readers[k](f.query(k)))[0];
 assert.equal(row.held,true);assert.equal(row.quarantined,true);assert.equal(row.suppressed,true);
});
