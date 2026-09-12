import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRateLimitHeaders,buildSourceCeilingPolicy,nextSourceAction,buildAlwaysOnSensoriumPlan} from '../src/adaptive-source-ceiling-governor.mjs';

test('parses provider rate headers',()=>{
 const r=parseRateLimitHeaders({'X-RateLimit-Limit':'5000','X-RateLimit-Remaining':'17','X-RateLimit-Reset':'2000000000','Retry-After':'12'});
 assert.equal(r.limit,5000);assert.equal(r.remaining,17);assert.equal(r.retryAfterSeconds,12);
});

test('rate-limit response schedules sleep',()=>{
 const p=buildSourceCeilingPolicy({sourceId:'github'});
 const r=nextSourceAction({policy:p,status:429,headers:{'retry-after':'30'},nowMs:1000});
 assert.equal(r.action,'SLEEP_UNTIL');assert.equal(r.retryAtMs,31000);
});

test('daily quota exhaustion sleeps until daily reset',()=>{
 const p=buildSourceCeilingPolicy({sourceId:'youtube',quotaUnitsPerDay:10000});
 assert.equal(nextSourceAction({policy:p,usedQuotaUnitsToday:10000}).action,'SLEEP_UNTIL_DAY_RESET');
});

test('continuous source keeps streaming with capacity',()=>{
 const p=buildSourceCeilingPolicy({sourceId:'x',continuous:true,minDelayMs:0});
 assert.equal(nextSourceAction({policy:p}).action,'KEEP_STREAMING');
});

test('always-on plan spans broad source families',()=>{
 const p=buildAlwaysOnSensoriumPlan();
 assert.ok(p.lanes.length>=8);assert.match(p.schedulerLaw,/24_7/);
});
