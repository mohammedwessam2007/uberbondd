import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { querySovereignContext } from '../scripts/sovereign-context-query.mjs';

test('context query refuses empty or oversized mission before touching Context state',()=>{
  const empty=querySovereignContext({mission:''});
  assert.equal(empty.ok,false);
  assert.ok(empty.reasonCodes.includes('bounded-context-query-required'));
  const huge=querySovereignContext({mission:'x'.repeat(16001)});
  assert.equal(huge.ok,false);
  assert.ok(huge.reasonCodes.includes('bounded-context-query-required'));
});

test('context query is permanently research-worker and zero authority',()=>{
  const wrong=querySovereignContext({mission:'inspect current context',audience:'founder-dialogue'});
  assert.equal(wrong.ok,false);
  assert.ok(wrong.reasonCodes.includes('context-query-audience-must-be-research-worker'));
  assert.equal(wrong.businessEffectAuthority,'NONE');
  assert.equal(wrong.externalEffectAuthority,'NONE');
});

test('context query history bounds are stricter than the mount maximum',()=>{
  for(const value of [-1,13,1.5,NaN]){
    const out=querySovereignContext({mission:'inspect context',maxHistory:value});
    assert.equal(out.ok,false);
    assert.ok(out.reasonCodes.includes('valid-context-query-history-limit-required'));
  }
});

test('query implementation is transient and cannot persist a mission mount',()=>{
  const source=readFileSync(new URL('../scripts/sovereign-context-query.mjs',import.meta.url),'utf8');
  assert.match(source,/mountCachePath:null/);
  assert.match(source,/audience:'research-worker'/);
  assert.doesNotMatch(source,/appendCognitiveJournalEvent|writeFileSync|renameSync|git\s+push|deploy|paypal|stripe/i);
});

test('installed wrapper only delegates to trusted local source and author config',()=>{
  const wrapper=readFileSync(new URL('../ops/sovereign/uberbond-context-query',import.meta.url),'utf8');
  assert.match(wrapper,/\/etc\/uberbond\/authoring\.env/);
  assert.match(wrapper,/sovereign-context-query\.mjs/);
  assert.doesNotMatch(wrapper,/curl|wget|https?:\/\//i);
});
