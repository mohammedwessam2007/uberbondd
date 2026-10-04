import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createUberImapReader } from '../src/uberimap.mjs';

function socketWith(transcript){
  const socket=new EventEmitter();
  socket.writes=[];
  socket.write=line=>{
    socket.writes.push(String(line));
    const tag=String(line).match(/^(UB\d{4})/)?.[1];
    const reply=transcript(String(line),tag);
    queueMicrotask(()=>socket.emit('data',Buffer.from(reply,'latin1')));
  };
  socket.end=()=>{};
  socket.destroy=()=>{};
  return socket;
}

function reader(socket){
  return createUberImapReader({
    host:'imap.example.test',port:993,secure:true,username:'user',password:'pass',authorized:true,termsCompatible:true,
    evidenceRef:'test',connectFactory:async()=>socket,timeoutMs:1000
  });
}

test('empty SEARCH result is an empty UID set and never becomes UID 0',async()=>{
  const socket=socketWith((line,tag)=>{
    if(line.includes(' LOGIN '))return `${tag} OK LOGIN completed\r\n`;
    if(line.includes(' SELECT '))return `* 0 EXISTS\r\n${tag} OK SELECT completed\r\n`;
    if(line.includes(' SEARCH '))return `* SEARCH\r\n${tag} OK SEARCH completed\r\n`;
    if(line.includes(' LOGOUT'))return `* BYE\r\n${tag} OK LOGOUT completed\r\n`;
    throw new Error(`unexpected command: ${line}`);
  });
  const result=await reader(socket).fetchRecent({sinceMs:Date.parse('2026-10-04T00:00:00Z'),afterUid:0,limit:100});
  assert.equal(result.ok,true);
  assert.equal(result.status,'UBERIMAP_FETCH_CONFIRMED');
  assert.deepEqual(result.messages,[]);
  assert.equal(result.lastUid,0);
  assert.equal(socket.writes.some(line=>/UID FETCH\s+0\b/.test(line)),false);
  assert.equal(socket.writes.some(line=>/UID FETCH\b/.test(line)),false);
});

test('positive SEARCH UIDs remain fetchable and zero/invalid tokens are ignored',async()=>{
  const raw='From: sender@example.test\r\nTo: user@example.test\r\nSubject: hello\r\nMessage-ID: <m1@example.test>\r\n\r\nbody';
  const socket=socketWith((line,tag)=>{
    if(line.includes(' LOGIN '))return `${tag} OK LOGIN completed\r\n`;
    if(line.includes(' SELECT '))return `* 2 EXISTS\r\n${tag} OK SELECT completed\r\n`;
    if(line.includes(' SEARCH '))return `* SEARCH 0 nope 41\r\n${tag} OK SEARCH completed\r\n`;
    if(line.includes(' UID FETCH 41 '))return `* 1 FETCH (UID 41 BODY[] {${Buffer.byteLength(raw)}}\r\n${raw}\r\n)\r\n${tag} OK FETCH completed\r\n`;
    if(line.includes(' LOGOUT'))return `* BYE\r\n${tag} OK LOGOUT completed\r\n`;
    throw new Error(`unexpected command: ${line}`);
  });
  const result=await reader(socket).fetchRecent({afterUid:0,limit:100});
  assert.equal(result.ok,true);
  assert.equal(result.messages.length,1);
  assert.equal(result.messages[0].uid,41);
  assert.equal(result.lastUid,41);
  assert.equal(socket.writes.some(line=>/UID FETCH\s+0\b/.test(line)),false);
});
