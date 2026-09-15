import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspectOutreach100kPacketCorpus} from '../src/outreach-100k-packet-corpus.mjs';

const boxes=[{mailboxId:'m1',address:'mohamed.001@uberbond.agency',ready:true,remainingDailyCap:2,observedHourlyCap:2,minGapSeconds:0},{mailboxId:'m2',address:'mohamed.001@uberbond.cloud',ready:true,remainingDailyCap:1,observedHourlyCap:1,minGapSeconds:0}];
const packet=(i,box='m1')=>({recipientId:`r${i}`,accountKey:`a${i}`,recipientProviderId:i===3?'microsoft':'gmail',recipientTimeZone:'America/New_York',notBefore:`2026-09-15T1${3+i}:00:00.000Z`,mailboxId:box,campaignId:'c1',idempotencyKey:`k${i}`,message:{from:box==='m1'?'mohamed.001@uberbond.agency':'mohamed.001@uberbond.cloud',to:`p${i}@example.com`,subject:'s',body:'b'},launchInput:{recipient:{email:`p${i}@example.com`,verified:true},campaign:{id:'c1'},legal:{eligible:true},suppression:{checked:true,suppressed:false,unsubscribeRequested:false}}});
async function file(rows){const d=await fs.mkdtemp(path.join(os.tmpdir(),'ub100k-'));const f=path.join(d,'x.ndjson');await fs.writeFile(f,rows.map(x=>JSON.stringify(x)).join('\n')+'\n');return f;}

test('exact scheduled corpus compiles digest inventory and provider counts',async()=>{const f=await file([packet(1),packet(2),packet(3,'m2')]);const r=await inspectOutreach100kPacketCorpus({filePath:f,mailboxes:boxes,campaignId:'c1',expectedCount:3});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.count,3);assert.equal(r.inventory.recipientProviderCounts.gmail,2);assert.equal(r.inventory.recipientProviderCounts.microsoft,1);assert.match(r.recipientSetDigest,/^sha256:/);});
test('duplicate recipient refuses corpus',async()=>{const a=packet(1),b=packet(2);b.message.to=a.message.to;b.launchInput.recipient.email=a.message.to;const f=await file([a,b]);const r=await inspectOutreach100kPacketCorpus({filePath:f,mailboxes:boxes,campaignId:'c1',expectedCount:2});assert.equal(r.ok,false);assert.ok(r.reasonCodes.some(x=>x.includes('duplicate-recipient')));});
test('hourly allocation cannot exceed observed mailbox cap',async()=>{const rows=[packet(1),packet(2),packet(3)];rows.forEach(x=>{x.notBefore='2026-09-15T14:10:00.000Z';});const f=await file(rows);const r=await inspectOutreach100kPacketCorpus({filePath:f,mailboxes:boxes,campaignId:'c1',expectedCount:3});assert.equal(r.ok,false);assert.ok(r.reasonCodes.some(x=>x.includes('hourly-allocation-exceeds-observed-capacity')));});
test('message sender must be the exact certified mailbox address',async()=>{const p=packet(1);p.message.from='other@uberbond.agency';const f=await file([p]);const r=await inspectOutreach100kPacketCorpus({filePath:f,mailboxes:boxes,campaignId:'c1',expectedCount:1});assert.equal(r.ok,false);assert.ok(r.reasonCodes.some(x=>x.includes('sender-address-must-match-certified-mailbox')));});
