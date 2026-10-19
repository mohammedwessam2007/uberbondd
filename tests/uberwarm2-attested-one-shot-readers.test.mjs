import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {
  ONE_SHOT_EVIDENCE_ROLES,attestedOneShotSigningPayload,
  createUberWarm2AttestedOneShotReaders
} from '../src/uberwarm2-attested-one-shot-readers.mjs';

const NOW=Date.parse('2026-10-19T15:00:00.000Z');
const at=new Date(NOW).toISOString(),expiry=new Date(NOW+40000).toISOString();
const sender='connect@uberbond.site',recipient='mohammedwessam306@gmail.com',probeId='UBERWARM-ONE-20261018-01';
const roles=Object.entries(ONE_SHOT_EVIDENCE_ROLES);
function fixture(){
  const keys={},privateKeys={},attestations={};
  for(const [kind,role] of roles){
    const signerId='fixture-'+kind;
    const {publicKey,privateKey}=generateKeyPairSync('ed25519');
    keys[signerId]={role,publicKeyPem:publicKey.export({type:'spki',format:'pem'})};
    privateKeys[signerId]=privateKey;
    const email=['readAuthenticatedConsent','readCurrentReceiveReady','readSuppression'].includes(kind)?recipient:sender;
    const row={email,observedAt:at,evidenceRef:`fixture:${kind}`,receiptId:`fixture:${kind}`,
      ...(email===sender?{domain:'uberbond.site'}:{probeId})};
    const envelope={kind,signerId,observedAt:at,expiresAt:expiry,row};
    envelope.signature=sign(null,attestedOneShotSigningPayload(envelope),privateKey).toString('base64url');
    attestations[kind]=[envelope];
  }
  return {keys,privateKeys,attestations};
}
const create=f=>createUberWarm2AttestedOneShotReaders({trustedPublicKeys:f.keys,readEvidence:async()=>JSON.stringify({attestations:f.attestations}),clock:()=>NOW});

test('six distinct, pinned Ed25519 authority roles produce verified rows and reverify each read',async()=>{
  const f=fixture(),system=create(f);assert.equal(system.configured,true);
  let observations=0;
  const readers=createUberWarm2AttestedOneShotReaders({trustedPublicKeys:f.keys,clock:()=>NOW,
    readEvidence:async()=>{observations++;return JSON.stringify({attestations:f.attestations});}});
  for(const [kind] of roles){
    const query=['readAuthenticatedConsent','readCurrentReceiveReady','readSuppression'].includes(kind)?
      {email:recipient,probeId}:{email:sender,domain:'uberbond.site'};
    const row=await readers.readers[kind](query);
    assert.equal(row.length,1);assert.equal(row[0].signed,true);assert.equal(row[0].verified,true);
    assert.equal(row[0].email,query.email);
  }
  assert.equal(observations,6);
  assert.equal((await readers.readers.readAuthenticatedConsent({email:sender,probeId})).length,0);
});
test('edits, forged signed booleans, invalid signature, wrong signer role, and role collapse deny',async()=>{
  for(const mutation of ['change-row','fake-signed','wrong-signature','wrong-role','same-key']){
    const f=fixture();
    if(mutation==='change-row')f.attestations.readLocalHold[0].row.email='changed@uberbond.site';
    if(mutation==='fake-signed')f.attestations.readLocalHold[0].row.signed=true;
    if(mutation==='wrong-signature')f.attestations.readLocalHold[0].signature='a'.repeat(86);
    if(mutation==='wrong-role')f.keys['fixture-readLocalHold'].role='authenticated-recipient-controller';
    if(mutation==='same-key')f.keys['fixture-readLocalHold'].publicKeyPem=f.keys['fixture-readVerifiedHttpsTransport'].publicKeyPem;
    const system=create(f);
    assert.equal((await system.readers.readLocalHold({email:sender,domain:'uberbond.site'})).length,0,mutation);
  }
});
test('stale, future, over-long, revoked after first read and conflicting duplicate proof all deny',async()=>{
  for(const mutation of ['stale','future','overlong','duplicate','revoked']){
    const f=fixture(),key='readAuthenticatedConsent';
    const item=f.attestations[key][0];
    if(mutation==='stale')item.observedAt=new Date(NOW-70000).toISOString();
    if(mutation==='future')item.observedAt=new Date(NOW+100).toISOString();
    if(mutation==='overlong')item.expiresAt=new Date(NOW+180000).toISOString();
    if(mutation==='duplicate')f.attestations[key].push({...item});
    const system=create(f);
    if(mutation==='revoked'){
      assert.equal((await system.readers[key]({email:recipient,probeId})).length,1);
      item.row.withdrawn=true;
    }
    assert.equal((await system.readers[key]({email:recipient,probeId})).length,0,mutation);
  }
});
test('no manifest or no pinned independent signers cannot qualify, even if JSON claims signed and verified',async()=>{
  const f=fixture();delete f.keys['fixture-readSuppression'];
  const s=create(f);assert.equal(s.configured,false);
  assert.equal((await s.readers.readVerifiedHttpsTransport({email:sender,domain:'uberbond.site'})).length,0);
  const t=createUberWarm2AttestedOneShotReaders({trustedPublicKeys:fixture().keys,readEvidence:async()=>'{corrupt',clock:()=>NOW});
  assert.equal((await t.readers.readVerifiedHttpsTransport({email:sender,domain:'uberbond.site'})).length,0);
});
test('manual executable default refuses before reading secrets, touching database or making provider calls',()=>{
  const r=spawnSync(process.execPath,['operator-tools/uberwarm2-execute-approved-once.mjs'],{encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.equal(r.status,2); const out=JSON.parse(r.stdout);
  assert.equal(out.status,'UBERWARM2_EXECUTION_NOT_ENABLED');
  assert.equal(out.providerSubmissions,0);assert.equal(out.automaticRetryAuthorized,false);
});
test('one-shot Docker is standalone, not hooked into five-minute monitor image or cron',()=>{
  const manual=readFileSync(new URL('../Dockerfile.uberwarm-one-shot',import.meta.url),'utf8');
  const watch=readFileSync(new URL('../Dockerfile.uberwarm-read-monitor',import.meta.url),'utf8');
  const cron=readFileSync(new URL('../scripts/uberwarm2-railway-read-monitor.mjs',import.meta.url),'utf8');
  assert.match(manual,/uberwarm2-execute-approved-once\.mjs/);
  assert.doesNotMatch(watch,/uberwarm2-execute-approved-once\.mjs/);
  assert.doesNotMatch(cron,/executeApprovedOneShot|sendOwnerSeedViaHttps/);
});
