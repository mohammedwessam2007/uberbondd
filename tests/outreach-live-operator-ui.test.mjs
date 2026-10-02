import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { inspectProspect, inspectRuntime } from '../public/prospect-preflight-ui.js';

const source = readFileSync(process.env.OUTREACH_UI_PROBE_SOURCE || new URL('../public/outreach-one-button.js', import.meta.url), 'utf8');
const allChecks = Object.fromEntries(['suppressions','prospects','outboundReservations','outboundEvents','replies','messages','providerEvents'].map(key => [key,{read:true}]));
const input = { record: { recipient: { email: 'hello@mypowerhouse.group' } }, slots: {}, artifactRef: 'artifacts/outreach/existing.md' };
const goodHistory = { status: 'CLEAN', findings: [], checks: allChecks };
const goodPreflight = { state: 'BLOCKED_IDENTITY', contactHistory: { status: 'CLEAN', hit: false }, sendAuthority: false };

test('operator uses the exact canonical POST and all seven exact history reads, without approvals', async () => {
  const calls = [];
  const result = await inspectProspect({ input, request: async (path, opts) => { calls.push({path,opts});return opts ? goodPreflight : goodHistory; } });
  assert.equal(result.classification,'CLEAN_EXACT_PRODUCTION_HISTORY');
  assert.equal(calls[0].path,'/api/prospect-preflight');
  assert.equal(calls[0].opts.method,'POST');
  assert.deepEqual(JSON.parse(calls[0].opts.body),input);
  assert.match(calls[1].path,/contact-history\?email=hello%40mypowerhouse.group&domain=mypowerhouse.group$/);
  assert.equal(result.sendAuthority,false);
  assert.equal(result.externalEffects,0);
});

test('failed POST or exact read, any missing collection, or disagreement is never CLEAN', async () => {
  for (const failedPath of ['/api/prospect-preflight','/api/prospect-preflight/contact-history']) {
    const r = await inspectProspect({ input,request:async path => { if(path === failedPath || path.startsWith(failedPath+'?')) throw Error('Unauthorized'); return path.includes('?') ? goodHistory : goodPreflight; } });
    assert.equal(r.classification,'PRODUCTION_HISTORY_UNKNOWN');
  }
  for(const key of Object.keys(allChecks)) {
    const r = await inspectProspect({input,request:async path => path.includes('?') ? {...goodHistory,checks:{...allChecks,[key]:{read:false}}} : goodPreflight});
    assert.equal(r.classification,'PRODUCTION_HISTORY_UNKNOWN',key);
  }
  const r = await inspectProspect({input,request:async path => path.includes('?') ? goodHistory : {...goodPreflight,contactHistory:{status:'HIT',hit:true}}});
  assert.equal(r.classification,'PRODUCTION_HISTORY_UNKNOWN');
});

test('even informational exact history findings are reported as contact history hits', async () => {
  const r = await inspectProspect({input,request:async path => path.includes('?') ? {...goodHistory,findings:[{severity:'INFORMATIONAL'}]} : goodPreflight});
  assert.equal(r.classification,'CONTACT_HISTORY_HIT');
});

test('runtime display uses GET only, preserves failed reads and redacts postal identity', async () => {
  const methods=[];
  const r=await inspectRuntime({request:async(path,opts)=>{methods.push(opts);if(path==='/api/owner/setup')return{ok:true,identity:{legalName:'Name',postalAddress:'PRIVATE POSTAL TEST VALUE'}};if(path==='/api/sender-health')throw Error('unread');if(path==='/api/summary')return{outbound:{uncertain:2}};if(path==='/api/campaigns')return[];return{reasonCodes:['identity-missing']};}});
  assert.ok(methods.every(x=>x===undefined));
  assert.equal(r.reads['/api/sender-health'].ok,false);
  assert.equal(r.reads['/api/owner/setup'].result.identity.postalAddressPresent,true);
  assert.doesNotMatch(JSON.stringify(r),/PRIVATE POSTAL TEST VALUE/);
  assert.equal(r.sendAuthority,false);
});

async function browserGate({ canary = {reasonCodes:['identity-missing']}, launch = {certificate:{state:'BLOCKED',hardStopReasonCodes:['identity-missing']}}, fail = '', launchHttpStatus = 200, sourceText = source } = {}) {
  const listeners = {};
  const events = {};
  const button={disabled:false,textContent:'',addEventListener:(key,fn)=>{listeners[key]=fn;}};
  const status={textContent:'',dataset:{}};
  const field={value:'test-bearer-not-a-real-secret',addEventListener:(key,fn)=>{events[key]=fn;}};
  const calls=[];
  const context=vm.createContext({document:{querySelector:id=>({'#start-outreach':button,'#start-outreach-status':status,'#token':field}[id])},window:{addEventListener:(key,fn)=>{events[key]=fn;},confirm:()=>{throw Error('Unexpected send confirmation');}},setInterval:()=>1,clearInterval:()=>{},setTimeout:()=>{},fetch:async(path,opts)=>{calls.push({path,method:opts.method});if(path===fail)throw Error('read failed');const httpStatus=path.includes('100k') ? launchHttpStatus : 200;return{ok:httpStatus===200,status:httpStatus,headers:{get:()=> 'application/json'},json:async()=>path.includes('100k') ? launch : (canary === null ? null : {state:'CANARY_STATUS',...canary})};}});
  vm.runInContext(sourceText,context);
  assert.equal(button.disabled,true,'must start closed before authentication');
  await events['outreach-runtime-loaded']();
  return{button,status,calls,events,listeners};
}

test('live blocker cases close the one-button without issuing any POST', async () => {
  for(const code of ['identity-missing','legal-authority-missing','contact-history-unknown','sender-quarantined','sender-health-invalid','suppression-exists','effect-not-approved','uncertain-send-exists']) {
    const b=await browserGate({launch:{certificate:{state:'CERTIFIED_100K_READY',hardStopReasonCodes:[],waitReasonCodes:[]},pressable:true},canary:{readyForLiveSend:true,reasonCodes:[code]}});
    assert.equal(b.button.disabled,true,code);
    assert.match(b.status.textContent,new RegExp(code));
    assert.equal(b.status.dataset.state,'blocked');
    await b.listeners.click();
    assert.ok(b.calls.every(c=>c.method==='GET'));
  }
});

test('a failed launch read or canary read stays UNKNOWN even with a ready counterpart', async () => {
  for(const fail of ['/api/outreach/100k/status','/api/outbound/canary/status']) {
    const b=await browserGate({fail,canary:{readyForLiveSend:true,reasonCodes:[]}});
    assert.equal(b.button.disabled,true);
    assert.match(b.status.textContent,/UNKNOWN/);
  }
});

test('exact canary readiness can open the bounded path without demanding 100K capacity', async () => {
  const b=await browserGate({canary:{readyForLiveSend:true,reasonCodes:[]},launch:{certificate:{state:'BLOCKED',hardStopReasonCodes:['100k-inventory-shortfall']}}});
  assert.equal(b.button.disabled,false);
  assert.equal(b.status.dataset.state,'ready');
  b.events.input();
  assert.equal(b.button.disabled,true,'credential edit invalidates readiness');
});

test('malformed successful status responses cannot open the launch control', async () => {
  const b=await browserGate({canary:null,launch:{certificate:{state:'CERTIFIED_100K_READY'},pressable:true}});
  assert.equal(b.button.disabled,true);
  assert.match(b.status.textContent,/UNKNOWN.*malformed/);
});

test('a canonical 409 exposes its exact blockers but a 401 never exposes readiness', async () => {
  const launch={ok:false,reasonCodes:['runtime-bundle-file-required']};
  const b=await browserGate({launch,launchHttpStatus:409});
  assert.equal(b.button.disabled,true);
  assert.match(b.status.textContent,/BLOCKED.*runtime-bundle-file-required/);
  const unauth=await browserGate({launch,launchHttpStatus:401,canary:{readyForLiveSend:true,reasonCodes:[]}});
  assert.equal(unauth.button.disabled,true);
  assert.match(unauth.status.textContent,/UNKNOWN/);
});

test('hostile mutation: disregarding canary blockers is killed by the live UI behavior', async () => {
  const mutant=source.replace('const ready = (green(current) && canaryCodes.length === 0) || canaryReady;', 'const ready = true;');
  assert.notEqual(mutant,source);
  const b=await browserGate({sourceText:mutant});
  assert.equal(b.button.disabled,false,'mutant wrongly opens the control; blocker-case assertion kills it');
});
