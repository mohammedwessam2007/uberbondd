import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberWarm2SmtpSeedAdapter } from '../src/uberwarm2-smtp-seed-adapter.mjs';
import { createUberWarm2PostgresSeedLedger } from '../src/uberwarm2-postgres-seed-ledger.mjs';
const account = {email:'tara@cedarpointdomains.com',sendingMailboxId:'tara',connected:true,tokens:{encrypted:true},smtpRoute:{authorized:true,termsCompatible:true,evidenceRef:'vendor:reply',host:'smtp.example',port:465,secure:true}};
function adapter(override={}) {let calls=0;const a=createUberWarm2SmtpSeedAdapter({account:{...account,...override},encryptionKey:'local-fixture',credentialReader:()=>({username:'redacted',password:'redacted'}),transportFactory:()=>({ok:true,async send(m){calls++;return {confirmed:true,messageId:m.messageId}}})});return {a,calls:()=>calls};}
test('reject non-authorized, non-encrypted, misbound senders',async()=>{
 assert.equal(adapter({connected:false}).a.authorizedSmtp,undefined);
 const f=adapter();assert.equal((await f.a.sendProbe({from:'other@example.com'})).ok,false);assert.equal(f.calls(),0);
});
test('actual SMTP adapter binds exact account and one transparent test envelope',async()=>{
 const f=adapter();const r=await f.a.sendProbe({from:'tara@cedarpointdomains.com',to:'owned@gmail.com',mailboxId:'tara',subject:'UberBond delivery check 12345678',text:'A valid owner-controlled diagnostic',idempotencyKey:'uw2_aaaaaaaaaaaaaaaaaaaaaaaa',purpose:'OWNER_CONTROLLED_PLACEMENT_TEST'});
 assert.equal(r.ok,true);assert.equal(r.status,'PROVIDER_ACCEPTED');assert.equal(f.calls(),1);
});
test('pg ledger refuses missing pool and validates rows',async()=>{
 assert.equal(createUberWarm2PostgresSeedLedger({}).ok,false);
 const pool={connect:async()=>({query:async()=>({rows:[],rowCount:0}),release(){}}),query:async()=>({rowCount:1})};
 const l=createUberWarm2PostgresSeedLedger({pool});assert.equal(l.ok,true);
 assert.equal((await l.tryReserveProbe({purpose:'WRONG'})).ok,false);
});
test('pg ledger applies serialized check, reservation and record result',async()=>{
 const queries=[];const pool={connect:async()=>({async query(sql,p=[]){queries.push(sql);if(sql.includes('COUNT(*)'))return {rows:[{sender_count:'0',recipient_count:'0'}]};return {rows:[],rowCount:1};},release(){queries.push('RELEASE')}}),async query(){return {rowCount:1}}};
 const l=createUberWarm2PostgresSeedLedger({pool});
 const r=await l.tryReserveProbe({reservationId:'uw2_aaaaaaaaaaaaaaaaaaaaaaaa',day:'2026-10-12',senderEmail:'tara@cedarpointdomains.com',recipientEmail:'owned@gmail.com',maxSenderProbesPerDay:2,maxRecipientProbesPerDay:1,purpose:'OWNER_CONTROLLED_PLACEMENT_TEST'});
 assert.equal(r.ok,true);assert(queries.some(x=>x.includes('advisory_xact_lock')));assert(queries.includes('COMMIT'));assert.equal((await l.recordResult({probeId:'uw2_aaaaaaaaaaaaaaaaaaaaaaaa',status:'PROVIDER_ACCEPTED_NOT_INBOX_PROVEN'})).ok,true);
});
test('pg ledger holds on over-quota, never INSERTS',async()=>{
 let sqls=[];const pool={connect:async()=>({async query(sql){sqls.push(sql);if(sql.includes('COUNT(*)'))return {rows:[{sender_count:'2',recipient_count:'0'}]};return {rows:[],rowCount:1}},release(){}})};
 const r=await createUberWarm2PostgresSeedLedger({pool}).tryReserveProbe({reservationId:'uw2_aaaaaaaaaaaaaaaaaaaaaaaa',day:'2026-10-12',senderEmail:'tara@cedarpointdomains.com',recipientEmail:'owned@gmail.com',maxSenderProbesPerDay:2,maxRecipientProbesPerDay:1,purpose:'OWNER_CONTROLLED_PLACEMENT_TEST'});
 assert.equal(r.ok,false);assert.equal(sqls.some(x=>x.includes('INSERT INTO')),false);
});