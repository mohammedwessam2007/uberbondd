import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {encryptJson} from '../src/crypto.mjs';
import {UBERWARM2_SEED_TEMPLATE} from '../src/uberwarm2-seed-template.mjs';
import {inspectOwnedImapReceiver,saveReceiverBinding,observeReceiverBinding} from '../src/uberwarm2-receiver-binding.mjs';
const receiverEmail='owner@owned.example',encryptionKey='a'.repeat(64),userId='owned-user';
const credential={host:'inbound.owned.example',port:993,username:receiverEmail,password:'PRIVATE-PASSWORD'};
function imap(reject=''){
  const commands=[];
  const connectFactory=async options=>{
    assert.equal(options.secure,true);assert.equal(options.port,993);
    const s=new EventEmitter();s.destroy=()=>{};
    s.write=line=>{commands.push(line);const tag=line.split(' ')[0];
      queueMicrotask(()=>s.emit('data',Buffer.from((line.includes('LIST ')?'* LIST (\\Junk) "." "INBOX.Junk"\r\n':'')+
        tag+(reject&&line.includes(reject)?' NO denied':' OK done')+'\r\n')));};return s;
  };
  return {commands,connectFactory};
}
test('receiver authenticator uses only LOGIN, EXAMINE, LIST, LOGOUT and never reads messages',async()=>{
  const f=imap();const r=await inspectOwnedImapReceiver({credential,receiverEmail,connectFactory:f.connectFactory});
  assert.equal(r.authenticated,true);assert.equal(r.inboxReadOnlyAccessible,true);
  assert.equal(r.spamSpecialUseAdvertised,true);assert.equal(r.probeConsentEstablished,false);
  assert.equal(r.messagesRead,0);assert.ok(!JSON.stringify(r).includes(credential.password));
  assert.ok(f.commands.every(c=>/^RB\d+ (LOGIN|EXAMINE|LIST|LOGOUT) /.test(c)||/^RB\d+ LOGOUT\r\n$/.test(c)));
  assert.ok(!f.commands.some(c=>/SELECT|STORE|FETCH|SEARCH|APPEND|EXPUNGE/.test(c)));
});
test('receiver binding rejects mismatched identity and protocol injection before connecting',async()=>{
  for(const change of [{username:'other@owned.example'},{password:'secret\r\nLOGOUT'},
    {port:143},{host:'127.0.0.1'}]){
    const f=imap();const r=await inspectOwnedImapReceiver({credential:{...credential,...change},receiverEmail,connectFactory:f.connectFactory});
    assert.equal(r.authenticated,false);assert.equal(f.commands.length,0);
  }
});
test('failed LOGIN or read-only EXAMINE never establishes receive access',async()=>{
  for(const reject of ['LOGIN','EXAMINE']){
    const f=imap(reject);const r=await inspectOwnedImapReceiver({credential,receiverEmail,connectFactory:f.connectFactory});
    assert.equal(r.authenticated,false);assert.equal(r.inboxReadOnlyAccessible,false);
    assert.equal(r.probeConsentEstablished,false);
  }
});
function fakePool(){let stored;return {get stored(){return stored;},async query(sql,args){
  if(sql.startsWith('INSERT')){if(stored)return{rows:[]};stored={provider_user_id:args[1],credential_json:JSON.parse(args[2]),authorization_ref:args[3],enabled:true};return{rows:[{}]};}
  return{rows:stored?[stored]:[]};}};}
test('encrypted binding round-trips, refuses overwrite, and respects disabled read access',async()=>{
  const pool=fakePool();const input={pool,receiverEmail,userId,credential,encryptionKey,authorizationRef:'owner-authorized-read'};
  assert.equal((await saveReceiverBinding(input)).stored,true);
  assert.ok(!JSON.stringify(pool.stored).includes(credential.password));
  const f=imap();assert.equal((await observeReceiverBinding({...input,connectFactory:f.connectFactory})).authenticated,true);
  await assert.rejects(saveReceiverBinding(input),/already-present/);
  pool.stored.enabled=false;
  assert.equal((await observeReceiverBinding({...input,connectFactory:f.connectFactory})).authenticated,false);
});
test('wrong keys, altered ciphertext and receiver-swapped envelopes fail closed',async()=>{
  for(const mode of ['key','ciphertext','identity']){
    const pool=fakePool(),input={pool,receiverEmail,userId,credential,encryptionKey,authorizationRef:'owner-read'};
    await saveReceiverBinding(input);
    if(mode==='ciphertext')pool.stored.credential_json.data='AAAA';
    if(mode==='identity')pool.stored.credential_json=encryptJson({receiverEmail:'other@owned.example',userId,credential},encryptionKey);
    const f=imap();const r=await observeReceiverBinding({...input,encryptionKey:mode==='key'?'b'.repeat(64):encryptionKey,connectFactory:f.connectFactory});
    assert.equal(r.authenticated,false);assert.equal(f.commands.length,0);
  }
});
function placementFixture(folder='INBOX',badSender=false,extra=''){
  const query={probeId:'owner-probe-one',bodyToken:'owner-probe-one',senderEmail:'sender@owned.example',
    seedEmail:receiverEmail,seedProvider:'winnr',providerMessageId:'<one@message.example>',at:Date.now()};
  const raw=['Message-ID: '+query.providerMessageId,'From: '+(badSender?'other@owned.example':query.senderEmail),
    'To: '+receiverEmail,'Subject: '+UBERWARM2_SEED_TEMPLATE.subject,'Content-Type: text/plain','',
    UBERWARM2_SEED_TEMPLATE.bodyPrefix+query.probeId+extra].join('\r\n');
  const commands=[];
  const connectFactory=async()=>{
    const socket=new EventEmitter();let selected='';socket.destroy=()=>{};
    socket.write=line=>{commands.push(line);const tag=line.split(' ')[0];let payload='';
      if(line.includes('EXAMINE '))selected=line.includes('INBOX.Junk')?'SPAM':'INBOX';
      if(line.includes('LIST '))payload='* LIST (\\Junk) "." "INBOX.Junk"\r\n';
      if(line.includes('UID SEARCH'))payload='* SEARCH'+(selected===folder?' 123':'')+'\r\n';
      if(line.includes('UID FETCH'))payload='* 1 FETCH (BODY[] {'+Buffer.byteLength(raw)+'}\r\n'+raw+')\r\n';
      queueMicrotask(()=>socket.emit('data',Buffer.from(payload+tag+' OK done\r\n')));};return socket;
  };
  return {query,connectFactory,commands};
}
test('exact received message is correlated independently in Inbox and Spam without signed-reference claims',async()=>{
  for(const folder of ['INBOX','SPAM']){
    const f=placementFixture(folder);const r=await inspectOwnedImapReceiver({credential,receiverEmail,...f});
    assert.equal(r.observation.providerFolder,folder);assert.equal(r.observation.messageId,f.query.providerMessageId);
    assert.equal(r.observation.referenceSignatureVerified,false);assert.equal(r.probeConsentEstablished,false);
    assert.equal(r.messagesRead,1);assert.ok(!JSON.stringify(r).includes(UBERWARM2_SEED_TEMPLATE.bodyPrefix));
    assert.ok(f.commands.every(c=>!c.includes('BODY[')||c.includes('BODY.PEEK[]')));
  }
});
test('mismatched received sender or absent message cannot yield placement',async()=>{
  for(const f of [placementFixture('INBOX',true),placementFixture('OTHER'),placementFixture('INBOX',false,'\r\n> injected quoted content')]){
    const r=await inspectOwnedImapReceiver({credential,receiverEmail,...f});
    assert.equal(r.observation,undefined);assert.equal(r.authenticated,false);
  }
});
test('opaque Message-ID and wrong receiver are rejected before IMAP authentication',async()=>{
  for(const change of [{providerMessageId:'opaque-id'},{seedEmail:'stranger@example.com'},{bodyToken:'changed'}]){
    const f=placementFixture();const r=await inspectOwnedImapReceiver({credential,receiverEmail,...f,query:{...f.query,...change}});
    assert.equal(r.observation,undefined);assert.equal(f.commands.length,0);
  }
});
test('real PostgreSQL retains encrypted binding and refuses duplicate enrollment',{
  skip:!process.env.OMNIA_V9_TEST_DATABASE_URL
},async()=>{
  const{default:pg}=await import('pg');const c=new pg.Client({connectionString:process.env.OMNIA_V9_TEST_DATABASE_URL});await c.connect();
  try{await c.query('BEGIN');await c.query(await readFile(new URL('../docs/migrations-pending/20261017_uberwarm2_receiver_binding.sql',import.meta.url),'utf8'));
    const input={pool:c,receiverEmail,userId,credential,encryptionKey,authorizationRef:'test-private-read'};
    assert.equal((await saveReceiverBinding(input)).stored,true);
    await assert.rejects(saveReceiverBinding(input),/already-present/);
    const raw=(await c.query('SELECT credential_json FROM public.uberwarm2_receiver_bindings')).rows;
    assert.ok(!JSON.stringify(raw).includes(credential.password));
    const f=imap();assert.equal((await observeReceiverBinding({...input,connectFactory:f.connectFactory})).authenticated,true);
    await c.query('UPDATE public.uberwarm2_receiver_bindings SET enabled=false');
    assert.equal((await observeReceiverBinding({...input,connectFactory:f.connectFactory})).authenticated,false);
  }finally{await c.query('ROLLBACK');await c.end();}
});
