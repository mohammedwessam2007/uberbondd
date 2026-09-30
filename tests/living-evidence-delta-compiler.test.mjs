import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticHash } from '../src/semantic-closure-kernel.mjs';
import { compileLivingEvidenceDelta } from '../src/living-evidence-delta-compiler.mjs';

const chunk=(id,text,tokens)=>({
  id,contentHash:semanticHash(text),
  tokenizerReceipt:{chunkHash:semanticHash(text),tokenCount:tokens,verifierRef:'fixture://tokenizer'}
});
const verifyTokenizerReceipt=({chunk,receipt})=>
  receipt.chunkHash===chunk.contentHash&&Number.isSafeInteger(receipt.tokenCount)&&receipt.verifierRef==='fixture://tokenizer';

test('Living Evidence Graph rereads only changed chunks and invalidates transitive descendants',()=>{
  const previous=[
    chunk('a','stable-a',95000),
    chunk('b','old-b',10000),
    chunk('c','stable-c',95000)
  ];
  const current=[
    chunk('a','stable-a',95000),
    chunk('b','new-b',10000),
    chunk('c','stable-c',95000)
  ];
  const nodes=[
    {id:'claim-a',dependencies:[],sourceChunkIds:['a']},
    {id:'claim-b',dependencies:[],sourceChunkIds:['b']},
    {id:'derived',dependencies:['claim-a','claim-b'],sourceChunkIds:[]},
    {id:'claim-c',dependencies:[],sourceChunkIds:['c']}
  ];
  const r=compileLivingEvidenceDelta({previousChunks:previous,currentChunks:current,nodes,verifyTokenizerReceipt});
  assert.equal(r.ok,true);
  assert.deepEqual(r.changedChunkIds,['b']);
  assert.deepEqual(r.unchangedChunkIds,['a','c']);
  assert.equal(r.totalCurrentTokens,200000);
  assert.equal(r.scanTokens,10000);
  assert.equal(r.reusableCurrentTokens,190000);
  assert.deepEqual(r.affectedNodeIds,['claim-b','derived']);
  assert.equal(r.recomputeFraction,.5);
  assert.equal(r.exactReuseAuthority,'UNCHANGED_CONTENT_HASH_ONLY');
});

test('removed source invalidates dependents but adds no nonexistent tokens to scan',()=>{
  const previous=[chunk('a','stable-a',100),chunk('b','gone',50)];
  const current=[chunk('a','stable-a',100)];
  const nodes=[
    {id:'a-node',dependencies:[],sourceChunkIds:['a']},
    {id:'b-node',dependencies:[],sourceChunkIds:['b']},
    {id:'root',dependencies:['a-node','b-node'],sourceChunkIds:[]}
  ];
  const r=compileLivingEvidenceDelta({previousChunks:previous,currentChunks:current,nodes,verifyTokenizerReceipt});
  assert.equal(r.ok,true);
  assert.deepEqual(r.removedChunkIds,['b']);
  assert.equal(r.scanTokens,0);
  assert.deepEqual(r.affectedNodeIds,['b-node','root']);
});

test('identical content hashes produce zero reread and zero recomputation',()=>{
  const previous=[chunk('a','same',100)];
  const current=[chunk('a','same',100)];
  const nodes=[{id:'a-node',dependencies:[],sourceChunkIds:['a']}];
  const r=compileLivingEvidenceDelta({previousChunks:previous,currentChunks:current,nodes,verifyTokenizerReceipt});
  assert.equal(r.ok,true);
  assert.equal(r.scanTokens,0);
  assert.deepEqual(r.affectedNodeIds,[]);
});

test('unverified token counts cannot manufacture delta economics',()=>{
  const c=chunk('a','new',10);c.tokenizerReceipt.tokenCount=1;
  const r=compileLivingEvidenceDelta({
    previousChunks:[],currentChunks:[c],nodes:[{id:'a-node',dependencies:[],sourceChunkIds:['a']}],
    verifyTokenizerReceipt:()=>false
  });
  assert.equal(r.ok,false);
  assert.match(r.reasons[0],/verified-current-chunk-token-count-required/);
});
