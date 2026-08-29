import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { selectEgressRoute, normalizeEgressOutcome } from '../src/egress-health-pool.mjs';
import { deriveProspectIdentity, deriveOutboundDailyGuard } from '../src/prospect-identity-ledger.mjs';
import { verifyLemonSqueezyWebhook } from '../src/billing-webhook-boundary.mjs';
import { compileMaintenancePlan } from '../src/database-hygiene-maintenance.mjs';
import { compileSystemHealthMatrix } from '../src/system-health-matrix.mjs';
import { createFetchHandler } from '../api/webhooks/billing.mjs';

test('egress pool chooses healthy policy-bound route',()=>{
 const r=selectEgressRoute({purpose:'PUBLIC_EVIDENCE',targetRef:'site:a',now:'2026-08-29T08:00:00Z',routes:[{routeRef:'p1',policyRef:'policy:1',state:'HEALTHY',allowedPurposes:['PUBLIC_EVIDENCE'],successRate:.9,latencyMs:200,observedAt:'2026-08-29T07:30:00Z'}]});
 assert.equal(r.ok,true); assert.equal(r.selection.routeRef,'p1');
});
test('egress pool refuses CAPTCHA/block evasion and fingerprint spoofing',()=>{
 assert.equal(selectEgressRoute({purpose:'CAPTCHA_BYPASS',targetRef:'x'}).ok,false);
 assert.equal(selectEgressRoute({purpose:'PUBLIC_EVIDENCE',targetRef:'x',webglSpoof:true,now:'2026-08-29T08:00:00Z',routes:[{routeRef:'p1',policyRef:'policy:1',state:'HEALTHY',allowedPurposes:['PUBLIC_EVIDENCE'],successRate:.9,latencyMs:100,observedAt:'2026-08-29T07:30:00Z'}]}).ok,false);
 assert.equal(selectEgressRoute({purpose:'PUBLIC_EVIDENCE',targetRef:'x',targetAccessState:'CAPTCHA'}).ok,false);
});
test('blocked route outcome quarantines rather than rotating around block',()=>{
 const r=normalizeEgressOutcome({routeRef:'p1',outcome:'BLOCKED',observedAt:'2026-08-29T08:00:00Z'});
 assert.equal(r.outcome.nextState,'QUARANTINED'); assert.match(r.outcome.retryDisposition,/DO_NOT_ROTATE/);
});
test('identity ledger canonicalizes domain and provides multiple stable keys',()=>{
 const r=deriveProspectIdentity({domain:'https://WWW.Example.com/path',phone:'+1 (212) 555-1234'});
 assert.equal(r.ok,true); assert.equal(r.identity.domain,'example.com'); assert.equal(r.identity.keys.length,2);
});
test('daily outbound guard is stable across inboxes for same target offer and day',()=>{
 const a=deriveOutboundDailyGuard({domain:'example.com',email:'Sales@Example.com',recipientEmail:'Sales@Example.com',channel:'EMAIL',offerRef:'offer:1',campaignRef:'c1',occurredAt:'2026-08-29T08:00:00Z',inbox:'a'});
 const b=deriveOutboundDailyGuard({domain:'https://www.example.com',email:'sales@example.com',recipientEmail:'sales@example.com',channel:'EMAIL',offerRef:'offer:1',campaignRef:'c1',occurredAt:'2026-08-29T21:00:00Z',inbox:'b'});
 assert.equal(a.guard.guardKey,b.guard.guardKey);
});
test('billing webhook verifies raw-body HMAC and treats event as evidence only',()=>{
 const raw=Buffer.from(JSON.stringify({meta:{event_name:'order_created',custom_data:{prospect_id:'p1',secret:'drop'}},data:{type:'orders',id:'42'}}));
 const secret='test-secret'; const signature=crypto.createHmac('sha256',secret).update(raw).digest('hex');
 const r=verifyLemonSqueezyWebhook({rawBody:raw,signingSecret:secret,signature,eventName:'order_created'});
 assert.equal(r.ok,true); assert.equal(r.event.customData.prospect_id,'p1'); assert.equal('secret' in r.event.customData,false); assert.match(r.event.admissionLaw,/RECONCILE/);
 assert.equal(verifyLemonSqueezyWebhook({rawBody:raw,signingSecret:secret,signature:'bad',eventName:'order_created'}).ok,false);
});
test('Vercel Web Request billing route verifies exact raw text before durable persistence',async()=>{
 const body=JSON.stringify({meta:{event_name:'order_created',custom_data:{prospect_id:'p1'}},data:{type:'orders',id:'42'}});
 const secret='route-secret'; const signature=crypto.createHmac('sha256',secret).update(body).digest('hex');
 let persisted=null;
 const handler=createFetchHandler({env:{LEMONSQUEEZY_WEBHOOK_SECRET:secret,DATABASE_URL:'postgres://fixture'},getPool:()=>({fixture:true}),persistVerifiedBillingEvent:async(_pool,event)=>{persisted=event;return {status:'WEBHOOK_PERSISTED',duplicate:false};},now:()=>new Date('2026-08-29T08:00:00Z')});
 const response=await handler(new Request('https://example.test/api/webhooks/billing',{method:'POST',headers:{'content-type':'application/json','x-event-name':'order_created','x-signature':signature},body}));
 const json=await response.json(); assert.equal(response.status,200); assert.equal(json.reconciliationRequired,true); assert.equal(persisted.objectId,'42');
 const bad=await handler(new Request('https://example.test/api/webhooks/billing',{method:'POST',headers:{'content-type':'application/json','x-event-name':'order_created','x-signature':'bad'},body}));
 assert.equal(bad.status,401);
});
test('maintenance refuses auto-deleting payment and audit truth',()=>{
 const r=compileMaintenancePlan({now:'2026-08-29T08:00:00Z',rules:[{dataClass:'PAYMENT_RECEIPT',retentionDays:14}]});
 assert.equal(r.ok,false);
});
test('maintenance allows bounded transient cleanup and avoids VACUUM FULL',()=>{
 const r=compileMaintenancePlan({now:'2026-08-29T08:00:00Z',rules:[{dataClass:'TRANSIENT_JOB_LOG',retentionDays:14,batchSize:250}]});
 assert.equal(r.ok,true); assert.match(r.plan.vacuumLaw,/AUTOVACUUM/); assert.match(r.plan.vacuumLaw,/DO NOT RUN VACUUM FULL/);
});
test('health matrix exposes aggregate operational truth without recipient PII',()=>{
 const r=compileSystemHealthMatrix({now:'2026-08-29T08:00:00Z',senderHealth:[{paused:false,complaintsToday:0,hardBouncesToday:1,failureStreak:0}],hourlyOutbound:[{count:12}],jobs:{pending:3,deadLetter:0},database:{activeConnections:2,maxConnections:10},egress:{healthy:2,quarantined:1}});
 assert.equal(r.ok,true); assert.equal(r.matrix.database.connectionUtilizationPct,20); assert.equal(JSON.stringify(r).includes('@'),false);
});
