import test from 'node:test';
import assert from 'node:assert/strict';
import { probeInquiryPath } from '../src/inquiry-path-probe.mjs';
import { witnessRuntimeTelLinks } from '../src/inquiry-path-runtime-witness.mjs';
import { renderInquiryAudit } from '../src/verified-inquiry-report.mjs';
const site = 'https://public-fixture.example/';
const okResponse = body => ({ status: 200, headers: { get: () => null }, body: { getReader: () => ({ read: async () => ({done:true}), releaseLock(){} }) }, text: async () => body });
const response = (status, body = '') => ({ status, headers: { get: () => null }, text: async () => body });
const run = options => probeInquiryPath({ website: site, maxPages: 1, delayMs: 0, urlGuard: async url => { if (url.includes('127.0.0.1')) throw Error('private address'); }, ...options });
test('body whose reader never completes cannot escape site deadline or become a paid finding', async () => {
  const started = Date.now();
  const result = await run({ maxSiteMs: 35, fetchImpl: (url) => url.endsWith('/robots.txt') ? Promise.resolve(response(200)) : Promise.resolve({ status: 200, headers: {get:()=>null}, body: {getReader: () => ({read: () => new Promise(()=>{}), releaseLock() {}})} }) });
  assert.ok(Date.now() - started < 1500);
  assert.equal(result.analysis.findings.length, 0);
  assert.equal(result.analysis.verdict, 'NOT_OBSERVABLE_FROM_STATIC_HTML');
  assert.ok(result.runtimeMetrics.wallClockMs >= 1);
});
test('robots 503 abstains and makes zero finding claims', async () => {
  const result = await run({ fetchImpl: async url => url.endsWith('/robots.txt') ? response(503) : response(200,'<a href="tel:100">200</a>') });
  assert.equal(result.analysis.findings.length, 0);
  assert.ok(result.refusals.some(r => r.reason === 'ROBOTS_UNAVAILABLE'));
});
test('redirect toward private address is refused before the next network fetch', async () => {
  let calls = 0;
  const result = await run({ fetchImpl: async url => { calls++; return url.endsWith('robots.txt') ? response(200) : { status: 302, headers: { get: ()=>'http://127.0.0.1/internal' }, body: { cancel:async()=>{} } }; } });
  assert.equal(calls, 2); assert.equal(result.analysis.findings.length,0);
});
test('looping redirects terminate without an asserted finding', async () => {
  const result = await run({fetchImpl: async url => url.endsWith('robots.txt') ? response(200) : {status:302,headers:{get:()=>site+'loop'},body:{cancel:async()=>{}}}});
  assert.equal(result.analysis.findings.length,0);
  assert.ok(result.refusals.some(r=>r.reason==='TOO_MANY_REDIRECTS'));
});
test('network DNS errors and browser crash remain unobservable', async () => {
  const result = await run({ fetchImpl: async () => { throw Error('ENOTFOUND'); } });
  assert.equal(result.analysis.findings.length,0);
  assert.ok(result.refusals.length>0);
});
test('unapproved browser navigation schemes rejected before browser launches', async () => {
  let launched = false;
  await assert.rejects(() => witnessRuntimeTelLinks({ urls:['javascript:alert(1)'], launch:async()=>{launched=true;} }), /UNSAFE_BROWSER_NAVIGATION_SCHEME/);
  assert.equal(launched,false);
});
test('report does not execute HTML, embed javascript link or invent money', () => {
  const item = {website:site,defect:'TEL_LABEL_DIALS_DIFFERENT_NUMBER',claim:'<img src=x onerror=alert(1)>',verifiedAt:'2026-10-22T10:00:00Z',disproveIn30Seconds:'Compare dialed destination',evidence:[{url:'javascript:alert(1)',excerpt:'<script>alert(1)</script>',sourceSha256:'x'}]};
  const input={sourceClass:'HISTORICAL_SAMPLE',deliveredItems:[item],receipt:{charged:1}};
  const a=renderInquiryAudit(input),b=renderInquiryAudit(input);
  assert.deepEqual(a,b);assert.equal(a.findingCount,1);
  assert.doesNotMatch(a.html,/<script>|href="javascript:/i);
  assert.match(a.html,/&lt;script&gt;/);assert.match(a.html,/NOT EVIDENCED/);
  assert.match(a.markdown,/Discovered: UNKNOWN/);
});
test('empty result is still a complete deliverable',()=>{
  const result=renderInquiryAudit({deliveredItems:[],sourceClass:'LOCAL_FIXTURE'});
  assert.equal(result.findingCount,0); assert.match(result.html,/No supported finding/);
  assert.match(result.markdown,/No independently supported finding/);
});
