import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOutreachPersonalization } from '../src/ubertruth-outreach.mjs';
const base={prospect:{company:'Acme'},issue:{safeForOutreach:true,evidenceUrl:'https://acme.example/page',evidenceExcerpt:'Booking form has no visible confirmation.',confidence:.9},contact:{firstName:'Sam'},subject:'Booking observation',body:'Hi Sam,\n\nI noticed the booking form has no visible confirmation.'};
test('passes a source-bound factual message',()=>assert.equal(evaluateOutreachPersonalization(base).state,'PASS'));
test('denies an invented personal name',()=>assert.equal(evaluateOutreachPersonalization({...base,body:'Hi Alex,\n\nI noticed the issue.'}).state,'DENY'));
test('denies unsupported revenue-loss arithmetic',()=>{
 const r=evaluateOutreachPersonalization({...base,body:'Hi Sam,\n\nYour business is losing $10,000 in revenue because of this.'});
 assert.equal(r.state,'DENY'); assert.ok(r.denyReasonCodes.some(x=>x.includes('invented-revenue-loss')));
});
test('low-confidence evidence routes to review rather than auto-send',()=>{
 const r=evaluateOutreachPersonalization({...base,issue:{...base.issue,confidence:.4}});
 assert.equal(r.state,'REVIEW'); assert.equal(r.autoSendEligible,false);
});
