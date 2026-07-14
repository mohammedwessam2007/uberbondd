import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {Store} from '../src/store.mjs';
import {RevenueEngine} from '../src/revenue.mjs';
import {checkoutUrl,verifyLemonSignature} from '../src/payments.mjs';

const cfg=dir=>({
  baseUrl:'https://audit.test',dataDir:dir,encryptionKey:'a'.repeat(64),
  revenue:{publicIntake:true,publicRateLimitPerHour:4,freeFindings:1,fullAuditPrice:49,strategyAuditPrice:299,monitoringPrice:99,implementationFrom:1000,bookingUrl:'',reportDeliveryInbox:'B',autoEmailReports:false,paymentProvider:'links',fullAuditCheckoutUrl:'https://shop.test/buy/full',strategyAuditCheckoutUrl:'https://shop.test/buy/strategy',monitoringCheckoutUrl:'https://shop.test/buy/watch',lemonWebhookSecret:'secret',allowTestUnlock:true,monitoringIntervalDays:30,monitoringBatchSize:10},
  google:{},sender:{name:'Mohamed'},
});

test('checkout custom data is encoded into hosted link',()=>{const u=new URL(checkoutUrl('https://shop.test/buy/abc',{lead_id:'lead 1',product:'full'}));assert.equal(u.searchParams.get('checkout[custom][lead_id]'),'lead 1');assert.equal(u.searchParams.get('checkout[custom][product]'),'full')});

test('Lemon Squeezy signature verification uses raw body HMAC',()=>{const raw='{"hello":"world"}',secret='secret';const sig=crypto.createHmac('sha256',secret).update(raw).digest('hex');assert.equal(verifyLemonSignature(raw,sig,secret),true);assert.equal(verifyLemonSignature(raw,'bad',secret),false)});

test('public report shows one free finding then unlocks full report',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'revenue-store-'));const store=new Store(dir);await store.init();
  const pipeline={running:true,paused:false,runBatch:async()=>{}};const engine=new RevenueEngine(store,cfg(dir),pipeline);
  const created=await engine.createLead({company:'Acme',website:'https://example.com',email:'owner@example.com',industry:'SaaS',consent:true},'1.2.3.4');
  const lead=await store.get('leads',created.leadId);const p=await store.get('prospects',lead.prospectId);
  const findings=[{title:'A',severity:4,confidence:.9,evidenceUrl:'https://example.com',evidenceExcerpt:'x',implication:'i',service:'s'},{title:'B',severity:3,confidence:.8,evidenceUrl:'https://example.com/about',evidenceExcerpt:'y',implication:'j',service:'t'}];
  await store.patch('prospects',p.id,{status:'research-complete',score:{total:72,tier:'B'},issue:findings[0],audit:findings,dossier:{screenshots:[],riskFlags:[]},completedAt:new Date().toISOString()});
  await engine.onProspectComplete(await store.get('prospects',p.id));
  const free=await engine.publicReport(created.accessToken);assert.equal(free.report.observations.length,1);assert.equal(free.report.hiddenFindings,1);assert.equal(free.report.fullAccess,false);
  await engine.unlockLead(lead.id,'full',{provider:'test',eventId:'evt_1',amountCents:4900});
  const paid=await engine.publicReport(created.accessToken);assert.equal(paid.report.observations.length,2);assert.equal(paid.report.hiddenFindings,0);assert.equal(paid.report.fullAccess,true);assert.equal((await engine.summary()).grossRevenue,49);
});
