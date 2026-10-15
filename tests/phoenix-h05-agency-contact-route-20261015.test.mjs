import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const obj=JSON.parse(fs.readFileSync(new URL('../artifacts/outreach/phoenix-h05-public-agency-route-20261015.json',import.meta.url),'utf8'));
test('three deduplicated, first-party traced organizations remain research leads only',()=>{
  assert.equal(obj.agencies.length,3);
  assert.equal(new Set(obj.agencies.map(a=>a.domain)).size,3);
  assert.equal(obj.totalEligibleRecipients,0);
  assert.equal(obj.authority,'NONE');
  assert.deepEqual(obj.sendSet,[]);
  for(const a of obj.agencies){
    assert.equal(a.sourceType,'FIRST_PARTY_OFFICIAL');
    assert.equal(new URL(a.sourceUrl).hostname,a.domain);
    assert.equal(a.sendAuthorized,false);
    assert.equal(a.verifiedPainOrDefect,false);
    assert.equal(a.identifiedBuyer,false);
  }
});
test('only truly observed business mailboxes, no invented person/permission',()=>{
  for(const a of obj.agencies){
    if(a.publicGeneralMailbox){
      assert.ok(a.publicGeneralMailbox.endsWith('@'+a.domain));
      assert.equal(a.contactRouteType==='PERSONAL_MAILBOX',false);
    }else assert.equal(a.id,'roi-growth-media');
    assert.equal(a.legalEligibility,'UNREVIEWED');
    assert.equal(a.suppressionHistory,'UNVERIFIED');
  }
});
test('one vendor introduction invitation is distinguished from generic business and project routes',()=>{
  assert.deepEqual(obj.agencies.filter(a=>a.explicitVendorInvitation).map(a=>a.id),['elxel']);
  assert.equal(obj.agencies.find(a=>a.id==='elxel').contactRouteType,'EXPLICIT_VENDOR_INTRODUCTION_FORM');
  assert.equal(obj.agencies.find(a=>a.id==='forward-first-media').explicitVendorInvitation,false);
  assert.equal(obj.agencies.find(a=>a.id==='roi-growth-media').explicitVendorInvitation,false);
});
test('no observed defect or revenue is fabricated by discovering a contact channel',()=>{
  assert.equal(obj.verifiedCustomerDemand,0);
  assert.equal(obj.verifiedServiceDefects,0);
  assert.equal(obj.paidOutcomes,0);
  assert.equal(obj.classificationRule,'PUBLIC_BUSINESS_CONTACT_IS_NOT_CONSENT_OR_A_REQUEST_TO_BUY');
  assert.ok(obj.agencies.every(a=>a.status.startsWith('HELD_')));
});
