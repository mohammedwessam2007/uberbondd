import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePublicContactSupply } from '../src/ubersupply-public-contact-capacity.mjs';

test('counts only exact supplied routes and does not invent contacts',()=>{
 const r=compilePublicContactSupply({
  prospects:[
   {id:'p1',company:'A',contact:{email:'info@a.example',sourceUrl:'https://a.example/contact',verified:'valid'}},
   {id:'p2',company:'B',crawl:{pages:[{url:'https://b.example/contact',emails:['sales@b.example'],contactForms:[{action:'https://b.example/form'}]}]}},
   {id:'p3',company:'C'}
  ],
  eligibilityByProspect:{p1:{legal:{status:'PASSED'}},p2:{legal:{status:'HOLD'}}},
  targetDailyFirstTouches:1,targetBusinessDays:1
 });
 assert.equal(r.summary.publicExactRoutes,2);
 assert.equal(r.summary.genericRoleRoutes,2);
 assert.equal(r.summary.eligibleRoutes,1);
 assert.equal(r.summary.contactFormAccounts,1);
 assert.equal(r.status,'OBSERVED_MONTH_COVERED');
});
test('an empirical shortfall does not automatically buy Apollo or Hunter',()=>{
 const r=compilePublicContactSupply({prospects:[],targetDailyFirstTouches:1000,targetBusinessDays:20});
 assert.equal(r.status,'EMPIRICAL_SUPPLY_SHORTFALL');
 assert.equal(r.paidLeadDataRequired,'UNKNOWN_NOT_PROVEN');
 assert.match(r.nextEvidenceNeeded,/measure exact eligible contact yield/i);
});
