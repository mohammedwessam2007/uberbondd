import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observeUberWarm2ProviderEventLog as observe } from '../src/uberwarm2-provider-event-log-observer.mjs';
import {compileOperationalSnapshot} from '../src/uberwarm2-operational-journal.mjs';
const digest='sha256:'+'a'.repeat(64);
const hook=(id,status='enabled')=>({id,status,privateAddress:'confidential@example.com'});
const ok=(data,has_more=false)=>({ok:true,receipt:{responseDigest:digest},data,pagination:{has_more}});
const when='2026-10-19T16:55:00.000Z';
const empty=()=>ok([]);
const base={now:when,listWebhooks:async()=>ok([hook('hook1')]),getWebhookDeliveries:async()=>ok([])};

test('bounded authenticated GETs observe provider-reported attempts, not verified original webhook events',async()=>{
 let list=0,reads=0;
 const r=await observe({...base,listWebhooks:async()=>{list++;return ok([hook('hook1')]);},
 getWebhookDeliveries:async({webhookId,limit})=>{reads++;assert.equal(webhookId,'hook1');assert.equal(limit,25);
 return ok([{event_type:'email.bounced',outcome:'success',recipient:'private@example.com'},
   {event_type:'email.complained',outcome:'failed',http_status:503},
   {event_type:'message.relayed',outcome:'success'}]);}});
 assert.equal(list,1);assert.equal(reads,1);
 assert.equal(r.status,'EVENT_LOG_PROVIDER_ATTEMPTS_OBSERVED');
 assert.equal(r.bounceDeliveryAttempts,1);assert.equal(r.complaintDeliveryAttempts,1);
 assert.equal(r.failedDeliveryAttempts,1);
 assert.equal(r.adverseEventOperatorReviewRequired,true);
 assert.equal(r.currentSenderClearance,false);assert.equal(r.recipientSuppressionCleared,false);
 assert.equal(r.sendAuthority,'NONE');assert.equal(r.sends,0);assert.equal(r.spendCents,0);
 assert.doesNotMatch(JSON.stringify(r),/private@example|hook1|confidential/);
});

test('zero currently configured endpoints is a gap, not a zero-bounces claim',async()=>{
 let called=false;const r=await observe({...base,listWebhooks:empty,getWebhookDeliveries:async()=>{called=true;}});
 assert.equal(called,false);assert.equal(r.status,'EVENT_LOG_ENDPOINTS_ABSENT');
 assert.equal(r.verifiedProviderDeliveryRead,false);assert.equal(r.providerCalls,1);
});

test('rotation observes one and only one endpoint regardless of vendor list order',async()=>{
 const rows=[hook('a'),hook('b'),hook('c')], visited=[];
 for(const epoch of [0,1,2]) {
   const r=await observe({...base,now:new Date(Date.parse(when)+epoch*300000),
      listWebhooks:async()=>ok(epoch%2?[...rows].reverse():rows),
      getWebhookDeliveries:async({webhookId})=>{visited.push(webhookId);return ok([]);}});
   assert.equal(r.providerCalls,2);
 }
 assert.equal(new Set(visited).size,3);
});

test('invalid inputs and forged provider receipts deny without accepting evidence',async()=>{
 const variants=[
   {now:'invalid'}, {listWebhooks:null}, {getWebhookDeliveries:null},
   {listWebhooks:async()=>({ok:true,data:[hook('x')]})},
   {listWebhooks:async()=>ok([hook('same'),hook('same')])},
   {listWebhooks:async()=>ok([hook('bad\n')])},
   {listWebhooks:async()=>ok([hook('a')],true)},
   {getWebhookDeliveries:async()=>({ok:true,data:[{event_type:'email.bounced'}]})},
   {getWebhookDeliveries:async()=>ok([{event_type:123}])},
   {getWebhookDeliveries:async()=>ok([null])},
 ];
 for(const patch of variants){const r=await observe({...base,...patch});
   assert.notEqual(r.status,'EVENT_LOG_PROVIDER_ATTEMPTS_OBSERVED');
   assert.equal(r.sendAuthority,'NONE');assert.equal(r.sends,0);
 }
});

test('provider exceptions never disclose secrets, fail closed and never send',async()=>{
 const a=await observe({...base,listWebhooks:()=>{throw Error('credential=private');}});
 const b=await observe({...base,getWebhookDeliveries:()=>{throw Error('password=private');}});
 assert.equal(a.status,'EVENT_LOG_ENDPOINT_READ_FAILED');
 assert.equal(b.status,'EVENT_LOG_DELIVERY_READ_FAILED');
 assert.doesNotMatch(JSON.stringify([a,b]),/private|credential|password/);
});

test('invalid status is not interpreted as health, unknown event stays non-authoritative',async()=>{
 const r=await observe({...base,listWebhooks:async()=>ok([hook('h','disabled')]),
 getWebhookDeliveries:async()=>ok([{event_type:'test.ping',outcome:'success'}])});
 assert.equal(r.disabledWebhookCount,1);assert.equal(r.bounceDeliveryAttempts,0);
 assert.equal(r.verifiedProviderDeliveryRead,true);assert.equal(r.currentSenderClearance,false);
});

test('Postgres operational journal stores only aggregate bounded telemetry, never private provider payload',()=>{
 const original={source:'a'.repeat(40),observedAt:when,sends:0,runtimeReady:false,sendAuthority:'NONE',
   status:'BLOCKED_FOR_SENDING',provider:{providerEventLog:{
     status:'EVENT_LOG_PROVIDER_ATTEMPTS_OBSERVED',webhookCount:3,disabledWebhookCount:1,
     bounceDeliveryAttempts:2,complaintDeliveryAttempts:1,failedDeliveryAttempts:4,
     verifiedProviderDeliveryRead:true,adverseEventOperatorReviewRequired:true,
     token:'private-token',sender:'secret@example.com'}}};
 const x=compileOperationalSnapshot(original);
 assert.equal(x.providerEventLog.bounceDeliveryAttempts,2);
 assert.equal(x.providerEventLog.complaintDeliveryAttempts,1);
 assert.equal(x.providerEventLog.adverseEventOperatorReviewRequired,true);
 assert.equal(x.providerEventLog.sendAuthority,'NONE');
 assert.doesNotMatch(JSON.stringify(x),/private|secret|token/);
});

test('production image includes observer and signed-read-only doctor wires the two GETs',()=>{
 const docker=readFileSync(new URL('../Dockerfile.uberwarm-read-monitor',import.meta.url),'utf8');
 const doctor=readFileSync(new URL('../scripts/uberwarm2-live-read-doctor.mjs',import.meta.url),'utf8');
 assert.match(docker,/COPY src\/uberwarm2-provider-event-log-observer\.mjs/);
 assert.match(doctor,/observeUberWarm2ProviderEventLog/);
 assert.match(doctor,/client\.listWebhooks\(\)/);
 assert.match(doctor,/client\.getWebhookDeliveries/);
 assert.doesNotMatch(doctor,/sendOwnerSeedViaHttps|createWebhook|redeliver/);
});

test('documented unpaginated provider GETs may show bounded adverse evidence without inventing negative coverage',async()=>{
 const bare=x=>({ok:true,receipt:{responseDigest:digest},data:x});
 const x=await observe({...base,listWebhooks:async()=>bare([hook('x')]),
   getWebhookDeliveries:async()=>bare([{type:'email.bounced',status:'failed'}])});
 assert.equal(x.status,'EVENT_LOG_PROVIDER_ATTEMPTS_OBSERVED');
 assert.equal(x.bounceDeliveryAttempts,1);
 assert.equal(x.deliveryPageMayHaveMore,true);
 assert.equal(x.currentSenderClearance,false);
});
