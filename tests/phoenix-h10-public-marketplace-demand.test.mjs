import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pack = JSON.parse(fs.readFileSync(new URL('../artifacts/outreach/phoenix-h10-public-marketplace-demand-20261015.json', import.meta.url),'utf8'));

test('three distinct first-cash demand references retain exact source routes', () => {
  assert.equal(pack.candidates.length,3);
  assert.equal(new Set(pack.candidates.map(x=>x.id)).size,3);
  assert.equal(new Set(pack.candidates.map(x=>x.url)).size,3);
  for (const c of pack.candidates) {
    const u=new URL(c.url);
    assert.equal(u.protocol,'https:');
    assert.equal(u.hostname,'www.upwork.com');
    assert.ok(u.pathname.startsWith('/freelance-jobs/apply/'));
    assert.equal(c.route,'PLATFORM_APPLICATION_ONLY');
  }
});

test('search snippet cannot be promoted to a verified active buyer', () => {
  assert.equal(pack.sourceClass,'SEARCH_RESULT_OBSERVED_NOT_LIVE_CONFIRMED');
  for(const c of pack.candidates){
    assert.equal(c.evidenceClass,'SEARCH_RESULT_ONLY');
    assert.equal(c.verifiedBuyerAccount,false);
    assert.equal(c.status,'HOLD_REVERIFY_POSTING_AND_PLATFORM_ELIGIBILITY');
    assert.equal(c.applicationSubmitted,false);
  }
});

test('contact identities or off-platform sending are never inferred', () => {
  assert.equal(pack.directApplicationAuthority,false);
  assert.equal(pack.externalMessageAuthority,false);
  assert.deepEqual(pack.sendSet,[]);
  for(const c of pack.candidates){
    assert.equal(c.namedBuyer,null);
    assert.equal(c.buyerEmail,null);
    assert.equal(c.authorizedOffPlatformContact,false);
    assert.ok(!/@/.test(c.buyerNeed));
  }
});

test('posted budget is not booked money or an accepted client', () => {
  assert.equal(pack.clearedRevenueCents,0);
  assert.equal(pack.actualCustomers,0);
  assert.equal(pack.acceptanceProof,'NONE');
  assert.deepEqual(pack.candidates.map(x=>x.postedBudgetUSD).sort((a,b)=>a-b),[150,300,1500]);
  for(const c of pack.candidates) assert.equal(c.claimedBuyerOutcome,null);
});

test('no automatic job application or contact authorization sneaks into the source corpus', () => {
  for(const c of pack.candidates){
    assert.equal(c.category,'DIRECT_BUYER_POSTED_REQUEST');
    assert.ok(c.buyerNeed.length>=70);
  }
  assert.ok(pack.warnings.some(x=>x.includes('platform')));
  assert.ok(pack.warnings.some(x=>x.includes('portfolio')));
});
