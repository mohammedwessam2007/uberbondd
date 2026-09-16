import test from 'node:test';
import assert from 'node:assert/strict';
import {compileUberDnsPlan} from '../src/uberdns-control-plane.mjs';
import {compileUberPostalIdentity} from '../src/uberpostal-identity.mjs';
import {compileUberProspectPortfolio} from '../src/uberprospect-forge.mjs';
import {compileUberLaunchClosure} from '../src/uberlaunch-closure.mjs';

test('UberDNS fails closed without physical mail-host evidence and mutation authority',()=>{
  const r=compileUberDnsPlan({roots:['uberbond.agency','uberbond.cloud']});
  assert.equal(r.ok,false);
  assert.ok(r.blockers.includes('mail-host-static-ipv4-required'));
  assert.ok(r.blockers.includes('owner-dns-mutation-authorization-required'));
});

test('UberPostal refuses to invent or publish an unapproved address',()=>{
  const r=compileUberPostalIdentity({});
  assert.equal(r.ok,false);
  assert.ok(r.blockers.includes('founder-address-authorization-required'));
  assert.ok(r.blockers.includes('public-footer-publication-authorization-required'));
});

test('UberProspect builds exactly four canonical 500-recipient first-day lanes',()=>{
  const rows=Array.from({length:2000},(_,i)=>({email:`prospect${i}@example.com`,sourceUrl:`https://example.com/${i}`,safeForOutreach:true,legalEligible:true}));
  const r=compileUberProspectPortfolio({records:rows,target:2000,perOfferTarget:500});
  assert.equal(r.ok,true);
  assert.deepEqual(r.laneCounts,{LEAD_TO_BOOKING_LEAK_AUDIT:500,AI_AGENT_RELEASE_GATE:500,CLIENT_ROI_PROOF_SPRINT:500,BILINGUAL_BOOKING_LEAK_AUDIT:500});
});

test('UberLaunch closes only when every external-reality atom is evidenced',()=>{
  const prospects=compileUberProspectPortfolio({records:Array.from({length:2000},(_,i)=>({email:`p${i}@example.com`,sourceUrl:`https://example.com/${i}`,safeForOutreach:true,legalEligible:true}))});
  const r=compileUberLaunchClosure({dns:{publicVerified:true,evidenceRef:'dns:live'},postal:{status:'UBERPOSTAL_IDENTITY_READY',identity:{evidenceRef:'postal:founder'}},mailCell:{status:'CONTABO_MAIL_CELL_PTR_UPDATE_ACCEPTED',evidenceRef:'cell:1'},prospects,runtime:{observedHealthy:true,evidenceRef:'runtime:1'}});
  assert.equal(r.ok,true);
  assert.equal(r.status,'UBERLAUNCH_CLOSURE_READY_FOR_EXISTING_CERTIFICATE_GATE');
});
