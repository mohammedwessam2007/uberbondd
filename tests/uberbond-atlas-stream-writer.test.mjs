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

test('graph and atlas share a redacting writer for cookies and session IDs', async () => isolated(async root => {
  const output=join(root,'graph.json');
  await writeRedactedAtlasJSON({ nodes:[{cookie:'opaque-cookie',sessionId:'opaque-session',safe:'ok'}] },output);
  const parsed=JSON.parse(await readFile(output,'utf8'));
  assert.equal(parsed.nodes[0].cookie,'[REDACTED]');
  assert.equal(parsed.nodes[0].sessionId,'[REDACTED]');
  assert.equal(parsed.nodes[0].safe,'ok');
}));

test('toJSON accessor is refused without executing its getter', async () => isolated(async root => {
  let called=0;
  const input={};
  Object.defineProperty(input,'toJSON',{enumerable:true,get(){called++;throw new Error('getter executed');}});
  await assert.rejects(writeRedactedAtlasJSON(input,join(root,'graph.json')),/toJSON/);
  assert.equal(called,0);
  assert.deepEqual(await readdir(root),[]);
}));

test('array getters fail closed and inherited numeric getters are never invoked', async () => isolated(async root => {
  const output = join(root, 'array.json');
  await writeFile(output, 'previous verified artifact\n');
  let calls = 0;
  const accessor = [1];
  Object.defineProperty(accessor, '0', { enumerable: true, get() { calls++; return 'private'; } });
  await assert.rejects(writeRedactedAtlasJSON({ rows: accessor }, output), /array getter/);
  assert.equal(calls, 0);
  assert.equal(await readFile(output, 'utf8'), 'previous verified artifact\n');
  const sparse = new Array(2);
  const inherited = Object.create(Array.prototype);
  Object.defineProperty(inherited, '0', { get() { calls++; throw new Error('inherited getter executed'); } });
  Object.setPrototypeOf(sparse, inherited);
  await writeRedactedAtlasJSON({ rows: sparse }, output);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), { rows: [null, null] });
  assert.equal(calls, 0);
}));

test('compact graph persistence keeps every edge and round-trips exactly', async () => isolated(async root => {
  const graph = { ok: true, nodes: Array.from({length: 1000}, (_,i) => ({id:'node-'+i,active:i%2===0})),
    edges: Array.from({length: 1500}, (_,i) => ({from:'node-'+(i%1000),to:'node-'+((i+1)%1000),weight:i})),
    annotations: {unicode:'🌐', freeText:'source backed'} };
  const pretty=join(root,'pretty.json'); const compact=join(root,'compact.json');
  await writeRedactedAtlasJSON(graph,pretty);
  await writeRedactedAtlasJSON(graph,compact,{compact:true});
  const a=await readFile(pretty,'utf8'),b=await readFile(compact,'utf8');
  assert.deepEqual(JSON.parse(b),JSON.parse(a));
  assert.equal(JSON.parse(b).edges.length,1500);
  assert.ok(b.length < a.length * 0.75);
}));
