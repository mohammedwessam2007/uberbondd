import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { Pipeline } from '../src/pipeline.mjs';
import { buildEncryptedSmtpAccount } from '../src/uberfleet.mjs';
import { approveProspectForTest, TEST_OUTREACH_APPROVAL_SECRET } from './helpers/outreach-governance.mjs';

const NOW=new Date('2026-09-28T10:00:00.000Z');
const KEY='a'.repeat(64);
const campaign={id:'camp-smtp',approved:true,autoSend:true,allowedCountries:['GB'],minScore:60,dailyCaps:{'smtp-1':5},maxFollowups:0};
const base={
 id:'pros-smtp',campaignId:campaign.id,company:'Clinic',website:'https://clinic.example',domain:'clinic.example',
 country:'GB',inbox:'smtp-1',status:'ready',draft:'Evidence-backed requested information.',
 subject:'Requested information',unsubscribeUrl:'https://uberbond.example/unsubscribe?token=x',
 oneClickUnsubscribeUrl:'https://uberbond.example/api/public/unsubscribe?token=x',
 contact:{email:'info@clinic.example',source:'owner_import',verified:'valid'},
 score:{total:85},completedAt:NOW.toISOString(),
 issue:{title:'Booking path issue',confidence:.9,safeForOutreach:true,evidenceUrl:'https://clinic.example/book',evidenceExcerpt:'Book button returned an error.'}
};
const cfg={
 outbound:{
  enabled:true,dryRun:false,launchPhase:'canary',provider:'smtp-relay',useEffectAdapter:true,
  approvalSecret:TEST_OUTREACH_APPROVAL_SECRET,routeEvidenceMaxAgeDays:7,
  allowedCountries:['GB'],hourlyCaps:{'smtp-1':2},minGapSeconds:0,
  businessHourStart:9,businessHourEnd:17,minEvidenceConfidence:.75,maxEvidenceAgeDays:45,
  hardBouncePauseThreshold:2,complaintPauseThreshold:1,failurePauseThreshold:3,domainMailboxGateRequired:false
 },
 sender:{name:'Mohamed',company:'UberBond',address:'Business address'},
 caps:{'smtp-1':5},google:{},encryptionKey:KEY
};
async function store(){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'uberbond-smtp-pipeline-'));
 const s=new Store(dir); await s.init(); await s.add('campaigns',campaign);
 const built=buildEncryptedSmtpAccount({
  slot:'smtp-1',email:'sender@uberbond.example',host:'smtp.example.com',username:'sender@uberbond.example',password:'secret',
  sendingDomainId:'d1',sendingMailboxId:'m1',sendingWorkspaceId:'w1',routeEvidenceRef:'provider:terms',
  routeAuthorized:true,termsCompatible:true
 },KEY);
 assert.equal(built.ok,true);
 await s.add('accounts',built.account);
 return s;
}
test('SMTP relay canary traverses governance and authoritative effect gate exactly once',async()=>{
 const s=await store();
 const approved=approveProspectForTest({
  prospect:base,campaign,cfg,date:NOW,jurisdiction:'GB',
  routeType:'EXPLICIT_CONSENT',permissionScope:'COMMERCIAL_OUTREACH'
 });
 await s.add('prospects',approved);
 let sends=0;
 const p=new Pipeline(s,cfg,{
  clock:()=>NOW,
  outboundConsequenceGate:async()=>({allowed:true,reason:'test-authoritative-admission'}),
  smtpSend:async({account,message})=>{
    sends++; assert.equal(account.slot,'smtp-1'); assert.equal(message.from,'sender@uberbond.example');
    return {classification:'ACCEPTED',providerReferenceId:'smtp250:test',messageId:'<smtp-test@example>'};
  }
 });
 const result=await p.maybeSend(approved,campaign);
 assert.equal(result.sent,true); assert.equal(sends,1);
 assert.equal(result.message.provider,'smtp-relay');
 assert.equal(result.message.providerReferenceId,'smtp250:test');
 const reservations=await s.list('outboundReservations');
 assert.equal(reservations.filter(x=>x.status==='sent').length,1);
});
test('SMTP relay cold public-business route is refused before provider call',async()=>{
 const s=await store();
 const approved=approveProspectForTest({
  prospect:base,campaign,cfg,date:NOW,jurisdiction:'GB',
  routeType:'PUBLIC_BUSINESS_CONTACT',permissionScope:'COMMERCIAL_OUTREACH'
 });
 await s.add('prospects',approved);
 let sends=0;
 const p=new Pipeline(s,cfg,{
  clock:()=>NOW,
  outboundConsequenceGate:async()=>({allowed:true}),
  smtpSend:async()=>{sends++;return {classification:'ACCEPTED',providerReferenceId:'unexpected'};}
 });
 const result=await p.maybeSend(approved,campaign);
 assert.equal(result.sent,false); assert.equal(result.reason,'outreach-governance-denied'); assert.equal(sends,0);
});
