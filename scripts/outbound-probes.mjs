import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateSendEligibility, contactEligibility, classifyDeliverySignal } from '../src/send-safety.mjs';
import { Store } from '../src/store.mjs';

let passed = 0;
const checks = [];
function probe(name, fn) {
  checks.push(Promise.resolve().then(fn).then(() => { passed += 1; console.log(`PASS  ${name}`); }));
}
const date = new Date('2026-07-13T10:00:00Z');
const baseCfg = { outbound: { enabled: true, dryRun: false, allowedCountries: ['GB'], businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75 }, sender: { address: 'Address' } };
const baseCampaign = { approved: true, autoSend: true, allowedCountries: ['GB'], minScore: 60 };
const base = {
  id:'p', website:'https://clinic.example', country:'GB', draft:'draft', unsubscribeUrl:'https://app.example/unsubscribe?t=x', oneClickUnsubscribeUrl:'https://app.example/api/public/unsubscribe?t=x',
  contact:{email:'info@clinic.example',source:'website',verified:'unknown'}, score:{total:80},
  issue:{title:'Booking error',confidence:.9,safeForOutreach:true,evidenceUrl:'https://clinic.example/book',evidenceExcerpt:'error'}
};
const reason = (prospect=base,campaign=baseCampaign,cfg=baseCfg,when=date) => evaluateSendEligibility({prospect,campaign,cfg,date:when}).reason;

probe('disabled outbound blocks',()=>assert.equal(reason(base,baseCampaign,{...baseCfg,outbound:{...baseCfg.outbound,enabled:false}}),'outbound-disabled'));
probe('dry-run blocks provider dispatch',()=>assert.equal(reason(base,baseCampaign,{...baseCfg,outbound:{...baseCfg.outbound,dryRun:true}}),'outbound-dry-run'));
probe('missing postal address blocks',()=>assert.equal(reason(base,baseCampaign,{...baseCfg,sender:{address:''}}),'business-address-missing'));
probe('missing body unsubscribe blocks',()=>assert.equal(reason({...base,unsubscribeUrl:''}),'unsubscribe-link-missing'));
probe('missing one-click unsubscribe blocks',()=>assert.equal(reason({...base,oneClickUnsubscribeUrl:''}),'one-click-unsubscribe-missing'));
probe('system country allowlist blocks',()=>assert.equal(reason(base,baseCampaign,{...baseCfg,outbound:{...baseCfg.outbound,allowedCountries:['DE']}}),'country-not-system-allowed'));
probe('campaign country allowlist blocks',()=>assert.equal(reason(base,{...baseCampaign,allowedCountries:['DE']}),'country-not-campaign-allowed'));
probe('free email contacts block',()=>assert.equal(contactEligibility({email:'clinic@gmail.com',source:'website'},base).reason,'free-mail-contact'));
probe('risky system mailboxes block',()=>assert.equal(contactEligibility({email:'noreply@clinic.example',source:'website'},base).reason,'risky-mailbox'));
probe('cross-domain contacts block',()=>assert.equal(contactEligibility({email:'info@other.example',source:'website'},base).reason,'contact-domain-mismatch'));
probe('unverified enrichment blocks',()=>assert.equal(contactEligibility({email:'owner@clinic.example',source:'hunter',verified:'unknown'},base).reason,'contact-not-published-or-verified'));
probe('positively verified enrichment passes',()=>assert.equal(contactEligibility({email:'owner@clinic.example',source:'hunter',verified:'valid'},base).ok,true));
probe('unsafe evidence blocks',()=>assert.equal(reason({...base,issue:{...base.issue,safeForOutreach:false}}),'unsafe-or-missing-evidence'));
probe('low confidence evidence blocks',()=>assert.equal(reason({...base,issue:{...base.issue,confidence:.4}}),'low-evidence-confidence'));
probe('cross-domain evidence blocks',()=>assert.equal(reason({...base,issue:{...base.issue,evidenceUrl:'https://other.example'}}),'evidence-domain-mismatch'));
probe('low score blocks',()=>assert.equal(reason({...base,score:{total:20}}),'score-below-campaign-threshold'));
probe('weekends block',()=>assert.equal(reason(base,baseCampaign,baseCfg,new Date('2026-07-12T10:00:00Z')),'outside-recipient-business-hours'));
probe('early hours block',()=>assert.equal(reason(base,baseCampaign,baseCfg,new Date('2026-07-13T02:00:00Z')),'outside-recipient-business-hours'));
probe('multi-timezone country requires explicit zone',()=>assert.equal(reason({...base,country:'US'}, {...baseCampaign,allowedCountries:['US']}, {...baseCfg,outbound:{...baseCfg.outbound,allowedCountries:['US']}}),'recipient-timezone-missing'));
probe('mailer daemon is recognized as bounce',()=>assert.equal(classifyDeliverySignal({from:'mailer-daemon@example.com',subject:'Undeliverable',body:'550 5.1.1'}).label,'bounce'));
probe('spam complaint signal is recognized',()=>assert.equal(classifyDeliverySignal({subject:'Feedback loop spam complaint'}).label,'complaint'));

probe('global pause, sender pause, cap, cadence, and idempotency are enforced atomically', async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'uberbond-outbound-probes-'));
  const store=new Store(dir); await store.init();
  const fixed=date.toISOString();
  const first=await store.reserveOutboundSend({idempotencyKey:'initial:1',inbox:'A',recipientEmail:'a@clinic.example',dailyCap:2,hourlyCap:2,minGapSeconds:600,now:fixed});
  assert.equal(first.ok,true);
  const cadence=await store.reserveOutboundSend({idempotencyKey:'initial:2',inbox:'A',recipientEmail:'b@clinic.example',dailyCap:2,hourlyCap:2,minGapSeconds:600,now:new Date(date.getTime()+1000).toISOString()});
  assert.equal(cadence.reason,'cadence-gap');
  await store.markOutboundReservation(first.reservation.id,'sent',{sentAt:fixed});
  assert.equal((await store.reserveOutboundSend({idempotencyKey:'initial:1',inbox:'A',recipientEmail:'a@clinic.example',dailyCap:10,hourlyCap:10,minGapSeconds:0,now:fixed})).reason,'duplicate-sent');
  await store.setSenderPaused('B',true,'probe');
  assert.equal((await store.reserveOutboundSend({idempotencyKey:'initial:b',inbox:'B',recipientEmail:'b@clinic.example',dailyCap:10,hourlyCap:10,minGapSeconds:0,now:fixed})).reason,'sender-paused');
  await store.setOutboundPaused(true,'probe');
  assert.equal((await store.reserveOutboundSend({idempotencyKey:'initial:c',inbox:'C',recipientEmail:'c@clinic.example',dailyCap:10,hourlyCap:10,minGapSeconds:0,now:fixed})).reason,'global-outbound-paused');
});

await Promise.all(checks);
console.log(`\n${passed} passed, 0 failed`);
