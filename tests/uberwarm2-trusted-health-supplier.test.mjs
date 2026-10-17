import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberWarm2TrustedHealthSupplier } from '../src/uberwarm2-trusted-health-supplier.mjs';
import { createUberWarm2LivePreflight } from '../src/uberwarm2-smtp-seed-bridge.mjs';

const NOW = Date.parse('2026-10-16T01:00:00.000Z');
const EMAIL = 'sender@example.test';
const DOMAIN = 'example.test';
const item = (extra = {}) => ({
  email: EMAIL, domain: DOMAIN, observedAt: new Date(NOW).toISOString(),
  evidenceRef: 'authenticated-unit-receipt:fixture', ...extra
});
const make = (overrides = {}, clock = () => NOW) => {
  const state = {
    mailbox: item({connected:true, paused:false, quarantined:false, placementQuarantine:false, policyCompatible:true}),
    dns: item({ready:true}),
    smtp: item({authenticated:true,signed:true,transportAuthorized:true,secure:true,termsCompatible:true}),
    hold: item({held:false,suppressed:false}),
    align: item({aligned:true,signed:true})
  };
  Object.assign(state, overrides);
  let calls = [];
  const wrap = k => async args => {calls.push([k,args]); return [state[k]];};
  const readers = {
    readProviderMailbox:wrap('mailbox'), readProviderDomainDns:wrap('dns'),
    readVerifiedSmtp:wrap('smtp'), readLocalHold:wrap('hold'),
    readVerifiedDnsAlignment:wrap('align'),clock
  };
  const supplier = createUberWarm2TrustedHealthSupplier(readers);
  return {supplier,state,calls,readers};
};
const query = {email:EMAIL,at:NOW};
test('healthy independent real-read shaped inputs compile exactly one bound observation',async()=>{
  const {supplier,calls}=make();
  const rows=await supplier.readSenderHealth(query);
  assert.equal(rows.length,1);
  assert.equal(rows[0].email,EMAIL);
  assert.equal(rows[0].authenticationStatus,'AUTHENTICATED');
  assert.equal(rows[0].dnsAuthenticated,true);
  assert.equal(rows[0].transportAuthorized,true);
  assert.match(rows[0].evidenceRef,/^uberwarm2-trusted-health:sha256:[a-f0-9]{64}$/);
  assert.equal(calls.length,5);
  const p=createUberWarm2LivePreflight({readSenderHealth:supplier.readSenderHealth,clock:()=>NOW});
  assert.equal(await p.verifyCurrentSenderHealth(EMAIL,NOW),true);
});
test('provider Active status NEVER substitutes for verified SMTP authentication',async()=>{
  const {supplier}=make({smtp:item({authenticated:false,signed:true,transportAuthorized:true,secure:true,termsCompatible:true})});
  assert.deepEqual(await supplier.readSenderHealth(query),[]);
});
test('DNS row must establish provider readiness, not just domain and record presence',async()=>{
  const {supplier}=make({dns:item({ready:false,spf:true,dkim:true,dmarc:true,mx:true})});
  assert.deepEqual(await supplier.readSenderHealth(query),[]);
});
test('signed DNS alignment is separate from provider DNS readiness',async()=>{
  for(const change of [{aligned:false,signed:true},{aligned:true,signed:false}]){
    const {supplier}=make({align:item(change)});
    assert.deepEqual(await supplier.readSenderHealth(query),[]);
  }
});
test('SMTP must have signed auth, approved secure route and compatible terms',async()=>{
  for(const change of [{authenticated:true,signed:false},{authenticated:true,signed:true,secure:false},
    {authenticated:true,signed:true,termsCompatible:false},
    {authenticated:true,signed:true,transportAuthorized:false}]){
    const {supplier}=make({smtp:item({transportAuthorized:true,secure:true,termsCompatible:true,...change})});
    assert.deepEqual(await supplier.readSenderHealth(query),[]);
  }
});
test('internal quarantine is authoritative even when provider mailbox is Active',async()=>{
  const {supplier,state}=make();
  assert.equal((await supplier.readSenderHealth(query)).length,1);
  state.hold=item({held:true,suppressed:false});
  assert.deepEqual(await supplier.readSenderHealth(query),[]);
  state.hold=item({held:false,suppressed:true});
  assert.deepEqual(await supplier.readSenderHealth(query),[]);
});
test('quarantined, paused, disconnected or policy-incompatible provider is refused',async()=>{
  for(const change of [{connected:false},{paused:true},{quarantined:true},
      {placementQuarantine:true},{policyCompatible:false}]){
    const {supplier}=make({mailbox:item({connected:true,paused:false,quarantined:false,
      placementQuarantine:false,policyCompatible:true,...change})});
    assert.deepEqual(await supplier.readSenderHealth(query),[]);
  }
});
test('provider identity, domain and freshness must match the intended sender',async()=>{
  for(const change of [{email:'different@example.test'},{domain:'other.test'},
    {observedAt:new Date(NOW-300001).toISOString()},
    {observedAt:new Date(NOW+1).toISOString()},{evidenceRef:''}]){
    const {supplier}=make({mailbox:item({connected:true,paused:false,quarantined:false,
      placementQuarantine:false,policyCompatible:true,...change})});
    assert.deepEqual(await supplier.readSenderHealth(query),[]);
  }
});
test('unreadable, duplicate and missing trusted suppliers fail closed',async()=>{
  const {readers}=make();
  delete readers.readVerifiedSmtp;
  assert.deepEqual(await createUberWarm2TrustedHealthSupplier(readers).readSenderHealth(query),[]);
  const dup=make();
  dup.readers.readProviderMailbox=async()=>[dup.state.mailbox,dup.state.mailbox];
  assert.deepEqual(await createUberWarm2TrustedHealthSupplier(dup.readers).readSenderHealth(query),[]);
  dup.readers.readProviderMailbox=async()=>{throw Error('provider down')};
  assert.deepEqual(await createUberWarm2TrustedHealthSupplier(dup.readers).readSenderHealth(query),[]);
});
test('expired requested instant and slow provider reads cannot pass',async()=>{
  const old=make({},()=>NOW+300001);
  assert.deepEqual(await old.supplier.readSenderHealth(query),[]);
  let clockNow=NOW;
  const slow=make({},()=>clockNow);
  slow.readers.readVerifiedSmtp=async()=>{clockNow=NOW+300001;return [slow.state.smtp]};
  assert.deepEqual(await createUberWarm2TrustedHealthSupplier(slow.readers).readSenderHealth(query),[]);
});
test('invalid identity cannot authorize source reads',async()=>{
  const {supplier,calls}=make();
  assert.deepEqual(await supplier.readSenderHealth({email:'bad',at:NOW}),[]);
  assert.deepEqual(await supplier.readSenderHealth({email:EMAIL,at:NaN}),[]);
  assert.equal(calls.length,0);
});
