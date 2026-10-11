import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { digestDeepAtlasCanonicalJson } from '../src/uberbond-repository-deep-atlas.mjs';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
const legacy = data => crypto.createHash('sha256').update(JSON.stringify(stable(data))).digest('hex');

test('streamed canonical digest keeps historical exact identity on mixed JSON and UTF-8', () => {
  for (const value of [
    {},
    {z:[1,0,-0,null,true,false,2.8],a:{'é':'ありがとう','Ω':'🔬',' ':'escaped'}},
    {null:null,nested:[[1,2],{d:'test',a:[{z:1,a:2},{}]}]},
    ['a',2,[],{},false,undefined],
    {b:undefined,c:null,a:'present'}
  ]) assert.equal(digestDeepAtlasCanonicalJson(value),legacy(value));
});

test('streamed digest maintains whole-array coverage without stringifying one huge tree', () => {
  const big = {schema:'uberbond.repository-deep-atlas.v1',details:Array.from({length:30000},(_,i)=>({
    sourcePath:'docs/history/'+(i%3300)+'.md',
    id:'deep:'+i, name:'chars:'+i+'-'+(i+16384),
    organs:['world-brain'], families:['distributed-intelligence'],
    contentDigest:crypto.createHash('sha256').update(String(i)).digest('hex')
  })), coverage:[{path:'src/main.mjs',status:'PARSED_TEXT',textDigest:'a'.repeat(64)}]};
  assert.equal(digestDeepAtlasCanonicalJson(big),legacy(big));
});

test('streamed digest rejects bigint rather than fabricating a digest', () => {
  assert.throws(()=>digestDeepAtlasCanonicalJson({balance:1n}),TypeError);
});
