import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRedactedAtlasJSON } from '../src/uberbond-atlas-stream-writer.mjs';

async function isolated(fn) {
  const root = await mkdtemp(join(tmpdir(), 'atlas-stream-test-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}
test('clean JSON preserves content, order and pretty-print structure', async () => isolated(async root => {
  const obj = { ok:true, nums:[2,NaN,null], nested:{ alpha:'Hello', beta:['x',false,{},[]] }, empty:{} };
  const path=join(root,'atlas.json');
  await writeRedactedAtlasJSON(obj,path);
  assert.equal(await readFile(path,'utf8'), JSON.stringify(obj,null,2)+'\n');
}));
test('redacts secret values, key-marked credentials, and exemption marker', async () => isolated(async root => {
  const marker=['secret-scanner','fixtures','intentional'].join('-');
  const leaked='ghp_'+'X'.repeat(34);
  const src={ safe:'hello', text:'Bearer '+'X'.repeat(23), api_key:'ordinarybutprivatecredentialvalue12345',
    nested:{ githubToken:'arbitrary-private-session', fixture: marker, exposed:leaked } };
  const path=join(root,'atlas.json');
  await writeRedactedAtlasJSON(src,path);
  const text=await readFile(path,'utf8');
  assert.doesNotMatch(text,/ghp_X|Bearer X|private-session|ordinarybutprivatecredentialvalue12345/);
  assert.doesNotMatch(text,new RegExp(marker));
  assert.match(text,/secret-scanner-fixture-marker-redacted/);
  assert.equal(JSON.parse(text).safe,'hello');
}));
test('writes many rows in bounded output without a monolithic stringify', async () => isolated(async root => {
  const rows=Array.from({ length: 15000 }, (_,i)=>({id:i,text:'Hello '+i+' '.repeat(300),valid:i%2===0}));
  const path=join(root,'large.json');
  await writeRedactedAtlasJSON({rows},path);
  const parsed=JSON.parse(await readFile(path,'utf8'));
  assert.equal(parsed.rows.length,rows.length);
  assert.equal(parsed.rows.at(-1).id,14999);
}));
test('cyclic objects and executable toJSON callbacks fail closed, preserving existing destination', async () => isolated(async root => {
  const p=join(root,'artifact.json');
  await writeFile(p,'old validated value\n');
  const cycle={};cycle.self=cycle;
  await assert.rejects(writeRedactedAtlasJSON(cycle,p),/cyclic/);
  let calls=0;
  await assert.rejects(writeRedactedAtlasJSON({meta:{toJSON(){calls++;return 'unsafe';}}},p),/toJSON/);
  assert.equal(calls,0);
  assert.equal(await readFile(p,'utf8'),'old validated value\n');
  assert.deepEqual(await readdir(root),['artifact.json']);
}));
test('getter and oversized text fail without partially publishing', async () => isolated(async root => {
  const path=join(root,'atlas.json');
  const obj={};Object.defineProperty(obj,'x',{ enumerable:true,get(){throw new Error('must not run');}});
  await assert.rejects(writeRedactedAtlasJSON(obj,path),/getter/);
  await assert.rejects(writeRedactedAtlasJSON({x:'x'.repeat(16*1024*1024+1)},path),/bounded/);
  assert.deepEqual(await readdir(root),[]);
}));
