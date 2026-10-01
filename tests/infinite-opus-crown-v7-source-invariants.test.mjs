import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Crown v7 request keeps ZDR routing and removes temperature',async()=>{
  const src=await readFile(new URL('../scripts/infinite-opus-crown-autofinish.mjs',import.meta.url),'utf8');
  assert.equal(src.includes('infinite_opus_crown_autofinish_20261001_v7'),true);
  assert.equal(src.includes("[OPUS,'amazon-bedrock']"),true);
  assert.equal(src.includes("[SOL,'azure']"),true);
  assert.equal(src.includes('require_parameters:true'),true);
  assert.equal(src.includes('zdr:true'),true);
  assert.equal(src.includes('allow_fallbacks:false'),true);
  assert.equal(src.includes('temperature:0'),false);
  assert.equal(src.includes('exact-v6-parameter-routing-refusal-required'),true);
});
