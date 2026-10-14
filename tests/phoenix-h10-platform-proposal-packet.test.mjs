import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const path = new URL('../docs/offers/PHOENIX_H10_BUYER_PLATFORM_PROPOSALS_20261015.md', import.meta.url);
const body = fs.readFileSync(path,'utf8');
test('three exact buyer-request proposal URLs appear and none is an off-platform contact',()=>{
  const matches=[...body.matchAll(/https:\/\/www\.upwork\.com\/freelance-jobs\/apply\/[^\s]+/g)].map(x=>x[0]);
  assert.equal(matches.length,3);
  assert.equal(new Set(matches).size,3);
  assert.doesNotMatch(body, /mailto:|[a-z0-9._%+-]+@(?!example\.invalid)[a-z0-9.-]+\.[a-z]{2,}/i);
});
test('draft proposal packet prohibits fabricated proof and unauthorized submission',()=>{
  assert.match(body,/ALL HELD/);
  assert.match(body,/do not claim a client or a result that did not happen/);
  assert.match(body,/explicitly forbids any off-platform contact/);
  assert.match(body,/Connects charges/);
  assert.match(body,/application count 0, emails 0, contracts 0, cleared revenue \$0/);
});
test('every budget stays a public listing, not an accepted price',()=>{
  for(const price of ['$150','$300','$1,500']) assert.ok(body.includes(price));
  assert.match(body,/actual platform acknowledgements/);
  assert.match(body,/only cleared provider funds as revenue/);
});
