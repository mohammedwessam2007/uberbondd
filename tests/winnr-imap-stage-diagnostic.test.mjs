import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { buildEncryptedImapAccount } from '../src/uberimap.mjs';
import { diagnoseWinnrImapStages } from '../src/winnr-imap-stage-diagnostic.mjs';

const KEY='a'.repeat(64);

function account(){
  const built=buildEncryptedImapAccount({
    slot:'winnr-imap:test@example.test',email:'test@example.test',host:'imap.example.test',port:993,secure:true,
    username:'private-user',password:'private-password',evidenceRef:'owner-approved-test',authorized:true,termsCompatible:true
  },KEY);
  assert.equal(built.ok,true);
  return built.account;
}

function fakeSocket(responder){
  const socket=new EventEmitter();
  socket.write=line=>queueMicrotask(()=>socket.emit('data',Buffer.from(responder(String(line)),'latin1')));
  socket.end=()=>{};
  socket.destroy=()=>{};
  return socket;
}

test('diagnostic identifies FETCH rejection without returning UID, credentials, or raw provider text',async()=>{
  const socket=fakeSocket(line=>{
    if(line.includes(' LOGIN '))return 'DG0001 OK LOGIN completed\r\n';
    if(line.includes(' SELECT '))return '* 2 EXISTS\r\nDG0002 OK SELECT completed\r\n';
    if(line.includes(' SEARCH '))return '* SEARCH 424242 434343\r\nDG0003 OK SEARCH completed\r\n';
    if(line.includes(' UID FETCH '))return 'DG0004 BAD [CLIENTBUG] raw-private-provider-detail\r\n';
    return 'DG0005 OK LOGOUT completed\r\n';
  });
  const result=await diagnoseWinnrImapStages({account:account(),encryptionKey:KEY,connectFactory:async()=>socket,now:Date.parse('2026-10-04T09:00:00Z')});
  assert.equal(result.ok,false);
  assert.equal(result.stage,'FETCH');
  assert.equal(result.status,'BAD');
  assert.equal(result.responseCode,'CLIENTBUG');
  const serialized=JSON.stringify(result);
  assert.equal(serialized.includes('424242'),false);
  assert.equal(serialized.includes('434343'),false);
  assert.equal(serialized.includes('private-user'),false);
  assert.equal(serialized.includes('private-password'),false);
  assert.equal(serialized.includes('raw-private-provider-detail'),false);
});

test('diagnostic proves bounded FETCH success without returning fetched content',async()=>{
  const socket=fakeSocket(line=>{
    if(line.includes(' LOGIN '))return 'DG0001 OK LOGIN completed\r\n';
    if(line.includes(' SELECT '))return '* 1 EXISTS\r\nDG0002 OK SELECT completed\r\n';
    if(line.includes(' SEARCH '))return '* SEARCH 515151\r\nDG0003 OK SEARCH completed\r\n';
    if(line.includes(' UID FETCH '))return '* 1 FETCH (UID 515151 BODY[] {12}\r\nsecret-body!\r\n)\r\nDG0004 OK FETCH completed\r\n';
    return 'DG0005 OK LOGOUT completed\r\n';
  });
  const result=await diagnoseWinnrImapStages({account:account(),encryptionKey:KEY,connectFactory:async()=>socket});
  assert.equal(result.ok,true);
  assert.equal(result.stage,'FETCH');
  assert.equal(result.sampleCount,1);
  const serialized=JSON.stringify(result);
  assert.equal(serialized.includes('515151'),false);
  assert.equal(serialized.includes('secret-body'),false);
});
