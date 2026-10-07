import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validatePhoenixLocalDraft,savePhoenixLocalDraft,listPhoenixCapsules,readPhoenixCapsule } from '../src/phoenix-owner-vault.mjs';

const sha='b025264685be8c196cfa87857e69f5d70ca1e230';
const corpus='23bb3c1813e3b5997d8ec76c801db2d5c59baf780573fb496da867d90d7017f0';
const at='2026-10-08T01:00:00.000Z';
function fixture(overrides={}){
 const body={schemaVersion:'uberbond.phoenix-local-draft.v1',
  sourceType:'MANUAL_LOCAL_DRAFT_NOT_FULL_CHAT_EXPORT',exportedAt:at,
  mainSha:sha,moonshotCorpusSha:corpus,entries:[{id:'checkpoint-1',kind:'DECISION',summary:'Preserve progress after exhausted chats',source:'CHAT_ONLY',recordedAt:at}],
  truthBoundary:'MANUALLY_ENTERED_MATERIAL_ONLY; SOURCE_NOT_REVALIDATED; ZERO_EXTERNAL_EFFECT_AUTHORITY',...overrides};
 return {body,digest:crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
function store(){
 const rows=new Map();
 return {rows,
  async get(collection,id){assert.equal(collection,'phoenixCapsules');return rows.get(id)||null;},
  async add(collection,row){assert.equal(collection,'phoenixCapsules');if(rows.has(row.id)){const e=new Error('duplicate');e.code='CONFLICT';throw e;}rows.set(row.id,structuredClone(row));return row;},
  async list(collection,opts){assert.equal(collection,'phoenixCapsules');return [...rows.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,opts.limit);}
 };
}
test('valid private draft checks checksum and remains non-authoritative',()=>{
 const result=validatePhoenixLocalDraft(fixture());
 assert.equal(result.entryCount,1);assert.equal(result.ok,true);
 assert.match(result.truthBoundary,/USER_ENTERED_NOT_SOURCE_VERIFIED/);
});
test('edit note after saving breaks capsule digest',()=>{
 const envelope=fixture();envelope.body.entries[0].summary='mutated';
 assert.throws(()=>validatePhoenixLocalDraft(envelope),/DIGEST_MISMATCH/);
});
test('reject source and summary containing credentials before persisting',()=>{
 for(const [key,value] of [['summary','password=hunter2'],['source','Bearer abcdefghijklmnop']]){
  const input=fixture({entries:[{...fixture().body.entries[0],[key]:value}]});
  assert.throws(()=>validatePhoenixLocalDraft(input),/ENTRY_CONTENT/);
 }
});
test('reject noncontiguous or duplicate checkpoint IDs',()=>{
 const e=fixture().body.entries[0];
 for(const x of [['checkpoint-2'],['checkpoint-1','checkpoint-1']]){
  const input=fixture({entries:x.map(id=>({...e,id}))});
  assert.throws(()=>validatePhoenixLocalDraft(input),/ENTRY_SEQUENCE/);
 }
});
test('reject 121 entries and empty entries',()=>{
 const e=fixture().body.entries[0];
 assert.throws(()=>validatePhoenixLocalDraft(fixture({entries:[]})),/ENTRY_COUNT/);
 assert.throws(()=>validatePhoenixLocalDraft(fixture({entries:Array.from({length:121},(_,i)=>({...e,id:'checkpoint-'+(i+1)}))})),/ENTRY_COUNT/);
});
test('reject unexpected fields to prevent arbitrary payload overreach',()=>{
 const envelope=fixture();envelope.body.suspicious='x';envelope.digest=crypto.createHash('sha256').update(JSON.stringify(envelope.body)).digest('hex');
 assert.throws(()=>validatePhoenixLocalDraft(envelope),/BODY_SHAPE/);
});
test('reject fictional SHA and altered 890 corpus ancestry',()=>{
 assert.throws(()=>validatePhoenixLocalDraft(fixture({mainSha:'latest'})),/MAIN_SHA/);
 assert.throws(()=>validatePhoenixLocalDraft(fixture({moonshotCorpusSha:'f'.repeat(64)})),/CORPUS_ANCHOR/);
});
test('accept no main SHA rather than fabricating repository truth',()=>{
 const output=validatePhoenixLocalDraft(fixture({mainSha:null}));
 assert.equal(output.mainSha,null);
});
test('save persists one durable record with exactly original source and digest',async()=>{
 const db=store(),input=fixture();
 const result=await savePhoenixLocalDraft(db,input,{now:'2026-10-08T02:00:00.000Z'});
 assert.equal(result.status,'PHOENIX_SAVED_TO_APP_DATABASE');
 const saved=db.rows.get(result.id);
 assert.equal(saved.body.entries[0].summary,input.body.entries[0].summary);
 assert.equal(saved.authority,'NONE');assert.equal(db.rows.size,1);
});
test('replay of identical capsule is safe and idempotent',async()=>{
 const db=store(),e=fixture();
 const a=await savePhoenixLocalDraft(db,e),b=await savePhoenixLocalDraft(db,e);
 assert.equal(a.id,b.id);assert.equal(b.status,'PHOENIX_ALREADY_SAVED');assert.equal(db.rows.size,1);
});
test('restored snapshot revalidates integrity and returns actual bytes',async()=>{
 const db=store(),input=fixture();
 const saved=await savePhoenixLocalDraft(db,input);
 const out=await readPhoenixCapsule(db,saved.id);
 assert.deepEqual(out.capsule,input);
});
test('corrupted DB entry fails closed, not silently restored',async()=>{
 const db=store(),saved=await savePhoenixLocalDraft(db,fixture());
 db.rows.get(saved.id).body.entries[0].summary='corrupted';
 await assert.rejects(readPhoenixCapsule(db,saved.id),/DIGEST_MISMATCH/);
});
test('listing reveals bounded metadata but no private note bodies',async()=>{
 const db=store(),saved=await savePhoenixLocalDraft(db,fixture());
 const list=await listPhoenixCapsules(db);
 assert.equal(list.capsules[0].id,saved.id);
 assert.equal(list.capsules[0].body,undefined);
 assert.equal(JSON.stringify(list).includes('Preserve progress'),false);
});
test('bad restore ID refused before datastore call',async()=>{
 const db=store();await assert.rejects(readPhoenixCapsule(db,'../../secrets'),/BAD_CAPSULE_ID/);
});
test('unconfigured vault is not modeled as initialized or externally verified',()=>{
 assert.equal(validatePhoenixLocalDraft(fixture()).status,'PHOENIX_MANUAL_DRAFT_INTEGRITY_CHECKED');
});
