import test from 'node:test';
import assert from 'node:assert/strict';
import {compileUberDnsPlan} from '../src/uberdns-control-plane.mjs';
import {compileUberPostalIdentity} from '../src/uberpostal-identity.mjs';
import {compileUberProspectPortfolio} from '../src/uberprospect-forge.mjs';
import {compileUberLaunchClosure} from '../src/uberlaunch-closure.mjs';


const passedLegal=i=>({status:'PASSED',evidenceId:`ubelig_${i}`,policyVersion:'uberbond.recipient-eligibility.v1'});

test('UberProspect refuses a bare legalEligible claim and any non-PASSED eligibility decision',()=>{
  const base={email:'info@agency.example',sourceUrl:'https://agency.example/contact',safeForOutreach:true};
  for(const row of [
    {...base,legalEligible:true},
    {...base,legal:{status:'HOLD',evidenceId:'ubelig_x',policyVersion:'v1'}},
    {...base,legal:{status:'REQUIREMENTS_UNMET',evidenceId:'ubelig_x',policyVersion:'v1'}},
    {...base,legal:{status:'PASSED',evidenceId:'',policyVersion:'v1'}},
    {...base,legal:{status:'PASSED',evidenceId:'ubelig_x',policyVersion:''}}
  ]){
    const r=compileUberProspectPortfolio({records:[row],target:1,perOfferTarget:0});
    assert.equal(r.acceptedCount,0);
    assert.deepEqual(r.rejectedCount,1);
  }
  const ok=compileUberProspectPortfolio({records:[{...base,legal:passedLegal(7)}],target:1,perOfferTarget:0});
  assert.equal(ok.acceptedCount,1);
  assert.equal(ok.records[0].legalPolicyVersion,'uberbond.recipient-eligibility.v1');
});

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
  const rows=Array.from({length:2000},(_,i)=>({email:`prospect${i}@example.com`,sourceUrl:`https://example.com/${i}`,safeForOutreach:true,legal:passedLegal(i)}));
  const r=compileUberProspectPortfolio({records:rows,target:2000,perOfferTarget:500});
  assert.equal(r.ok,true);
  assert.equal(r.records[0].legalEvidenceId,'ubelig_0');
  assert.deepEqual(r.laneCounts,{LEAD_TO_BOOKING_LEAK_AUDIT:500,AI_AGENT_RELEASE_GATE:500,CLIENT_ROI_PROOF_SPRINT:500,BILINGUAL_BOOKING_LEAK_AUDIT:500});
});

test('UberLaunch closes only when every external-reality atom is evidenced',()=>{
  const prospects=compileUberProspectPortfolio({records:Array.from({length:2000},(_,i)=>({email:`p${i}@example.com`,sourceUrl:`https://example.com/${i}`,safeForOutreach:true,legal:passedLegal(i)}))});
  const r=compileUberLaunchClosure({dns:{publicVerified:true,evidenceRef:'dns:live'},postal:{status:'UBERPOSTAL_IDENTITY_READY',identity:{evidenceRef:'postal:founder'}},mailCell:{status:'CONTABO_MAIL_CELL_PTR_UPDATE_ACCEPTED',evidenceRef:'cell:1'},prospects,runtime:{observedHealthy:true,evidenceRef:'runtime:1'}});
  assert.equal(r.ok,true);
  assert.equal(r.status,'UBERLAUNCH_CLOSURE_READY_FOR_EXISTING_CERTIFICATE_GATE');
});
