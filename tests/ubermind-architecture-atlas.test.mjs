import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,ROOT),'utf8');
const parse=path=>JSON.parse(read(path));
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const atlas='docs/architecture/UBERMIND_890_JEV_ALL_MODELS_ROUTING_2026-10-09.md';
const dir='artifacts/research/founder-moonshot-literal-corpus/';

test('complete 890 original founder ideas stay addressable and hash-bound behind diagram',()=>{
 const doc=read(atlas),m=parse(dir+'manifest.json');
 assert.equal(m.corpus.expectedCount,890);
 assert.equal(m.corpus.recoveredCount,890);
 assert.equal(m.shards.length,10);
 const ids=new Set(),titles=[];
 for(const sh of m.shards){
  const source=read(dir+sh.path);
  assert.equal(sha(source),sh.sha256,sh.path);
  const body=JSON.parse(source);
  assert.equal(body.entries.length,89);
  assert.equal(sh.entryCount,89);
  assert.ok(doc.includes(sh.path),sh.path+' missing from architecture');
  assert.ok(doc.includes('#'+String(sh.ordinalStart).padStart(4,'0')));
  assert.ok(doc.includes('#'+String(sh.ordinalEnd).padStart(4,'0')));
  for(const entry of body.entries){
   assert.ok(!ids.has(entry.ordinal),'Duplicate original #'+entry.ordinal);
   ids.add(entry.ordinal);
   assert.equal(typeof entry.literalTitle,'string');
   assert.ok(entry.literalBodyMarkdown.length>0);
   titles.push(entry.literalTitle);
  }
 }
 assert.equal(ids.size,890);
 for(let i=1;i<=890;i++)assert.ok(ids.has(i),'Missing founder original #'+i);
 assert.ok(doc.includes(m.source.sha256));
 assert.ok(doc.includes(m.corpus.canonicalEntriesSha256));
});

test('architecture covers every source-registered model without asserting universal provider readiness',()=>{
 const doc=read(atlas);
 const broad=parse('config/frontier-model-candidates.json');
 const market=parse('config/infinite-opus-live-market-candidates.json');
 assert.equal(broad.candidates.length,20);
 assert.equal(market.candidates.length,11);
 const broadIds=broad.candidates.map(x=>x.canonicalModel);
 const marketIds=market.candidates.map(x=>x.model);
 for(const model of [...broadIds,...marketIds]){
  assert.equal(typeof model,'string');
  assert.ok(doc.includes(model),'Model ID absent from atlas: '+model);
 }
 assert.ok(doc.includes('typesafe/jev-1.13'));
 assert.ok(doc.includes('anthropic/claude-haiku-5.5'));
 assert.match(doc,/no unsupported claim|NOT proof|not a promise/i);
});

test('three diagram source files exactly mirror architecture and form bounded Mermaid flowcharts',()=>{
 const doc=read(atlas);
 const extracted=[...doc.matchAll(/~~~mermaid\n([\s\S]*?)\n~~~/g)].map(x=>x[1]);
 const paths=[
  'docs/architecture/UBERMIND_MASTER_MODEL_ROUTING.mmd',
  'docs/architecture/UBERMIND_JEV_COMPLETE_ROUTING.mmd',
  'docs/architecture/UBERMIND_890_GENOME_ROUTING.mmd'
 ];
 assert.equal(extracted.length,3);
 paths.forEach((path,i)=>{
  const source=read(path);
  assert.equal(source.trim(),extracted[i].trim());
  assert.match(source,/^flowchart\s+(?:TD|TB)\b/);
  assert.ok(source.split('\n').length>=20);
  assert.ok(!source.includes('sk-or-v1-'));
 });
});

test('routing atlas binds to existing real guarded providers and preserves authority boundaries',()=>{
 const doc=read(atlas);
 const required=[
  'src/jev-shared-state-tensor.mjs',
  'src/jev-scaled-preflight.mjs',
  'src/jev-governed-runtime-service.mjs',
  'src/openrouter-jev-governed-adapter.mjs',
  'src/jev-public-answer-reuse.mjs',
  'src/ubermind-jev-pending-doctor.mjs',
  'src/ubermind-real-issue-jev-shadow.mjs',
  'src/infinite-opus-native-runtime.mjs',
  'src/ubermind-890-evidence-flywheel.mjs',
  'src/agent-model-router.mjs',
  'src/cognition-route-inventory.mjs'
 ];
 for(const path of required){
  assert.ok(doc.includes(path),'Missing active file reference '+path);
  assert.ok(fs.existsSync(new URL(path,ROOT)),'Nonexistent source path '+path);
 }
 assert.match(doc,/no automatic paid retry|never silently retried|without automatic retry/i);
 assert.match(doc,/No spend or external outreach is authorized/i);
 assert.match(doc,/not evidence of general semantic equivalence/i);
});