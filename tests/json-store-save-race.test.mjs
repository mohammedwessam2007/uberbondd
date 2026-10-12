import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/store.mjs';

async function fixture(t) {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberci-json-save-'));
 t.after(() => fs.rm(dir,{recursive:true,force:true}));
 return dir;
}
test('60 concurrent saves on one store cannot collide or return ENOENT',async t=>{
 const dir=await fixture(t);const store=new JsonStore(dir);await store.init();
 const statuses=await Promise.allSettled(Array.from({length:60},()=>store.save()));
 assert.equal(statuses.filter(x=>x.status==='rejected').length,0);
 await store.close();
 assert.deepEqual(JSON.parse(await fs.readFile(store.file,'utf8')),store.data);
 assert.deepEqual((await fs.readdir(dir)).sort(),['db.json']);
});
test('serialized saving retains last invoked complete snapshot, not partial JSON',async t=>{
 const dir=await fixture(t);const store=new JsonStore(dir);await store.init();
 const pending=[];
 for(let i=1;i<=30;i++){store.data.settings={sequence:i};pending.push(store.save());}
 await Promise.all(pending);
 assert.equal(JSON.parse(await fs.readFile(store.file,'utf8')).settings.sequence,30);
});
test('independent JsonStore instances using same dir cannot steal staging files',async t=>{
 const dir=await fixture(t);
 const a=new JsonStore(dir);await a.init();
 const b=new JsonStore(dir);await b.init();
 const result=await Promise.allSettled([...Array.from({length:20},()=>a.save()),...Array.from({length:20},()=>b.save())]);
 assert.equal(result.filter(x=>x.status==='rejected').length,0);
 const saved=JSON.parse(await fs.readFile(a.file,'utf8'));
 assert.equal(saved.version,a.data.version);
 assert.equal(saved.version,b.data.version);
 assert.deepEqual(saved,a.data);
 assert.deepEqual((await fs.readdir(dir)).sort(),['db.json']);
});
test('failed save does not poison subsequent save queue',async t=>{
 const dir=await fixture(t);const missing=path.join(dir,'other');
 const store=new JsonStore(missing);
 await assert.rejects(store.save(),{code:'ENOENT'});
 await fs.mkdir(missing);
 store.data.settings={recovered:true};
 await store.save();
 assert.equal(JSON.parse(await fs.readFile(store.file,'utf8')).settings.recovered,true);
});

test('opening a version-5 snapshot upgrades to current schema without discarding saved data',async t=>{
 const dir=await fixture(t);
 const original=new JsonStore(dir);await original.init();
 const legacy={...structuredClone(original.data),version:5,settings:{legacySnapshot:true},phoenixCapsules:[{id:'keep-me'}]};
 await fs.writeFile(original.file,JSON.stringify(legacy),'utf8');
 const reloaded=new JsonStore(dir);await reloaded.init();
 assert.equal(reloaded.data.version,6);
 assert.deepEqual(reloaded.data.settings,{legacySnapshot:true});
 assert.deepEqual(reloaded.data.phoenixCapsules,[{id:'keep-me'}]);
 assert.deepEqual(JSON.parse(await fs.readFile(reloaded.file,'utf8')),reloaded.data);
 assert.deepEqual((await fs.readdir(dir)).sort(),['db.json']);
});
